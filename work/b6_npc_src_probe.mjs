// 获取 npcPregnancyUpdater widget 源码 + 正确进入 Start2 dump 上下文
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9264;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6npc3-'));
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

  // 1. 获取 npcPregnancyUpdater widget 源码
  const WIDGET_SRC = `(function(){
    try {
      var W = window.Wikifier || (window.SugarCube && window.SugarCube.Wikifier);
      // SugarCube 2.x widget 存储
      var widgets = W.widgets || (W.getWidgetEntries && W.getWidgetEntries()) || {};
      var keys = Object.keys(widgets);
      var target = null;
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === 'npcpregnancyupdater') { target = widgets[keys[i]]; break; }
      }
      if (!target) {
        // 尝试从 passage 数据找
        var SC = window.SugarCube;
        var pd = SC && SC.Story && SC.Story.get('npcPregnancyUpdater');
        if (pd) return JSON.stringify({source: 'passage', text: pd.text.slice(0, 3000)});
        return JSON.stringify({error: 'widget not found', available: keys.slice(0, 30)});
      }
      return JSON.stringify({source: 'widget', text: String(target).slice(0, 3000)});
    } catch (e) { return 'EXC:' + e.message + ' stack:' + (e.stack||'').slice(0,500); }
  })()`;
  console.log('=== npcPregnancyUpdater source ===');
  console.log(await ev(WIDGET_SRC, 15000));

  // 2. 用 Engine.play 进入 Start2
  console.log('--- entering Start2 via Engine.play ---');
  const GOTO = `(function(){
    try {
      SugarCube.Engine.play('Start2');
      return 'played Start2';
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log(await ev(GOTO, 15000));
  await sleep(8000);
  console.log('current passage:', await ev(`SugarCube.State.passage`, 10000));

  // 3. 在 Start2 dump $NPCName 中每个条目的 pregnancy 字段详情
  const PREG_DUMP = `(function(){
    try {
      var V = SugarCube.State.variables;
      var npcs = V.NPCName || [];
      var out = [];
      for (var i = 0; i < npcs.length; i++) {
        var n = npcs[i];
        if (!n) { out.push({idx: i, null: true}); continue; }
        var pg = n.pregnancy;
        if (pg === undefined || pg === null) {
          out.push({idx: i, nam: n.nam, pregnancy: String(pg), type: n.type});
        }
      }
      return JSON.stringify({total: npcs.length, missingPregnancy: out});
    } catch (e) { return 'EXC:' + e.message; }
  })()`;
  console.log('--- Start2 pregnancy dump ---');
  console.log(await ev(PREG_DUMP, 15000));

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
