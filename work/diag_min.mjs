import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9227;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-diag-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const src = readFileSync('C:/Users/79403/Desktop/dol/work/cdp_pack.mjs', 'utf8');
const lines = src.split(/\r?\n/);
const featDiagLine = lines.find((l) => l.includes('featDiag = await ev'));
const trapLine = lines.find((l) => l.includes('getOwnPropertyDescriptor(f,'));
const clearLine = lines.find((l) => l.includes('rentCostModifier = 1; delete V.locked'));
const featDiagExpr = new Function('return `' + featDiagLine.match(/await ev\(`(.*)`\)/)[1] + '`')();
const trapExpr = new Function('return `' + trapLine.match(/await ev\(`(.*)`\)/)[1] + '`')();
const clearExpr = new Function('return `' + clearLine.match(/await ev\(`(.*)`\)/)[1] + '`')();
console.log('featDiagExpr len', featDiagExpr.length);
console.log('trapExpr len', trapExpr.length);
console.log('featDiag contains \\\\n two-char:', featDiagExpr.includes('\\n'));
console.log('trap head:', trapExpr.slice(0, 80));

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
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    }),
  };
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  await sleep(3000);
  const ws = connect(await getPageWs());
  await ws.ready;
  const ev = async (expr) => {
    const r = await Promise.race([
      ws.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
      sleep(25000).then(() => { throw new Error('evaluate timeout'); }),
    ]);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('page exception: ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 500));
    }
    return r.result.value;
  };

  let t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
    if (ok) break;
    await sleep(2000);
  }
  console.log('booted');
  const bsrc = src.match(/const BJXTEST_SRC = `([\s\S]*?)`\s*;/)[1];
  await ev(bsrc);
  await sleep(1000);
  // age gate
  const open = await ev('BJXTEST.dialogOpen()');
  if (open) {
    await ev('BJXTEST.ageGateCheck()');
    await sleep(400);
    await ev('BJXTEST.ageGateEnter()');
    await sleep(800);
  }
  console.log('passage:', await ev('BJXTEST.passage()'));

  // ---- Stage A: fresh page, run the exact featDiag expr ----
  console.log('\n[A] fresh featDiag:');
  console.log(await ev(featDiagExpr));

  // ---- Stage A2: bisect the new fragments ----
  const bis = async (label, runCode) => {
    const r = await ev(`BJXTEST.run(` + JSON.stringify(runCode) + `)`);
    console.log('[A2:' + label + ']', String(r).slice(0, 200));
  };
  await bis('rentMod', 'JSON.stringify({rentMod: V.settings ? String(V.settings.rentCostModifier) : ""})');
  await bis('lockedVar', 'JSON.stringify({lockedVar: (typeof V.locked === "undefined") ? "deleted" : String(V.locked)})');
  await bis('lockStack-nostack', 'JSON.stringify({lockStack: (window.__lockStacks && window.__lockStacks[0]) ? "x" : "none"})');
  await ev(`window.__lockStacks = ["Error\\n    at foo (bar:1:1)\\n    at baz (qux:2:2)"]`);
  await bis('lockStack-withstack', 'JSON.stringify({lockStack: (window.__lockStacks && window.__lockStacks[0]) ? window.__lockStacks[0].split("\\n").slice(1, 5).join(" | ").slice(0, 400) : "none"})');
  const innerExact = featDiagExpr.slice("BJXTEST.run('".length, featDiagExpr.length - 2);
  console.log('innerExact len:', innerExact.length, 'head:', JSON.stringify(innerExact.slice(0, 30)), 'tail:', JSON.stringify(innerExact.slice(-30)));
  await bis('full-inner-json', innerExact);
  console.log('[A3] direct eval of inner via expression:');
  try {
    console.log(String(await ev('(' + innerExact + ')')).slice(0, 200));
  } catch (e) { console.log('DIRECT ERR:', e.message.slice(0, 200)); }

  // ---- Stage B: after trap install ----
  console.log('\n[B] trap install returns:', await ev(trapExpr));
  console.log('[B] featDiag after trap:');
  console.log(await ev(featDiagExpr));

  // ---- Stage B2: clear guards expr + featDiag ----
  console.log('\n[B2] clear returns:', await ev(clearExpr));
  console.log('[B2] featDiag after clear:');
  console.log(await ev(featDiagExpr));

  // ---- Stage C: after navigation ----
  await ev('BJXTEST.goto("Sewers Slime")');
  await sleep(1000);
  console.log('\n[C] passage after goto:', await ev('BJXTEST.passage()'));
  console.log('[C] featDiag after goto:');
  console.log(await ev(featDiagExpr));
  console.log('[C] V.feats descriptor has setter:', await ev(`!!Object.getOwnPropertyDescriptor(SugarCube.State.variables.feats, "locked")?.set`));
  console.log('[C] __lockStacks len:', await ev(`(window.__lockStacks || []).length`));

  // ---- Stage D: simulate a lock write then featDiag ----
  await ev(`SugarCube.State.variables.feats.locked = true`);
  console.log('\n[D] featDiag after forced lock write:');
  console.log(await ev(featDiagExpr));
  console.log('[D] __lockStacks[0] head:', await ev(`(window.__lockStacks && window.__lockStacks[0]) ? window.__lockStacks[0].slice(0, 200) : "none"`));

  // ---- Stage E2: exact S48 timeline on a fresh page ----
  console.log('\n[E2] exact S48 timeline:');
  console.log('[E2] fresh locked:', await ev(`String(SugarCube.State.variables.feats.locked)`));
  await ev(`SugarCube.State.variables.parasite.left_ear = {name: "slime"}; SugarCube.State.variables.parasite.right_ear = {name: "slime"}; SugarCube.State.variables.player.penisExist = true; SugarCube.State.variables.slime = 0`);
  await ev(clearExpr);
  console.log('[E2] after clear locked:', await ev(`String(SugarCube.State.variables.feats.locked)`));
  await ev(trapExpr);
  await ev(`window.__trappedFeats = SugarCube.State.variables.feats`);
  await ev('BJXTEST.goto("Sewers Slime 4")');
  await sleep(1200);
  console.log('[E2] after goto passage:', await ev('BJXTEST.passage()'));
  console.log('[E2] after goto locked:', await ev(`String(SugarCube.State.variables.feats.locked)`));
  console.log('[E2] trap object still V.feats:', await ev(`SugarCube.State.variables.feats === window.__trappedFeats`));
  console.log('[E2] lockStacks len:', await ev(`(window.__lockStacks||[]).length`));
  await ev(clearExpr);
  console.log('[E2] after 2nd clear locked:', await ev(`String(SugarCube.State.variables.feats.locked)`));
  const cl = await ev(`BJXTEST.clickLink('顺其自然')`);
  await sleep(2000);
  console.log('[E2] clickLink:', cl, 'passage:', await ev('BJXTEST.passage()'));
  console.log('[E2] after click locked:', await ev(`String(SugarCube.State.variables.feats.locked)`));
  console.log('[E2] feat val:', await ev(`String(SugarCube.State.variables.feats.currentSave && SugarCube.State.variables.feats.currentSave["Ear Slime Amalgam"])`));
  console.log('[E2] guards:', await ev(`String(SugarCube.State.variables.cheatsEnabled) + "/" + String(SugarCube.State.variables.debug) + "/" + String(SugarCube.State.variables.settings.rentCostModifier) + "/" + String(SugarCube.State.variables.settings.allureModifier) + "/" + String(SugarCube.State.variables.statFreeze) + "/" + String(SugarCube.State.variables.gamemode)`));
  console.log('[E2] noEarSlime:', await ev(`String(SugarCube.State.variables.noEarSlime)`));

  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });