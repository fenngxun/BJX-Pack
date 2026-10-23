// Path-A FINAL: clean html -> import bjx-pack + rebuilt ImagePack via the
// GUI's own JS chain (addModIndexDB) -> enable -> reload -> verify bjx
// content smoke + real image rendering (img elements + canvas).
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/patha-final-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9237;
const PROFILE = 'C:/Users/79403/Desktop/dol/work/patha-final-profile';
const BJX_ZIP = 'C:/Users/79403/Desktop/dol/work/bjx-pack-0.3.0.mod.zip';
const IMG_ZIP = 'C:/Users/79403/Desktop/dol/work/GameOriginalImagePack-rebuilt.mod.zip';
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
    log('P1 passage:', await ev(`SugarCube.State.passage`));

    const importMod = async (zipPath, key, label) => {
      const buf = readFileSync(zipPath);
      const chunks = b64Chunks(buf);
      log(label, 'zip bytes:', buf.length, 'chunks:', chunks.length);
      await ev(`window.__zb = []`);
      for (const c of chunks) await ev(`window.__zb.push(${JSON.stringify(c)})`);
      const r = await ev(`(async () => { try { const b64 = window.__zb.join(''); window.__zb = null; await modSC2DataManager.modLoadController.addModIndexDB(${JSON.stringify(key)}, b64); return 'ok, idb: ' + JSON.stringify(await modSC2DataManager.modLoadController.listModIndexDB()); } catch (e) { return 'EXC ' + e.message; } })()`);
      log(label, 'addModIndexDB:', r);
    };

    await importMod(BJX_ZIP, 'bjx-pack', '[bjx]');
    await importMod(IMG_ZIP, 'GameOriginalImagePack', '[imgpack]');
    const wr = await ev(`(async () => { try { await modSC2DataManager.modLoadController.overwriteModIndexDBModList(['bjx-pack', 'GameOriginalImagePack']); return 'written'; } catch (e) { return 'EXC ' + e.message; } })()`);
    log('enable list:', wr);

    // reload
    await cdp.send('Page.reload');
    await sleep(12000);
    const t1 = Date.now();
    let booted2 = false;
    while (Date.now() - t1 < 180000) {
      const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State); })()`).catch(() => false);
      if (ok) { booted2 = true; break; }
      await sleep(2000);
    }
    log('P2 rebooted:', booted2);
    await sleep(6000);

    // verify mods loaded
    const names = await ev(`(() => { try { return JSON.stringify(modSC2DataManager.modLoader.getModAllName()); } catch (e) { return 'EXC ' + e.message; } })()`);
    log('P2 loaded mods:', names);
    log('P2 bjx loaded:', await ev(`(() => { try { return modSC2DataManager.modLoader.getModAllName().indexOf('bjx-pack') >= 0; } catch (e) { return 'EXC ' + e.message; } })()`));
    log('P2 imgpack loaded:', await ev(`(() => { try { return modSC2DataManager.modLoader.getModAllName().indexOf('GameOriginalImagePack') >= 0; } catch (e) { return 'EXC ' + e.message; } })()`));
    // img cache of the pack: how many imgs were read out of the zip
    log('P2 imgpack imgs in cache:', await ev(`(() => { try { const m = modSC2DataManager.modLoader.getModCacheByNameOne('GameOriginalImagePack'); return m && m.modInfo ? 'imgs:' + m.modInfo.imgs.length : 'no-cache'; } catch (e) { return 'EXC ' + e.message; } })()`));

    // bjx content smoke
    log('P2 Sea Reef:', await ev(`SugarCube.Story.has('Sea Reef')`));
    log('P2 Robin Raccoon:', await ev(`SugarCube.Story.has('Robin Raccoon')`));

    // age gate + start
    await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; })()`);
    await sleep(500);
    await ev(`(() => { const bs = Array.from(document.querySelectorAll('#ui-dialog button')); const b = bs.find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
    await sleep(1500);
    log('P2 passage:', await ev(`SugarCube.State.passage`));

    // BJXTEST smoke: TF keys + one BJX page render
    const BJXTEST_SRC = `
(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const SC = window.SugarCube;
  const linkText = (a) => a.textContent.trim().replace(/^\\\\((?:Shift \\\\+ )?\\\\d+\\\\)\\\\s+/, '');
  window.BJXTEST = {
    passage: () => SC.State.passage,
    var: (n) => SC.State.variables[n],
    setVars: (o) => { Object.assign(SC.State.variables, o); return true; },
    run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 200); } },
    goto: (n) => { SC.Engine.play(n); return true; },
    links: () => qa('#passages a.link-internal, #passages a.macro-link').map(linkText),
    clickLink: (prefix) => {
      const el = qa('#passages a.link-internal, #passages a.macro-link').find((a) => linkText(a).startsWith(prefix));
      if (el) { el.click(); return true; }
      return false;
    },
    domErrors: () => qa('.error').map((e) => e.textContent.trim().slice(0, 250)),
  };
  return true;
})()
`;
    await ev(BJXTEST_SRC);
    await ev(`BJXTEST.setVars({ debug: 1 })`);
    await ev(`SugarCube.State.variables.options.debugdisable = 'f'`);
    await ev(`BJXTEST.goto("Start2")`);
    await sleep(1200);
    await ev(`BJXTEST.clickLink('School Start')`);
    await sleep(2000);
    log('P2 after school start:', await ev('BJXTEST.passage()'));
    log('P2 tf keys:', await ev(`BJXTEST.run('!!V.transformationParts.slime + "/" + !!V.transformationParts.dragon + "/" + !!V.transformationParts.raccoon')`));

    // ---- image rendering verification ----
    // 1) global img element status on current page
    const imgStat = await ev(`(() => { const imgs = Array.from(document.querySelectorAll('img')); return JSON.stringify({ total: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length, broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length, srcSample: imgs.slice(0, 3).map(i => (i.src || '').slice(0, 60)) }); })()`);
    log('P3 img elements:', imgStat);

    // 2) canvas sprite: go to a scene that draws sprites. Bedroom mirror shows the PC sprite.
    await ev(`BJXTEST.setVars({ stress: 0, trauma: 0, exposed: 0 })`);
    await ev(`BJXTEST.goto("Bedroom")`);
    await sleep(1500);
    await ev(`BJXTEST.clickLink('Mirror')`);
    await sleep(2000);
    log('P3 at mirror:', await ev('BJXTEST.passage()'));
    // canvas paint check: dataURL length indicates non-blank pixels
    const canvasInfo = await ev(`(() => { const cs = Array.from(document.querySelectorAll('canvas')); return JSON.stringify(cs.map(c => { let len = -1; try { len = c.toDataURL().length; } catch (e) { len = -2; } return { w: c.width, h: c.height, dataLen: len }; })); })()`);
    log('P3 mirror canvases:', canvasInfo);
    const imgStat2 = await ev(`(() => { const imgs = Array.from(document.querySelectorAll('img')); return JSON.stringify({ total: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length, broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length }); })()`);
    log('P3 mirror imgs:', imgStat2);

    // 3) screenshot for visual proof
    await cdp.send('Page.enable');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync('C:/Users/79403/Desktop/dol/work/patha-mirror.png', Buffer.from(shot.data, 'base64'));
    log('P3 screenshot saved: patha-mirror.png');

    // 4) a combat scene sprite (beast) for stronger proof
    await ev(`BJXTEST.setVars({ stress: 0, trauma: 0, exposed: 0, eventskip: 1 })`);
    await ev(`BJXTEST.goto("Forest")`);
    await sleep(2000);
    log('P3 forest imgs:', await ev(`(() => { const imgs = Array.from(document.querySelectorAll('img')); return 'total:' + imgs.length + ' loaded:' + imgs.filter(i => i.complete && i.naturalWidth > 0).length; })()`));
    const canvasInfo2 = await ev(`(() => { const cs = Array.from(document.querySelectorAll('canvas')); return JSON.stringify(cs.map(c => { let len = -1; try { len = c.toDataURL().length; } catch (e) {} return { w: c.width, h: c.height, dataLen: len }; })); })()`);
    log('P3 forest canvases:', canvasInfo2);
    const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('C:/Users/79403/Desktop/dol/work/patha-forest.png', Buffer.from(shot2.data, 'base64'));
    log('P3 screenshot saved: patha-forest.png');
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();