// Canvas TF check: layers registered, options mapped, art reachable.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9240;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-diag-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = readFileSync('C:/Users/79403/Desktop/dol/work/cdp_pack.mjs', 'utf8');

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
  throw new Error('no page');
}
const consoleTail = [];
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
      consoleTail.push('[' + m.params.type + '] ' + txt.slice(0, 200));
      if (consoleTail.length > 400) consoleTail.shift();
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      consoleTail.push('[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 250));
      if (consoleTail.length > 400) consoleTail.shift();
    }
  });
  return {
    send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pending.set(mid, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: mid, method, params })); }); },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}
async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
  await sleep(3000);
  const ws = connect(await getPageWs()); await ws.ready;
  const ev = async (expr) => {
    const r = await Promise.race([ws.send('Runtime.evaluate', { expression: expr, returnByValue: true }), sleep(90000).then(() => { throw new Error('timeout'); })]);
    if (r.exceptionDetails) throw new Error('exc: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || '').slice(0, 300));
    return r.result.value;
  };
  let t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (await ev(`!!(window.SugarCube && SugarCube.State && SugarCube.State.passage)`).catch(() => false)) break;
    await sleep(2000);
  }
  const bsrc = src.match(/const BJXTEST_SRC = `([\s\S]*?)`\s*;/)[1];
  await ev(bsrc); await sleep(600);
  if (await ev('BJXTEST.dialogOpen()')) { await ev('BJXTEST.ageGateCheck()'); await sleep(300); await ev('BJXTEST.ageGateEnter()'); await sleep(600); }
  await ev(`BJXTEST.run('V.saveVersions=[StartConfig.version]; V.objectVersion=V.objectVersion||{}; V.options.bjx_animal=true; V.settings.transformAnimalEnabled=true; "ok"')`);

  console.log('layers:', await ev(`["raccoon_ears","raccoon_mask","raccoon_tail","bee_wings_left","dragon_wings_right","frog_cheeks","fish_fins"].map(function(k){return k+":"+(!!Renderer.CanvasModels.main.layers[k])}).join(" ")`));
  console.log('wrapped:', await ev(`String(!!SugarCube.Macro.get("modelprepare-player-body").__bjxTf)`));
  ws.send('Runtime.enable', {});
  ws.send('Runtime.evaluate', { expression: '1', returnByValue: true });

  // art reachable?

  // go in-game and apply a full raccoon TF
  await ev(`BJXTEST.setVars({ debug: 1 })`);
  await ev(`SugarCube.State.variables.options.debugdisable = 'f'`);
  await ev('BJXTEST.goto("Start2")');
  await sleep(800);
  await ev(`BJXTEST.clickLink('School Start')`);
  for (let i = 0; i < 120; i++) { const p = await ev('String(BJXTEST.passage())').catch(()=> 'ERR'); if (p === 'Oxford Street') break; await sleep(500); }
  console.log('passage:', await ev('String(BJXTEST.passage())'));
  await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<raccoonTransform>>');})()`);
  console.log('raccoon:', await ev(`JSON.stringify({r:V.raccoon, ears:V.transformationParts.raccoon.ears})`));
  await ev('BJXTEST.goto("Bedroom")');
  await sleep(1500);
  console.log('modeloptions:', await ev(`JSON.stringify({ears:T.modeloptions.raccoon_ears_type, mask:T.modeloptions.raccoon_mask_type, tail:T.modeloptions.raccoon_tail_type})`));
  console.log('layer hit:', await ev(`String((function(){var o=Renderer.CanvasModels.main.layers.raccoon_ears; return o.srcfn(T.modeloptions);})())`));
  console.log('show:', await ev(`String(Renderer.CanvasModels.main.layers.raccoon_ears.showfn(T.modeloptions))`));
  console.log('errors:', await ev(`String(Array.from(document.querySelectorAll('#passages .error')).map(function(e){return e.textContent.trim().slice(0,100)}).join(' | ')).slice(0,300)`));

  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); console.log('--- console tail ---\n' + consoleTail.slice(-40).join('\n')); process.exit(1); });
