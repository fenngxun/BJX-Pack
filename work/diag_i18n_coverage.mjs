// 诊断：SC2 数据里中文覆盖率 + 关键 passage 文本 + mod 清单
import { spawn } from 'node:child_process';
import { mkdtempSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2];
const PORT = 9231;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-diag-'));
const LOG = 'C:/Users/79403/Desktop/dol/work/diag-i18n-console.log';
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
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}

const STATE_PROBE = `(() => {
  const out = {};
  try {
    out.modList = window.modUtils ? window.modUtils.getModListName() : null;
    const cache = window.modSC2DataManager.getSC2DataInfoCache();
    const m = cache.passageDataItems.map;
    out.passageTotal = m.size;
    let withCJK = 0, cjkChars = 0, latinChars = 0;
    const sampleEnglish = [];
    m.forEach((v, k) => {
      const t = v && v.content ? v.content : '';
      const c = (t.match(/[\\u4e00-\\u9fff]/g) || []).length;
      const l = (t.match(/[A-Za-z]/g) || []).length;
      cjkChars += c; latinChars += l;
      if (c > 0) withCJK++;
      else if (l > 200 && sampleEnglish.length < 12) sampleEnglish.push(k);
    });
    out.withCJK = withCJK;
    out.cjkChars = cjkChars;
    out.latinChars = latinChars;
    out.sampleEnglish = sampleEnglish;
    const pick = (n) => { const it = m.get(n); return it ? (it.content || '').slice(0, 260) : null; };
    out.shoppingTop = pick('Shopping Centre Top');
    out.shoppingTopHasCJK = /[\\u4e00-\\u9fff]/.test(out.shoppingTop || '');
    out.startP = pick('Start');
    out.bunker = pick('Bunker');
    out.bjxPassageExists = m.has('Bunker') && m.has('Casey Introduction');
    out.sampleBJXNames = ['Bunker','Casey Introduction','The Bunker Intro'].filter((n) => m.has(n));
    // 渲染期：直接跳到商场顶层看显示文本
    try { window.SugarCube.Engine.play('Shopping Centre Top'); } catch (e) { out.gotoErr = String(e).slice(0,120); }
  } catch (e) { out.err = String(e).slice(0, 300); }
  return JSON.stringify(out);
})()`;

async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
  const cdp = connect(await getPageWs());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  cdp.onEvent?.();
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  };
  const t0 = Date.now();
  let booted = false;
  while (Date.now() - t0 < 300000) {
    const ok = await ev(`(()=>{const d=document.getElementById('story');return !!(d&&window.SugarCube&&window.SugarCube.State&&window.SugarCube.State.passage);})()`).catch(() => false);
    if (ok) { booted = true; break; }
    await sleep(2000);
  }
  console.log('booted:', booted, 'in', Math.round((Date.now() - t0) / 1000), 's');
  if (!booted) { chrome.kill(); process.exit(1); }
  await sleep(1500);
  const raw = await ev(STATE_PROBE);
  const s = JSON.parse(raw);
  await sleep(1500);
  const dom = await ev(`(()=>{const el=document.getElementById('passages');return el?el.innerText.slice(0,700):null;})()`);
  console.log(JSON.stringify({
    modCount: s.modList ? s.modList.length : null,
    modTail: s.modList ? s.modList.slice(-6) : null,
    passageTotal: s.passageTotal,
    withCJK: s.withCJK,
    cjkRatio: s.passageTotal ? +(s.withCJK / s.passageTotal * 100).toFixed(1) : null,
    shoppingTopHasCJK: s.shoppingTopHasCJK,
    shoppingTop: s.shoppingTop,
    bjxPassageExists: s.bjxPassageExists,
    sampleBJXNames: s.sampleBJXNames,
    sampleEnglish: s.sampleEnglish,
    err: s.err,
  }, null, 1));
  console.log('--- rendered after goto ---');
  console.log(dom);
  chrome.kill();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
