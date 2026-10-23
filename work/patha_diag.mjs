// diag: why is GameOriginalImagePack skipped during load?
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/patha-diag-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9238;
const PROFILE = 'C:/Users/79403/Desktop/dol/work/patha-final-profile';
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
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
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
    await sleep(5000);

    // 1) the enabled list as ModLoader sees it
    log('idb list:', await ev(`(async () => { try { return JSON.stringify(await modSC2DataManager.modLoadController.listModIndexDB()); } catch (e) { return 'EXC ' + e.message; } })()`));
    log('idb hidden list:', await ev(`(async () => { try { return JSON.stringify(await modSC2DataManager.modLoadController.loadHiddenModList()); } catch (e) { return 'EXC ' + e.message; } })()`));
    // 2) the load order / toLoad lists
    log('toLoadModList:', await ev(`(() => { try { const l = modSC2DataManager.modLoader.toLoadModList; return (l && l.map ? l.map(m => m && m.name) : String(l)).toString().slice(0, 300); } catch (e) { return 'EXC ' + e.message; } })()`));
    log('loadEndModList:', await ev(`(() => { try { const l = modSC2DataManager.modLoader.loadEndModList; return (l && l.map ? l.map(m => m && m.name) : String(l)).toString().slice(0, 300); } catch (e) { return 'EXC ' + e.message; } })()`));
    // 3) mod loader logger logs
    const logs = await ev(`(() => { try { const lg = modSC2DataManager.modLoader.logger; if (!lg) return 'no logger'; const out = {}; for (const k of Object.keys(lg)) { const v = lg[k]; if (Array.isArray(v)) out[k] = v.slice(-40); else if (typeof v === 'object' && v && Array.isArray(v.log)) out[k] = v.log.slice(-40); } return JSON.stringify(out).slice(0, 4000); } catch (e) { return 'EXC ' + e.message; } })()`);
    log('=== loader logger ===');
    log(logs);
    // 4) console errors during boot - hook was not installed, but check modLoadRecord via safe stringify
    log('loadRecord keys:', await ev(`(() => { try { const r = modSC2DataManager.modLoader.modLoadRecord; const out = {}; for (const k of Object.keys(r)) { const v = r[k]; out[k] = (v && v.map) ? v.map(m => m && (m.name || m.modInfo && m.modInfo.name)) : String(v).slice(0, 80); } return JSON.stringify(out).slice(0, 1500); } catch (e) { return 'EXC ' + e.message; } })()`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();