// Fast boot-only probe for B2 bisecting: launches headless Chrome, waits for
// SugarCube.State.passage, prints mod list + tail of console. No assertions.
// Usage: node b2_boot.mjs [url] [waitSeconds]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const WAIT = Number(process.argv[3] || 100) * 1000;
const PORT = 9225;
const PROFILE = mkdtempSync(join(tmpdir(), 'b2-boot-'));
const LOG = 'C:/Users/79403/Desktop/dol/work/b2_boot-console.log';

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
  throw new Error('devtools page not found');
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
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (m) => (m.error ? reject(new Error(method + ': ' + JSON.stringify(m.error))) : resolve(m.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    onEvent(l) { listeners.push(l); },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}

function ser(a) {
  if (a == null) return String(a);
  if (a.value !== undefined) return typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
  if (a.description) return a.description.slice(0, 300);
  if (a.preview && a.preview.properties) return '{' + a.preview.properties.map((p) => p.name + ':' + (p.value || '?')).join(',') + '}';
  return a.type || '?';
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const lines = [];
  const wsUrl = await getPageWs();
  const cdp = connect(wsUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  cdp.onEvent((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const t = (msg.params.args || []).map(ser).join(' ');
      if (!/canLoadThisMod|LoaderKeyConfig|ModZipReader init/.test(t)) lines.push('[' + msg.params.type + '] ' + t.slice(0, 500));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      lines.push('[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 500));
    }
  });

  const t0 = Date.now();
  let booted = false, state = '';
  while (Date.now() - t0 < WAIT) {
    // page main thread may be blocked (boot hang) -> evaluate never resolves.
    // Race it so the probe keeps looping instead of hanging forever.
    const r = await Promise.race([
      cdp.send('Runtime.evaluate', {
        expression: `(() => { const d = document.getElementById('story'); return JSON.stringify({ ok: !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage), mode: window.SugarCube && window.SugarCube.State ? 'SC' : '-', ready: document.readyState, sets: document.querySelectorAll('#story script').length }); })()`,
        returnByValue: true,
      }).catch(() => null),
      sleep(8000).then(() => null),
    ]);
    state = (r && r.result && r.result.value) || state;
    try { if (JSON.parse(state).ok) { booted = true; break; } } catch {}
    await sleep(1500);
  }

  let mods = null;
  if (booted) {
    const r = await Promise.race([
      cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.modUtils ? window.modUtils.getModListName() : null)', returnByValue: true }).catch(() => null),
      sleep(8000).then(() => null),
    ]);
    try { mods = JSON.parse(r.result.value); } catch {}
  }

  const out = {
    booted, elapsed: Math.round((Date.now() - t0) / 1000), state,
    modCount: mods ? mods.length : null,
    mods,
    consoleTail: lines.slice(-40),
  };
  writeFileSync(LOG, lines.join('\n'));
  writeFileSync('C:/Users/79403/Desktop/dol/work/b2_boot-result.json', JSON.stringify(out, null, 1));
  console.log('BOOTED=' + booted + ' in ' + out.elapsed + 's  state=' + state);
  if (mods) console.log('mods(' + mods.length + '): ' + mods.join(' | '));
  console.log('--- console tail ---');
  for (const l of out.consoleTail) console.log(l);
  chrome.kill();
  process.exit(booted ? 0 : 1);
}

main().catch((e) => { console.error('PROBE FATAL', e); process.exit(2); });
