// 探查 ModLoader 的 boot 日志缓冲（logRecordBeforeAnyLogHookRegister）
// 并扫描 window 上可能的 GUI 实时日志缓冲，导出全部 logError / logWarning。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8767/Degrees%20of%20Lewdity.html';
const PORT = 9247;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6log2-'));
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

  // 1) ModLoadController 的 before-hook 缓冲
  const bufExpr = `(function(){
    try{
      var mc = window.SC2DataManager && window.SC2DataManager.getModLoadController();
      if(!mc) return 'NO_MC';
      var arr = mc.logRecordBeforeAnyLogHookRegister || [];
      var out = arr.map(function(x){return {t:x.type, m:String(x.message)};});
      return JSON.stringify({len:out.length, items:out});
    }catch(e){return 'EXC:'+e.message;}
  })()`;
  const buf = await ev(bufExpr, 20000);
  let items = [];
  if (typeof buf === 'string' && buf.startsWith('{')) {
    try { const o = JSON.parse(buf); items = o.items || []; console.log('before-hook buffer len=', o.len); }
    catch {}
  } else {
    console.log('before-hook buffer raw:', buf);
  }

  // 2) 扫描 window 上可能的 GUI 实时日志缓冲（数组里是 {time,message} / {type,message}）
  const scanExpr = `(function(){
    try{
      var cands=[];
      var keys=Object.keys(window);
      for(var i=0;i<keys.length;i++){
        var k=keys[i]; var v;
        try{ v=window[k]; }catch(e){continue;}
        if(!v||typeof v!=='object') continue;
        var sub=Object.keys(v);
        for(var j=0;j<sub.length;j++){
          var f=v[sub[j]];
          if(Array.isArray(f)&&f.length>0){
            var e0=f[0];
            if(e0&&typeof e0==='object'&&(e0.message!==undefined||e0.time!==undefined||e0.type!==undefined)){
              cands.push({owner:k, field:sub[j], len:f.length});
            }
          }
        }
      }
      return JSON.stringify(cands);
    }catch(e){return 'EXC:'+e.message;}
  })()`;
  const scan = await ev(scanExpr, 20000);
  console.log('\n=== 疑似日志缓冲候选 ===');
  console.log(scan);

  // 3) 输出 before-hook 缓冲里的 error / warning
  const errs = items.filter((x) => x.t === 'error');
  const warns = items.filter((x) => x.t === 'warning');
  console.log('\n=== ERROR (' + errs.length + ') ===');
  errs.forEach((x, i) => console.log((i + 1) + '. ' + x.m));
  console.log('\n=== WARNING (' + warns.length + ') ===');
  warns.forEach((x, i) => console.log((i + 1) + '. ' + x.m));

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
