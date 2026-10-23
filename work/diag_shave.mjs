// Diagnose the "自动脱毛" click hang in Farm Shed (S33 DRIVER-ABORT).
// Strategy: reproduce state, click the link with a short race, then probe
// the main thread with tiny evaluates to tell dead-loop vs slow-render.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9224;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-diag-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let mid = 0;
  const pending = new Map();
  const listeners = [];
  const cdp = {
    send: (method, params) => new Promise((resolve, reject) => {
      const id = ++mid;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    }),
    on: (ev, fn) => listeners.push({ ev, fn }),
  };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    } else if (m.method) {
      for (const l of listeners) if (l.ev === m.method) l.fn(m.params);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(cdp));
    ws.addEventListener('error', reject);
  });
}

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

const HELPER = `
window.BJXD = {
  ready: () => !!(window.SugarCube && window.SugarCube.State && window.SugarCube.State.variables),
  setVars: (o) => { Object.assign(window.SugarCube.State.variables, o); return true; },
  run: (code) => { const V = window.SugarCube.State.variables; return eval(code); },
  passage: () => window.SugarCube.State.passage,
  goto: (p) => { window.SugarCube.Engine.play(p); return true; },
  links: () => Array.from(document.querySelectorAll('#passages a')).map((a) => a.textContent.trim()),
  hasLink: (p) => Array.from(document.querySelectorAll('#passages a')).some((a) => a.textContent.trim().startsWith(p)),
  click: (p) => {
    const el = Array.from(document.querySelectorAll('#passages a')).find((a) => a.textContent.trim().startsWith(p));
    if (el) { el.click(); return true; }
    return false;
  },
  text: () => { const el = document.querySelector('#passages .passage'); return el ? el.textContent.slice(0, 300) : null; },
  ageCheck: () => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; },
  ageEnter: () => { const b = Array.from(document.querySelectorAll('#ui-dialog button')).find((x) => x.textContent.trim() === 'Enter'); if (b) { b.click(); return true; } return false; },
};
true;
`;

async function main() {
  // trace collector server (synchronous XHR beacons land here even during hang)
  const traces = [];
  const { createServer } = await import('node:http');
  const collector = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url.includes('trace')) traces.push(body);
      res.writeHead(200);
      res.end('ok');
    });
  }).listen(8767, '127.0.0.1');
  const hardExit = setTimeout(() => {
    console.error('[diag] TRACES (' + traces.length + '):');
    for (const t of traces) console.error('  T>', t);
    console.error('[diag] HARD EXIT (script hung)');
    process.exit(2);
  }, 90000);
  hardExit.unref();
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const cdp = await getPageWs().then(connect);
    const ev = async (expr, timeoutMs = 10000) => {
      const r = await Promise.race([
        cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
        sleep(timeoutMs).then(() => { throw new Error('TIMEOUT(' + timeoutMs + 'ms): ' + expr.slice(0, 80)); }),
      ]);
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error('page exception: ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 400));
      }
      return r.result.value;
    };
    const log = (...a) => console.log('[diag]', ...a);

    // boot
    let booted = false;
    for (let i = 0; i < 40; i++) {
      try { if (await ev('BJXD && BJXD.ready ? BJXD.ready() : (window.SugarCube ? "sc-only" : false)', 3000)) { booted = true; break; } } catch {}
      // helper may not be injected yet
      try { await cdp.send('Runtime.evaluate', { expression: HELPER }); } catch {}
      await sleep(750);
    }
    if (!booted) { log('GAME DID NOT BOOT'); return; }
    log('game booted, passage =', await ev('BJXD.passage()'));

    // age gate
    for (let i = 0; i < 10; i++) {
      const cb = await ev('BJXD.ageCheck()');
      const en = await ev('BJXD.ageEnter()');
      if (!cb && !en) break;
      await sleep(400);
    }
    log('after age gate, passage =', await ev('BJXD.passage()'));

    // debug start
    await ev('BJXD.setVars({ debug: 1 })');
    await ev('BJXD.goto("Start2")');
    await sleep(800);
    log('at', await ev('BJXD.passage()'));

    // S33-equivalent init (skip clothesIndex/clone: run-eval scope lacks them)
    await ev('BJXD.run("try { C.npc.Alex = C.npc.Alex || {love: 0, dom: 0, lust: 0} } catch(e) {}; \\"ok\\"")');
    await ev('BJXD.setVars({ exposed: 0, money: 100000, moorburger: 0, eventskip: 1, rng: 1, stress: 0, farm: {}, plots: { farm: [] } })');
    await ev('BJXD.run("V.options = V.options || {}; V.options.bjx_animal = 1; V.options.bjx_eventTF = 1; \\"ok\\"")');
    await ev('BJXD.setVars({ slime: 1, pblevel: 3, pbgrowth: 0, pblevelballs: 0, pbgrowthballs: 0, pbstrip: 0 })');
    await ev('BJXD.goto("Farm Shed")');
    await sleep(900);
    log('at', await ev('BJXD.passage()'), 'links:', JSON.stringify(await ev('BJXD.links()')).slice(0, 400));
    const hasShave = await ev('BJXD.hasLink("自动脱毛")');
    log('shave link present:', hasShave);
    if (!hasShave) { log('ABORT: shave link missing, injection condition not met'); return; }

    // ---- ROUND 29: shadow-wrapper boundaries + Engine.play + wikifyEval done ----
    await ev(`(() => {
      const beacon = (label) => {
        try { const x = new XMLHttpRequest(); x.open('POST', 'http://127.0.0.1:8767/trace', false); x.send(label); } catch (e) {}
      };
      let seq = 0;
      const res = [];
      try {
        const proto = window.SugarCube.MacroContext.prototype;
        const origCSW = proto.createShadowWrapper;
        if (!origCSW.__bjxR29) {
          proto.createShadowWrapper = function() {
            const fns = Array.prototype.slice.call(arguments);
            const wrapped = fns.map((fn, i) => (typeof fn === 'function' && !fn.__bjxR29f)
              ? function() {
                  beacon(seq++ + ' >shadow[' + i + ']');
                  try { const r = fn.apply(this, arguments); beacon(seq++ + ' <shadow[' + i + ']'); return r; }
                  catch (e) { beacon(seq++ + ' !shadow[' + i + '] ' + (e && e.message)); throw e; }
                }
              : fn);
            wrapped.forEach((f) => { if (f) f.__bjxR29f = true; });
            return origCSW.apply(this, wrapped);
          };
          proto.createShadowWrapper.__bjxR29 = true;
          res.push('csw:ok');
        } else res.push('csw:skip');
      } catch (e) { res.push('csw EXC ' + e.message); }
      try {
        const E = window.SugarCube.Engine;
        if (!E.play.__bjxR29) {
          const origPlay = E.play;
          E.play = function() {
            beacon(seq++ + ' >Engine.play ' + (arguments[0] || ''));
            try { const r = origPlay.apply(this, arguments); beacon(seq++ + ' <Engine.play'); return r; }
            catch (e) { beacon(seq++ + ' !Engine.play ' + (e && e.message)); throw e; }
          };
          E.play.__bjxR29 = true;
          res.push('play:ok');
        }
      } catch (e) { res.push('play EXC ' + e.message); }
      try {
        const W = window.Wikifier || window.SugarCube.Wikifier;
        if (!W.wikifyEval.__bjxR29) {
          const origWE = W.wikifyEval;
          const hooked = function(source) {
            beacon(seq++ + ' >WE[' + String(source).length + ']');
            try { const r = origWE.apply(this, arguments); beacon(seq++ + ' <WE'); return r; }
            catch (e) { beacon(seq++ + ' !WE ' + (e && e.message)); throw e; }
          };
          hooked.__bjxR29 = true;
          W.wikifyEval = hooked;
          res.push('we:ok');
        }
      } catch (e) { res.push('we EXC ' + e.message); }
      const wrapMacro = (name) => {
        const m = window.SugarCube.Macro.get(name);
        if (!m || m.handler.__bjxR29) return name + ':skip';
        const orig = m.handler;
        const wrapped = function() {
          let a = '';
          try { a = this.args && this.args.raw !== undefined ? JSON.stringify(this.args.raw).slice(0, 80) : ''; } catch (e) {}
          beacon(seq++ + ' >' + name + ' ' + a);
          try { const r = orig.apply(this, arguments); beacon(seq++ + ' <' + name); return r; }
          catch (e) { beacon(seq++ + ' !' + name + ' ' + (e && e.message)); throw e; }
        };
        wrapped.__bjxR29 = true;
        m.handler = wrapped;
        return name + ':ok';
      };
      res.push(wrapMacro('set'), wrapMacro('for'), wrapMacro('if'));
      try {
        const eff = window.SugarCube.Macro.get('effects');
        if (eff && !eff.handler.__bjxR29) {
          const orig = eff.handler;
          const wrapped = function() {
            beacon(seq++ + ' >EFFECTS');
            try { const r = orig.apply(this, arguments); beacon(seq++ + ' <EFFECTS'); return r; }
            catch (e) { beacon(seq++ + ' !EFFECTS ' + (e && e.message)); throw e; }
          };
          wrapped.__bjxR29 = true;
          eff.handler = wrapped;
          res.push('effects:ok');
        } else res.push('effects:' + (eff ? 'skip' : 'missing'));
      } catch (e) { res.push('effects EXC ' + e.message); }
      return 'r29: ' + res.join(',');
    })()`);
    log('R29 hooks installed; clicking INJECTED link ...');

    const t0 = Date.now();
    let hung = false;
    try {
      await ev('BJXD.click("自动脱毛")', 9000);
      log('R25 injected click COMPLETED in', Date.now() - t0, 'ms; passage =', await ev('BJXD.passage()', 4000));
    } catch (e) {
      hung = true;
      log('R25 injected click HANGS (as expected)');
    }
    await sleep(1500);
    console.error('[diag] R25 TRACES (' + traces.length + '):');
    for (const t of traces) console.error('  T>', t);
    if (!hung) log('R25 NOTE: click completed - payload above is the real injected content');
    return;
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('[diag] fatal:', e.message); process.exit(1); });