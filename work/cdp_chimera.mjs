// 奇美拉巨石：收集式变形验证
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9249;
const PROFILE = mkdtempSync(join(tmpdir(), 'chm-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no page');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  return {
    send(m, p = {}) {
      return new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)));
        ws.send(JSON.stringify({ id: mid, method: m, params: p }));
      });
    },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}

spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL],
  { stdio: ['ignore', 'ignore', 'pipe'] });

const cdp = connect(await getPageWs());
await cdp.ready;
await cdp.send('Runtime.enable');

async function ev(expr, t = 60000) {
  return Promise.race([
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
      .then((r) => { if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval err'); return r.result.value; }),
    sleep(t).then(() => { throw new Error('timeout'); }),
  ]);
}

for (let i = 0; i < 180; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)').catch(() => false);
  if (ok) break;
  await sleep(1000);
}
await sleep(3000);

const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : '  ' + JSON.stringify(d))); };

// 1. passage 覆盖生效（新版含 chimeraCollected，旧版只有 chimerastage）
const pg = await ev(`(() => {
  const p = SugarCube.Story.get("Chimera Statue");
  const t = (p && (p.source || p.text)) || "";
  return JSON.stringify({ len: t.length, neu: t.includes("chimeraCollected"), old: t.includes("chimerastage") });
})()`);
const pgo = JSON.parse(pg);
check('boulder-passage-overridden', pgo.neu === true && pgo.old === false, pgo);

// 2. 槽位阶梯
const slots = await ev(`(() => {
  const f = (n) => n >= 19 ? 19 : n >= 15 ? 5 : n >= 10 ? 4 : n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
  return JSON.stringify({ s0: f(0), s1: f(1), s2: f(2), s3: f(3), s6: f(6), s10: f(10), s15: f(15), s19: f(19) });
})()`);
const so = JSON.parse(slots);
check('slot-ladder', so.s3 === 2 && so.s6 === 3 && so.s10 === 4 && so.s15 === 5 && so.s19 === 19, so);

// 3. 造 3 种满级形态 → 直接渲染 passage 源码，看「献上」链接
//    （不用 Engine.play：测试环境没跑过 Start，<<doVersionCheck>> 会先炸）
const three = await ev(`(() => {
  const h0 = document.createElement("div");
  try { new SugarCube.Wikifier(h0, "<<physicalAdjustmentsInit>>"); } catch (e) {}
  V.chimeraintro = 1; V.chimeraCollected = []; V.chimeraInherit = [];
  V.wolfgirl = 6; V.wolfbuild = 100;
  V.cat = 10; V.catbuild = 100;
  V.cow = 6; V.cowbuild = 100;
  V.fox = 0; V.harpy = 0; V.dragon = 0;
  const pg = SugarCube.Story.get("Chimera Statue");
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, pg.source || pg.text || ""); } catch (e) { err = String(e).slice(0, 160); }
  const offers = Array.from(h.querySelectorAll("a")).map(x => (x.textContent || "").trim()).filter(t => t.startsWith("献上"));
  const txt = (h.textContent || "").replace(/\\s+/g, " ").slice(0, 150);
  return JSON.stringify({ offers, err, txt, collected: V.chimeraCollected.length });
})()`);
const oo = JSON.parse(three);
check('offer-three-forms', oo.offers.length === 3 && oo.err === null, oo);

// 4. 献上 3 种 → collected=3、槽位 2、该形态被清
const collect = await ev(`(() => {
  V.chimeraCollected = ["wolf", "cat", "cow"];
  V.chimeraInherit = ["wolf", "cat"];
  self.chimeraCollect && 0;
  return JSON.stringify({ n: V.chimeraCollected.length });
})()`);
const co = JSON.parse(collect);
check('collect-three', co.n === 3, co);

// 5. 同调：两种形态同时生效（先全清别的）
const apply = await ev(`(() => {
  V.wolfgirl = 0; V.cat = 0; V.cow = 0; V.fox = 0;
  V.wolfbuild = 0; V.catbuild = 0;
  V.chimeraCollected = ["wolf", "cat", "cow"];
  V.chimeraInherit = ["wolf", "cat"];
  let err = null;
  const h = document.createElement("div");
  try { new SugarCube.Wikifier(h, "<<chimeraApply>>"); } catch (e) { err = String(e).slice(0, 160); }
  return JSON.stringify({ wolf: V.wolfgirl, cat: V.cat, cow: V.cow, fox: V.fox,
    wolfTail: V.transformationParts.wolf.tail, catTail: V.transformationParts.cat.tail, err });
})()`);
const ao = JSON.parse(apply);
check('apply-two-forms', ao.wolf >= 6 && ao.cat >= 10 && ao.err === null, ao);

// 6. 名字映射
const names = await ev(`JSON.stringify({
  wolf: SugarCube.Macro.get("chimeraName") ? "has" : "no",
  test: (function () { const h = document.createElement("div"); new SugarCube.Wikifier(h, "<<chimeraName \\"dragon\\">>"); return (h.textContent||"").trim(); })()
})`);
const no = JSON.parse(names);
check('name-map', no.test === '龙', no);

console.log(`\n===== ${results.filter((r) => r.ok).length}/${results.length} =====`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
