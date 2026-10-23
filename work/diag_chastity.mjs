// diag: chastityBreakDemon widget - why does type.push('broken') vanish?
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';
import { writeFileSync } from 'fs';

const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9783;
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

  // probe 1: identity - is window.V the same object as SugarCube.State.variables?
  const ident = {
    sameRef: await ev(`window.V === SugarCube.State.variables`),
    vIsProxy: await ev(`String(window.V)`),
    wornSame: await ev(`window.V.worn === SugarCube.State.variables.worn`),
    typeIs: await ev(`JSON.stringify(SugarCube.State.variables.worn.genitals.type)`),
    typeDescriptor: await ev(`(() => { const d = Object.getOwnPropertyDescriptor(SugarCube.State.variables.worn.genitals, 'type'); return d && d.get ? 'getter' : (d && d.writable === false ? 'frozen' : 'plain'); })()`),
  };
  log('identity', ident);

  // probe 2: single-eval push + render + check (all inside one expression)
  const single = await ev(`(() => {
    const SC = window.SugarCube;
    const V = SC.State.variables;
    V.worn.genitals.name = 'chastity belt';
    V.worn.genitals.type.push('chastity');
    const h = document.createElement('div');
    new SC.Wikifier(h, '<<chastityBreakDemon>>');
    return JSON.stringify({
      outLen: h.textContent.trim().length,
      outHead: h.textContent.trim().slice(0, 60),
      type: V.worn.genitals.type,
      broken: V.worn.genitals.type.includes('broken'),
    });
  })()`);
  log('single-eval', single);

  // probe 3: what does the widget actually receive? instrument State.getVar
  const probe3 = await ev(`(() => {
    const SC = window.SugarCube;
    const V = SC.State.variables;
    V.worn.genitals.type = ['naked'];
    V.worn.genitals.type.push('chastity');
    const seen = [];
    const orig = SC.State.getVar;
    SC.State.getVar = function (n) { const v = orig.call(this, n); if (n.includes('worn')) seen.push({ n: String(n), isArr: Array.isArray(v), same: v === V.worn.genitals.type, type: JSON.stringify(v && v.type || v) }); return v; };
    try {
      const h = document.createElement('div');
      new SC.Wikifier(h, '<<chastityBreakDemon>>');
    } finally {
      SC.State.getVar = orig;
    }
    return JSON.stringify({ seen, type: V.worn.genitals.type });
  })()`);
  log('getVar-instrumented', probe3);

  // probe 4: cross-eval (replicating the failing S44 sequence exactly)
  await ev(`V.worn.genitals.type = ['naked']`);
  await ev(`V.worn.genitals.name = 'chastity belt'; V.worn.genitals.type.push('chastity')`);
  const crossA = await ev(`JSON.stringify(SugarCube.State.variables.worn.genitals.type)`);
  const sm = await ev(`(() => { const SC = window.SugarCube; const h = document.createElement('div'); new SC.Wikifier(h, '<<chastityBreakDemon>>'); return JSON.stringify({ outLen: h.textContent.trim().length, outHead: h.textContent.trim().slice(0, 60), errs: Array.from(h.querySelectorAll('.error')).map(e => e.textContent.slice(0, 120)) }); })()`);
  const crossB = await ev(`JSON.stringify(SugarCube.State.variables.worn.genitals.type)`);
  log('cross-eval', { beforeSmoke: crossA, smoke: sm, afterSmoke: crossB });

  writeFileSync('diag-chastity.json', JSON.stringify({ ident, single, probe3, cross: { crossA, sm, crossB } }, null, 2));
  console.log('saved diag-chastity.json');

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