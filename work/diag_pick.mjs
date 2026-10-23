// diag: why does goto("Sewers Shackle Pick") render without the BJX E3
// Chinese block (and sometimes stay on Shackle Struggle)?
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';

const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9785;
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
  const consoleLines = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ');
      consoleLines.push(`[${m.params.type}] ${text.slice(0, 300)}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      consoleLines.push('[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 300));
    }
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
  await ev(`BJXTEST.clickLink('School Start')`);
  for (let i = 0; i < 40; i++) {
    await ev(`(() => { const b = document.querySelector('#ui-dialog-close'); if (b) b.click(); return true; })()`);
    const p = await ev(`SugarCube.State.passage`);
    if (p === 'Oxford Street') break;
    await sleep(500);
  }
  await sleep(900);

  const dump = async (tag) => {
    const info = await ev(`(() => {
      const V = SugarCube.State.variables;
      const t = Array.from(document.querySelectorAll('#passages .passage')).map(e => e.textContent).join(' ');
      const links = Array.from(document.querySelectorAll('#passages a.link-internal, #passages a.macro-link'))
        .map(a => a.textContent.trim().replace(/^\\(\\d+\\)\\s+/, '')).slice(0, 8);
      const errs = Array.from(document.querySelectorAll('.error')).map(e => e.textContent.trim().slice(0, 120));
      const i = t.indexOf('你试图挣脱');
      return JSON.stringify({
        passage: SugarCube.State.passage,
        sewerschasedstep: V.sewerschasedstep, phase: V.phase,
        skulduggerydiff: V.skulduggerydifficulty, skulduggery: V.skulduggery,
        skulduggerysuccess: V.skulduggerysuccess,
        hasChinese: i >= 0, ctx: i >= 0 ? t.slice(i, i + 30) : 'none',
        len: t.length, links, errs,
      });
    })()`);
    log(tag, info);
  };

  // S48 sequence: E1 Shackle Struggle first
  await ev(`BJXTEST.setVars({ stress: 0, exposed: 0, arousal: 0, sewerschasedstep: 1, phase: 0 })`);
  await ev(`BJXTEST.run('V.physiqueSuccess = 0')`);
  await ev(`BJXTEST.goto('Sewers Shackle Struggle')`);
  await sleep(1000);
  await dump('after Shackle Struggle');

  // round 1: like the fixed test (difficulty 100000)
  await ev(`BJXTEST.setVars({ sewerschasedstep: 1, skulduggerydifficulty: 100000 })`);
  await ev(`BJXTEST.run('V.skulduggery = 0')`);
  await ev(`BJXTEST.goto('Sewers Shackle Pick')`);
  await sleep(1200);
  await dump('after Pick (difficulty 100000)');

  // round 2: normal difficulty 600, re-pin sewerschasedstep
  await ev(`BJXTEST.setVars({ sewerschasedstep: 1, skulduggerydifficulty: 600 })`);
  await ev(`BJXTEST.goto('Sewers Shackle Pick')`);
  await sleep(1200);
  await dump('after Pick (difficulty 600)');

  // what does morganhunt actually do to sewerschasedstep?
  await ev(`BJXTEST.run('V.sewerschasedstep = 1')`);
  await ev(`BJXTEST.goto('Sewers Shackle Struggle')`);
  await sleep(1000);
  await dump('after Struggle again (watch sewerschasedstep mutation)');

  // ---- feat diagnosis: replicate the TF1 earnFeat call ----
  await ev(`BJXTEST.run('V.slime = 0')`);
  await ev(`BJXTEST.run('V.parasite.left_ear = {name: "slime"}; V.parasite.right_ear = {name: "slime"}')`);
  const pre = await ev(`JSON.stringify({
    debug: V.debug, cheatsEnabled: V.cheatsEnabled, gamemode: V.gamemode,
    statFreeze: V.statFreeze, allureModifier: V.settings ? V.settings.allureModifier : "noSettings",
    featsLocked: V.feats ? V.feats.locked : "noFeats", featsSoft: V.feats ? V.feats.soft : null,
    currentSave: V.feats ? Object.keys(V.feats.currentSave || {}) : null,
    setupHasFeat: typeof setup !== "undefined" && setup.feats ? !!setup.feats["Ear Slime Amalgam"] : "noSetup",
  })`);
  log('feat guards before', pre);
  const cleared = await ev(`BJXTEST.run('V.debug = false; V.cheatsEnabled = false; V.gamemode = "normal"; V.statFreeze = 0; V.settings.allureModifier = 1; V.feats.locked = false; V.feats.soft = false; "cleared"')`);
  log('clear guards result', cleared);
  await ev(`BJXTEST.goto('Slime Transformation 1')`);
  await sleep(1200);
  const post = await ev(`JSON.stringify({
    passage: SugarCube.State.passage,
    noEarSlime: V.noEarSlime, slime: V.slime,
    currentSaveKeys: V.feats ? Object.keys(V.feats.currentSave || {}) : null,
    featVal: V.feats && V.feats.currentSave ? String(V.feats.currentSave["Ear Slime Amalgam"]) : "none",
    pageErrors: Array.from(document.querySelectorAll('.error')).map(e => e.textContent.trim().slice(0, 120)),
  })`);
  log('after TF1', post);
  // manual call as a cross-check
  const manual = await ev(`BJXTEST.run('(typeof earnFeat === "function") ? (earnFeat("Ear Slime Amalgam"), String(V.feats.currentSave["Ear Slime Amalgam"])) : "noFn"')`);
  log('manual earnFeat', manual);

  log('console tail', consoleLines.slice(-15).join(' | ').slice(0, 1500));

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