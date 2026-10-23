import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9228;
const PROFILE = mkdtempSync(join(tmpdir(), 'grab-logs-'));
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
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else for (const l of listeners) l(msg);
  });
  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? reject(new Error(method)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    }),
    onEvent: (l) => listeners.push(l),
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
try {
  const wsUrl = await getPageWs();
  const cdp = connect(wsUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  const lines = [];
  cdp.onEvent((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || `[obj ${a.type}]`))).join(' | ');
      lines.push(`[${msg.params.type}] ${text}`);
    }
  });
  const ev = (expr) => cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }).then((r) => r.result.value);
  const t0 = Date.now();
  let booted = false;
  while (Date.now() - t0 < 240000) {
    const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
    if (ok) { booted = true; break; }
    await sleep(2000);
  }
  await sleep(3000);
  writeFileSync('C:/Users/79403/Desktop/dol/work/console-all.log', lines.join('\n'));
  const trLines = lines.filter((l) => /TweeReplacer|ReplacePatcher|ConflictChecker|optionalBefore|cannot find/i.test(l));
  console.log('booted:', booted, 'total console lines:', lines.length);
  trLines.forEach((l) => console.log(l.slice(0, 250)));
} finally {
  try { chrome.kill(); } catch {}
  await sleep(1500);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
