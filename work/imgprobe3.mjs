// Probe 3: modImgLoaderHooker.getImage + modLoader zip-read APIs + how Tumbler
// sprites actually obtain image data.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/imgprobe3-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9240;
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

    // getImage signature & call
    log('getImage.toString head:', await ev(`String(window.modImgLoaderHooker.getImage).slice(0, 300)`));
    const g1 = await ev(`(async () => { try { const r = await window.modImgLoaderHooker.getImage('img/body/base-head.png'); if (r == null) return 'null'; if (typeof r === 'string') return 'str:' + r.slice(0, 40) + ' len=' + r.length; return 'type=' + (r && r.constructor && r.constructor.name); } catch (e) { return 'EXC ' + e.message; } })()`);
    log('getImage(img/body/base-head.png):', g1);

    // modLoader API surface
    log('modLoader keys:', await ev(`(() => { const ml = window.modSC2DataManager.modLoader; const ks = []; for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(ml) || {})) ks.push('P:' + k); for (const k of Object.keys(ml)) ks.push('O:' + k); return ks.join(' | '); })()`));

    // modLoader zip read attempts
    for (const code of [
      `(async () => { try { const ml = window.modSC2DataManager.modLoader; return typeof ml.getModImg; } catch (e) { return 'EXC ' + e.message; } })()`,
      `(async () => { try { const ml = window.modSC2DataManager.modLoader; return typeof ml.readModFile; } catch (e) { return 'EXC ' + e.message; } })()`,
    ]) {
      log('typeof:', await ev(code));
    }

    // try reading one img out of the imgpack zip through modLoader
    const read1 = await ev(`(async () => { try { const ml = window.modSC2DataManager.modLoader; if (ml.getModImg) { const r = await ml.getModImg('GameOriginalImagePack', 'img/body/base-head.png'); if (r == null) return 'null'; if (typeof r === 'string') return 'str:' + r.slice(0, 40) + ' len=' + r.length; return 'type=' + (r && r.constructor && r.constructor.name); } return 'no getModImg'; } catch (e) { return 'EXC ' + e.message; } })()`);
    log('getModImg(GameOriginalImagePack, img/body/base-head.png):', read1);

    // check the imgpack ModZipReader directly
    const zipInfo = await ev(`(() => { try { const ml = window.modSC2DataManager.modLoader; const names = ml.getModAllName(); const out = {}; for (const n of ['GameOriginalImagePack', 'bjx-pack']) { const c = ml.getModCacheByNameOne ? ml.getModCacheByNameOne(n) : null; out[n] = c ? Object.keys(c).join(',') : 'no-cache'; } return JSON.stringify(out); } catch (e) { return 'EXC ' + e.message; } })()`);
    log('mod caches:', zipInfo);

    // how does Tumbler load? find the DoL-side image path function
    log('Tumbler global:', await ev(`(() => { return { hasTumbler: typeof window.Tumbler, hasSetupTumbler: typeof (window.SugarCube && SugarCube.setup && SugarCube.setup.Tumbler) }; })()`));
    log('setup.Tumbler keys:', await ev(`(() => { const T = window.SugarCube && SugarCube.setup && SugarCube.setup.Tumbler; if (!T) return 'absent'; return Object.keys(T).slice(0, 30).join(','); })()`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();