// diag: trace V.eventskip / V.allure through the S46 mid-sequence to find
// why goto("Trash") after Trash Search renders trash_4 (Brace/Break free)
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';

const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9784;
const PROFILE = join(process.cwd(), '.diag-profile-' + Date.now());
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--window-size=1280,900', URL,
], { stdio: ['ignore', 'ignore', 'ignore'] });

async function waitCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(500);
  }
  throw new Error('no cdp');
}

async function main() {
  const wsUrl = await waitCdp();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++mid;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return 'PAGE-EXC: ' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result && r.result.result && r.result.result.value;
  };
  const log = (k, v) => console.log('[' + k + '] ' + (typeof v === 'string' ? v : JSON.stringify(v)));

  await send('Runtime.enable');
  await send('Page.enable');
  const t0 = Date.now();
  let booted = false;
  while (Date.now() - t0 < 240000) {
    const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`);
    if (ok === true) { booted = true; break; }
    await sleep(2000);
  }
  if (!booted) throw new Error('game did not boot');
  await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); const b = Array.from(document.querySelectorAll('#ui-dialog button')).find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
  await sleep(1500);
  await ev(`SugarCube.Engine.play('Start2')`);
  await sleep(800);

  const BJXTEST_BOOT = `window.BJXTEST = {
    setVars: (o) => { Object.assign(SugarCube.State.variables, o); return true; },
    run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 200); } },
    goto: (n) => { SugarCube.Engine.play(n); return true; },
    clickLink: (prefix) => {
      const qa = (s) => Array.from(document.querySelectorAll(s));
      const linkText = (a) => a.textContent.trim().replace(/^\\((?:Shift \\+ )?\\d+\\)\\s+/, '');
      const el = qa('#passages a.link-internal, #passages a.macro-link').find((a) => linkText(a).startsWith(prefix));
      if (el) { el.click(); return true; }
      return false;
    },
  }; true`;
  await ev(BJXTEST_BOOT);
  await sleep(300);

  // mirror the debug-start shortcut from cdp_pack.mjs (school start)
  await ev(`BJXTEST.goto('Oxford Street')`);
  await sleep(900);

  const dump = async (tag) => {
    const info = await ev(`(() => {
      const V = SugarCube.State.variables;
      const links = Array.from(document.querySelectorAll('#passages a.link-internal, #passages a.macro-link'))
        .map(a => a.textContent.trim()).slice(0, 6);
      return JSON.stringify({
        passage: SugarCube.State.passage,
        eventskip: V.eventskip, allure: V.allure, rng: V.rng,
        trash: V.trash, bunker: String(V.bunker), stress: V.stress,
        stressmax: V.stressmax, arousal: V.arousal,
        links,
      });
    })()`);
    log(tag, info);
  };

  // S46 sequence start
  await ev(`BJXTEST.setVars({ stress: 0, exposed: 0, arousal: 0 })`);
  await ev(`BJXTEST.run('Time.setTime(12, 0)')`);
  await sleep(400);
  await ev(`BJXTEST.run('V.trash = 0')`);
  await ev(`BJXTEST.run('V.eventskip = 1')`);
  await ev(`BJXTEST.run('C.npc["凯西"].love = 50')`);
  await ev(`BJXTEST.goto('Trash')`);
  await sleep(1200);
  await dump('after goto Trash (den)');

  const clicked = await ev(`BJXTEST.clickLink('进入内部')`);
  log('click 进入内部', clicked);
  await sleep(1500);
  await dump('after Trash Mammals');

  await ev(`BJXTEST.run('V.bunker = 0')`);
  await ev(`BJXTEST.setVars({ rng: 95, trash: 100, trash_key: 1 })`);
  await ev(`BJXTEST.goto('Trash Search')`);
  await sleep(1200);
  await dump('after Trash Search');

  await ev(`BJXTEST.goto('Trash')`);
  await sleep(1200);
  await dump('after goto Trash (the failing one)');

  // also test: same again but with eventskip re-pinned to 1
  await ev(`BJXTEST.run('V.eventskip = 1')`);
  await ev(`BJXTEST.goto('Trash')`);
  await sleep(1200);
  await dump('after goto Trash with eventskip=1 re-pinned');

  spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
  await sleep(1500);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(0);
}

main().catch((e) => {
  console.error('DIAG ERROR: ' + e.message);
  spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
  process.exit(1);
});