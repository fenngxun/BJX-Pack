// 定点验证：Pharmacy 页 ModShopZone → ExtraPharmacy 是否还报 lanSwitch 缺失
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9228;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-pharm-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('page not found');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else for (const l of listeners) l(msg);
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    onEvent(l) { listeners.push(l); },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

let cdp;
const consoleLines = [];
const ev = async (expr, timeout = 20000) => {
  const r = await Promise.race([
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
    sleep(timeout).then(() => { throw new Error('evaluate timeout'); }),
  ]);
  if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || '').slice(0, 300));
  return r.result.value;
};
try {
  cdp = connect(await getPageWs());
  await cdp.ready;
  await cdp.send('Runtime.enable');
  cdp.onEvent((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ');
      consoleLines.push(`[${msg.params.type}] ${text.slice(0, 300)}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleLines.push('[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 300));
    }
  });
  {
    const t0 = Date.now();
    let ok = false;
    while (Date.now() - t0 < 240000) {
      ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`, 10000).catch(() => false);
      if (ok) break;
      await sleep(2000);
    }
    if (!ok) throw new Error('boot failed');
  }
  await ev(`(() => {
    const SC = window.SugarCube;
    window.BJXTEST = {
      goto: (n) => { SC.Engine.play(n); return true; },
      setVars: (o) => { Object.assign(SC.State.variables, o); return true; },
      passage: () => SC.State.passage,
      macroHas: (n) => !!(SC.Macro && SC.Macro.has && SC.Macro.has(n)),
    };
    return true;
  })()`);
  await ev('BJXTEST.goto("Start2")');
  await sleep(1500);
  await ev('BJXTEST.setVars({ eventskip: 1, money: 100000 })');
  await ev('BJXTEST.goto("Pharmacy")');
  await sleep(2500);
  const report = {
    passage: await ev('BJXTEST.passage()'),
    lanSwitch: await ev('BJXTEST.macroHas("lanSwitch")'),
    modShopZone: await ev('BJXTEST.macroHas("ModShopZone")'),
    extraPharmacy: await ev(`(function(){var el=document.getElementById('bjx-extra-pharmacy')||document.querySelector('.b2sf-ModShopZone');return el?el.textContent.trim().slice(0,200):null;})()`),
    domErrors: await ev(`Array.from(document.querySelectorAll('.error')).map(e=>e.textContent.trim().slice(0,200)).slice(0,6)`),
    consoleErrors: consoleLines.filter((l) => /lanSwitch|ExtraPharmacy|ModShopZone|does not exist/i.test(l)).slice(-10),
  };

  // Canteen：Remy 的海报补丁曾因少 <</if>> 把整段宏结构打断
  await ev('BJXTEST.setVars({ schoolstate: "lunch", eventskip: 1 })');
  await ev('BJXTEST.goto("Canteen")');
  await sleep(2500);
  report.canteen = {
    passage: await ev('BJXTEST.passage()'),
    textHead: await ev(`(function(){var el=document.querySelector('#passages .passage');return el?el.textContent.replace(/\\s+/g,' ').trim().slice(0,120):null;})()`),
    domErrors: await ev(`Array.from(document.querySelectorAll('.error')).map(e=>e.textContent.trim().slice(0,200)).slice(0,6)`),
    consoleErrors: consoleLines.filter((l) => /closing tag|outside of a call|Canteen|remymod_canteen/i.test(l)).slice(-10),
  };
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  console.log('FATAL', String(e && e.stack || e));
  console.log(consoleLines.filter((l) => /lanSwitch|ExtraPharmacy|ModShopZone|does not exist/i.test(l)).slice(-10).join('\n'));
} finally {
  try { chrome.kill(); } catch {}
  process.exit(0);
}
