import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9227;
const PROFILE = mkdtempSync(join(tmpdir(), 'dump-psg-'));
const WANTED = process.argv[2] ? JSON.parse(process.argv[2]) : ['Widgets Attitudes', 'Ocean Breeze', 'Dance Studio', 'Eden Clearing', 'Town Hall', 'Cabin Actions'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('page not found');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  });
  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? reject(new Error(method)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    }),
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
try {
  const cdp = connect(await getPageWs());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  const ev = (expr) => cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }).then((r) => { if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; });
  const t0 = Date.now();
  let booted = false;
  while (Date.now() - t0 < 240000) {
    const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
    if (ok) { booted = true; break; }
    await sleep(2000);
  }
  if (!booted) throw new Error('no boot');
  const out = {};
  for (const name of WANTED) {
    const len = await ev(`(() => { const d = window.modUtils.getPassageData(${JSON.stringify(name)}); return d ? (d.text || d.content || '').length : -1; })()`);
    out[name] = { len };
    const CHUNK = 30000;
    let text = '';
    for (let i = 0; i < len; i += CHUNK) {
      const part = await ev(`(() => { const d = window.modUtils.getPassageData(${JSON.stringify(name)}); return (d.text || d.content || '').slice(${i}, ${i + CHUNK}); })()`);
      text += part;
    }
    out[name].text = text;
  }
  writeFileSync('C:/Users/79403/Desktop/dol/work/passages-dump.json', JSON.stringify(out, null, 1));
  for (const k of Object.keys(out)) console.log(k, out[k].len);
} finally {
  try { chrome.kill(); } catch {}
  await sleep(1500);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
