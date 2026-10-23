// Bare boot timing: NO console hook at all, so the measurement excludes
// CDP console-event flooding. Tells us whether the game itself slowed down.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9231;
const PROFILE = mkdtempSync(join(tmpdir(), 'bare-'));
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
  let id = 0;
  const pend = new Map();
  s.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  return {
    send(method, params = {}) {
      return new Promise((res, rej) => {
        const mid = ++id;
        pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result)));
        s.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((r, j) => { s.addEventListener('open', r); s.addEventListener('error', j); }),
  };
}

const main = async () => {
  const t0 = Date.now();
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
  const cdp = connect(await ws());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  let booted = false, n = 0;
  while (Date.now() - t0 < 240000) {
    n++;
    const r = await Promise.race([
      cdp.send('Runtime.evaluate', { expression: `!!(window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage)`, returnByValue: true }).catch(() => null),
      sleep(15000).then(() => null),
    ]);
    if (r && r.result && r.result.value) { booted = true; break; }
    await sleep(1000);
  }
  console.log(`BARE boot: ${booted} in ${Math.round((Date.now() - t0) / 1000)}s (polls=${n})`);
  chrome.kill();
  process.exit(booted ? 0 : 1);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
