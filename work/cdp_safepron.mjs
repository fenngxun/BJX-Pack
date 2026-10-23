// 验证安全代词 widget：空 NPCList 不报错 + beastejaculation 能跑完
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9248;
const PROFILE = mkdtempSync(join(tmpdir(), 'sp-'));
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

// 1. 空 NPCList + enemyno=0：七个 widget 都不能报错
const r1 = await ev(`(() => {
  V.NPCList = []; V.enemyno = 0;
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, "<<bhe>>/<<bhis>>/<<bhers>>/<<bhim>>/<<bhimself>>/<<bhes>>/<<bboy>>/<<bHe>>/<<bHis>>"); }
  catch (e) { err = String(e).slice(0, 160); }
  const txt = (h.textContent || "").trim();
  return JSON.stringify({ err, txt, bad: /error|undefined|monster/i.test(txt) });
})()`);
console.log('EMPTY-NPC:', r1);
const o1 = JSON.parse(r1);
check('safe-pronouns-empty-npc', o1.err === null && o1.bad === false, o1);

// 2. 有 NPC 时按性别输出（语义未变）
const r2 = await ev(`(() => {
  const mk = (pron) => { const b = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
    Object.assign(b, { monster: "monster", pronoun: pron }); return b; };
  V.NPCList = [mk("m")]; V.enemyno = 1;
  const h = document.createElement("div");
  new SugarCube.Wikifier(h, "<<bhe>>/<<bhis>>/<<bboy>>");
  const male = (h.textContent || "").trim();
  V.NPCList = [mk("f")]; V.enemyno = 1;
  const h2 = document.createElement("div");
  new SugarCube.Wikifier(h2, "<<bhe>>/<<bhis>>/<<bboy>>");
  const female = (h2.textContent || "").trim();
  return JSON.stringify({ male, female });
})()`);
console.log('GENDERED:', r2);
const o2 = JSON.parse(r2);
check('safe-pronouns-keeps-semantics', o2.male === 'he/his/boy' && o2.female === 'she/her/girl', o2);

// 3. beastejaculation 必须在 NPCList 异常时也能跑完并把 enemyejaculated +1
const r3 = await ev(`(() => {
  const mk = () => { const b = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
    Object.assign(b, { active: "active", stance: "none", health: 500, healthmax: 500,
      maxOrgasms: 2, orgasms: 0, virgin: false, penis: 1, vagina: 0, arousal: 0, arousalmax: 500,
      pronoun: "m", type: "dog", monster: "monster", intro: 0, ejaculated: 0 }); return b; };
  V.NPCList = [mk()]; V.enemyno = 1; V.enemyno;
  // 故意把 enemyno 打错，模拟玩家遇到的状态错位
  V.enemyno = 0;
  V.enemytype = "beast"; V.enemyarousal = 500; V.enemyarousalmax = 500;
  V.enemyejaculated = 0; V.combat = 1; V.stalk = 0; V.location = "residential";
  V.sexStats = V.sexStats || { creampie: { npc: { vagina: 0, anus: 0, mouth: 0 } }, vagina: { pregnancy: {} }, anus: { pregnancy: {} } };
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, "<<beastejaculation>>"); }
  catch (e) { err = String(e).slice(0, 200); }
  const txt = (h.textContent || "").slice(0, 300);
  return JSON.stringify({ err, ejac: V.enemyejaculated, hasErr: /errors within widget|reading 'monster'/.test(txt), txt: txt.replace(/\\s+/g, ' ').slice(0, 160) });
})()`);
console.log('BEAST-EJAC:', r3);
const o3 = JSON.parse(r3);
// animateCombat 在 headless 没有战斗画布时报错属环境问题，只看 monster 与计数
check('beastejaculation-survives-bad-npc', o3.ejac >= 1 && !/monster/.test(o3.txt), o3);

console.log(`\n===== ${results.filter((r) => r.ok).length}/${results.length} =====`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
