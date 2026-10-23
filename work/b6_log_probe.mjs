// 探查 ModLoader 的日志存储位置，并尽量把 boot 期的 logError/logWarning 全导出来。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2];
const PORT = 9246;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6log-'));
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
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result))); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.enable');
  const ev = async (e, tmo = 30000) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(tmo).then(() => null)]);
    if (!r) return 'TIMEOUT';
    if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0].slice(0, 160);
    return r.result.value;
  };

  const STATE = `(function(){try{var s=window.SugarCube,st=s&&s.State;return JSON.stringify({sc:!!s,psg:st&&st.passage?String(st.passage):null,base:typeof(window.setup&&window.setup.baseNNPC)});}catch(e){return 'ERR';}})()`;
  const t0 = Date.now();
  while (Date.now() - t0 < 260000) {
    const r = await ev(STATE, 15000);
    if (typeof r === 'string' && r.startsWith('{')) {
      const o = JSON.parse(r);
      if (o.sc && o.psg && o.base === 'object') { console.log('READY', ((Date.now() - t0) / 1000).toFixed(1) + 's'); break; }
    }
    await sleep(2000);
  }
  await sleep(2500);

  console.log('\n=== 含 log 的全局 ===');
  console.log(await ev(`Object.keys(window).filter(function(k){return /log/i.test(k);}).slice(0,40).join(',')`));
  console.log('\n=== SC2DataManager keys ===');
  console.log(await ev(`(function(){var m=window.SC2DataManager;return m?Object.keys(m).join(','):'none';})()`));
  console.log('\n=== modUtils keys ===');
  console.log(await ev(`(function(){var m=window.modUtils;return m?Object.keys(m).join(','):'none';})()`));
  console.log('\n=== 可能的日志数组 ===');
  console.log(await ev(`(function(){var out=[];var cands=[['SC2DataManager',window.SC2DataManager],['modUtils',window.modUtils],['ModLoaderGui',window.ModLoaderGui]];for(var i=0;i<cands.length;i++){var n=cands[i][0],o=cands[i][1];if(!o)continue;var ks=Object.keys(o);for(var j=0;j<ks.length;j++){var v=o[ks[j]];if(Array.isArray(v)&&v.length>3)out.push(n+'.'+ks[j]+' len='+v.length);}}return out.join(' | ');})()`));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
