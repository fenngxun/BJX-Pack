// Dump clickable links for key passages to verify mod entries survived surgery.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9230;
const PROFILE = mkdtempSync(join(tmpdir(), 'links-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = ['Passout Tentacle World 3'];

async function ws() {
  for (let i = 0; i < 90; i++) {
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
  const ev = async (e, t = 60000) => {
    const r = await Promise.race([cdp.send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(t).then(() => null)]);
    if (!r) return null;
    if (r.exceptionDetails) return 'EXC';
    return r.result.value;
  };
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    if (await ev(`!!(window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage)`, 10000)) break;
    await sleep(2500);
  }
  await ev(`window.SugarCube.Engine.play('Start2')`);
  await sleep(2500);

  const out = {};
  for (const pg of TARGETS) {
    await ev(`(function(){
      var V = window.SugarCube.State.variables;
      V.saveVersions = [window.StartConfig.version];
      V.objectVersion = V.objectVersion || {};
      V.eventskip = 1; V.allure = 0;
      window.SugarCube.Engine.play(${JSON.stringify(pg)});
      return true;
    })()`);
    await sleep(1800);
    await ev(`(function(){ var V=window.SugarCube.State.variables; V.slime=1; return true; })()`);
    const info = await ev(`(function(){
      var now = window.SugarCube.State.passage;
      var ps = Array.from(document.querySelectorAll('#passages .passage'));
      var detail = ps.map(function(e, i){ return { i: i, cls: e.className, len: (e.textContent||'').length, head: (e.textContent||'').trim().slice(0, 60) }; });
      var links = Array.from(document.querySelectorAll('#passages a.link-internal')).map(function(a){ return a.textContent.trim(); });
      return JSON.stringify({ now: now, passageDivs: ps.length, detail: detail, nLinks: links.length, links: links.slice(0,10),
        errs: Array.from(document.querySelectorAll('.error')).length });
    })()`);
    out[pg] = info ? JSON.parse(info) : { err: 'timeout' };
    const o = out[pg];
    console.log(`--- ${pg} -> ${o.now}  links=${o.n} errs=${o.errs}`);
    if (o.links) console.log('    ' + o.links.join(' | ').slice(0, 700));
  }
  writeFileSync('C:/Users/79403/Desktop/dol/work/b2_links_probe.json', JSON.stringify(out, null, 1));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
