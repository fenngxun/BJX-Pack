// 验证 backComp fetus 修复：进入 Domus Street，检查 console error
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9273;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6verify5-'));
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
    const r = await ev(`(function(){try{return window.SugarCube && SugarCube.State.passage ? SugarCube.State.passage : '';}catch(e){return '';}})()`, 15000);
    if (r && String(r).startsWith('Start')) { console.log('START-READY', ((Date.now() - t0) / 1000).toFixed(1) + 's'); break; }
    await sleep(2000);
  }
  await sleep(3000);

  // 先进入 Start2 初始化
  console.log('--- entering Start2 ---');
  await ev(`SugarCube.Engine.play('Start2')`, 15000);
  await sleep(5000);

  // 检查 Start2 后 NPC pregnancy 状态
  const pregCheck = await ev(`(function(){
    var V = SugarCube.State.variables;
    var npcs = V.NPCName || [];
    var missing = 0;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (!n) continue;
      if (!n.pregnancy) missing++;
    }
    return JSON.stringify({total: npcs.length, missingPregnancy: missing, saveVersions: JSON.stringify(V.saveVersions)});
  })()`, 10000);
  console.log('after Start2:', pregCheck);

  // 进入 Domus Street（用户报错的场景）
  console.log('--- entering Domus Street ---');
  await ev(`SugarCube.Engine.play('Domus Street')`, 15000);
  await sleep(5000);
  console.log('current passage:', await ev(`SugarCube.State.passage`, 10000));

  // 再导航几个 passage，确保 backComp 不报错
  for (const p of ['Oxford Street', 'High Street', 'Domus Street']) {
    await ev(`SugarCube.Engine.play('${p}')`, 15000);
    await sleep(3000);
  }
  console.log('final passage:', await ev(`SugarCube.State.passage`, 10000));

  // 检查 backComp/fetus 相关错误
  console.log('--- console errors ---');
  const backCompErrors = consoleErrors.filter(e =>
    e.indexOf('backComp') >= 0 || e.indexOf('fetus') >= 0 ||
    e.indexOf('doVersionCheck') >= 0 || e.indexOf('pregnancy') >= 0);
  console.log(JSON.stringify({totalErrors: consoleErrors.length, backCompErrors: backCompErrors.slice(0, 5), allErrors: consoleErrors.slice(0, 10)}));

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
