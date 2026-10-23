// 针对性诊断：附身扣自控 / 日志写入 / 氧气宏
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9252;
const PROFILE = mkdtempSync(join(tmpdir(), 'dg-'));
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

// A. effectsman 包装状态
const a = await ev(`(() => {
  const m = SugarCube.Macro.get("effectsman");
  const slots = ["mouthaction","feetaction","vaginaaction","anusaction","penisaction","chestaction","handaction","thighaction","bottomaction"];
  V.possessed = true; V.combat = 1; V.controlmax = 1000; V.control = 1000;
  V.mouthaction = "cooperate";
  const before = slots.map(k => V[k]).filter(x => typeof x === "string" && x);
  return JSON.stringify({
    exists: !!m, wrapped: !!(m && m.__bjxWrapped),
    beforeSlots: before,
    controlBefore: V.control,
  });
})()`);
console.log('A effectsman:', a);

// B. 直接跑一次 effectsman 看扣多少
const b = await ev(`(() => {
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, "<<effectsman>>"); } catch (e) { err = String(e).slice(0, 160); }
  return JSON.stringify({ control: V.control, mouth: V.mouthaction, possessed: V.possessed, err });
})()`);
console.log('B after effectsman:', b);

// C. bjxLog 直接调用
const c = await ev(`(() => {
  V.journalNotes = { default: "" };
  V.options.bjx_eventTF = true;
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, '<<bjxLog "测试条目一">>'); } catch (e) { err = String(e).slice(0, 200); }
  const again = document.createElement("div");
  try { new SugarCube.Wikifier(again, '<<bjxLog "测试条目二">>'); } catch (e) {}
  return JSON.stringify({ notes: V.journalNotes, err, text: (h.textContent||'').slice(0,100) });
})()`);
console.log('C bjxLog:', c);

// D. oxygen 宏
const d = await ev(`(() => {
  const m = SugarCube.Macro.get("oxygen");
  V.oxygen = 1000; V.oxygenmax = 1000;
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, "<<oxygen -150>>"); } catch (e) { err = String(e).slice(0, 120); }
  const plain = V.oxygen;
  V.slime = 1; V.oxygen = 1000;
  try { new SugarCube.Wikifier(h, "<<oxygen -150>>"); } catch (e) {}
  const slimed = V.oxygen;
  V.slime = 0;
  return JSON.stringify({ exists: !!m, wrapped: !!(m && m.__bjxWrapped), plain, slimed, err });
})()`);
console.log('D oxygen:', d);

process.exit(0);
