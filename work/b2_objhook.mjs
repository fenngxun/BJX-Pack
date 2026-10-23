// Hook Object.keys/assign/entries/values BEFORE any mod script runs.
// Any call with a null/undefined target is recorded with a stack trace,
// so we can fix every "Cannot convert undefined or null to object" in one pass.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9233;
const PROFILE = mkdtempSync(join(tmpdir(), 'objhook-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ws() {
  for (let i = 0; i < 90; i++) {
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
function connect(u) {
  const s = new WebSocket(u);
  let id = 0; const pend = new Map();
  s.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  return {
    send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result))); s.send(JSON.stringify({ id: mid, method, params })); }); },
    ready: new Promise((r, j) => { s.addEventListener('open', r); s.addEventListener('error', j); }),
  };
}

const main = async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
  const cdp = connect(await ws());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__OBJERR = [];
    ['keys','assign','entries','values','getOwnPropertyNames'].forEach(function (fn) {
      var orig = Object[fn];
      Object[fn] = function (t) {
        if (t === undefined || t === null) {
          var st = '';
          try { st = String(new Error().stack || '').split('\\n').slice(1, 6).join(' <- '); } catch (e) {}
          try { window.__OBJERR.push(fn + ' | ' + st.slice(0, 600)); } catch (e) {}
          if (window.__OBJERR.length > 60) return orig.apply(Object, arguments);
        }
        return orig.apply(Object, arguments);
      };
    });
  })()` });
  await cdp.send('Page.reload', { ignoreCache: true });

  const ev = async (e, t = 30000) => {
    const r = await Promise.race([cdp.send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(t).then(() => null)]);
    if (!r || r.exceptionDetails) return null;
    return r.result.value;
  };
  const t0 = Date.now();
  let booted = false;
  while (Date.now() - t0 < 200000) {
    if (await ev(`!!(window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage)`, 8000)) { booted = true; break; }
    await sleep(2000);
  }
  const raw = await ev('JSON.stringify(window.__OBJERR || [])');
  const list = raw ? JSON.parse(raw) : [];
  writeFileSync('C:/Users/79403/Desktop/dol/work/b2_objhook.json', JSON.stringify({ booted, list }, null, 1));
  console.log('booted=' + booted + '  captured=' + list.length);
  for (const l of list.slice(0, 12)) console.log('---\n' + l);
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
