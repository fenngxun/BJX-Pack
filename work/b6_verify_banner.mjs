// 验证：横幅 undefined 噪音是否消除
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9261;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6verify-'));
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

  // 等待 Start 页面
  const t0 = Date.now();
  while (Date.now() - t0 < 280000) {
    const r = await ev(`(function(){try{return window.SugarCube && SugarCube.State.passage ? SugarCube.State.passage : '';}catch(e){return '';}})()`, 15000);
    if (r && String(r).startsWith('Start')) { console.log('START-READY', ((Date.now() - t0) / 1000).toFixed(1) + 's'); break; }
    await sleep(2000);
  }
  await sleep(5000);

  // 检查 1：passage 内所有 b2sf-slot 的文本内容
  const SLOT_CHECK = `(function(){
    try {
      var slots = document.querySelectorAll('#passages .passage .b2sf-slot');
      var out = [];
      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        out.push({ cls: s.className, txt: s.textContent.trim().slice(0, 100) });
      }
      return JSON.stringify(out);
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log('--- b2sf-slot contents ---');
  console.log(await ev(SLOT_CHECK, 15000));

  // 检查 2：passage 全文中是否还有独立的 "undefined" 行
  const UNDEF_CHECK = `(function(){
    try {
      var passage = document.querySelector('#passages .passage');
      if (!passage) return 'NO PASSAGE';
      var txt = passage.textContent;
      // 找所有 "undefined" 出现的位置和上下文
      var idxs = [];
      var pos = 0;
      while ((pos = txt.indexOf('undefined', pos)) >= 0) {
        var ctx = txt.slice(Math.max(0, pos - 30), pos + 40).replace(/\\s+/g, ' ');
        idxs.push(ctx);
        pos += 9;
      }
      return JSON.stringify({ count: idxs.length, contexts: idxs.slice(0, 10) });
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log('--- undefined occurrences in passage ---');
  console.log(await ev(UNDEF_CHECK, 15000));

  // 检查 3：版本横幅区域（#modversion + gameVersionDisplay）
  const BANNER_CHECK = `(function(){
    try {
      var out = {};
      var mv = document.querySelector('#passages .passage #modversion');
      out.modversion = mv ? mv.textContent.trim().slice(0, 150) : 'NOT FOUND';
      var gvd = document.querySelector('#passages .passage #gameVersionDisplay');
      out.gameVersionDisplay = gvd ? gvd.textContent.trim().slice(0, 150) : 'NOT FOUND';
      // passage 直接子元素的文本（前5个）
      var passage = document.querySelector('#passages .passage');
      out.directChildren = [];
      if (passage) {
        for (var i = 0; i < Math.min(8, passage.children.length); i++) {
          var c = passage.children[i];
          out.directChildren.push({ tag: c.tagName, id: c.id, cls: c.className, txt: c.textContent.trim().slice(0, 80) });
        }
      }
      return JSON.stringify(out);
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log('--- banner area ---');
  console.log(await ev(BANNER_CHECK, 15000));

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
