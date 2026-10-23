// Minimal boot diagnostic: load the game, capture console/exceptions, then
// report why SugarCube did or did not reach its first passage.
import { spawn } from 'node:child_process';
import { mkdtempSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9231;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-boot-'));
const LOG = 'C:/Users/79403/Desktop/dol/work/diag-boot.log';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
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
  const subs = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else for (const s of subs) s(msg);
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (m) => (m.error ? reject(new Error(method + ': ' + JSON.stringify(m.error))) : resolve(m.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    on(fn) { subs.push(fn); },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const cdp = connect(await getPageWs());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  const tail = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300);
      tail.push(`[${m.params.type}] ${txt}`);
      appendFileSync(LOG, `[${m.params.type}] ${txt}\n`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      const txt = '[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 600);
      tail.push(txt);
      appendFileSync(LOG, txt + '\n');
    }
  });

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return 'PAGE_EXC: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  };

  for (let i = 0; i < 20; i++) {
    await sleep(5000);
    const state = await ev(`JSON.stringify({
      ready: document.readyState,
      story: !!document.getElementById('story'),
      sc: !!window.SugarCube,
      passage: (window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage) || null,
      scripts: document.scripts.length,
      hud: !!document.getElementById('hud')
    })`);
    console.log(i * 5 + 5, 's', state, '| last console:', tail.slice(-1)[0] || '(none)');
    if (state && String(state).includes('"passage":"')) break;
  }

  console.log('\n--- last 25 console lines ---');
  for (const l of tail.slice(-25)) console.log(l);
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
