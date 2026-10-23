// 百货商店视觉核查：进店、四个货架各截一张、统计图片真实尺寸
// 用法：node work/shot_daiso.mjs "http://127.0.0.1:8766/Degrees%20of%20Lewdity.html"
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9226;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-shot-'));
const OUT = 'C:/Users/79403/Desktop/dol/work/shots';
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

const BOOT = `
(() => {
  const SC = window.SugarCube;
  window.BJXTEST = {
    passage: () => SC.State.passage,
    setVars: (o) => { Object.assign(SC.State.variables, o); return true; },
    goto: (n) => { SC.Engine.play(n); return true; },
    run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 200); } },
  };
  return true;
})()`;

mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,1000', URL,
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

const cdp = connect(await getPageWs());
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 2, mobile: false });

const ev = async (expr, timeout = 60000) => {
  const r = await Promise.race([
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
    sleep(timeout).then(() => { throw new Error('evaluate timeout'); }),
  ]);
  if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || '').slice(0, 300));
  return r.result.value;
};

async function shot(name, clip) {
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const res = await cdp.send('Page.captureScreenshot', params);
  const p = join(OUT, name + '.png');
  writeFileSync(p, Buffer.from(res.data, 'base64'));
  return p;
}

// 关掉 ModI18N 欢迎弹窗，否则遮住整页
async function dismissPopups() {
  await ev(`(() => {
    document.querySelectorAll('.swal2-container, .swal2-popup').forEach(e => e.remove());
    document.querySelectorAll('.modal, dialog').forEach(e => { e.style.display = 'none'; });
    return true;
  })()`);
  await sleep(300);
}

try {
  const t0 = Date.now();
  let booted = false;
  while (Date.now() - t0 < 300000) {
    const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
    if (ok) { booted = true; break; }
    await sleep(2000);
  }
  console.log('booted:', booted, Math.round((Date.now() - t0) / 1000) + 's');
  if (!booted) throw new Error('no boot');
  await ev(BOOT);
  await sleep(800);

  // 过年龄门（否则整页被 WELCOME 画面盖住）
  await ev(`(() => {
    const cb = document.querySelector('#passages input[type=checkbox], input[type=checkbox]');
    if (cb && !cb.checked) cb.click();
    const btn = Array.from(document.querySelectorAll('#passages button, #passages .link-internal, button'))
      .find(e => /^\\s*(enter|进入)\\s*$/i.test(e.textContent || ''));
    if (btn) btn.click();
    return true;
  })()`);
  await sleep(1500);
  console.log('after gate:', await ev('BJXTEST.passage()'));

  await ev('BJXTEST.goto("Start2")');
  await sleep(2500);
  await ev('BJXTEST.setVars({ saveVersions: [String(StartConfig.version)], objectVersion: {} })');
  await ev('BJXTEST.setVars({ phase: 0, eventskip: 1 })');
  await sleep(500);

  await ev('BJXTEST.goto("BaseScene DaisoShop")', 120000);
  await sleep(3000);
  await dismissPopups();
  console.log('passage:', await ev('BJXTEST.passage()'));

  for (const shelf of ['daiso_snack', 'daiso_drink', 'daiso_foods', 'daiso_sundry']) {
    await ev(`iShop.tabSwitch('${shelf}')`);
    await sleep(1200);
    const info = await ev(`(() => {
      const imgs = Array.from(document.querySelectorAll('#shopshelf img, #shopbanner img'));
      return JSON.stringify({
        total: imgs.length,
        ok: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
        broken: imgs.filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')).slice(0, 8),
        natSizes: [...new Set(imgs.map(i => i.naturalWidth + 'x' + i.naturalHeight))],
        drawn: [...new Set(imgs.map(i => Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height)))],
        bannerBox: (() => { const b = document.getElementById('shopbanner'); if (!b) return null; const r = b.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })(),
        shelfBox: (() => { const b = document.getElementById('shopshelf'); if (!b) return null; const r = b.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })(),
      });
    })()`);
    console.log(shelf, info);
    // 滚到货架，只截视口
    await ev(`(() => {
      const b = document.getElementById('shopbanner');
      const s = document.getElementById('shopshelf');
      if (b && s) window.scrollTo(0, Math.max(0, b.offsetTop - 120));
      return true;
    })()`);
    await sleep(500);
    console.log('  shot ->', await shot('daiso_' + shelf.replace('daiso_', ''), null));
  }
} catch (e) {
  console.log('ERROR', String(e).slice(0, 400));
} finally {
  chrome.kill();
  process.exit(0);
}
