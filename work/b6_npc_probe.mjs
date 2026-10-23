// B6 diagnostic: why do the 9 i.Candy NamedNPCs never land in V.NPCNameList?
// NOTE: every Runtime.evaluate expression must be a SINGLE LINE here —
// multi-line expressions come back as "SyntaxError: Unexpected end of input".
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9242;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6npc-'));
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
    if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0].slice(0, 200);
    return r.result.value;
  };

  const STATE = `(function(){try{var s=window.SugarCube,st=s&&s.State;return JSON.stringify({sc:!!s,psg:st&&st.passage?String(st.passage):null,base:typeof(window.setup&&window.setup.baseNNPC),nnpc:typeof(window.setup&&window.setup.NPCNameList)});}catch(e){return 'ERR:'+e.message;}})()`;
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 260000) {
    const r = await ev(STATE, 15000);
    if (typeof r === 'string' && r.startsWith('{')) {
      const o = JSON.parse(r);
      if (o.sc && o.psg && o.base === 'object') { ready = true; console.log('READY after', ((Date.now() - t0) / 1000).toFixed(1), 's ->', JSON.stringify(o)); break; }
    }
    await sleep(2000);
  }
  if (!ready) console.log('!! readiness not reached; dumping anyway');

  const DUMP = `(function(){try{var V=window.SugarCube.State.variables;var want=['Robert','Hadley','Qing','Lam','Wei','Xinyu','Cheng','Yue','Keith'];var L=V.NPCNameList;return JSON.stringify({psg:String(window.SugarCube.State.passage),shim:!!window.__b2SFShim,NN:typeof window.NamedNPC,hasInit:!!(window.NamedNPC&&window.NamedNPC.prototype&&window.NamedNPC.prototype.Init),qlen:(window.__b2NpcQueue||[]).length,qnames:(window.__b2NpcQueue||[]).map(function(c){return c&&c.nam;}),base:typeof(window.setup&&window.setup.baseNNPC),setupLen:(window.setup&&window.setup.NPCNameList||[]).length,listType:Object.prototype.toString.call(L),listLen:(L||[]).length,nameLen:(V.NPCName||[]).length,hit:want.filter(function(n){return (L||[]).indexOf(n)>=0;}),nv:V.npcNamedVersion});}catch(e){return 'ERR:'+e.message;}})()`;
  const dump = async (tag) => { console.log('---', tag, '\n', await ev(DUMP)); };
  const flush = async () => ev(`(function(){try{return String(window.__b2FlushNamedNPCs());}catch(e){return 'ERR:'+e.message;}})()`);

  await dump('boot state');
  console.log('manual flush ->', await flush());
  await dump('after manual flush');

  await ev(`window.SugarCube.Engine.play('Start2')`);
  await sleep(3000);
  await dump('after Start2');
  console.log('manual flush ->', await flush());
  await dump('after Start2 + flush');

  // what does the host do on npcNamed? and is npcSetup effective?
  console.log('macro npcNamed   ->', await ev(`(function(){var m=window.SugarCube.Macro.get('npcNamed');return m?('ok isWidget='+!!m.isWidget):'MISSING';})()`));
  console.log('R.robot/modNpc   ->', await ev(`(function(){try{return JSON.stringify({R:typeof R,robot:typeof(R&&R.robot),modNpc:typeof(window.setup&&window.setup.ModNpcSetting)});}catch(e){return 'ERR:'+e.message;}})()`));
  console.log('C.npc Robert     ->', await ev(`(function(){try{return JSON.stringify({C:typeof C,keys:Object.keys((window.C&&C.npc)||{}).slice(-12)});}catch(e){return 'ERR:'+e.message;}})()`));

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
