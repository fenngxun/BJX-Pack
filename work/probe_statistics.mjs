// 检查 dist 里 Cheats widget 是否含 BJX 段落 / 转化页列出什么
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2];
const PORT = 9238;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-stat-'));
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

const P = `(() => {
  const mu = window.modUtils;
  const get = (n) => { try { const d = mu.getPassageData(n); return d ? (d.text || d.content || '') : ''; } catch (e) { return ''; } };
  const st = get('Statistics');
  const out = { len: st.length };
  for (const k of ['羊化','蜜蜂化','鹿化','熊化','龙化','蜥蜴化','海豚化','狗化','鱼化','浣熊化','马化','蜘蛛化','青蛙化','猪化','蘑菇营养']) {
    out[k] = (st.match(new RegExp(k, 'g')) || []).length;
  }
  out.tail = st.slice(-600);
  return JSON.stringify(out);
})()`;

async function main() {
  spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL], { stdio: ['ignore', 'ignore', 'ignore'] });
  const cdp = conn(await ws()); await cdp.ready; await cdp.send('Runtime.enable');
  const ev = async (x) => { const r = await cdp.send('Runtime.evaluate', { expression: x, returnByValue: true }); if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200); return r.result.value; };
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    if (await ev(`(()=>{const d=document.getElementById('story');return !!(d&&window.SugarCube&&window.SugarCube.State&&window.SugarCube.State.passage);})()`).catch(() => false)) break;
    await sleep(2000);
  }
  console.log('booted', Math.round((Date.now() - t0) / 1000) + 's');
  await sleep(1500);
  const raw = await ev(P);
  try { const o = JSON.parse(raw); const { len, tail, ...hits } = o; console.log('STATS len=' + len); console.log(JSON.stringify(hits)); console.log('TAIL:', (tail||'').replace(/\n/g,' | ').slice(-420)); } catch (e) { console.log(raw); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
