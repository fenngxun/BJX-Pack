// Path-A full: import bjx-pack + GameOriginalImagePack via real GUI flow
// (click AddMod -> CDP file chooser intercept -> setFileInputFiles), enable
// via GUI buttons, reload, verify bjx content + image pack.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const OUT = 'C:/Users/79403/Desktop/dol/work/patha-out.txt';
const log = (...a) => { const t = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); appendFileSync(OUT, t + '\n'); };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/dol-clean.html';
const PORT = 9236;
const PROFILE = 'C:/Users/79403/Desktop/dol/work/patha-profile';
const BJX_ZIP = 'C:\\Users\\79403\\Desktop\\dol\\work\\bjx-pack-0.3.0.mod.zip';
const IMG_ZIP = 'C:\\Users\\79403\\Desktop\\dol\\game\\DoL-ModLoader-0.5.10.12-v2.101.1-polyfill\\GameOriginalImagePack-0.5.10.12.mod.zip';
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
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    waitEvent(method, timeoutMs = 15000) {
      return new Promise((resolve, reject) => {
        const t = setInterval(() => {
          const i = events.findIndex((e) => e.method === method);
          if (i >= 0) { clearInterval(t); resolve(events.splice(i, 1)[0]); }
        }, 100);
        setTimeout(() => { clearInterval(t); reject(new Error('timeout ' + method)); }, timeoutMs);
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
    await cdp.send('DOM.enable');
    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return 'EXC:' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 400);
      return r.result.value;
    };

    // boot + gate
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
    log('pre-check Sea Reef absent:', await ev(`SugarCube.Story.has('Sea Reef') === false`));

    // open manager
    await ev(`document.getElementById('startBannerModLoaderGui').click()`);
    await sleep(3000);

    // ---- import via real file chooser ----
    await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true });

    const importOne = async (zipPath, label) => {
      const chooserP = cdp.waitEvent('Page.fileChooserOpened', 20000);
      // click AddMod button (inside iframe)
      const clicked = await ev(`(() => { const f = document.getElementById('MyConfig'); const b = f.contentDocument.getElementById('MyConfig_field_AddMod_b'); if (b) { b.click(); return 'ok'; } return 'no-btn'; })()`);
      log(label, 'click AddMod:', clicked);
      const chooser = await chooserP;
      log(label, 'fileChooserOpened mode:', chooser.params.mode, 'canSelectMultiple:', chooser.params.canSelectMultiple);
      // resolve the input node and set files
      const { nodeId } = await cdp.send('DOM.requestNode', { objectId: chooser.params.backendNodeId ? undefined : undefined }).catch(() => ({ nodeId: 0 }));
      // use DOM.setFileInputFiles with the backendNodeId from the event
      await cdp.send('DOM.setFileInputFiles', { files: [zipPath], backendNodeId: chooser.params.backendNodeId });
      log(label, 'files set:', zipPath);
      // the input should fire change -> JSZip reads -> added to IDB
      await sleep(6000);
      // verify in the disabled list
      const inList = await ev(`(() => { const f = document.getElementById('MyConfig'); return f.contentDocument.body.textContent.indexOf('bjx-pack') >= 0 || f.contentDocument.body.textContent.indexOf('ImagePack') >= 0; })()`);
      log(label, 'name visible in manager:', inList);
      const idb = await ev(`(async () => { try { const l = await modSC2DataManager.modLoadController.listModIndexDB(); return JSON.stringify(l).slice(0, 400); } catch (e) { return 'EXC ' + e.message; } })()`);
      log(label, 'IndexedDB list:', idb);
    };

    await importOne(BJX_ZIP, '[bjx]');
    await importOne(IMG_ZIP, '[imgpack]');

    // ---- enable via GUI: select the disabled items then click enable ----
    // dump the select elements first
    log('manager selects:', await ev(`(() => { const f = document.getElementById('MyConfig'); return Array.from(f.contentDocument.querySelectorAll('select')).map(s => s.id + '|opts:' + Array.from(s.options).map(o => o.textContent.trim().slice(0, 30)).join(',')).join('  ##  ').slice(0, 900); })()`));

    // try selecting bjx-pack + GameOriginalImagePack in the disable list and enabling
    const enableRes = await ev(`(() => { const f = document.getElementById('MyConfig'); const d = f.contentDocument; const selects = Array.from(d.querySelectorAll('select')); let out = []; for (const s of selects) { for (const o of s.options) { if (/bjx-pack|ImagePack/.test(o.textContent)) { o.selected = true; out.push('selected ' + o.textContent.trim().slice(0, 40) + ' in ' + s.id); } } } // click the enable button (scope fn)
      const btn = Array.from(d.querySelectorAll('input[type=button]')).find(b => (b.getAttribute('ng-click') || '').indexOf("EnableDisableItem('enable')") >= 0); if (btn) { btn.click(); out.push('enable-clicked'); } else { out.push('NO-ENABLE-BTN'); } return out.join(' ; '); })()`);
    log('enable attempt:', enableRes);
    await sleep(2500);
    // check the mod list state (which are enabled now)
    log('manager text after enable:', await ev(`(() => { const f = document.getElementById('MyConfig'); return f.contentDocument.body.textContent.replace(/\\s+/g, ' ').slice(0, 1200); })()`));

    // ---- reload the game ----
    await cdp.send('Page.reload');
    await sleep(10000);
    // boot wait again
    const t1 = Date.now();
    let booted2 = false;
    while (Date.now() - t1 < 120000) {
      const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State); })()`).catch(() => false);
      if (ok) { booted2 = true; break; }
      await sleep(2000);
    }
    log('rebooted:', booted2);
    await sleep(3000);

    // ---- verify bjx-pack loaded ----
    log('Sea Reef present:', await ev(`SugarCube.Story.has('Sea Reef')`));
    log('Robin Raccoon present:', await ev(`SugarCube.Story.has('Robin Raccoon')`));
    log('loaded mod names:', await ev(`(window.modSC2DataManager && modSC2DataManager.modLoader) ? (modSC2DataManager.modLoader.getModAllName ? JSON.stringify(modSC2DataManager.modLoader.getModAllName()).slice(0, 500) : 'no-fn') : 'no-loader'`));

    // ---- verify image pack: image API surface ----
    log('img cache objects:', await ev(`(() => { const k = Object.keys(window).filter(k => /img/i.test(k)); return k.slice(0, 20).join(','); })()`));
    log('setup keys img:', await ev(`Object.keys(window.setup || {}).filter(k => /img|image/i.test(k)).join(',')`));

    // age gate + start a game to trigger sprite rendering
    await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; })()`);
    await sleep(500);
    await ev(`(() => { const bs = Array.from(document.querySelectorAll('#ui-dialog button')); const b = bs.find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
    await sleep(1500);
    log('passage after gate:', await ev(`SugarCube.State.passage`));

    // BJXTEST inject + core smoke
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
    log('after school start:', await ev('BJXTEST.passage()'));

    // TF keys (inject_early ran?)
    log('tf keys slime/dragon:', await ev(`BJXTEST.run('!!V.transformationParts.slime + "/" + !!V.transformationParts.dragon')`));

    // image check: go to a scene with sprites, then check canvas / img status
    await ev(`BJXTEST.setVars({ sea: 45, eventskip: 1, stress: 0, tiredness: 0 })`);
    await ev(`BJXTEST.goto("Sea")`);
    await sleep(2000);
    log('Sea passage:', await ev('BJXTEST.passage()'));
    log('img elements:', await ev(`Array.from(document.querySelectorAll('img')).map(i => (i.src || '').slice(-60) + ':w' + i.naturalWidth + ':c' + (i.complete ? 1 : 0)).join(' ; ').slice(0, 500) || 'none'`));
    log('canvas count:', await ev(`document.querySelectorAll('canvas').length`));
    log('canvas data len:', await ev(`(() => { const c = document.querySelector('canvas'); if (!c) return 'no-canvas'; try { const d = c.toDataURL(); return 'len:' + d.length; } catch (e) { return 'EXC ' + e.message; } })()`));
    // broken images: any img with complete && naturalWidth===0 is a failed load
    log('broken imgs:', await ev(`Array.from(document.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth === 0).length`));

    // sprite test in a character scene: Forest should render beast sprites on combat
    await ev(`BJXTEST.setVars({ stress: 0, trauma: 0, exposed: 0 })`);
    await ev(`BJXTEST.goto("Bedroom")`);
    await sleep(1500);
    log('bedroom imgs:', await ev(`Array.from(document.querySelectorAll('img')).length`));
  } catch (e) {
    log('MAIN-THREW:', e.message);
  } finally {
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(1500);
    process.exit(0);
  }
}
main();