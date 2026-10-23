// Path-A: clean HTML -> open Mod manager GUI -> import zip via setFileInputFiles
// -> enable mod -> reload -> verify bjx-pack + image pack load
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/patha-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9236;
// fixed profile so the imported mods survive for a later full-suite run
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

    // ---- boot ----
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
    log('protocol:', await ev(`location.protocol`), '(http mode ok)');

    // pre-check: bjx must be absent on the clean html
    log('pre-check bjx passages:', await ev(`SugarCube.Story.has('Sea Reef')`), '(expect false)');
    log('pre-check idb mods:', await ev(`(async () => { try { return JSON.stringify(await modSC2DataManager.modLoadController.listModIndexDB()); } catch (e) { return 'EXC ' + e.message; } })()`));

    // ---- open the Mod manager GUI ----
    log('gui banner click:', await ev(`(() => { const b = document.getElementById('startBannerModLoaderGui'); if (b) { b.click(); return 'clicked'; } return 'no-banner'; })()`));
    await sleep(2500);
    // dump manager UI: dialogs, new fixed elements, file inputs, buttons
    log('gui dialogs open:', await ev(`!!document.querySelector('#ui-dialog')`));
    log('gui file inputs:', await ev(`Array.from(document.querySelectorAll('input[type=file]')).map(i => i.id + '|' + i.className + '|' + (i.accept || '')).join(' ; ') || 'none'`));
    log('gui new buttons:', await ev(`(() => { const out = []; for (const b of document.querySelectorAll('button, a, span[class*=btn], div[class*=btn]')) { const t = (b.textContent || '').trim(); if (t && t.length < 40 && /导入|Import|import|启用|Enable|Mod/.test(t)) out.push(b.tagName + '|' + b.id + '|' + b.className.slice(0, 40) + '|' + t); } return out.slice(0, 25).join('  ##  ') || 'none'; })()`));
    log('gui angular containers:', await ev(`Array.from(document.querySelectorAll('[ng-app], [ng-controller], .modal, .mod-manager, #modLoadUI, .ng-scope')).map(e => e.tagName + '|' + e.id + '|' + e.className.slice(0, 50)).slice(0, 15).join('  ##  ') || 'none'`));
    // body tail (GUI usually appends at body end)
    log('body tail:', await ev(`document.body.lastElementChild ? document.body.lastElementChild.outerHTML.slice(0, 500) : 'none'`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();