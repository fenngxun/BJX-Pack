// Locate NaN values inside V (the Corrupted-variables trigger on 0.5.10.12).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9229;
const PROFILE = mkdtempSync(join(tmpdir(), 'b2-nan-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ws() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const l = await r.json();
      const p = l.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no page');
}
function connect(u) {
  const s = new WebSocket(u);
  let id = 0;
  const pend = new Map();
  s.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  return {
    send(method, params = {}) {
      return new Promise((res, rej) => {
        const mid = ++id;
        pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result)));
        s.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((r, j) => { s.addEventListener('open', r); s.addEventListener('error', j); }),
  };
}

const main = async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
  const cdp = connect(await ws());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  const ev = async (e, t = 30000) => {
    const r = await Promise.race([cdp.send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(t).then(() => null)]);
    if (!r) return null;
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result.value;
  };

  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    if (await ev(`!!(window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage)`)) break;
    await sleep(2000);
  }
  const scan = `(function(){
    var V = window.SugarCube.State.variables; var out = [];
    function walk(o, path, depth) {
      if (depth > 5 || !o || typeof o !== 'object') return;
      for (var k in o) {
        var v;
        try { v = o[k]; } catch (e) { continue; }
        if (typeof v === 'number' && isNaN(v)) out.push(path + '.' + k);
        else if (typeof v === 'number' && !isFinite(v)) out.push(path + '.' + k + '=Inf');
        else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path + '.' + k, depth + 1);
        else if (Array.isArray(v)) {
          for (var i = 0; i < v.length && i < 50; i++) {
            var x = v[i];
            if (typeof x === 'number' && isNaN(x)) out.push(path + '.' + k + '[' + i + ']');
            else if (x && typeof x === 'object') walk(x, path + '.' + k + '[' + i + ']', depth + 1);
          }
        }
      }
    }
    walk(V, 'V', 0);
    return JSON.stringify(out.slice(0, 60));
  })()`;

  const dumpNpc = `(function(){
    var V = window.SugarCube.State.variables;
    var a = V.NPCName; if (!a) return 'NO_NPCNAME';
    var rows = [];
    for (var i = 0; i < a.length; i++) {
      var n = a[i]; if (!n) continue;
      var has = Object.prototype.hasOwnProperty.call(n, 'atfield');
      if (has) rows.push(i + ':' + (n.nam || n.name) + ' atfield=' + JSON.stringify(n.atfield) + ' typeof=' + typeof n.atfield);
    }
    return JSON.stringify({len: a.length, hits: rows.slice(0, 10), idx32: a[32] ? (a[32].nam || a[32].name) : null});
  })()`;
  console.log('NPC atfield @boot:', await ev(dumpNpc));
  console.log('scanNaNs @boot  :', await ev(`JSON.stringify(window.scanNaNs ? window.scanNaNs(V) : 'NOFN')`));

  console.log('before Start2:', await ev(scan));
  await ev(`window.SugarCube.Engine.play('Start2')`);
  await sleep(2500);
  console.log('after Start2 :', await ev(scan));
  console.log('passage:', await ev('window.SugarCube.State.passage'));

  for (const pg of ['Chimera Statue', 'Start2', 'Bedroom']) {
    await ev(`(function(){
      var V = window.SugarCube.State.variables;
      V.saveVersions = [window.StartConfig.version];
      V.objectVersion = V.objectVersion || {};
      window.SugarCube.Engine.play(${JSON.stringify(pg)});
      return true;
    })()`);
    await sleep(1600);
    const nan = await ev(scan);
    const err = await ev(`(function(){
      var els = Array.from(document.querySelectorAll('.error'));
      return JSON.stringify(els.map(function(e){ return e.textContent.trim().slice(0, 1200); }).slice(0, 3));
    })()`);
    console.log(`--- ${pg}: passage=${await ev('window.SugarCube.State.passage')} nan=${nan}`);
    console.log('    err:', String(err).slice(0, 1400));
  }
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
