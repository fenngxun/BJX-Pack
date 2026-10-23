// 运行时获取 npcPregnancyUpdater widget 源码
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9265;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6src-'));
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

  // 尝试多种方式获取 widget 源码
  const GET_SRC = `(function(){
    try {
      var SC = window.SugarCube;
      var results = {};
      // 方式1: Story.get with widget- prefix
      try {
        var p1 = SC.Story.get('widget-npcPregnancyUpdater');
        results.storyGet = p1 ? p1.text.slice(0, 3000) : 'null';
      } catch(e) { results.storyGet = 'ERR:' + e.message; }
      // 方式2: Story.lookup
      try {
        var p2 = SC.Story.lookup('widget', 'npcPregnancyUpdater');
        results.storyLookup = p2 ? (p2.text || JSON.stringify(p2)).slice(0, 3000) : 'null';
      } catch(e) { results.storyLookup = 'ERR:' + e.message; }
      // 方式3: 遍历所有 passage 找包含 widget 定义的
      try {
        var all = SC.Story.filter(function(p){ return p.tags && p.tags.indexOf('widget') >= 0 && p.name.indexOf('npcPregnancy') >= 0; });
        results.filterWidgets = all.map(function(p){ return p.name + ': ' + (p.text||'').slice(0,200); });
      } catch(e) { results.filterWidgets = 'ERR:' + e.message; }
      // 方式4: Wikifier 内部
      try {
        var W = window.Wikifier;
        if (W && W.widgets) {
          var keys = Object.keys(W.widgets);
          results.wikifierWidgets = keys.filter(function(k){ return k.toLowerCase().indexOf('preg') >= 0; });
        } else {
          results.wikifierWidgets = 'no W.widgets';
        }
      } catch(e) { results.wikifierWidgets = 'ERR:' + e.message; }
      return JSON.stringify(results);
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log('=== widget source lookup ===');
  console.log(await ev(GET_SRC, 15000));

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
