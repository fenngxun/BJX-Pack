import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'C:/Users/79403/Desktop/dol/work/probe-gui2-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9234;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-guiprobe2-'));
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
      if (r.exceptionDetails) return 'EXC:' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300);
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

    // dump object method maps
    const dump = (name, expr) => ev(`(() => { try { const o = ${expr}; if (!o) return 'null'; const own = Object.keys(o); const prot = o.constructor && o.constructor.prototype ? Object.getOwnPropertyNames(o.constructor.prototype).filter(k => k !== 'constructor') : []; return name + ' own:' + own.join(',') + ' | proto:' + prot.join(','); } catch (e) { return 'EXC ' + e.message; } })()`.replace('name + ', JSON.stringify(name) + ' + '));
    log(await dump('modManagerSubUi', 'window.modLoaderGui && modLoaderGui.modManagerSubUi'));
    log(await dump('modSubUiAngularJsService', 'window.modLoaderGui && modLoaderGui.modSubUiAngularJsService'));
    log(await dump('modLoadController', 'window.modSC2DataManager && modSC2DataManager.modLoadController'));
    log(await dump('modLoader', 'window.modSC2DataManager && modSC2DataManager.modLoader'));
    log(await dump('modLoadSwitch', 'window.modLoaderGui && modLoaderGui.modLoadSwitch'));

    // IndexDBLoader global?
    log('[globals] IndexDBLoader:', await ev(`typeof window.IndexDBLoader`));
    log('[globals] localStorage mod keys:', await ev(`(() => { const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ks.push(k); } return ks.slice(0, 20).join(','); })()`));

    // modManagerSubUi method sources - look for import-related
    log('[mgr] subUi source snippets:', await ev(`(() => { const m = window.modLoaderGui && modLoaderGui.modManagerSubUi; if (!m) return 'null'; let out = []; for (const k of Object.keys(m)) { const v = m[k]; if (typeof v === 'function') { const s = String(v); out.push(k + '() ' + s.slice(0, 120).replace(/\\s+/g, ' ')); } else { out.push(k + ':' + String(v).slice(0, 80)); } } return out.join('  ##  ').slice(0, 3000); })()`));
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