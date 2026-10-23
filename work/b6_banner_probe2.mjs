// 定位渲染区 #modversion 与四行文本的 DOM 结构
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8767/Degrees%20of%20Lewdity.html';
const PORT = 9256;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6banner2-'));
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
      if (o.sc && o.psg && o.base === 'object') { console.log('READY', ((Date.now() - t0) / 1000).toFixed(1) + 's'); break; }
    }
    await sleep(2000);
  }
  await sleep(2000);

  await ev(`(function(){ var d=document.createElement('div'); new Wikifier(d,'<<goto [[Bedroom]]>>'); return 'ok'; })()`);
  await sleep(5000);

  const DUMP = `(function(){
    try {
      var out = {};
      var psg = document.querySelector('#passages .passage');
      out.passage = State.passage;
      out.passageExists = !!psg;
      if (!psg) return JSON.stringify(out);
      out.passageText = psg.textContent.replace(/\\s+/g,' ').slice(0, 500);
      // 找 modversion
      var mv = psg.querySelectorAll('#modversion');
      out.modversionCount = mv.length;
      if (mv.length) {
        var el = mv[0];
        out.mvText = el.textContent.trim();
        // 祖先链
        var chain = []; var p = el;
        for (var i = 0; i < 8 && p; i++) { chain.push(p.tagName + (p.className ? '.' + String(p.className).split(' ').join('.') : '') + (p.id ? '#' + p.id : '')); p = p.parentElement; }
        out.chain = chain;
        // 父容器（b2sf-slot?）的所有文本行
        var host = el.closest('.b2sf-slot') || el.parentElement;
        out.hostTxt = host ? host.textContent.replace(/\\s+/g,' ').slice(0, 300) : null;
        // 横幅后面兄弟节点（undefined 行来源）
        var sibs = []; var s = host ? host.nextElementSibling : null;
        for (var k = 0; k < 10 && s; k++) { sibs.push({ tag: s.tagName, cls: String(s.className).slice(0,40), txt: s.textContent.replace(/\\s+/g,' ').slice(0,100) }); s = s.nextElementSibling; }
        out.nextSibs = sibs;
      }
      // b2sf-slot 总览
      var slots = psg.querySelectorAll('.b2sf-slot');
      out.slotCount = slots.length;
      out.slots = [];
      for (var j = 0; j < slots.length && j < 12; j++) {
        out.slots.push({ cls: slots[j].className, txt: slots[j].textContent.replace(/\\s+/g,' ').slice(0, 120) });
      }
      return JSON.stringify(out);
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log(await ev(DUMP, 30000));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });