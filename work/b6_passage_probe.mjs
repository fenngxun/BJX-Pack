// 从运行中的 dist 里取「运行时真实 passage 文本」——用于给规则做精确重锚。
// 注意：所有 evaluate 表达式必须单行（多行会 SyntaxError: Unexpected end of input）。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2];
const PORT = 9244;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6psg-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = [
  ['Children Activity Events', 'Childrens Home'],
  ["Briar's Office Show 2", 'Brothel'],
  ['Hallways', 'School Detention'],
  ['Widgets Events Maths', 'ZZZ'],
  ['Start', 'ZZZ'],
];

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

  for (const [psg, needle] of TARGETS) {
    const expr = `(function(){try{var SC=window.SugarCube;var t=(SC.State.passages||{})[${JSON.stringify(psg)}]||(SC.Story&&SC.Story.get?SC.Story.get(${JSON.stringify(psg)}):null);if(!t)return 'NO PASSAGE keys='+(SC.State.passages?Object.keys(SC.State.passages).length:'undef')+' story='+(typeof SC.Story);var s=t.text||'';var i=s.indexOf(${JSON.stringify(needle)});if(i<0)return 'NEEDLE NOT FOUND len='+s.length;return s.length<400?('FULL len='+s.length+' | '+s):s.slice(Math.max(0,i-120), i+160);}catch(e){return 'ERR:'+e.message;}})()`;
    console.log('\n=== ' + psg + ' ===\n' + await ev(expr));
  }
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
