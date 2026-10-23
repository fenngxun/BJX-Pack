// diag: Hospital Parasite page text/DOM dump (native WebSocket CDP, mirrors diag_home.mjs)
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';
import { writeFileSync } from 'fs';

const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9781;
const PROFILE = join(process.cwd(), '.diag-profile-' + Date.now());
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BJXTEST_SRC = `
(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const SC = window.SugarCube;
  window.BJXTEST = {
    passage: () => SC.State.passage,
    var: (n) => SC.State.variables[n],
    setVars: (o) => { Object.assign(SC.State.variables, o); return true; },
    run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 300); } },
    goto: (n) => { SC.Engine.play(n); return true; },
    links: () => qa('#passages a.link-internal, #passages a.macro-link').map(a => a.textContent.trim()),
  };
  return true;
})()
`;

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
  await ev(BJXTEST_SRC);
  await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); const b = Array.from(document.querySelectorAll('#ui-dialog button')).find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
  await sleep(2000);
  log('boot-passage', await ev('BJXTEST.passage()'));
  await ev(`BJXTEST.goto('Start2')`);
  await sleep(800);

  // variant 1: urchin body + ear slime -> first diagnosis + rumour
  await ev(`V.parasite.clit.name = 'urchin'`);
  await ev(`V.parasite.left_ear.name = 'slime'`);
  await ev(`BJXTEST.goto('Hospital Parasite')`);
  await sleep(1000);
  const r1 = {
    at: await ev('BJXTEST.passage()'),
    earSlime: await ev(`String(numberOfEarSlime())`),
    silence: await ev(`String(V.hypnosis_traits && V.hypnosis_traits.silence)`),
    passageEls: await ev(`document.querySelectorAll('#passages .passage').length`),
    len1s: await ev(`document.querySelector('#passages .passage') ? document.querySelector('#passages .passage').textContent.length : -1`),
  };
  await sleep(2500);
  r1.len35s = await ev(`document.querySelector('#passages .passage') ? document.querySelector('#passages .passage').textContent.length : -1`);
  r1.txt = await ev(`document.querySelector('#passages .passage') ? document.querySelector('#passages .passage').textContent.replace(/\\s+/g, ' ').slice(0, 500) : 'NO EL'`);
  r1.hasRumour = await ev(`document.querySelector('#passages .passage') ? document.querySelector('#passages .passage').textContent.includes('顺便说一句') : 'NO EL'`);
  r1.hasEnglish = await ev(`document.querySelector('#passages .passage') ? document.querySelector('#passages .passage').textContent.includes('Firstly, the slime') : 'NO EL'`);
  r1.domErrors = await ev(`Array.from(document.querySelectorAll('.error')).map(e => e.textContent.trim().slice(0, 150))`);
  log('variant1-urchin-earslime', r1);

  // variant 2: livingclothes only -> BJX branch
  await ev(`delete V.parasite.clit.name`);
  await ev(`delete V.parasite.left_ear.name`);
  await ev(`V.parasite.clit.name = 'livingclothes'`);
  await ev(`BJXTEST.goto('Hospital Parasite')`);
  await sleep(2000);
  const r2 = {
    at: await ev('BJXTEST.passage()'),
    hasDianji: await ev(`document.querySelector('#passages .passage') ? document.querySelector('#passages .passage').textContent.includes('电击法') : 'NO EL'`),
    txt: await ev(`document.querySelector('#passages .passage') ? document.querySelector('#passages .passage').textContent.replace(/\\s+/g, ' ').slice(0, 500) : 'NO EL'`),
    links: await ev(`BJXTEST.links()`),
    domErrors: await ev(`Array.from(document.querySelectorAll('.error')).map(e => e.textContent.trim().slice(0, 150))`),
  };
  log('variant2-livingclothes', r2);

  writeFileSync('diag-hospital.json', JSON.stringify({ r1, r2 }, null, 2));
  console.log('saved diag-hospital.json');

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