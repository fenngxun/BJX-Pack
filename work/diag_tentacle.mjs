// diag: S35 physique difficulty + S36 missing Chinese paragraph (self-contained)
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';

const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9777;
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
    clickLink: (prefix) => {
      const el = qa('#passages a.link-internal, #passages a.macro-link').find((a) => a.textContent.trim().startsWith(prefix));
      if (el) { el.click(); return true; }
      return false;
    },
    text: () => { const el = q('#passages .passage'); return el ? el.textContent : null; },
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
    if (Math.floor((Date.now() - t0) / 1000) % 15 === 0) {
      log('boot-wait', await ev(`JSON.stringify({rs: document.readyState, story: !!document.getElementById('story'), sc: !!window.SugarCube, st: !!(window.SugarCube && window.SugarCube.State), url: location.href.slice(0, 60)})`));
      await sleep(2100);
    }
    await sleep(2000);
  }
  if (!booted) throw new Error('game did not boot');
  await ev(BJXTEST_SRC);
  log('boot-passage', await ev('BJXTEST.passage()'));
  // age gate if present
  await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); const b = Array.from(document.querySelectorAll('#ui-dialog button')).find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
  await sleep(2000);
  log('after-gate-passage', await ev('BJXTEST.passage()'));
  log('p3-set', await ev(`BJXTEST.setVars({ slime: 1 })`));
  log('p3-goto', await ev(`BJXTEST.goto('Passout Tentacle World 3')`));
  await sleep(1500);
  log('p3-passage', await ev('BJXTEST.passage()'));
  const fullText = await ev('BJXTEST.text()');
  log('p3-textLen', fullText === null ? 'NULL' : fullText.length);
  log('p3-hasCN', fullText === null ? 'NULL' : fullText.includes('无休止的高潮'));
  log('p3-textTail', fullText === null ? 'NULL' : JSON.stringify(fullText.slice(-700)));
  // the raw passage source the engine actually uses
  log('p3-sourceHasCN', await ev(`(() => { const w = window.SugarCube; const src = w.Wikifier && w.Wikifier.SourceHandler && w.Wikifier.SourceHandler.getPassage ? null : null; return 'skip'; })()`));
  // check via story data in DOM (ModLoader keeps original <tw-passagedata>)
  log('p3-dataEls', await ev(`document.querySelectorAll('tw-passagedata[name="Passout Tentacle World 3"]').length`));
  log('p3-modSource', await ev(`(() => { const els = document.querySelectorAll('tw-passagedata[name="Passout Tentacle World 3"]'); return Array.from(els).map(e => e.textContent.includes('无休止的高潮')); })()`));
  // check SugarCube's own passage store
  log('p3-scStore', await ev(`(() => { const sc = window.SugarCube; try { const p = sc.story.get('Passout Tentacle World 3'); return p ? p.text.includes('无休止的高潮') : 'no-passage'; } catch (e) { return 'EXC:' + e.message; } })()`));

  // ---------- problem 1: physique difficulty ----------
  log('phys-set', await ev(`BJXTEST.setVars({ tentnorth: -2, tenteast: -2, tentcloth: 0, slime: 0 })`));
  await ev(`BJXTEST.goto('Living Clothes Resisting 2')`);
  await sleep(1200);
  log('phys-at', await ev('BJXTEST.passage()'));
  log('phys-set2', await ev(`BJXTEST.setVars({ physique: 20000, physiquemax: 20000 })`));
  log('phys-vars', await ev(`BJXTEST.run('JSON.stringify({physique: V.physique, physiquemax: V.physiquemax, temple_burden: V.temple_burden, moorLuck: V.moorLuck, location: V.location, skillVal: currentSkillValue("physique")})')`));
  log('phys-click', await ev(`BJXTEST.clickLink('尝试挣脱束缚')`));
  await sleep(1500);
  log('phys-after', await ev(`BJXTEST.run('JSON.stringify({passage: SugarCube.State.passage, physiqueSuccess: V.physiqueSuccess, physique: V.physique})')`));
  const t2 = await ev('BJXTEST.text()');
  log('phys-textTail', t2 === null ? 'NULL' : JSON.stringify(t2.slice(-300)));

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