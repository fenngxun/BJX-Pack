// Debug harness: capture ALL page errors + console, install error traps at doc start.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8799/Degrees%20of%20Lewdity.html';
const PORT = 9226;
const PROFILE = mkdtempSync(join(tmpdir(), 'dbg-'));
const LOG = 'C:/Users/79403/Desktop/dol/work/cdp-debug-console.log';

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
  throw new Error('no page');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map(); const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else for (const l of listeners) l(msg);
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    onEvent(l) { listeners.push(l); },
    ready: new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); }),
  };
}

const sleep_eval = (cdp, expr, ms = 30000) => Promise.race([
  cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
  sleep(ms).then(() => { throw new Error('eval timeout ' + expr.slice(0, 60)); }),
]);

async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', (d) => { const s = String(d); if (/error|crash|fatal/i.test(s)) writeFileSync(LOG, '[chrome] ' + s.slice(0, 300) + '\n', { flag: 'a' }); });
  let cdp;
  try {
    const wsUrl = await getPageWs();
    cdp = connect(wsUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    // install error traps BEFORE any script runs (doc start)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[];window.__rej=[];window.addEventListener('error',function(e){window.__errs.push((e.message||'')+' @ '+(e.filename||'')+':'+(e.lineno||''));});window.addEventListener('unhandledrejection',function(e){window.__rej.push(String(e.reason&&e.reason.stack||e.reason));});` });
    cdp.onEvent((msg) => {
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ');
        writeFileSync(LOG, `[${msg.params.type}] ${text.slice(0, 500)}\n`, { flag: 'a' });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        writeFileSync(LOG, '[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 500) + '\n', { flag: 'a' });
      } else if (msg.method === 'Inspector.targetCrashed') {
        writeFileSync(LOG, '[CRASH]\n', { flag: 'a' });
      }
    });
    for (let i = 0; i < 18; i++) {
      await sleep(10000);
      let st;
      try {
        st = await sleep_eval(cdp, `(() => ({ sc: typeof window.SugarCube, passage: (window.SugarCube&&window.SugarCube.State&&window.SugarCube.State.passage)||null, modUtils: typeof window.modUtils, modI18N: typeof window.modI18N, errs: (window.__errs||[]).slice(0,8), rej: (window.__rej||[]).slice(0,4), ready: document.readyState }))()`);
      } catch (e) { writeFileSync(LOG, '[poll] ' + String(e).slice(0, 200) + '\n', { flag: 'a' }); continue; }
      const v = st.result ? st.result.value : null;
      writeFileSync(LOG, `[poll ${i}] ` + JSON.stringify(v) + '\n', { flag: 'a' });
      if (v && v.passage) { writeFileSync(LOG, '[BOOTED] at poll ' + i + '\n', { flag: 'a' }); break; }
    }
  } catch (e) {
    writeFileSync(LOG, '[FATAL] ' + String(e).slice(0, 400) + '\n', { flag: 'a' });
  } finally {
    try { chrome.kill(); } catch {}
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
}
main();
