// 导出 i.Candy 物品数据库的图标路径 + 货架名（用于补占位图）
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9229;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-items-'));
const OUT = 'C:/Users/79403/Desktop/dol/work/icandy_item_paths.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('page not found');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else for (const l of listeners) l(msg);
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    onEvent(l) { listeners.push(l); },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

let cdp;
const ev = async (expr, timeout = 20000) => {
  const r = await Promise.race([
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
    sleep(timeout).then(() => { throw new Error('evaluate timeout'); }),
  ]);
  if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || '').slice(0, 300));
  return r.result.value;
};
try {
  cdp = connect(await getPageWs());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  {
    const t0 = Date.now();
    let ok = false;
    while (Date.now() - t0 < 240000) {
      ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`, 10000).catch(() => false);
      if (ok) break;
      await sleep(2000);
    }
    if (!ok) throw new Error('boot failed');
  }
  await sleep(3000);
  const data = await ev(`(() => {
    const items = (typeof Items !== 'undefined' && Items.data) ? Items.data : {};
    const list = Object.values(items).map((d) => ({ type: d.type, id: d.id, img: d.img,
      stacksprites: d.stacksprites || null, diff: d.diff ? Object.keys(d.diff) : null }));
    let shelves = [];
    try { shelves = Object.keys(iShop.shelfdata); } catch (e) {}
    let pockets = [];
    try { pockets = Pocket.list.slice(); } catch (e) { try { pockets = Object.keys(Pocket.pockets || {}); } catch (e2) {} }
    return JSON.stringify({ list, shelves, pockets });
  })()`);
  const obj = JSON.parse(data);
  writeFileSync(OUT, JSON.stringify(obj, null, 1));
  console.log('items', obj.list.length, 'shelves', obj.shelves, 'pockets', obj.pockets);
  console.log('sample', obj.list.slice(0, 3));
} catch (e) {
  console.log('FATAL', String(e && e.stack || e));
} finally {
  try { chrome.kill(); } catch {}
  process.exit(0);
}
