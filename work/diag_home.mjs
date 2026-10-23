// diag: S38 Basement Caught / Cage textContent comes back blank while links
// are present - inspect the actual DOM structure of combat passages.
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';

const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9778;
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

  const dumpDom = async (tag) => {
    log(tag + '-passage', await ev('BJXTEST.passage()'));
    log(tag + '-passageEls', await ev(`(() => { const els = document.querySelectorAll('#passages .passage'); return Array.from(els).map(e => ({ cls: e.className, len: e.textContent.length, kids: e.children.length, visible: !!(e.offsetWidth || e.offsetHeight) })); })()`));
    log(tag + '-allPassageEls', await ev(`(() => { return { ids: Array.from(document.querySelectorAll('#passages > *')).map(e => e.tagName + '.' + e.className).slice(0, 10) }; })()`));
    log(tag + '-firstHtml', await ev(`(() => { const e = document.querySelector('#passages .passage'); return e ? JSON.stringify(e.innerHTML.slice(0, 1800)) : 'NULL'; })()`));
    log(tag + '-fullTextHead', await ev(`(() => { const e = document.querySelector('#passages .passage'); return e ? JSON.stringify(e.textContent.slice(0, 600)) : 'NULL'; })()`));
    log(tag + '-fullTextTail', await ev(`(() => { const e = document.querySelector('#passages .passage'); return e ? JSON.stringify(e.textContent.slice(-600)) : 'NULL'; })()`));
    log(tag + '-domErrors', await ev(`(() => { return Array.from(document.querySelectorAll('.error')).map(e => e.textContent.trim().slice(0, 150)); })()`));
    log(tag + '-links', await ev('BJXTEST.links()'));
    log(tag + '-storyVars', await ev(`BJXTEST.run('JSON.stringify({molestationstart: V.molestrationstart, molestart: V.molestationstart, enemyhealth: V.enemyhealth, enemyarousal: V.enemyarousal, enemyarousalmax: V.enemyarousalmax, NPClen: (V.NPCList||[]).length, combatinit: V.combatinit})')`));
  };

  // --- Basement Caught with fresh combat init ---
  log('set1', await ev(`BJXTEST.setVars({ molestationstart: 1, skulduggery: 20000 })`));
  log('goto1', await ev(`BJXTEST.goto('Basement Caught')`));
  await sleep(2500);
  await dumpDom('caught');

  // --- loop once (molestationstart now 0) ---
  log('set2', await ev(`BJXTEST.setVars({ enemyarousal: 9999, enemyarousalmax: 100 })`));
  log('click-continue', await ev(`(() => { const as = Array.from(document.querySelectorAll('#passages a.link-internal, #passages a.macro-link')); const el = as.find(a => a.textContent.trim().startsWith('继续')); if (el) { el.click(); return 'clicked'; } return 'no-link: ' + as.map(a => a.textContent.trim()).slice(0, 8).join('|'); })()`));
  await sleep(2000);
  await dumpDom('caught2');

  // --- Basement Cage directly (NPC already generated) ---
  log('goto-cage', await ev(`BJXTEST.goto('Basement Cage')`));
  await sleep(2500);
  await dumpDom('cage');

  spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
  await sleep(1500);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(0);
}

main().catch((e) => {
  console.error('DIAG ERR: ' + e.message);
  spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
  process.exit(1);
});