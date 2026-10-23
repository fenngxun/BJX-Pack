// B6 noise probe: identify (a) which images fail img.decode(), (b) which Dynamic ids
// go missing, (c) any non-2xx network responses.
// Hooks are installed BEFORE navigation via Page.addScriptToEvaluateOnNewDocument,
// otherwise the boot-time failures are already gone by the time we attach.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9243;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6net-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOOK = `(function () {
  window.__b2ImgFails = [];
  var od = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function () {
    var self = this;
    return od.apply(this, arguments).catch(function (e) {
      try { window.__b2ImgFails.push({ src: String(self.currentSrc || self.src).slice(0, 300), w: self.naturalWidth, h: self.naturalHeight }); } catch (x) {}
      throw e;
    });
  };
  window.__b2DynMissing = [];
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (window.Dynamic && !window.Dynamic.__b2wrapped) {
      var orig = window.Dynamic.eventBinderWithId;
      window.Dynamic.eventBinderWithId = function (id) {
        var r = orig.apply(this, arguments);
        var SC = window.SugarCube;
        setTimeout(function () {
          try {
            if (!document.getElementById(id)) {
              window.__b2DynMissing.push({ id: id, passage: SC && SC.State ? String(SC.State.passage) : '?' });
            }
          } catch (x) {}
        }, 800);
        return r;
      };
      window.Dynamic.__b2wrapped = true;
    }
    if ((window.Dynamic && window.Dynamic.__b2wrapped) || tries > 600) clearInterval(t);
  }, 200);
})();`;

const main = async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 120 && !wsUrl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const l = await r.json();
      const p = l.find((t) => t.type === 'page');
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(400);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  const bad = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Network.responseReceived') {
      const st = m.params.response.status;
      if (st >= 400) bad.push(st + ' ' + m.params.response.url.slice(0, 200));
    }
    if (m.method === 'Network.loadingFailed') {
      bad.push('FAIL ' + (m.params.errorText || '') + ' ' + (m.params.type || ''));
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result))); ws.send(JSON.stringify({ id: mid, method, params })); });
  const ev = async (expr, tmo = 30000) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: expr, returnByValue: true }), sleep(tmo).then(() => null)]);
    if (!r) return 'TIMEOUT';
    if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0].slice(0, 200);
    return r.result.value;
  };

  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await send('Page.navigate', { url: URL });

  const STATE = `(function(){try{var s=window.SugarCube,st=s&&s.State;return JSON.stringify({sc:!!s,psg:st&&st.passage?String(st.passage):null,base:typeof(window.setup&&window.setup.baseNNPC)});}catch(e){return 'ERR';}})()`;
  const t0 = Date.now();
  while (Date.now() - t0 < 260000) {
    const r = await ev(STATE, 15000);
    if (typeof r === 'string' && r.startsWith('{')) {
      const o = JSON.parse(r);
      if (o.sc && o.psg && o.base === 'object') { console.log('READY after', ((Date.now() - t0) / 1000).toFixed(1), 's'); break; }
    }
    await sleep(2000);
  }
  await sleep(3000);

  // 复现冒烟测试里 livestock-field 那步：直接 play 到目标 passage，天气/背景层
  // 才会真正初始化（Start 页上不会）。
  await ev(`window.SugarCube.Engine.play('Start2')`);
  await sleep(2500);
  await ev(`window.SugarCube.Engine.play('Livestock Field')`);
  await sleep(5000);

  console.log('=== img.decode failures ===');
  console.log(await ev(`JSON.stringify((window.__b2ImgFails||[]).slice(0,40))`));
  console.log('=== zero-size images in DOM ===');
  console.log(await ev(`JSON.stringify(Array.from(document.images).filter(function(i){return i.complete && i.naturalWidth===0;}).map(function(i){return String(i.currentSrc||i.src).slice(0,200);}).slice(0,40))`));
  console.log('=== Dynamic missing ===');
  console.log(await ev(`JSON.stringify((window.__b2DynMissing||[]).slice(0,20))`));
  console.log('=== network >=400 / failed ===');
  console.log(bad.slice(0, 40).join('\n') || '(none)');

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
