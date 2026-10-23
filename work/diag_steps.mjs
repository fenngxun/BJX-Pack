// Replicate S33 (farm state), S57 (fly), S58 (docks) in isolation with diagnostics.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9234;
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
  await ev(`BJXTEST.run('V.saveVersions = [StartConfig.version]; V.objectVersion = V.objectVersion || {}; "ok"')`);

  const dump = async (label) => {
    const o = await ev(`JSON.stringify({passage:BJXTEST.passage(), exposed:String(V.exposed), upper:String(V.worn.upper&&V.worn.upper.name), beasts:String(V.farm&&V.farm.beasts&&V.farm.beasts.horses), bjxTF:String(V.options&&V.options.bjx_eventTF), bjxAnimal:String(V.options&&V.options.bjx_animal), dw:String(V.transformationParts&&V.transformationParts.dragon&&V.transformationParts.dragon.wings), money:String(V.money), history:String(V.history)})`);
    console.log('[' + label + ']', o);
    console.log('  links:', await ev(`String(BJXTEST.links())`));
    console.log('  errors:', await ev(`String(Array.from(document.querySelectorAll("#passages .error")).map(e=>e.textContent.trim().slice(0,100)).join(" | ")).slice(0,300)`));
  };

  // ---- A: S33 farm reset, then hospital foyer (S35 style) ----
  console.log('\n== A: farm reset then hospital ==');
  await ev(`BJXTEST.run('V.worn.upper = JSON.parse(JSON.stringify(setup.clothes.upper[setup.clothes.upper.findIndex(function(i){return i.name === "school shirt"})])); V.worn.lower = JSON.parse(JSON.stringify(setup.clothes.lower[setup.clothes.lower.findIndex(function(i){return i.name === "school shorts"})])); "dressed"')`);
  await ev(`BJXTEST.setVars({ exposed: 0, money: 100000, moorburger: 0, eventskip: 1, rng: 1, stress: 0, farm: {}, plots: { farm: [] } })`);
  await dump('after farm reset');
  await ev(`BJXTEST.setVars({ slime: 1, mushroom: 1, demonhunter: 2, money: 5000000, stress: 0, exposed: 0, arousal: 0 })`);
  await ev('BJXTEST.goto("Hospital Foyer")');
  await sleep(1200);
  await dump('hospital foyer');

  // ---- B: S57 fly ----
  console.log('\n== B: fly ==');
  await ev(`BJXTEST.run('V.options.bjx_animal = true; V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; V.worn.upper = JSON.parse(JSON.stringify(setup.clothes.upper[setup.clothes.upper.findIndex(function(i){return i.name === "school shirt"})])); V.worn.lower = JSON.parse(JSON.stringify(setup.clothes.lower[setup.clothes.lower.findIndex(function(i){return i.name === "school shorts"})])); V.transformationParts.dragon.wings = "red"; V.transformationParts.bird.wings = "disabled"; "ok"')`);
  await ev(`BJXTEST.setVars({ exposed: 0, eventskip: 1, stress: 0, trauma: 0 })`);
  await ev('BJXTEST.goto("Barb Street")');
  await sleep(1400);
  await dump('barb street');
  console.log('  click 起飞:', await ev(`String(BJXTEST.clickLink('起飞'))`));
  await sleep(900);
  await dump('after takeoff click');

  // ---- C: S58 docks ----
  console.log('\n== C: docks ==');
  await ev(`BJXTEST.run('V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; V.worn.upper = JSON.parse(JSON.stringify(setup.clothes.upper[setup.clothes.upper.findIndex(function(i){return i.name === "school shirt"})])); V.worn.lower = JSON.parse(JSON.stringify(setup.clothes.lower[setup.clothes.lower.findIndex(function(i){return i.name === "school shorts"})])); "ok"')`);
  await ev(`BJXTEST.setVars({ money: 100000, history: 700, exposed: 0, eventskip: 1 })`);
  await ev('BJXTEST.goto("Docks")');
  await sleep(1600);
  await dump('docks');
  console.log('  injector el:', await ev(`String(!!document.querySelector("#bjx-docks-ride-entry"))`));

  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
