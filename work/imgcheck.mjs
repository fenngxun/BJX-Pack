// FINAL visual check: full official-equivalent env (bjx-pack + ImagePack mods
// + img/ dir on server). Count loaded DOM imgs, canvases, and take screenshots.
import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/imgcheck-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9243;
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
    await cdp.send('Page.enable');
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
    await sleep(5000);
    await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; })()`);
    await sleep(400);
    await ev(`(() => { const bs = Array.from(document.querySelectorAll('#ui-dialog button')); const b = bs.find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
    await sleep(2500);

    // wait for imgs to settle
    let stat;
    for (let i = 0; i < 10; i++) {
      stat = await ev(`(() => { const imgs = Array.from(document.querySelectorAll('img')); return JSON.stringify({ total: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length, broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length }); })()`);
      const s = JSON.parse(stat);
      if (s.total > 0 && s.loaded + s.broken === s.total) break;
      await sleep(1000);
    }
    log('main page imgs:', stat);

    // goto bedroom mirror (sprite scene)
    await ev(`SugarCube.Engine.play('Bedroom')`);
    await sleep(2000);
    await ev(`(() => { const a = Array.from(document.querySelectorAll('#passages a')).find(x => /Mirror/i.test(x.textContent)); if (a) a.click(); return true; })()`);
    await sleep(3000);
    let stat2;
    for (let i = 0; i < 10; i++) {
      stat2 = await ev(`(() => { const imgs = Array.from(document.querySelectorAll('img')); return JSON.stringify({ total: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length, broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length }); })()`);
      const s = JSON.parse(stat2);
      if (s.total > 0 && s.loaded + s.broken === s.total) break;
      await sleep(1000);
    }
    log('mirror imgs:', stat2);
    const cv = await ev(`(() => { const cs = Array.from(document.querySelectorAll('canvas')); return JSON.stringify(cs.map(c => ({ w: c.width, h: c.height, len: (() => { try { return c.toDataURL().length; } catch (e) { return -1; } })() }))); })()`);
    log('mirror canvases:', cv);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('C:/Users/79403/Desktop/dol/work/final-mirror.png', Buffer.from(shot.data, 'base64'));
    log('screenshot: final-mirror.png');

    log('passage:', await ev(`SugarCube.State.passage`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();