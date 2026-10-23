// Locate which file owns a character offset inside the concatenated user script.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const OFFSET = Number(process.argv[3] || 168141);
const PORT = 9232;
const PROFILE = mkdtempSync(join(tmpdir(), 'scr-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  let id = 0; const pend = new Map();
  s.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  return {
    send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result))); s.send(JSON.stringify({ id: mid, method, params })); }); },
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
    if (!r || r.exceptionDetails) return null;
    return r.result.value;
  };
  await sleep(60000); // let mods load; boot may have failed, that's fine

  const info = await ev(`(function(){
    var out = [];
    var ss = document.querySelectorAll('script');
    for (var i = 0; i < ss.length; i++) {
      var t = ss[i].textContent || '';
      out.push({ i: i, id: ss[i].id || '', len: t.length, head: t.slice(0, 70) });
    }
    return JSON.stringify(out.sort(function(a,b){return b.len-a.len;}).slice(0, 12));
  })()`);
  console.log('top scripts:', info);

  const around = await ev(`(function(){
    var el = document.getElementById('twine-user-script');
    if (!el) return 'NO_TWINE_USER_SCRIPT';
    var t = el.textContent || '';
    var s = Math.max(0, ${OFFSET} - 500);
    return JSON.stringify({ len: t.length, ctx: t.slice(s, ${OFFSET} + 260) });
  })()`);
  console.log('around offset:', String(around).slice(0, 1400));
  writeFileSync('C:/Users/79403/Desktop/dol/work/_script_offset.json', JSON.stringify({ info, around }, null, 1));
  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
