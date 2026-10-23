// Path A (GUI import) test: clean HTML -> addModIndexDB -> reload -> verify.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9250;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-gui-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZIP_B64 = readFileSync('C:/Users/79403/Desktop/dol/work/bjx-pack-1.0.0.mod.zip').toString('base64');
const src = readFileSync('C:/Users/79403/Desktop/dol/work/cdp_pack.mjs', 'utf8');

async function getPageWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('dol-clean'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no page');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  return {
    send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pending.set(mid, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: mid, method, params })); }); },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}
async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
  await sleep(4000);
  const ws = connect(await getPageWs()); await ws.ready;
  const ev = async (expr, timeout = 30000) => {
    const r = await Promise.race([ws.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }), sleep(timeout).then(() => { throw new Error('timeout'); })]);
    if (r.exceptionDetails) throw new Error('exc: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || '').slice(0, 250));
    return r.result.value;
  };
  let t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    if (await ev(`!!(window.SugarCube && SugarCube.State && SugarCube.State.passage)`).catch(() => false)) break;
    await sleep(2000);
  }
  console.log('clean boot ok, passage:', await ev(`String(SugarCube.State.passage)`));
  console.log('modUtils available:', await ev(`String(!!window.modUtils)`));
  console.log('modList before:', await ev(`String(window.modUtils ? window.modUtils.getModListName() : 'none')`));

  // import the zip via the ModLoader storage API (same one the GUI uses)
  console.log('zip b64 bytes:', ZIP_B64.length);
  await ev(`window.__zipB64 = ${JSON.stringify(ZIP_B64)}; 'stored'`, 60000);
  const importResult = await ev(`(async () => {
    try {
      await window.modModLoadController.addModIndexDB('bjx-pack', window.__zipB64);
      return 'imported';
    } catch (e) { return 'EXC: ' + String(e).slice(0, 200); }
  })()`, 120000);
  console.log('import:', importResult);
  console.log('modList after:', await ev(`String(window.modUtils.getModListName())`));

  // reload: ModLoader should auto-load the IndexedDB mod at boot
  await ev(`location.reload(); 'reloading'`, 10000);
  t0 = Date.now();
  let booted = false;
  while (Date.now() - t0 < 300000) {
    if (await ev(`!!(window.SugarCube && SugarCube.State && SugarCube.State.passage)`).catch(() => false)) { booted = true; break; }
    await sleep(2000);
  }
  console.log('booted after reload:', booted);
  if (!booted) { chrome.kill(); process.exit(1); }
  await sleep(2000);

  // verify the mod is live
  const bsrc = src.match(/const BJXTEST_SRC = `([\s\S]*?)`\s*;/)[1];
  await ev(bsrc); await sleep(800);
  if (await ev('BJXTEST.dialogOpen()')) { await ev('BJXTEST.ageGateCheck()'); await sleep(300); await ev('BJXTEST.ageGateEnter()'); await sleep(800); }
  console.log('modList:', await ev(`String(window.modUtils.getModListName())`));
  console.log('pack zip loaded:', await ev(`String((window.modUtils.getModListName() || []).some(m => String(m).includes('bjx-pack')))`));

  // spot checks: widgets + cheats panel + raccoon TF + canvas layers
  console.log('widgets:', await ev(`["raccoonTransform","slimetransform","optionsmods","cheats-characterVisual"].map(n=>n+":"+(!!SugarCube.Macro.get(n))).join(" ")`));
  await ev(`BJXTEST.run('V.saveVersions = [StartConfig.version]; V.objectVersion = V.objectVersion || {}; V.options.bjx_animal = true; "ok"')`);
  await ev('BJXTEST.goto("Start2")'); await sleep(800);
  await ev(`BJXTEST.clickLink('School Start')`);
  for (let i = 0; i < 60; i++) { if (await ev('String(BJXTEST.passage())').catch(() => '') === 'Oxford Street') break; await sleep(500); }
  console.log('started at:', await ev('String(BJXTEST.passage())'));
  await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<raccoonTransform>>');})()`);
  console.log('raccoon:', await ev(`JSON.stringify({r:V.raccoon, ears:V.transformationParts.raccoon.ears})`));
  await ev('BJXTEST.goto("Bedroom")'); await sleep(2000);
  console.log('canvas layers:', await ev(`String(!!Renderer.CanvasModels.main.layers.raccoon_ears && !!Renderer.CanvasModels.main.__bjxTfLayers)`));
  console.log('mapped:', await ev(`String(T.modeloptions && T.modeloptions.raccoon_ears_type)`));
  const ch = await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<cheats-characterVisual>>'); var t=d.textContent; return JSON.stringify({animal:t.indexOf('\\u6d63\\u718a')>=0, errs:d.querySelectorAll('.error').length});})()`);
  console.log('cheats panel:', ch);

  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
