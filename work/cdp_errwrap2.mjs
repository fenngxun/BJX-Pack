// Grab FULL console.error args for ReplacePatcher / ConflictChecker errors.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9228;
const PROFILE = mkdtempSync(join(tmpdir(), 'errwrap2-'));

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
  throw new Error('chrome devtools page not found');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else {
      for (const l of listeners) l(msg);
    }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method)) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    onEvent(l) { listeners.push(l); },
    ready: new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    }),
  };
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  try {
    let wsUrl = await getPageWs();
    let cdp = connect(wsUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const orig = console.error;
      window.__ERRLOG = [];
      const seen = new WeakSet();
      const safe = (v, depth) => {
        if (v === null || v === undefined) return v;
        if (typeof v === 'string') return v.length > 300 ? v.slice(0, 300) + '...' : v;
        if (typeof v === 'number' || typeof v === 'boolean') return v;
        if (v instanceof Error) return String(v);
        if (typeof v !== 'object') return String(v);
        if (seen.has(v)) return '[circular]';
        if (depth > 3) return '[deep]';
        seen.add(v);
        try {
          if (Array.isArray(v)) return v.map((x) => safe(x, depth + 1));
          const o = {};
          for (const k of Object.keys(v).slice(0, 25)) o[k] = safe(v[k], depth + 1);
          return o;
        } finally { seen.delete(v); }
      };
      console.error = function (...args) {
        try {
          window.__ERRLOG.push(JSON.stringify(args.map((a) => safe(a, 0))));
        } catch (e) { window.__ERRLOG.push('["wrap-fail", ' + JSON.stringify(String(e)) + ']'); }
        orig.apply(console, args);
      };
    })()` });
    await cdp.send('Page.reload', { ignoreCache: true });

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.exceptionDetails) throw new Error('page exception: ' + (r.exceptionDetails.text || '').slice(0, 200));
      return r.result.value;
    };

    const t0 = Date.now();
    let booted = false;
    while (Date.now() - t0 < 240000) {
      const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
      if (ok) { booted = true; break; }
      await sleep(2000);
    }
    if (!booted) throw new Error('game did not boot');

    const errs = JSON.parse(await ev('JSON.stringify(window.__ERRLOG || [])'));
    writeFileSync('C:/Users/79403/Desktop/dol/work/errwrap2-result.json', JSON.stringify(errs, null, 1));
    console.log('total wrapped errors:', errs.length);
    for (const s of errs) {
      console.log('---');
      console.log(s.slice(0, 700));
    }
  } finally {
    try { chrome.kill(); } catch {}
    await sleep(1500);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });