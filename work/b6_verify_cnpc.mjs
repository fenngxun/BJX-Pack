// 验证 C.npc 别名修复：进入 Start2，检查 C.npc 里 iCandy NPC 是否存在
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9275;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6verify7-'));
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
  const consoleErrors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 500));
    }
    if (m.method === 'Runtime.exceptionThrown' && m.params && m.params.exceptionDetails) {
      consoleErrors.push('EXC: ' + (m.params.exceptionDetails.text || '').slice(0, 500));
    }
  });
  const ev = async (e, tmo = 30000) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(tmo).then(() => null)]);
    if (!r) return 'TIMEOUT';
    if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0].slice(0, 500);
    return r.result.value;
  };

  const t0 = Date.now();
  while (Date.now() - t0 < 280000) {
    const r = await ev(`(function(){try{return window.SugarCube && window.SugarCube.State.passage ? window.SugarCube.State.passage : '';}catch(e){return '';}})()`, 15000);
    if (r && String(r).startsWith('Start')) { console.log('START-READY', ((Date.now() - t0) / 1000).toFixed(1) + 's'); break; }
    await sleep(2000);
  }
  await sleep(3000);

  console.log('--- entering Start2 ---');
  await ev(`window.SugarCube.Engine.play('Start2')`, 15000);
  await sleep(8000);
  console.log('passage:', await ev(`window.SugarCube.State.passage`, 10000));

  // 检查 C.npc 里 iCandy NPC 和 BJX NPC 的别名
  const CHECK = `(function(){
    try {
      var C = window.C;
      var V = window.SugarCube.State.variables;
      var names = ['Robert','Hadley','Qing','Lam','Wei','Xinyu','Cheng','Yue','Keith','泰勒','凯西'];
      var result = [];
      var missing = 0;
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var inCnpc = false;
        var cnpcVal = null;
        try {
          cnpcVal = C.npc[name];
          inCnpc = cnpcVal !== undefined;
        } catch(e) { inCnpc = false; }
        var hasPreg = inCnpc && cnpcVal && cnpcVal.pregnancy !== undefined;
        result.push({nam: name, inCnpc: inCnpc, hasPregnancy: hasPreg, pregnancy: cnpcVal ? JSON.stringify(cnpcVal.pregnancy) : 'N/A'});
        if (!inCnpc) missing++;
      }
      // 也检查 $NPCNameList 总数和 C.npc 可访问数
      var totalList = V.NPCNameList.length;
      var cnpccount = 0;
      for (var j = 0; j < V.NPCNameList.length; j++) {
        try { if (C.npc[V.NPCNameList[j]] !== undefined) cnpccount++; } catch(e) {}
      }
      return JSON.stringify({totalInList: totalList, inCnpc: cnpccount, missingCnpc: missing, details: result});
    } catch(e) { return 'EXC:' + e.message; }
  })()`;
  console.log('--- C.npc alias check ---');
  console.log(await ev(CHECK, 15000));

  // 检查 npcPregnancyUpdater 相关错误
  console.log('--- console errors ---');
  const pregErrors = consoleErrors.filter(e =>
    e.indexOf('npcPregnancy') >= 0 || e.indexOf('pregnancy') >= 0 ||
    e.indexOf('settingsExitFunction') >= 0);
  console.log(JSON.stringify({totalErrors: consoleErrors.length, pregErrors: pregErrors.slice(0, 5), allErrors: consoleErrors.slice(0, 10)}));

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
