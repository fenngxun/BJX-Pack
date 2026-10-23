// 游戏内验证 <<iModReplace>> 宏：三个 overlay 实际打开 + 无宏错误 + 挂件渲染
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8767/Degrees%20of%20Lewdity.html';
const PORT = 9250;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6imod-'));
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
  const consoleMsgs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      consoleMsgs.push(m.params.type + ': ' + (m.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 160));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleMsgs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n').slice(0, 2).join(' | ').slice(0, 200));
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result))); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.enable');
  const ev = async (e, tmo = 30000) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(tmo).then(() => null)]);
    if (!r) return 'TIMEOUT';
    if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0].slice(0, 300);
    return r.result.value;
  };

  const STATE = `(function(){try{var s=window.SugarCube,st=s&&s.State;return JSON.stringify({sc:!!s,psg:st&&st.passage?String(st.passage):null,base:typeof(window.setup&&window.setup.baseNNPC)});}catch(e){return 'ERR';}})()`;
  const t0 = Date.now();
  while (Date.now() - t0 < 280000) {
    const r = await ev(STATE, 15000);
    if (typeof r === 'string' && r.startsWith('{')) {
      const o = JSON.parse(r);
      if (o.sc && o.psg && o.base === 'object') { console.log('READY', ((Date.now() - t0) / 1000).toFixed(1) + 's'); break; }
    }
    await sleep(2000);
  }
  await sleep(2000);

  // 进入一个正常场景（Bedroom）以获得 T.buttons / overlay 基建
  await ev(`(function(){ var d=document.createElement('div'); new Wikifier(d,'<<goto [[Bedroom]]>>'); return 'ok'; })()`);
  await sleep(3000);

  const results = [];
  for (const name of ['voidBagOverlay', 'terraExpandEquipmentOverlay', 'terraExpandToolOverlay']) {
    const r = await ev(`(function(){
      try {
        var before = consoleMsgsLen = 0;
        var frag = document.createElement('div');
        new Wikifier(frag, "<<iModReplace '" + name + "'>>");
        var SC = window.SugarCube;
        var T = window.T || (SC && SC.State && SC.State.temporary);
        var ov = document.querySelector('#customOverlay');
        return JSON.stringify({
          macroRan: true,
          currentOverlay: T ? T.currentOverlay : null,
          overlayVisible: ov ? !ov.classList.contains('hidden') : 'no-container',
          overlayData: ov ? ov.getAttribute('data-overlay') : null,
          titleReplaced: !!document.querySelector('#customOverlayTitle') && document.querySelector('#customOverlayTitle').innerHTML.length > 10,
          contentReplaced: !!document.querySelector('#customOverlayContent') && document.querySelector('#customOverlayContent').innerHTML.length > 10,
        });
      } catch (e) { return 'EXC:' + e.message; }
    })()`);
    results.push(name + ' => ' + r);
    await sleep(1200);
  }
  results.forEach((r) => console.log(r));

  // 关闭 overlay 复原
  await ev(`(function(){ try { window.closeOverlay(); } catch(e){} return 'closed'; })()`);
  await sleep(800);

  const consoleErrs = consoleMsgs.filter((m) => m.startsWith('error') || m.startsWith('EXC'));
  console.log('console errors/thrown during test:', consoleErrs.length);
  consoleErrs.slice(0, 10).forEach((m) => console.log('  ' + m));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });