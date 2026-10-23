// 胚胎吸收端到端：真实怀孕结构 + 入口注入 + 点击结果
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9246;
const PROFILE = mkdtempSync(join(tmpdir(), 'emb-'));
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
    sleep(t).then(() => { throw new Error('timeout: ' + expr.slice(0, 40)); }),
  ]);
}

for (let i = 0; i < 180; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)').catch(() => false);
  if (ok) break;
  await sleep(1000);
}
await sleep(3000);

// 1. 函数实现
const impl = await ev(`JSON.stringify({
  aware: (window.playerAwareTheyArePregnant || "").toString().slice(0, 700),
  isPreg: (window.playerIsPregnant || "").toString().slice(0, 500)
})`);
console.log('=== 实现 ===');
const im = JSON.parse(impl);
console.log('playerAwareTheyArePregnant:\n', im.aware);
console.log('playerIsPregnant:\n', im.isPreg);

// 2. 用游戏自己的 createPregnancy 造真实怀孕（0.5.12.13 新系统）
const setup = await ev(`(() => {
  const h = document.createElement("div");
  try { new SugarCube.Wikifier(h, "<<physicalAdjustmentsInit>>"); } catch (e) {}
  if (!V.pregnancies) V.pregnancies = [];
  let id = null, err = null;
  try { id = createPregnancy("pc", "human", { type: "human", source: "test" }); }
  catch (e) { err = String(e).slice(0, 200); }
  // 让玩家「知道自己怀孕」：直接往 record 的 awareOfPregnancy 里塞 "pc"
  try {
    const list = getActivePregnancies("pc");
    if (list.length) {
      const rec = V.pregnancies[list[0].pregnancyId];
      rec.awareOfPregnancy = Array.from(new Set([...(rec.awareOfPregnancy || []), "pc"]));
    }
  } catch (e) {}
  V.demon = 6; V.demonhunter = 3; V.options.bjx_divine = true;
  const rec = id != null ? V.pregnancies[id] : null;
  return JSON.stringify({
    id, err,
    keys: rec ? Object.keys(rec) : null,
    carrier: rec ? rec.carrier : null,
    orifice: rec ? rec.orifice : null,
    active: getActivePregnancies("pc").length,
    isPreg: playerIsPregnant(),
    aware: playerAwareTheyArePregnant(),
  });
})()`);
console.log('=== 造真实怀孕 ===');
console.log(setup);

// 3. 进厕所，等入口注入
await ev(`(() => { try { SugarCube.Engine.play("Bathroom"); } catch (e) {} return null; })()`).catch(() => {});
await sleep(2500);
const link = await ev(`(() => {
  const el = document.getElementById("bjx-embryo-link");
  return JSON.stringify({
    found: !!el,
    text: el ? el.textContent.trim() : null,
    passage: SugarCube.State.passage,
    demon: V.demon, hunter: V.demonhunter,
    aware: playerAwareTheyArePregnant(),
    active: getActivePregnancies("pc").length,
  });
})()`).catch((e) => JSON.stringify({ err: String(e).slice(0, 100) }));
console.log('=== 入口 ===');
console.log(link);

// 4. 点进去看结果
const l = JSON.parse(link);
if (l.found) {
  await ev(`(() => {
    const a = document.querySelector("#bjx-embryo-link a");
    if (a) setTimeout(() => { try { a.click(); } catch (e) {} }, 50);
    return null;
  })()`).catch(() => {});
  await sleep(2000);
  let res = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      res = await ev(`(() => {
        const txt = ((document.getElementById("passages") || {}).textContent || "").replace(/\\s+/g, " ");
        return JSON.stringify({ passage: SugarCube.State.passage, empty: txt.includes("什么也没有"),
          absorbed: txt.includes("恶魔的体质开始工作"), active: getActivePregnancies("pc").length,
          isPreg: playerIsPregnant(), promiscuity: V.promiscuity, head: txt.slice(0, 160) });
      })()`, 4000);
      break;
    } catch (e) {}
  }
  console.log('=== 点进去之后 ===');
  console.log(res);
}
process.exit(0);
