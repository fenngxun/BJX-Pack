// Probe modImgLoaderHooker (installed by ImageLoaderHook mod): its API surface
// and whether it can serve img data from the ImagePack zip.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/imgprobe2-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9239;
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
      if (r.exceptionDetails) return 'EXC:' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 500);
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
    await sleep(4000);
    await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; })()`);
    await sleep(400);
    await ev(`(() => { const bs = Array.from(document.querySelectorAll('#ui-dialog button')); const b = bs.find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
    await sleep(1500);

    // modImgLoaderHooker API surface
    log('modImgLoaderHooker keys:', await ev(`(() => { const h = window.modImgLoaderHooker; if (!h) return 'absent'; const ks = []; for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(h) || {})) ks.push('P:' + k); for (const k of Object.keys(h)) ks.push('O:' + k); return ks.join(' | '); })()`));

    // try common read methods
    for (const code of [
      `window.modImgLoaderHooker && typeof window.modImgLoaderHooker.loadImg`,
      `window.modImgLoaderHooker && typeof window.modImgLoaderHooker.getImage`,
      `window.modImgLoaderHooker && typeof window.modImgLoaderHooker.getImg`,
    ]) {
      log('typeof:', code.slice(-40), '=', await ev(code));
    }

    // try loadImg on a known zip image
    const r1 = await ev(`(async () => { try { const h = window.modImgLoaderHooker; if (!h || !h.loadImg) return 'no loadImg'; const d = await h.loadImg('img/body/base-head.png'); return d ? String(d).slice(0, 40) + ' len=' + String(d).length : 'null'; } catch (e) { return 'EXC ' + e.message; } })()`);
    log('loadImg(img/body/base-head.png):', r1);

    // what does the hooker consider its source list? check internal caches
    const r2 = await ev(`(() => { const h = window.modImgLoaderHooker; if (!h) return 'absent'; const out = {}; for (const k of Object.keys(h)) { const v = h[k]; if (v instanceof Map) out[k] = 'Map(' + v.size + ')'; else if (v instanceof Set) out[k] = 'Set(' + v.size + ')'; else if (Array.isArray(v)) out[k] = 'Array(' + v.length + ')'; else if (typeof v !== 'function') out[k] = String(v).slice(0, 60); } return JSON.stringify(out); })()`);
    log('hooker fields:', r2);

    // how many img requests has the hooker seen vs served
    const r3 = await ev(`(() => { const h = window.modImgLoaderHooker; if (!h) return 'absent'; const out = {}; for (const k of Object.keys(h)) { const v = h[k]; if (v instanceof Map) { out[k] = { size: v.size, sample: Array.from(v.keys()).slice(0, 3) }; } } return JSON.stringify(out); })()`);
    log('hooker maps:', r3);
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();