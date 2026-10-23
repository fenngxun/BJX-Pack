// Wrap console.error before page scripts run (via
// Page.addScriptToEvaluateOnNewDocument) so do_patch failures carry their
// full [mod, rule] arguments as JSON. Then report the 20 failing rules.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9227;
const PROFILE = mkdtempSync(join(tmpdir(), 'errwrap-'));

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

  const wrapped = [];
  try {
    // wait for the page target to exist, then attach BEFORE scripts run is
    // impossible post-hoc; instead we reload after installing the wrapper.
    let wsUrl = await getPageWs();
    let cdp = connect(wsUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const orig = console.error;
      window.__ERRLOG = [];
      console.error = function (...args) {
        try {
          const s = JSON.stringify(args, (k, v) => {
            if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '...' : v;
            if (v instanceof Error) return String(v);
            return v;
          });
          window.__ERRLOG.push(s);
          orig('[ERRJSON]', s);
        } catch (e) { orig.apply(console, args); }
      };
    })()` });
    const consoleLines = [];
    cdp.onEvent((msg) => {
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ');
        consoleLines.push(`[${msg.params.type}] ${text}`);
      }
    });
    // reload so the wrapper is active during ModLoader boot
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

    const errlog = await ev('JSON.stringify(window.__ERRLOG || [])');
    const errs = JSON.parse(errlog);
    const patchFails = errs.filter((s) => s.includes('do_patch'));
    writeFileSync('C:/Users/79403/Desktop/dol/work/errwrap-result.json', JSON.stringify({ total: errs.length, patchFails }, null, 1));
    console.log('total wrapped errors:', errs.length, '| do_patch failures:', patchFails.length);
    for (const f of patchFails) {
      try {
        const arr = JSON.parse(f);
        // expected: [msg, [modBootJson, rule]] - find the objects
        const flat = [];
        const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') flat.push(v); else flat.push(v); };
        walk(arr);
        const modObj = flat.find((v) => v && v.name && v.bootJson);
        const rule = flat.find((v) => v && v.passage && (v.findString !== undefined || v.findRegex !== undefined));
        if (modObj && rule) {
          console.log(`  [${modObj.name}] ${rule.passage} :: ${JSON.stringify(String(rule.findString !== undefined ? rule.findString : rule.findRegex).slice(0, 70))}`);
        } else {
          console.log('  RAW:', f.slice(0, 220));
        }
      } catch { console.log('  RAW:', f.slice(0, 220)); }
    }
  } finally {
    try { chrome.kill(); } catch {}
    await sleep(1500);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });