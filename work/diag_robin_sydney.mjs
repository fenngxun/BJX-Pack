// Verify the two hypotheses: (1) Sydney Chat needs a current saveVersions,
// (2) Robin Raccoon only needs $pronoun set before render.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9233;
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

  console.log('pronouns:', await ev(`["Robin:"+String(C.npc.Robin && C.npc.Robin.pronoun), "Sydney:"+String(C.npc.Sydney && C.npc.Sydney.pronoun), "nameList:"+String(V.NPCNameList && V.NPCNameList.includes("Robin")), "saveVersions:"+String(V.saveVersions), "startVer:"+String(StartConfig.version)].join(" | ")`));

  // ---- Sydney with a current saveVersions ----
  await ev(`BJXTEST.run('V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; V.saveVersions = [StartConfig.version]; V.objectVersion = V.objectVersion || {}; "ok"')`);
  await ev(`BJXTEST.setVars({ sydneyromance: 1, sydneyChatState: 1, harpy: 0, fallenangel: 0, demon: 0, dragon: 1, cow: 0, wolfgirl: 0, cat: 0, fox: 0, stress: 0, trauma: 0, exposed: 0 })`);
  await ev(`BJXTEST.run('C.npc.Sydney.love = 100; V.transformationParts.dragon = V.transformationParts.dragon || {}; V.transformationParts.dragon.eyes = "red"; "ok"')`);
  const hit = await ev(`BJXTEST.run('(() => { for (let i = 0; i < 40; i++) { try { SugarCube.Engine.play("Sydney Chat"); } catch (e) {} const el = document.querySelector("#passages .passage"); if (el && el.textContent.indexOf("隐形眼镜") >= 0) return "hit@" + i; } const el = document.querySelector("#passages .passage"); return "miss:" + String((el && el.textContent) || "").replace(/\\s+/g, " ").slice(0, 200); })()')`);
  console.log('sydney:', String(hit).slice(0, 320));
  console.log('sydney errors:', await ev(`String(Array.from(document.querySelectorAll("#passages .error")).map(e=>e.textContent.trim().slice(0,120)).join(" || ")).slice(0,400)`));

  // ---- Robin Raccoon with $pronoun set ----
  await ev(`BJXTEST.setVars({ robinraccoon: 0, raccoon: 6, stress: 0, trauma: 0, exposed: 0 })`);
  await ev(`BJXTEST.run('V.pronoun = (C.npc.Robin && C.npc.Robin.pronoun) || "m"; V.transformationParts.raccoon = V.transformationParts.raccoon || {}; V.transformationParts.raccoon.tail = "red"; "ok"')`);
  await ev('BJXTEST.goto("Robin Raccoon")');
  await sleep(1200);
  console.log('robin passage:', await ev('BJXTEST.passage()'));
  console.log('robin errors:', await ev(`String(Array.from(document.querySelectorAll("#passages .error")).map(e=>e.textContent.trim().slice(0,120)).join(" || ")).slice(0,300)`));
  console.log('robin text:', await ev(`String((document.querySelector("#passages .passage")||{}).textContent||"").replace(/\\s+/g," ").slice(0,220)`));
  console.log('robin links:', await ev(`String(BJXTEST.links())`));

  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
