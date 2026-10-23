import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'C:/Users/79403/Desktop/dol/work/probe-gui3-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9235;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-guiprobe3-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('dol-clean'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('chrome devtools page not found');
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
    ready: new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); }),
  };
}

async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
  try {
    const cdp = connect(await getPageWs());
    await cdp.ready;
    await cdp.send('Runtime.enable');
    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.exceptionDetails) return 'EXC:' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 400);
      return r.result.value;
    };
    const t0 = Date.now();
    let booted = false;
    while (Date.now() - t0 < 120000) {
      const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State); })()`).catch(() => false);
      if (ok) { booted = true; break; }
      await sleep(2000);
    }
    log('booted:', booted);
    await sleep(3000);

    // 1) key API sources
    const src = (objExpr, method) => ev(`(() => { try { const o = ${objExpr}; const p = o.constructor.prototype; return String(${method === 'own' ? 'o' : 'p'}['${method}']).replace(/\\s+/g, ' ').slice(0, 600); } catch (e) { return 'EXC ' + e.message; } })()`);
    const ctl = 'window.modSC2DataManager.modLoadController';
    log('[addModIndexDB]', await src(ctl, 'addModIndexDB'));
    log('[overwriteModIndexDBModList]', await src(ctl, 'overwriteModIndexDBModList'));
    log('[listModIndexDB]', await src(ctl, 'listModIndexDB'));

    // 2) GUI entry button in live DOM
    log('[dom] elements containing ModLoader text:', await ev(`(() => { const out = []; const walk = (el) => { for (const c of el.children) { if (c.children.length === 0 && /Mod/i.test(c.textContent) && c.textContent.length < 60) out.push(c.tagName + '|' + c.className.slice(0,40) + '|' + c.textContent.trim().slice(0,40)); walk(c); } }; walk(document.body); return out.slice(0, 15).join('  ##  '); })()`));
    log('[dom] fixed/absolute buttons:', await ev(`(() => { const out = []; for (const el of document.querySelectorAll('div,span,a,button')) { const cs = getComputedStyle(el); if ((cs.position === 'fixed' || cs.position === 'absolute') && el.offsetWidth > 0 && el.offsetWidth < 120 && el.offsetHeight < 60 && el.textContent.trim().length < 30) out.push(el.tagName + '|' + el.id + '|' + el.className.slice(0,30) + '|' + el.textContent.trim().slice(0,20) + '|' + cs.position); } return out.slice(0, 20).join('  ##  ') || 'none'; })()`));

    // 3) IndexedDB databases listed by the browser
    log('[idb] databases:', await ev(`(async () => { try { const dbs = await indexedDB.databases(); return JSON.stringify(dbs.map(d => d.name)); } catch (e) { return 'EXC ' + e.message; } })()`));
    log('[idb] listModIndexDB result:', await ev(`(async () => { try { const r = await modSC2DataManager.modLoadController.listModIndexDB(); return JSON.stringify(r).slice(0, 500); } catch (e) { return 'EXC ' + e.message; } })()`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
    process.exit(0);
  }
}
main();