// 读取 ModLoader 真实日志缓冲：modModLoadController.logRecordBeforeAnyLogHookRegister
// 以及 GUI 实时缓冲 modLoaderGui_LoadingProgress.logList（用户实际看到的面板）
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8767/Degrees%20of%20Lewdity.html';
const PORT = 9248;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6log3-'));
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
    if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0].slice(0, 200);
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
  await sleep(3000);

  const EXPR = `(function(){
    try{
      function msgo(x){
        var m = x.message!=null?x.message:(x.msg!=null?x.msg:x);
        if(m==null) return '';
        if(typeof m==='string') return m;
        try{ return JSON.stringify(m); }catch(e){ return String(m); }
      }
      function norm(arr){
        if(!arr) return [];
        return arr.map(function(x){
          if(typeof x==='string') return {t:'unknown', m:x};
          return {t:String(x.type||x.level||'unknown'), m:msgo(x)};
        });
      }
      var mc = window.modModLoadController;
      var gui = window.modLoaderGui_LoadingProgress;
      var struct = gui && gui.logList && gui.logList[0] ? JSON.stringify(Object.keys(gui.logList[0])) : 'none';
      var a = norm(mc && mc.logRecordBeforeAnyLogHookRegister);
      var b = norm(gui && gui.logList);
      // 合并去重（GUI 通常已含 before-hook 内容）
      var seen={}, all=[];
      [].concat(b,a).forEach(function(x){
        var k=x.t+'|'+x.m.slice(0,160);
        if(!seen[k]){seen[k]=1;all.push(x);}
      });
      var errs=all.filter(function(x){return /error/i.test(x.t);});
      var warns=all.filter(function(x){return /warn/i.test(x.t);});
      return JSON.stringify({struct:struct, total:all.length, errLen:errs.length, warnLen:warns.length, errs:errs, warns:warns, sample:all.slice(0,3)});
    }catch(e){return 'EXC:'+e.message;}
  })()`;
  const out = await ev(EXPR, 30000);
  if (typeof out === 'string' && out.startsWith('{')) {
    const o = JSON.parse(out);
    console.log('logList item keys:', o.struct);
    console.log('total=' + o.total + ' errors=' + o.errLen + ' warnings=' + o.warnLen);
    console.log('\n=== ERRORS (' + o.errLen + ') ===');
    o.errs.forEach((x, i) => console.log((i + 1) + '. ' + x.m));
    console.log('\n=== WARNINGS (' + o.warnLen + ') ===');
    o.warns.forEach((x, i) => console.log((i + 1) + '. ' + x.m));
  } else {
    console.log('RAW:', out);
  }
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
