// dump 运行时 SF shim 状态：谁建的 simpleFrameworks、onInit 在不在、iMod 指向
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8767/Degrees%20of%20Lewdity.html';
const PORT = 9249;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6dump-'));
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
  await sleep(3000);

  const DUMP = `(function(){
    try{
      var sf = window.simpleFrameworks;
      var im = window.iMod;
      function keys(o){ try { return o ? Object.keys(o) : null; } catch(e){ return 'ERR'; } }
      return JSON.stringify({
        b2SFShim: !!window.__b2SFShim,
        b2GetModShim: !!window.__b2GetModShim,
        sf: sf ? {
          keys: keys(sf),
          isShim: !!sf._b2shim,
          hasReg: !!sf._reg,
          regKeys: sf._reg ? Object.keys(sf._reg) : null,
          onInit: typeof sf.onInit,
          modData: typeof sf.modData,
          modList: sf.modData ? sf.modData.modList : null,
          version: sf.version || null,
        } : 'ABSENT',
        iMod: im ? {
          sameAsSf: im === sf,
          keys: keys(im),
          modData: typeof im.modData,
          modList: im.modData ? im.modData.modList : null,
        } : 'ABSENT',
        iModReplaceMacro: (function(){ try { var M = window.SugarCube && window.SugarCube.Macro; return M && M.get ? (M.get('iModReplace') ? 'registered' : 'missing') : 'no-macro-api'; } catch(e){ return 'ERR'; } })(),
      });
    }catch(e){return 'EXC:'+e.message;}
  })()`;
  console.log(await ev(DUMP, 30000));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });