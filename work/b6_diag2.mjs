// 终极诊断：宏执行前后同步 DOM 对比
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8767/Degrees%20of%20Lewdity.html';
const PORT = 9253;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6diag2-'));
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

  const STATE = `(function(){try{var s=window.SugarCube,st=s&&s.State;return JSON.stringify({sc:!!s,psg:st&&st.passage?String(st.passage):null,base:typeof(window.setup&&window.setup.baseNNPC)});}catch(e){return 'ERR';}})()`;
  const t0 = Date.now();
  while (Date.now() - t0 < 280000) {
    const r = await ev(STATE, 15000);
    if (typeof r === 'string' && r.startsWith('{')) {
      const o = JSON.parse(r);
      if (o.sc && o.psg && o.base === 'object') { console.log('READY', ((Date.now() - t0) / 1000).toFixed(1) + 's', 'passage=' + o.psg); break; }
    }
    await sleep(2000);
  }
  await sleep(2000);

  await ev(`(function(){ var d=document.createElement('div'); new Wikifier(d,'<<goto [[Bedroom]]>>'); return 'ok'; })()`);
  await sleep(4000);

  const r = await ev(`(function(){
    try {
      window.__imodDiag = [];
      var before = document.querySelectorAll('#customOverlay');
      var cntBefore = before.length;
      var clsBefore = cntBefore ? before[0].className : null;
      var jqLenBefore = (typeof window.jQuery === 'function') ? jQuery('#customOverlay').length : 'no-jquery';
      var frag = document.createElement('div');
      new Wikifier(frag, "<<iModReplace 'voidBagOverlay'>>");
      var after = document.querySelectorAll('#customOverlay');
      return JSON.stringify({
        passage: window.SugarCube.State.passage,
        cntBefore: cntBefore, cntAfter: after.length,
        jqLenBefore: jqLenBefore,
        jqLenAfter: (typeof window.jQuery === 'function') ? jQuery('#customOverlay').length : 'no-jquery',
        clsBefore: clsBefore,
        clsAfter: after.length ? after[0].className : null,
        dataOverlayAfter: after.length ? after[0].getAttribute('data-overlay') : null,
        containerClsAfter: (document.querySelector('#customOverlayContainer') || {className:'?'}).className,
        titleHTMLLen: (document.querySelector('#customOverlayTitle') || {innerHTML:'?'}).innerHTML.length,
        contentHTMLLen: (document.querySelector('#customOverlayContent') || {innerHTML:'?'}).innerHTML.length,
        fragHTMLLen: frag.innerHTML.length,
        diag: window.__imodDiag,
      });
    } catch (e) { return 'EXC:' + e.message + '|' + String(e && e.stack).slice(0, 300); }
  })()`);
  console.log(r);
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });