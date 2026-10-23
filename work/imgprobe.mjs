// Runtime probe on existing profile (bjx-pack + rebuilt ImagePack enabled):
// 1) does HtmlTagSrcHook.requestImageBySrc pull real image data from the imgpack zip?
// 2) do DOM img elements carry ML-src (hooked) or raw src (unhooked)?
// 3) does ImageLoaderHook expose any global helpers / observers?
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/imgprobe-out.txt';
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

    // pass age gate
    await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; })()`);
    await sleep(400);
    await ev(`(() => { const bs = Array.from(document.querySelectorAll('#ui-dialog button')); const b = bs.find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
    await sleep(1500);

    // 1) framework APIs present?
    log('has modSC2DataManager:', await ev(`!!(window.modSC2DataManager && window.modSC2DataManager.getHtmlTagSrcHook)`));
    log('modUtils keys:', await ev(`(() => { try { return Object.keys(window.modUtils || {}).filter(k => /image|img|src/i.test(k)).join(','); } catch (e) { return 'EXC ' + e.message; } })()`));

    // 2) requestImageBySrc from the imgpack zip (two paths)
    for (const p of ['img/ui/pepper-spray.png', 'img/body/base-head.png']) {
      const r = await ev(`(async () => { try { const d = await window.modSC2DataManager.getHtmlTagSrcHook().requestImageBySrc('${p}'); if (!d) return 'null'; return String(d).slice(0, 50) + ' ... len=' + String(d).length; } catch (e) { return 'EXC ' + e.message; } })()`);
      log('requestImageBySrc(' + p + '):', r);
    }

    // 3) DOM img elements: raw src or ML-src?
    const imgDom = await ev(`(() => { const imgs = Array.from(document.querySelectorAll('img')); return JSON.stringify(imgs.slice(0, 5).map(i => ({ src: (i.getAttribute('src') || '').slice(0, 60), mlSrc: (i.getAttribute('ML-src') || '').slice(0, 60), outer: i.outerHTML.slice(0, 120) }))); })()`);
    log('img dom:', imgDom);

    // 4) any image-related globals the ImageLoaderHook mod installs
    log('img-related globals:', await ev(`(() => { return Object.keys(window).filter(k => /tumbler|imageloader|imgload|sprite/i.test(k)).slice(0, 20).join(','); })()`));

    // 5) setup.ImagePath style helpers behaviour: how does DoL resolve an img path?
    log('setup img keys:', await ev(`(() => { try { const SC = window.SugarCube; const s = SC && SC.setup; if (!s) return 'no setup'; return Object.keys(s).filter(k => /image|img|path/i.test(k)).join(','); } catch (e) { return 'EXC ' + e.message; } })()`));

    // 6) Tumbler/sprite canvas still ok?
    const canvasInfo = await ev(`(() => { const cs = Array.from(document.querySelectorAll('canvas')); return JSON.stringify(cs.map(c => { let len = -1; try { len = c.toDataURL().length; } catch (e) {} return { w: c.width, h: c.height, dataLen: len }; })); })()`);
    log('canvases:', canvasInfo);
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();