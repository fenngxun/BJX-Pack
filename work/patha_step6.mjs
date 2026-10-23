// diag: can JSZip parse the streamed ImagePack zip? then try rebuilt standard zip
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/patha-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9236;
const PROFILE = 'C:/Users/79403/Desktop/dol/work/patha-profile';
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
    await sleep(1500);

    // feed the zip bytes into the page and try JSZip (the lib bundled in the game)
    const buf = readFileSync(IMG_ZIP);
    const chunks = [];
    const b64 = buf.toString('base64');
    for (let i = 0; i < b64.length; i += 400000) chunks.push(b64.slice(i, i + 400000));
    await ev(`window.__z = []`);
    for (const c of chunks) await ev(`window.__z.push(${JSON.stringify(c)})`);
    const res = await ev(`(async () => {
      try {
        const b64 = window.__z.join(''); window.__z = null;
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const JSZip = window.JSZip || (window.modSC2DataManager && null);
        // find JSZip: the game bundles it; check common globals
        let z = window.JSZip;
        if (!z) { try { z = modSC2DataManager.sC2JsEvalContext && modSC2DataManager.sC2JsEvalContext.JSZip; } catch (e) {} }
        if (!z) return 'no JSZip global; globals with zip: ' + Object.keys(window).filter(k => /zip/i.test(k)).join(',');
        const zip = await z.loadAsync(bytes);
        const names = Object.keys(zip.files);
        return 'JSZip OK, entries: ' + names.length + ' sample: ' + names.slice(0, 5).join(',') + ' has boot.json: ' + names.includes('boot.json');
      } catch (e) { return 'JSZip FAIL: ' + String(e && e.message).slice(0, 200); }
    })()`);
    log('JSZip parse of shipped ImagePack zip:', res);

    // also try reading it through the ModLoader's own reader chain (loadHiddenModList path): check how it failed
    log('idb mods now:', await ev(`(async () => { try { return JSON.stringify(await modSC2DataManager.modLoadController.listModIndexDB()); } catch (e) { return 'EXC ' + e.message; } })()`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();