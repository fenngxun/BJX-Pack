// 定位 npcPregnancyUpdater 报错：dump $NPCName 数组找 undefined 条目
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9263;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6npc2-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 120 && !wsUrl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const l = await r.json();
      const p = l.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(500);
  }
  if (!wsUrl) { console.error('NO PAGE'); chrome.kill(); process.exit(2); }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result))); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.enable');
  const ev = async (e, tmo = 30000) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(tmo).then(() => null)]);
    if (!r) return 'TIMEOUT';
    if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0].slice(0, 300);
    return r.result.value;
  };

  const t0 = Date.now();
  while (Date.now() - t0 < 280000) {
    const r = await ev(`(function(){try{return window.SugarCube && SugarCube.State.passage ? SugarCube.State.passage : '';}catch(e){return '';}})()`, 15000);
    if (r && String(r).startsWith('Start')) { console.log('START-READY', ((Date.now() - t0) / 1000).toFixed(1) + 's'); break; }
    await sleep(2000);
  }
  await sleep(3000);

  console.log('--- clicking 开始游戏 ---');
  const CLICK = `(function(){
    try {
      var links = document.querySelectorAll('#passages .passage a');
      for (var i = 0; i < links.length; i++) {
        var txt = links[i].textContent.trim();
        if (txt.indexOf('开始游戏') >= 0 || txt === 'Start' || txt.indexOf('Click here to start') >= 0) {
          links[i].click();
          return 'clicked: ' + txt;
        }
      }
      var all = [];
      for (var j = 0; j < links.length; j++) all.push(links[j].textContent.trim().slice(0, 40));
      return 'NOT FOUND, links: ' + JSON.stringify(all.slice(0, 15));
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log(await ev(CLICK, 15000));
  await sleep(8000);

  console.log('current passage:', await ev(`SugarCube.State.passage`, 10000));

  const NPC_DUMP = `(function(){
    try {
      var V = SugarCube.State.variables;
      var names = V.NPCNameList || [];
      var npcs = V.NPCName || [];
      var out = {
        listLen: names.length,
        npcLen: npcs.length,
        undefinedIndices: [],
        nullIndices: [],
        noPregnancy: [],
        noType: [],
        icandyNpcs: [],
      };
      var icandyNames = ['Robert','Hadley','Qing','Lam','Wei','Xinyu','Cheng','Yue','Keith'];
      for (var i = 0; i < npcs.length; i++) {
        var n = npcs[i];
        if (n === undefined) { out.undefinedIndices.push(i); continue; }
        if (n === null) { out.nullIndices.push(i); continue; }
        if (n.pregnancy === undefined) out.noPregnancy.push({idx: i, nam: n.nam, type: n.type});
        if (n.type === undefined) out.noType.push({idx: i, nam: n.nam});
        if (icandyNames.indexOf(n.nam) >= 0) {
          out.icandyNpcs.push({idx: i, nam: n.nam, type: n.type, hasPreg: n.pregnancy !== undefined, keys: Object.keys(n).slice(0, 20)});
        }
      }
      return JSON.stringify(out);
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log('--- NPCName dump ---');
  console.log(await ev(NPC_DUMP, 15000));

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
