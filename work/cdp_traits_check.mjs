// 验证发布包里的猎手特质面板文案（120 门槛）与 tj 吸收提示
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8791/Degrees%20of%20Lewdity.html';
const PORT = 9245;
const PROFILE = mkdtempSync(join(tmpdir(), 'tr-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no page');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  return {
    send(m, p = {}) {
      return new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)));
        ws.send(JSON.stringify({ id: mid, method: m, params: p }));
      });
    },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}

spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL],
  { stdio: ['ignore', 'ignore', 'pipe'] });

const cdp = connect(await getPageWs());
await cdp.ready;
await cdp.send('Runtime.enable');

async function ev(expr, t = 60000) {
  return Promise.race([
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
      .then((r) => { if (r.exceptionDetails) throw new Error('eval err'); return r.result.value; }),
    sleep(t).then(() => { throw new Error('timeout'); }),
  ]);
}

for (let i = 0; i < 180; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)').catch(() => false);
  if (ok) break;
  await sleep(1000);
}
await sleep(3000);

await ev(`(() => {
  V.demonhunter = 3; V.hunterbuild = 59;
  V.demon = 6; V.options.bjx_divine = true;
  try { SugarCube.Engine.play("Bedroom"); } catch (e) {}
  return null;
})()`).catch(() => {});
await sleep(2500);

const out = await ev(`(() => {
  const t = document.querySelector('.traits');
  const txt = t ? t.textContent.replace(/\\s+/g, ' ') : '<no traits panel>';
  return JSON.stringify({ hasPanel: !!t, txt: txt.slice(0, 600) });
})()`);
console.log('TRAITS:', out);
const o = JSON.parse(out);
const ok120 = o.txt.includes('/120') && !o.txt.includes('/360');
const okTired = o.txt.includes('疲惫');
console.log(ok120 && okTired ? 'PASS  面板已是新门槛(120)且含疲惫' : 'FAIL  面板仍旧或不含疲惫');
process.exit(ok120 && okTired ? 0 : 1);
