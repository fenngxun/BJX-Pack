// diag: reproduce the street-sea Sea Dive phase-0 failure with the cdp_pack harness
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'C:/Users/79403/Desktop/dol/work/diag-sea-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9232;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-diagsea-'));
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
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); }),
  };
}

// verbatim from cdp_pack.mjs (S1-S3 proven harness)
const BJXTEST_SRC = `
(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const SC = window.SugarCube;
  const linkText = (a) => a.textContent.trim().replace(/^\\\\((?:Shift \\\\+ )?\\\\d+\\\\)\\\\s+/, '');
  window.BJXTEST = {
    passage: () => SC.State.passage,
    var: (n) => SC.State.variables[n],
    setVars: (o) => { Object.assign(SC.State.variables, o); return true; },
    run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 200); } },
    goto: (n) => { SC.Engine.play(n); return true; },
    links: () => qa('#passages a.link-internal, #passages a.macro-link').map(linkText),
    hasEl: (s) => !!q(s),
    elText: (s) => { const el = q(s); return el ? el.textContent.trim().slice(0, 200) : null; },
    dialogOpen: () => !!(SC.Dialog && SC.Dialog.isOpen()),
    ageGateCheck: () => { const cb = q('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; },
    ageGateEnter: () => { const b = qa('#ui-dialog button').find((x) => x.textContent.trim() === 'Enter'); if (b) { b.click(); return true; } return false; },
    closeDialog: () => { const b = q('#ui-dialog-close'); if (b) { b.click(); return true; } return false; },
    clickLink: (prefix) => {
      const el = qa('#passages a.link-internal, #passages a.macro-link').find((a) => linkText(a).startsWith(prefix));
      if (el) { el.click(); return true; }
      return false;
    },
    domErrors: () => qa('.error').map((e) => e.textContent.trim().slice(0, 250)),
  };
  return true;
})()
`;

async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
  try {
    const ws = await getPageWs();
    const cdp = connect(ws);
    await cdp.ready;
    await cdp.send('Runtime.enable');
    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.exceptionDetails) {
        log('EVAL-FAILED expr(' + expr.length + '):', expr);
        log('EVAL-ERR:', (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
        throw new Error('page exc');
      }
      return r.result.value;
    };
    // S1 boot
    const t0 = Date.now();
    let booted = false;
    while (Date.now() - t0 < 120000) {
      const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
      if (ok) { booted = true; break; }
      await sleep(2000);
    }
    log('booted:', booted);
    if (!booted) throw new Error('no boot');
    await ev(BJXTEST_SRC);
    // S2 age gate
    await sleep(1500);
    if (await ev('BJXTEST.dialogOpen()')) {
      await ev('BJXTEST.ageGateCheck()');
      await sleep(400);
      await ev('BJXTEST.ageGateEnter()');
      await sleep(800);
    }
    log('passage after gate:', await ev('BJXTEST.passage()'));
    // S3 debug start (same as the pack suite)
    await ev(`BJXTEST.setVars({ debug: 1 })`);
    await ev(`SugarCube.State.variables.options.debugdisable = 'f'`);
    await ev('BJXTEST.goto("Start2")');
    await sleep(1200);
    await ev(`BJXTEST.clickLink('School Start')`);
    await sleep(1500);
    log('after school start:', await ev('BJXTEST.passage()'));
    log('time now:', await ev(`BJXTEST.run('"d:" + Time.weekDayName + " h:" + Time.hour + ":" + Time.minute + " state:" + Time.dayState')`));

    // --- scenario A: clean state, deep dive directly (sea 95) ---
    await ev(`BJXTEST.setVars({ sea: 95, eventskip: 1, stress: 0, tiredness: 0, allure: 0 })`);
    await ev(`BJXTEST.run('V.swimmingskill = 1000000; V.temple_burden = 0; "ok"')`);
    await ev('BJXTEST.goto("Sea")');
    await sleep(1500);
    log('[A] passage:', await ev('BJXTEST.passage()'));
    log('[A] dive links count:', await ev(`BJXTEST.run('document.querySelectorAll("#passages a.link-internal, #passages a.macro-link").length + " total; " + Array.from(document.querySelectorAll("#passages a")).filter(function(a){return a.textContent.indexOf("潜水")>=0}).length + " dive"')`));
    log('[A] dive link details:', await ev(`BJXTEST.run('Array.from(document.querySelectorAll("#passages a")).filter(function(a){return a.textContent.indexOf("潜水")>=0}).map(function(a,i){return i + "|cls:" + a.className + "|tgt:" + (a.getAttribute("data-passage")||a.getAttribute("data-cb")||"-") + "|parent:" + (a.parentElement && a.parentElement.className)}).join(" ;; ")')`));
    log('[A] phase before click:', await ev(`BJXTEST.run('String(V.phase)')`));
    log('[A] click:', await ev(`BJXTEST.clickLink('潜水')`));
    await sleep(1500);
    log('[A] after click passage:', await ev('BJXTEST.passage()'));
    log('[A] phase after click:', await ev(`BJXTEST.run('String(V.phase)')`));
    log('[A] danger/eventskip:', await ev(`BJXTEST.run('"danger:" + V.danger + " allure:" + V.allure + " skip:" + V.eventskip + " stress:" + V.stress + "/" + V.stressmax')`));
    log('[A] page text head:', await ev(`BJXTEST.run('document.querySelector("#passages .passage").textContent.replace(/\\s+/g, " ").slice(0, 300)')`));
    log('[A] page text FULL:', await ev(`BJXTEST.run('document.querySelector("#passages .passage").textContent.replace(/\\s+/g, " ").slice(0, 1200)')`));
    log('[A] swimmingskill:', await ev(`BJXTEST.run('"skill:" + V.swimmingskill + " swimming:" + V.swimming + " oxygen:" + V.oxygen + " phase:" + V.phase')`));
    log('[A] Sea Dive passage source head:', await ev(`BJXTEST.run('(() => { const p = SugarCube.Story.get("Sea Dive"); return p ? p.text.slice(0, 260) : "none"; })()')`));
    log('[A] passage count:', await ev(`BJXTEST.run('document.querySelectorAll("#passages .passage").length + " ids:" + Array.from(document.querySelectorAll("#passages .passage")).map(function(e){return e.id}).join(",")')`));

    // --- scenario B: reroll a fresh dive from a mid-game-ish state ---
    await ev(`BJXTEST.setVars({ sea: 95, eventskip: 1, stress: 0, tiredness: 0, phase: 0 })`);
    await ev('BJXTEST.goto("Sea")');
    await sleep(1200);
    log('[B] click:', await ev(`BJXTEST.clickLink('潜水')`));
    await sleep(1500);
    log('[B] after click passage:', await ev('BJXTEST.passage()'));
    log('[B] phase:', await ev(`BJXTEST.run('String(V.phase)')`));
    log('[B] page text head:', await ev(`BJXTEST.run('document.querySelector("#passages .passage").textContent.replace(/\\s+/g, " ").slice(0, 300)')`));
    log('[B] hit 你潜入水下:', await ev(`BJXTEST.run('document.querySelector("#passages").textContent.indexOf("你潜入水下") >= 0')`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
    process.exit(0);
  }
}
main();