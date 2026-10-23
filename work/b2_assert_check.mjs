// Quick check of candidate smoke assertions for B2 mods.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9227;
const PROFILE = mkdtempSync(join(tmpdir(), 'b2-assert-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHECKS = [
  ['iCandy', 'BaseScene Chinatown', 'Chinatown'],
  ['iCandy', 'BaseScene Brothel Basement', 'Brothel'],
  ['iCandy', 'BaseScene Orphanage Garage', 'Garage'],
  ['iCandy', 'iCandy Widget Storagep', 'storage'],
  ['iCandy', 'Room Robot', 'Robot'],
  ['iCandy', 'Actions UseItems', 'item'],
  ['iCandy', 'RobotWidget', 'Robot'],
];

async function getPageWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const p = list.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no devtools page');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  return {
    send(method, params = {}) {
      return new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); }),
  };
}

const main = async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', URL], { stdio: 'ignore' });
  const cdp = connect(await getPageWs());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  const ev = async (e) => {
    const r = await Promise.race([cdp.send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(20000).then(() => null)]);
    return r && r.result ? r.result.value : null;
  };
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    if (await ev(`!!(window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage)`)) break;
    await sleep(2000);
  }
  const rows = [];
  for (const [tag, pg, needle] of CHECKS) {
    const expr = `(function(){var d=null;try{d=window.modUtils.getPassageData(${JSON.stringify(pg)});}catch(e){}
      if(!d) return JSON.stringify({ok:false,err:'NO_PASSAGE'});
      var t=d.text||d.content||String(d);
      var c=0,i=0; while((i=t.indexOf(${JSON.stringify(needle)},i))>=0){c++;i+=1;}
      return JSON.stringify({ok:c>0,c:c,len:t.length});})()`;
    const raw = await ev(expr);
    const r = raw ? JSON.parse(raw) : { ok: false, err: 'TIMEOUT' };
    rows.push({ tag, passage: pg, needle, ...r });
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${tag.padEnd(9)} ${pg.padEnd(30)} ${needle.slice(0, 40).padEnd(42)} ${JSON.stringify(r)}`);
  }
  writeFileSync('C:/Users/79403/Desktop/dol/work/b2_assert_check.json', JSON.stringify(rows, null, 1));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
