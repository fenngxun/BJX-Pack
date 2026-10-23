// Probe 4: read an image straight out of the ImagePack ModZipReader, and find
// which component painted the sprite canvases.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/imgprobe4-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9241;
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

    // ModZipReader API of the imgpack
    log('zip reader keys:', await ev(`(() => { const c = window.modSC2DataManager.modLoader.getModCacheByNameOne('GameOriginalImagePack'); const z = c && c.zip; if (!z) return 'no zip'; const ks = []; for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(z) || {})) ks.push('P:' + k); for (const k of Object.keys(z)) ks.push('O:' + k); return ks.join(' | '); })()`));

    // read img from the zip
    const read1 = await ev(`(async () => { try { const c = window.modSC2DataManager.modLoader.getModCacheByNameOne('GameOriginalImagePack'); const z = c && c.zip; if (!z) return 'no zip'; const fn = z.readModFile || z.readFile || z.getImg || z.readImg; if (!fn) return 'no read fn'; const r = await fn.call(z, 'img/body/base-head.png'); if (r == null) return 'null'; if (typeof r === 'string') return 'str:' + r.slice(0, 40) + ' len=' + r.length; if (r instanceof Uint8Array || r instanceof ArrayBuffer) return 'bytes:' + (r.byteLength || r.length); return 'type=' + (r && r.constructor && r.constructor.name); } catch (e) { return 'EXC ' + e.message; } })()`);
    log('zip read img/body/base-head.png:', read1);

    // modInfo of the imgpack (imgs list from boot.json?)
    log('modInfo:', await ev(`(() => { const c = window.modSC2DataManager.modLoader.getModCacheByNameOne('GameOriginalImagePack'); const m = c && c.mod; if (!m) return 'no mod'; const o = { keys: Object.keys(m).slice(0, 25).join(',') }; try { o.imgsLen = (m.modInfo && m.modInfo.imgs) ? m.modInfo.imgs.length : 'none'; } catch (e) { o.imgsLen = 'EXC'; } try { o.bootImgListLen = (m.bootJson && m.bootJson.imgFileList) ? m.bootJson.imgFileList.length : 'none'; } catch (e) { o.bootImgListLen = 'EXC'; } return JSON.stringify(o); })()`));

    // who painted the canvas? look for canvas-drawing sprite engine globals
    log('setup keys w/ sprite/canvas:', await ev(`(() => { const s = window.SugarCube && SugarCube.setup; if (!s) return 'no setup'; return Object.keys(s).filter(k => /sprite|canvas|image|tumb|overlay|icon/i.test(k)).join(','); })()`));

    // DoL 0.5 sprite: check for .sprite / .main-img style DOM & the canvas parent
    log('canvas parents:', await ev(`(() => { const cs = Array.from(document.querySelectorAll('canvas')).filter(c => c.width > 100); return JSON.stringify(cs.map(c => ({ cls: c.className, parentCls: c.parentElement && c.parentElement.className, id: c.id, w: c.width, h: c.height }))); })()`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();