// 特质面板注入验证：BJX 猎手特质 + DoLSims 书籍特质。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9229;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-traits-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const l = await r.json();
      const p = l.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no page');
}

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
const ws = new WebSocket(await getWs());
const pending = new Map();
let id = 0;
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, (m) => res(m.result));
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Runtime.enable');
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval error');
  return r.result.value;
};

for (let i = 0; i < 120; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)');
  if (ok) break;
  await sleep(1000);
}
await sleep(3000);

const out = await ev(`(() => {
  const V = window.V;
  V.options = V.options || {}; V.options.bjx_divine = true;
  V.demonhunter = 2; V.demon = 6;
  V.citylibrarybook_11 = 1000; V.WDestinytrait = 1;
  V.citylibrarybook_14_2 = 1; V.citylibrarybook_14_2_trait = 0;
  const host = document.getElementById("passages");
  const tl = document.createElement("div"); tl.className = "traitList";
  const tr = document.createElement("div"); tr.className = "traits";
  tl.appendChild(tr); host.appendChild(tl);
  window.bjxInjectTraits();
  const list = host.querySelector(".bjx-sims-traits");
  const names = list ? Array.from(list.querySelectorAll(".trait span")).map(s => s.textContent) : [];
  const heads = list ? Array.from(list.querySelectorAll(".traitHeading")).map(s => s.textContent) : [];
  const texts = list ? Array.from(list.querySelectorAll(".trait small")).map(s => s.textContent) : [];
  const bjx = Array.from(tr.querySelectorAll(".bjx-trait span")).map(s => s.textContent);
  const bjxTexts = Array.from(tr.querySelectorAll(".bjx-trait small")).map(s => s.textContent);
  tl.remove(); if (list) list.remove();
  return JSON.stringify({ heads, names, bjx, bjxTexts, hasText: texts.some(t => t.indexOf("90%") >= 0) });
})()`);
const r = JSON.parse(out);
console.log('RESULT', out);
const ok = r.heads.indexOf('书籍特质（模拟人生）') >= 0
  && r.names.indexOf('命运之轮') >= 0
  && r.names.indexOf('奸奇注视(未生效)') >= 0
  && r.bjx.indexOf('恶魔猎手 Lv.2') >= 0
  && r.bjxTexts.some(t => t.indexOf('减免 30%') >= 0 && t.indexOf('/360') >= 0)
  && r.hasText;
console.log(ok ? 'PASS  1/1' : 'FAIL');
try { chrome.kill(); } catch {}
process.exit(0);
