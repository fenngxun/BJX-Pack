/* Diagnose the combat/sex canvas extension (combatMainPc):
   1. PlayerCombatMapper.mapToTransformationOptions wrapped -> bee/bear
      entries appear in options.transformations
   2. combatMainPc.layers has the bee/bear clones with correct src paths
   3. a render probe resolves the layer src for a transformed PC */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9270;
const URL_ = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let id = 0;
    ws.addEventListener('open', () => {
      resolve({
        ev: (expr) => new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result.result !== undefined ? m.result.result : m.result));
          ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
        }),
      });
    });
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    ws.addEventListener('error', reject);
  });
}

async function main() {
  const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-'));
  const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT,
     '--user-data-dir=' + PROFILE, '--no-first-run', URL_], { stdio: 'ignore' });
  let cdp;
  for (let i = 0; i < 30 && !cdp; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const page = (await res.json()).find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (page) cdp = await connect(page.webSocketDebuggerUrl);
    } catch (e) { /* retry */ }
    if (!cdp) await sleep(1000);
  }
  for (let i = 0; i < 200; i++) {
    if (await cdp.ev('String(!!(window.SugarCube&&SugarCube.State&&SugarCube.State.passage))').catch(() => 'false') === 'true') break;
    await sleep(2000);
  }
  const src = (await import('node:fs')).readFileSync('C:/Users/79403/Desktop/dol/work/cdp_pack.mjs', 'utf8')
    .match(/const BJXTEST_SRC = `([\s\S]*?)`\s*;/)[1];
  await cdp.ev(src);
  await sleep(500);
  if (String(await cdp.ev('BJXTEST.dialogOpen()')) === 'true') {
    await cdp.ev('BJXTEST.ageGateCheck()'); await sleep(300);
    await cdp.ev('BJXTEST.ageGateEnter()'); await sleep(600);
  }
  await cdp.ev(`BJXTEST.setVars({ debug: 1 })`);
  await cdp.ev(`SugarCube.State.variables.options.debugdisable = 'f'`);
  await cdp.ev('BJXTEST.goto("Start2")'); await sleep(800);
  await cdp.ev(`BJXTEST.clickLink('School Start')`);
  for (let i = 0; i < 120; i++) {
    const p = await cdp.ev('String(BJXTEST.passage())').catch(() => 'ERR');
    if (p === 'Oxford Street') break;
    await sleep(500);
  }
  console.log('started at:', await cdp.ev('String(BJXTEST.passage())'));

  // apply bee TF (full) then probe the mapper + model
  await cdp.ev(`BJXTEST.run('V.options.bjx_animal = true; V.bee = 6; V.beebuild = 100;
    V.transformationParts.bee = {ears: "default", tail: "default", wings: "default"}; "ok"')`);
  console.log('mapper wrapped:', await cdp.ev(`String(PlayerCombatMapper.__bjxCombatMap === true)`));
  console.log('model layers:', await cdp.ev(`JSON.stringify({beeEars: !!Renderer.CanvasModels.combatMainPc.layers.beeEars,
    beeTail: !!Renderer.CanvasModels.combatMainPc.layers.beeTail,
    beeWings: !!Renderer.CanvasModels.combatMainPc.layers.beeWings,
    bearEars: !!Renderer.CanvasModels.combatMainPc.layers.bearEars})`));

  // build options the way the model does and inspect bee entries + src
  console.log('options probe:', await cdp.ev(`(function(){
    var opts = PlayerCombatMapper.generateOptions();
    PlayerCombatMapper.mapPlayerToOptions(opts);
    var bee = opts.transformations && opts.transformations.bee;
    var src = null;
    if (bee && Renderer.CanvasModels.combatMainPc.layers.beeEars) {
      try { src = Renderer.CanvasModels.combatMainPc.layers.beeEars.srcfn(opts); } catch(e) { src = 'ERR:'+e.message; }
    }
    return JSON.stringify({src: src, beeEars: bee ? bee.ears : null, root: opts.root, position: opts.position});
  })()`));

  // render the actual canvas once (combat pose) and check the layer state
  await cdp.ev(`BJXTEST.goto("Combat")`).catch(async () => {
    // no combat available in debug start; force-render the model in a div
    await cdp.ev(`(function(){
      var d=document.createElement('div'); d.id='bjx-canvas-probe';
      document.body.appendChild(d);
      try { Renderer.show('combatMainPc', d); } catch(e) { d.dataset.err = e.message; }
    })()`);
  });
  await sleep(2500);
  console.log('probe div err:', await cdp.ev(`String(document.getElementById('bjx-canvas-probe') ? (document.getElementById('bjx-canvas-probe').dataset.err || 'none') : 'no-div')`));

  ch.kill();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
