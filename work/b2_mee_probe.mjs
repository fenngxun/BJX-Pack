// One-shot runtime probe: is window.mee present and does calmStatModifier work?
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9234;
const PROFILE = mkdtempSync(join(tmpdir(), 'mee-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 90 && !wsUrl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const l = await r.json();
      const p = l.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(500);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result))); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.enable');
  const ev = async (e) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(20000).then(() => null)]);
    if (!r) return 'TIMEOUT';
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 120);
    return r.result.value;
  };
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    if (await ev(`!!(window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage)`)) break;
    await sleep(2000);
  }
  console.log('typeof window.mee        :', await ev('typeof window.mee'));
  console.log('npcQueue len             :', await ev('(window.__b2NpcQueue||[]).length'));
  console.log('npcQueue names           :', await ev('JSON.stringify((window.__b2NpcQueue||[]).map(function(c){return c&&c.nam;}))'));
  console.log('typeof setup.baseNNPC    :', await ev('typeof (window.setup && window.setup.baseNNPC)'));
  console.log('V.NPCNameList type/len   :', await ev('(function(){var V=window.SugarCube.State.variables;return JSON.stringify({t:Object.prototype.toString.call(V.NPCNameList),n:(V.NPCNameList||[]).length});})()'));
  console.log('V.NPCName len            :', await ev('(function(){var V=window.SugarCube.State.variables;return String((V.NPCName||[]).length);})()'));
  console.log('manual flush()           :', await ev('(function(){try{return String(window.__b2FlushNamedNPCs());}catch(e){return "ERR:"+e.message;}})()'));
  console.log('after flush NPCNameList  :', await ev('(function(){var V=window.SugarCube.State.variables;return JSON.stringify((V.NPCNameList||[]).filter(function(n){return ["Robert","Hadley","Qing","Lam","Wei","Xinyu","Cheng","Yue","Keith"].indexOf(n)>=0;}));})()'));
  console.log('after flush queue len    :', await ev('(window.__b2NpcQueue||[]).length'));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
