// 验证"一句话判断 BJX 是否加载"的几种写法，找出最稳的
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2];
const PORT = 9235;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-ck-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ws() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const p = (await r.json()).find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no page');
}
function conn(u) {
  const s = new WebSocket(u); let id = 0; const pend = new Map();
  s.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  return {
    send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); s.send(JSON.stringify({ id: i, method, params })); }); },
    ready: new Promise((res, rej) => { s.addEventListener('open', res); s.addEventListener('error', rej); }),
  };
}

const CHECKS = {
  'modUtils存在': `typeof window.modUtils`,
  'getModListName里有bjx-pack': `(()=>{try{return window.modUtils.getModListName().includes('bjx-pack')}catch(e){return 'EXC:'+e.message}})()`,
  'modUtils方法列表': `(()=>{try{return Object.keys(window.modUtils).slice(0,20)}catch(e){return 'EXC'}})()`,
  'getModZip(bjx-pack)': `(()=>{try{const z=window.modUtils.getModZip('bjx-pack');return !!z}catch(e){return 'EXC:'+e.message}})()`,
  'V.bjx_dragonUnlock': `(()=>{try{return typeof window.SugarCube.State.variables.bjx_dragonUnlock}catch(e){return 'EXC:'+e.message}})()`,
  'bjx独有passage Bunker': `(()=>{try{return !!window.modUtils.getPassageData('Bunker')}catch(e){return 'EXC:'+e.message}})()`,
  'Story.get Bunker': `(()=>{try{return !!window.SugarCube.Story.get('Bunker')}catch(e){return 'EXC:'+e.message}})()`,
  'bjx入口链接(森林)': `(()=>{try{const d=window.modUtils.getPassageData('Forest');return /林间巨石|Mossy/.test(d.text||d.content||'')}catch(e){return 'EXC'}})()`,
};

async function main() {
  spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL], { stdio: ['ignore', 'ignore', 'ignore'] });
  const cdp = conn(await ws()); await cdp.ready; await cdp.send('Runtime.enable');
  const ev = async (x) => { const r = await cdp.send('Runtime.evaluate', { expression: x, returnByValue: true }); if (r.exceptionDetails) return 'EXC'; return r.result.value; };
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    if (await ev(`(()=>{const d=document.getElementById('story');return !!(d&&window.SugarCube&&window.SugarCube.State&&window.SugarCube.State.passage);})()`).catch(() => false)) break;
    await sleep(2000);
  }
  console.log('booted', Math.round((Date.now() - t0) / 1000) + 's');
  await sleep(1500);
  for (const [k, v] of Object.entries(CHECKS)) console.log(k + ':', JSON.stringify(await ev(v)));
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
