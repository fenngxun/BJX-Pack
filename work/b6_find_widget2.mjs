// 遍历所有 passage 找 npcPregnancyUpdater 和 settingsExitFunction 定义
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9266;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6src2-'));
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

  // 遍历所有 passage 找包含 npcPregnancyUpdater 定义的
  const FIND = `(function(){
    try {
      var SC = window.SugarCube;
      var passages = SC.Story.lookupAll('widget') || [];
      var found = [];
      for (var i = 0; i < passages.length; i++) {
        var p = passages[i];
        if (p.name && p.name.toLowerCase().indexOf('pregnancy') >= 0) {
          found.push({name: p.name, text: (p.text || '').slice(0, 3000)});
        }
      }
      // 也找 settingsExitFunction
      var se = [];
      for (var j = 0; j < passages.length; j++) {
        var q = passages[j];
        if (q.name && q.name.toLowerCase().indexOf('settingsexit') >= 0) {
          se.push({name: q.name, text: (q.text || '').slice(0, 2000)});
        }
      }
      return JSON.stringify({totalWidgets: passages.length, pregnancyWidgets: found, settingsExit: se});
    } catch (e) { return 'EXC:' + e.message + ' stack:' + (e.stack||'').slice(0,500); }
  })()`;
  console.log('=== searching widgets ===');
  console.log(await ev(FIND, 15000));

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
