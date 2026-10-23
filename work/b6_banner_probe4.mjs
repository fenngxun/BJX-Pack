// 正常流程进游戏（点击开始）后 dump 页面所有 fixed/角落元素文本，找 undefined 行
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8767/Degrees%20of%20Lewdity.html';
const PORT = 9258;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6banner4-'));
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

  // 等 Start 页就绪（SugarCube 出现）
  const t0 = Date.now();
  while (Date.now() - t0 < 280000) {
    const r = await ev(`(function(){try{return window.SugarCube && SugarCube.State.passage ? SugarCube.State.passage : '';}catch(e){return '';}})()`, 15000);
    if (r && String(r).startsWith('Start')) { console.log('START-READY', ((Date.now() - t0) / 1000).toFixed(1) + 's', r); break; }
    await sleep(2000);
  }
  await sleep(3000);

  // 过年龄门 + 开始新游戏（参照 cdp_pack.mjs 流程）
  await ev(`(function(){ var a = document.querySelector('#created-by a, a[data-passage]'); return document.querySelectorAll('a').length; })()`);
  // 点年龄确认
  await ev(`(function(){ var links = [].slice.call(document.querySelectorAll('.link-internal, a')); for (var i=0;i<links.length;i++){ var t=(links[i].textContent||'').trim(); if (t==='I am 18 or older' || t==='我已满18岁' || /18/.test(t) && /older|以上/.test(t)) { links[i].click(); return 'age:'+t; } } return 'no-age-link:' + links.slice(0,5).map(function(l){return l.textContent.trim()}).join('|'); })()`);
  await sleep(2000);
  // 开始新游戏
  await ev(`(function(){ var links = [].slice.call(document.querySelectorAll('.link-internal, a')); for (var i=0;i<links.length;i++){ var t=(links[i].textContent||'').trim(); if (/new life|开始新生活|New Life/i.test(t)) { links[i].click(); return 'new:'+t; } } return 'no-new-link'; })()`);
  await sleep(6000);

  const CUR = await ev(`SugarCube.State.passage`);
  console.log('now passage:', CUR);

  // dump：页面上所有「版本/undefined」相关文本元素（含 fixed 定位）
  const DUMP = `(function(){
    try {
      var found = [];
      // 1) #modversion / #gameVersionDisplay / #gameVersionDisplay2
      ['modversion','gameVersionDisplay','gameVersionDisplay2'].forEach(function(id){
        var el = document.getElementById(id);
        found.push({ id: id, exists: !!el, txt: el ? el.textContent.trim().slice(0,150) : null });
      });
      // 2) 全页搜含 'undefined' 的文本节点（限 #passages 与 body 直接可见区）
      var hits = [];
      var walker = document.createTreeWalker(document.getElementById('passages') || document.body, NodeFilter.SHOW_TEXT, null, 0);
      var n;
      while ((n = walker.nextNode())) {
        var t = n.textContent.trim();
        if (t === 'undefined' || /^undefined$/.test(t)) {
          var p = n.parentElement;
          hits.push({ parent: p.tagName + (p.id ? '#'+p.id : '') + (p.className ? '.'+String(p.className).slice(0,40) : ''), txt: t });
        }
      }
      found.push({ undefTextNodes: hits });
      // 3) 含 ver / version 字样的元素
      var verEls = [];
      document.querySelectorAll('#passages *').forEach(function(el){
        if (el.children.length === 0 && /ver\\s*\\d|version/i.test(el.textContent)) {
          verEls.push({ tag: el.tagName, id: el.id || null, cls: String(el.className).slice(0,40), txt: el.textContent.trim().slice(0,120) });
        }
      });
      found.push({ verEls: verEls.slice(0, 12) });
      return JSON.stringify(found);
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log(await ev(DUMP, 30000));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });