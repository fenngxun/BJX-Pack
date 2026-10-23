// 验证两个运行时 bug 的修复：$sydneySeen 播种 + setup.loveAlias 兜底
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2];
const PORT = 9233;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-fix-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no devtools page');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  return {
    send(method, params = {}) {
      return new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? rej(new Error(method + ': ' + JSON.stringify(msg.error))) : res(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}

async function main() {
  spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  const cdp = connect(await getPageWs());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
    if (r.exceptionDetails) return 'EXC: ' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result.value;
  };
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 300000) {
    ok = await ev(`(()=>{const d=document.getElementById('story');return !!(d&&window.SugarCube&&window.SugarCube.State&&window.SugarCube.State.passage);})()`).catch(() => false);
    if (ok) break;
    await sleep(2000);
  }
  console.log('booted:', ok, Math.round((Date.now() - t0) / 1000) + 's');
  if (!ok) process.exit(1);
  await sleep(2000);

  const probes = {
    sydneySeenType: `(()=>{const v=window.SugarCube.State.variables.sydneySeen; return Array.isArray(v)?'array('+v.length+')':String(v);})()`,
    sydneySeenIncludes: `(()=>{try{return window.SugarCube.State.variables.sydneySeen.includes('orphanage')}catch(e){return 'EXC:'+e.message}})()`,
    loveAlias_bjx: `(()=>{try{return typeof window.setup.loveAlias['凯西']==='function' ? window.setup.loveAlias['凯西']() : 'NOT_FN' }catch(e){return 'EXC:'+e.message}})()`,
    loveAlias_taylor: `(()=>{try{return typeof window.setup.loveAlias['泰勒']==='function' ? window.setup.loveAlias['泰勒']() : 'NOT_FN' }catch(e){return 'EXC:'+e.message}})()`,
    loveAlias_unknown: `(()=>{try{return typeof window.setup.loveAlias['SomeModNpc']==='function' ? window.setup.loveAlias['SomeModNpc']() : 'NOT_FN' }catch(e){return 'EXC:'+e.message}})()`,
    loveAlias_vanilla: `(()=>{try{return window.setup.loveAlias['Robin']() }catch(e){return 'EXC:'+e.message}})()`,
    loveAlias_keys: `(()=>{try{return Object.keys(window.setup.loveAlias).length}catch(e){return 'EXC'}})()`,
  };
  for (const [k, expr] of Object.entries(probes)) {
    console.log(k + ':', await ev(expr));
  }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
