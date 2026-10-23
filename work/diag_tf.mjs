// TF smoke: widget registration, full transform, decay, alteration, text.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9237;
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
  await sleep(3000);
  const ws = connect(await getPageWs()); await ws.ready;
  const ev = async (expr) => {
    const r = await Promise.race([ws.send('Runtime.evaluate', { expression: expr, returnByValue: true }), sleep(25000).then(() => { throw new Error('timeout'); })]);
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

  const species = ['raccoon','bee','sheep','deer','bear','dragon','lizard','dolphin','dog','fish','horse','spider','pig','frog'];
  console.log('widgets:', await ev(`["toggleTransform","clearcheeks","clearears","cleareyes","clearhorns","cleartail","clearwings","clearhalo"].concat(${JSON.stringify(species)}.map(function(s){return s+"Transform"})).concat(["bee","deer","bear","sheep","fish","horse","spider","frog","pig","dolphin","dog"]).map(function(n){return n+":"+(!!SugarCube.Macro.get(n))}).join(" ")`));

  await ev(`BJXTEST.run('V.saveVersions = [StartConfig.version]; V.objectVersion = V.objectVersion || {}; V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; V.options.bjx_animal = true; V.settings.transformAnimalEnabled = true; V.sexStats = V.sexStats || {vagina:{pregnancy:{type:null}}, anus:{pregnancy:{type:null}}}; V.player = V.player || {vaginaExist:false}; V.worn = V.worn || {}; V.worn.neck = V.worn.neck || {name:"none"}; V.worn.head = V.worn.head || {name:"none"}; "ok"')`);

  console.log('parts keys:', await ev(`String(Object.keys(V.transformationParts).join(","))`));
  console.log('raccoon parts:', await ev(`JSON.stringify(V.transformationParts.raccoon)`));

  // full transform through the no-arg branch
  console.log('\n-- full raccoon TF --');
  console.log('smoke:', await ev(`JSON.stringify(BJXTEST.smokeWidget('raccoonTransform'))`));
  console.log('state:', await ev(`JSON.stringify({raccoon:V.raccoon, build:V.raccoonbuild, tail:V.transformationParts.raccoon.tail, ears:V.transformationParts.raccoon.ears, mask:V.transformationParts.raccoon.mask, incognito:V.transformationParts.traits.incognito})`));

  // decay: build 1 -> stateUpdate should drop it
  console.log('\n-- decay --');
  await ev(`BJXTEST.run('V.raccoon = 6; V.raccoonbuild = 30; V.countTransform = 1; "ok"')`);
  console.log('before:', await ev(`JSON.stringify({build:V.raccoonbuild, raccoon:V.raccoon})`));
  console.log('stateUpdate:', await ev(`JSON.stringify(BJXTEST.smokeWidget('transformationStateUpdate'))`));
  console.log('full err:', await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<transformationStateUpdate>>'); return JSON.stringify(Array.from(d.querySelectorAll('.error')).map(function(e){return e.textContent.trim().slice(0,600)}));})()`));
  console.log('after:', await ev(`JSON.stringify({build:V.raccoonbuild, raccoon:V.raccoon})`));

  // alteration: bee build 100 -> repeated passes should climb 1..6
  console.log('\n-- alteration bee --');
  await ev(`BJXTEST.run('V.bee = 0; V.beebuild = 100; V.raccoon = 0; V.raccoonbuild = 0; V.wolfgirl = 0; V.cat = 0; V.cow = 0; V.harpy = 0; V.fox = 0; "ok"')`);
  for (let i = 0; i < 7; i++) {
    const r = await ev(`JSON.stringify(BJXTEST.smokeWidget('transformationAlteration'))`);
    const st = await ev(`JSON.stringify({bee:V.bee, wings:V.transformationParts.bee.wings, ears:V.transformationParts.bee.ears})`);
    console.log('pass', i, String(r).slice(0, 80), st);
    if (String(r).indexOf('"ok":false') >= 0) break;
  }

  // text widgets
  console.log('\n-- text --');
  console.log('bee text:', await ev(`JSON.stringify(BJXTEST.smokeWidget('bee'))`), await ev(`String((function(){var d=document.createElement('div');new SugarCube.Wikifier(d,'<<bee>>');return d.textContent;})())`));

  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
