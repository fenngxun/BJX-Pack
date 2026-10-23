// Smoke test for the two newly wired modules: options overlay switches + tending widgets.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9236;
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

  console.log('widgets:', await ev(`["askicon","display_plot","tending_harvests","tendingTills","tendingPlantSeeds","optionsmods"].map(function(n){return n+":"+(!!SugarCube.Macro.get(n))}).join(" ")`));

  await ev(`BJXTEST.run('V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; V.saveVersions = [StartConfig.version]; V.objectVersion = V.objectVersion || {}; "ok"')`);
  // The options screen is a [widget] passage rendered into a dialog, so
  // invoke the widgets directly instead of goto-ing a non-playable passage.
  const om = await ev(`JSON.stringify(BJXTEST.smokeWidget('optionsmods'))`);
  console.log('smoke optionsmods:', String(om).slice(0, 260));
  const ai = await ev(`JSON.stringify(BJXTEST.smokeWidget('askicon'))`);
  console.log('smoke askicon:', String(ai).slice(0, 200));
  console.log('bjx switches in optionsmods source:', await ev(`String((SugarCube.Story.get("Options Overlay")||{text:""}).text.indexOf("bjx_animal"))`));

  // tending: smoke each new widget with a minimal farm state
  for (const w of ['display_plot', 'tending_harvests', 'tendingTills', 'tendingPlantSeeds']) {
    const r = await ev(`JSON.stringify(BJXTEST.smokeWidget(${JSON.stringify(w)}))`);
    console.log('smoke', w, String(r).slice(0, 200));
  }

  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
