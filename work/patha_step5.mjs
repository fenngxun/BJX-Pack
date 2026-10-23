// Path-A via the same JS chain the GUI uses after file selection:
// addModIndexDB(name, base64) + overwriteModIndexDBModList(enableList)
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/patha-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9236;
const PROFILE = 'C:/Users/79403/Desktop/dol/work/patha-profile';
const BJX_ZIP = 'C:/Users/79403/Desktop/dol/work/bjx-pack-0.3.0.mod.zip';
const IMG_ZIP = 'C:/Users/79403/Desktop/dol/game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/GameOriginalImagePack-0.5.10.12.mod.zip';
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

function b64Chunks(buf, size = 400000) {
  const b64 = buf.toString('base64');
  const out = [];
  for (let i = 0; i < b64.length; i += size) out.push(b64.slice(i, i + size));
  return out;
}

async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
  try {
    const cdp = connect(await getPageWs());
    await cdp.ready;
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
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
    await sleep(2000);
    await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; })()`);
    await sleep(500);
    await ev(`(() => { const bs = Array.from(document.querySelectorAll('#ui-dialog button')); const b = bs.find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
    await sleep(1500);
    log('passage:', await ev(`SugarCube.State.passage`));

    // what does overwriteModIndexDBModList expect? dump full compiled source
    log('overwriteModIndexDBModList src:', await ev(`String(modSC2DataManager.modLoadController.__proto__.overwriteModIndexDBModList).replace(/\\s+/g, ' ').slice(0, 300)`));
    log('addModIndexDB src:', await ev(`String(modSC2DataManager.modLoadController.__proto__.addModIndexDB).replace(/\\s+/g, ' ').slice(0, 200)`));

    // ---- import bjx-pack (same chain as GUI change handler) ----
    const bjxBuf = readFileSync(BJX_ZIP);
    const bjxChunks = b64Chunks(bjxBuf);
    log('bjx zip bytes:', bjxBuf.length, 'b64 chunks:', bjxChunks.length);
    await ev(`window.__zipB64 = []`);
    for (let i = 0; i < bjxChunks.length; i++) {
      await ev(`window.__zipB64.push(${JSON.stringify(bjxChunks[i])})`);
    }
    const r1 = await ev(`(async () => { try { const b64 = window.__zipB64.join(''); window.__zipB64 = null; await modSC2DataManager.modLoadController.addModIndexDB('bjx-pack', b64); const l = await modSC2DataManager.modLoadController.listModIndexDB(); return 'added, idb now: ' + JSON.stringify(l).slice(0, 300); } catch (e) { return 'EXC ' + e.message; } })()`);
    log('[bjx] addModIndexDB:', r1);

    // ---- import GameOriginalImagePack ----
    const imgBuf = readFileSync(IMG_ZIP);
    const imgChunks = b64Chunks(imgBuf);
    log('imgpack zip bytes:', imgBuf.length, 'b64 chunks:', imgChunks.length);
    await ev(`window.__zipB64 = []`);
    for (let i = 0; i < imgChunks.length; i++) {
      await ev(`window.__zipB64.push(${JSON.stringify(imgChunks[i])})`);
    }
    const r2 = await ev(`(async () => { try { const b64 = window.__zipB64.join(''); window.__zipB64 = null; await modSC2DataManager.modLoadController.addModIndexDB('GameOriginalImagePack-0.5.10.12', b64); const l = await modSC2DataManager.modLoadController.listModIndexDB(); return 'added, idb now: ' + JSON.stringify(l).slice(0, 300); } catch (e) { return 'EXC ' + e.message; } })()`);
    log('[imgpack] addModIndexDB:', r2);

    // ---- enable: write the mod list (enabled names) ----
    const r3 = await ev(`(async () => { try { const l = await modSC2DataManager.modLoadController.listModIndexDB(); const names = (l || []).map(x => x && (x.name || x)); return 'list detail: ' + JSON.stringify(l).slice(0, 400); } catch (e) { return 'EXC ' + e.message; } })()`);
    log('list detail:', r3);

    // overwriteModIndexDBModList likely takes name array; try with both imported mods
    const r4 = await ev(`(async () => { try { await modSC2DataManager.modLoadController.overwriteModIndexDBModList(['bjx-pack', 'GameOriginalImagePack-0.5.10.12']); return 'list written'; } catch (e) { return 'EXC ' + e.message; } })()`);
    log('overwriteModList:', r4);

    // ---- reload ----
    await cdp.send('Page.reload');
    await sleep(10000);
    const t1 = Date.now();
    let booted2 = false;
    while (Date.now() - t1 < 120000) {
      const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State); })()`).catch(() => false);
      if (ok) { booted2 = true; break; }
      await sleep(2000);
    }
    log('rebooted:', booted2);
    await sleep(4000);

    // ---- verify ----
    log('Sea Reef present:', await ev(`SugarCube.Story.has('Sea Reef')`));
    log('Robin Raccoon present:', await ev(`SugarCube.Story.has('Robin Raccoon')`));
    log('loaded mod names:', await ev(`(() => { try { return JSON.stringify(modSC2DataManager.modLoader.getModAllName()).slice(0, 600); } catch (e) { return 'EXC ' + e.message; } })()`));
    log('bjx in loaded:', await ev(`(() => { try { return modSC2DataManager.modLoader.getModAllName().indexOf('bjx-pack') >= 0; } catch (e) { return 'EXC ' + e.message; } })()`));
    log('imgpack in loaded:', await ev(`(() => { try { return JSON.stringify(modSC2DataManager.modLoader.getModAllName()).indexOf('ImagePack') >= 0; } catch (e) { return 'EXC ' + e.message; } })()`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();