// 定位每页显示的版本横幅 DOM 来源（含后三行 undefined）
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8767/Degrees%20of%20Lewdity.html';
const PORT = 9255;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6banner-'));
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
      // 找含 "iCandyRobot ver" 的元素
      var walker = document.evaluate("//*[contains(text(),'iCandyRobot ver')]", document, null, 0, null);
      var hits = [];
      var n;
      while ((n = walker.iterateNext())) hits.push(n);
      if (!hits.length) return 'NO-BANNER (page=' + State.passage + ')';
      var el = hits[0];
      // 顺着祖先找注入容器（b2sf-slot？还是原始 passage 内容？）
      var chain = [];
      var p = el;
      for (var i = 0; i < 6 && p; i++) {
        chain.push({ tag: p.tagName, cls: p.className, id: p.id || null });
        p = p.parentElement;
      }
      // banner 所在容器的全部文本（看四行结构）
      var container = hits[0].closest('.b2sf-slot') || hits[0].closest('.passage') || document.body;
      var containerText = container.textContent.replace(/\\s+/g, ' ').slice(0, 400);
      // banner 前后兄弟
      var sibs = [];
      var s = container.firstElementChild;
      for (var k = 0; k < 12 && s; k++) {
        sibs.push({ tag: s.tagName, cls: String(s.className).slice(0, 50), txt: s.textContent.replace(/\\s+/g, ' ').slice(0, 80) });
        s = s.nextElementSibling;
      }
      return JSON.stringify({
        passage: State.passage,
        bannerCount: hits.length,
        chain: chain,
        containerCls: container.className,
        containerText: containerText,
        sibs: sibs,
      });
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log(await ev(DUMP, 30000));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });