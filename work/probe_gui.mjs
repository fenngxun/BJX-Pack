// probe: explore ModLoader GUI entry + import control + image system on the clean HTML
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'C:/Users/79403/Desktop/dol/work/probe-gui-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9233;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-guiprobe-'));
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
    // boot wait
    const t0 = Date.now();
    let booted = false;
    while (Date.now() - t0 < 120000) {
      const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State); })()`).catch(() => false);
      if (ok) { booted = true; break; }
      await sleep(2000);
    }
    log('booted:', booted);
    await sleep(2000);

    // age gate
    await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; })()`);
    await sleep(500);
    await ev(`(() => { const bs = Array.from(document.querySelectorAll('#ui-dialog button')); const b = bs.find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return bs.map(x=>x.textContent.trim()).join(','); })()`);
    await sleep(1500);
    log('passage:', await ev(`(window.SugarCube && SugarCube.State.passage) || 'none'`));

    // 1) ModLoader GUI entry: any element mentioning mod loader / Mods
    log('[entry] body text has ModLoader:', await ev(`document.body.textContent.indexOf('ModLoader') >= 0`));
    log('[entry] #menu-look:', await ev(`(() => { const m = document.getElementById('menu'); return m ? m.textContent.slice(0,150) : 'no #menu'; })()`));
    log('[entry] sidebar links:', await ev(`Array.from(document.querySelectorAll('#story > div[id], #story aside, .options')), Array.from(document.querySelectorAll('a, button, input[type=button]')).map(e => e.textContent.trim()).filter(t => /mod|Mod|MOD/.test(t)).slice(0,10).join(' | ')`));
    log('[entry] buttons all:', await ev(`Array.from(document.querySelectorAll('button, input[type=button], .macro-link')).map(e => (e.textContent || e.value || '').trim()).filter(Boolean).slice(0, 30).join(' | ')`));

    // 2) ModLoaderGui global API surface
    log('[api] modLoaderGui keys:', await ev(`(() => { const g = window.modLoaderGui; return g ? Object.keys(g).join(',') : 'none'; })()`));
    log('[api] modSC2DataManager keys:', await ev(`(() => { const g = window.modSC2DataManager; return g ? Object.keys(g).slice(0,40).join(',') : 'none'; })()`));
    log('[api] angular present:', await ev(`typeof window.angular`));

    // 3) image system surface
    log('[img] window.img:', await ev(`(() => { const i = window.img; return i ? Object.keys(i).slice(0,15).join(',') : 'none'; })()`));
    log('[img] setup.imageApi:', await ev(`(() => { const s = window.setup; return s ? Object.keys(s).filter(k => /img|image|sprite|canvas/i.test(k)).join(',') : 'none'; })()`));
    log('[img] img elements on page:', await ev(`document.querySelectorAll('img').length`));
    log('[img] canvases:', await ev(`document.querySelectorAll('canvas').length`));
    log('[img] ModI18N / ImagePack in zip list:', await ev(`(() => { try { return JSON.stringify((window.modSC2DataManager && modSC2DataManager.getModAllName && modSC2DataManager.getModAllName()) || 'no-getModAllName'); } catch (e) { return 'EXC ' + e.message; } })()`));

    // 4) open ModLoader GUI: common launcher ids
    for (const sel of ['#modLoadUI', '#ModLoadUI', '#modloader', '#mod-ui']) {
      const found = await ev(`!!document.querySelector('${sel}')`);
      if (found) log('[gui] found element:', sel);
    }
    // maybe a link in the sidebar menu ("Save" menu area). Dump the ui-bar
    log('[gui] #ui-bar links:', await ev(`(() => { const b = document.getElementById('ui-bar'); return b ? b.textContent.slice(0, 300) : 'no ui-bar'; })()`));
    log('[gui] story region head:', await ev(`document.body.textContent.slice(0, 400)`));
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