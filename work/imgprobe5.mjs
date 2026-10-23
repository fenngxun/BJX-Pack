// Probe 5 (final): read base64 out of the imgpack's underlying JSZip + check
// mod.imgs cache; prove end-to-end image availability from the rebuilt pack.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/imgprobe5-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9242;
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

    // 1) underlying JSZip via zip.zip() / getZipFile()
    log('zip.zip() type:', await ev(`(() => { const c = window.modSC2DataManager.modLoader.getModCacheByNameOne('GameOriginalImagePack'); const z = c && c.zip; try { const j = typeof z.zip === 'function' ? z.zip() : undefined; return j ? (j.constructor && j.constructor.name) + ' files:' + (j.files ? Object.keys(j.files).length : '?') : String(j); } catch (e) { return 'EXC ' + e.message; } })()`));

    // 2) read base64 through JSZip
    const read1 = await ev(`(async () => { try { const c = window.modSC2DataManager.modLoader.getModCacheByNameOne('GameOriginalImagePack'); const z = c && c.zip; const j = typeof z.zip === 'function' ? z.zip() : (typeof z.getZipFile === 'function' ? z.getZipFile() : null); if (!j) return 'no jszip handle'; const f = j.file && j.file('img/body/base-head.png'); if (!f) return 'file entry not found'; const b64 = await f.async('base64'); return 'OK base64 len=' + b64.length + ' head=' + b64.slice(0, 24); } catch (e) { return 'EXC ' + e.message; } })()`);
    log('jszip read img/body/base-head.png:', read1);

    // 3) mod.imgs cache type/size
    log('mod.imgs:', await ev(`(() => { const c = window.modSC2DataManager.modLoader.getModCacheByNameOne('GameOriginalImagePack'); const m = c && c.mod; if (!m) return 'no mod'; const im = m.imgs; if (im == null) return 'null'; if (im instanceof Map) return 'Map(' + im.size + ')'; if (Array.isArray(im)) return 'Array(' + im.length + ')'; if (typeof im === 'object') return 'obj keys:' + Object.keys(im).length; return typeof im; })()`));

    // 4) imgFileReplaceList (should be empty for a pure original-image pack)
    log('imgFileReplaceList:', await ev(`(() => { const c = window.modSC2DataManager.modLoader.getModCacheByNameOne('GameOriginalImagePack'); const m = c && c.mod; const l = m && m.imgFileReplaceList; if (!l) return 'none'; return (l.length || Object.keys(l).length) + ' entries'; })()`));

    // 5) how does the game sprite engine ask for images? trace: check DoL-side
    //    setup.LocationImages / shadowImage source values
    log('shadowImage:', await ev(`(() => { const s = window.SugarCube && SugarCube.setup; return s && s.shadowImage ? String(s.shadowImage).slice(0, 80) : 'none'; })()`));

    // 6) force-trigger the DOM img replacement flow manually: pick a broken img,
    //    run the same chain the sc2 hook would, using modUtils.requestImageBySrc? or
    //    check what attributes the flow left (ml-replaced-src was original path)
    log('sample img full attrs:', await ev(`(() => { const i = document.querySelector('img[ml-src]'); if (!i) return 'none'; return JSON.stringify(Array.from(i.attributes).map(a => a.name + '=' + String(a.value).slice(0, 60))); })()`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();