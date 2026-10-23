// One-shot diagnostic: boot the game, then report every TweeReplacer
// do_patch failure with full logger text (modName + findString + passage),
// plus runtime anchor counts for ReOverfits' 5 rules.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9227;
const PROFILE = mkdtempSync(join(tmpdir(), 'probe-anch-'));
const OUT = 'C:/Users/79403/Desktop/dol/work/probe-anchors-result.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 60; i++) {
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
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else {
      for (const l of listeners) l(msg);
    }
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
    ready: new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    }),
  };
}

const PASSAGE_PROBE = `(() => {
  window.MODPROBE = {
    count(name, needle) {
      const mu = window.modUtils;
      let d;
      try { d = mu.getPassageData(name); } catch (e) { return JSON.stringify({ err: 'EXC:' + String(e).slice(0, 120) }); }
      if (!d) return JSON.stringify({ err: 'NO_SC2_DATA' });
      const t = d.text || d.content || String(d);
      let count = 0, i = 0, firstCtx = null;
      while ((i = t.indexOf(needle, i)) >= 0) {
        if (firstCtx === null) firstCtx = t.slice(Math.max(0, i - 40), i + 40);
        count++; i += needle.length;
      }
      return JSON.stringify({ count, len: t.length, firstCtx });
    },
    ctx(name, needle, span) {
      const mu = window.modUtils;
      let d;
      try { d = mu.getPassageData(name); } catch (e) { return JSON.stringify({ err: 'EXC:' + String(e).slice(0, 120) }); }
      if (!d) return JSON.stringify({ err: 'NO_SC2_DATA' });
      const t = d.text || d.content || String(d);
      const i = t.indexOf(needle);
      if (i < 0) return JSON.stringify({ found: false });
      return JSON.stringify({ found: true, ctx: t.slice(Math.max(0, i - span), i + span) });
    },
  };
  return true;
})()`;

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const consoleLines = [];
  let cdp;
  try {
    const wsUrl = await getPageWs();
    cdp = connect(wsUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');
    cdp.onEvent((msg) => {
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ');
        consoleLines.push(`[${msg.params.type}] ${text}`);
      }
    });

    const ev = async (expr) => {
      const r = await Promise.race([
        cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
        sleep(30000).then(() => { throw new Error('evaluate timeout'); }),
      ]);
      if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || '').slice(0, 300));
      return r.result.value;
    };

    const t0 = Date.now();
    let booted = false;
    while (Date.now() - t0 < 240000) {
      const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
      if (ok) { booted = true; break; }
      await sleep(2000);
    }
    if (!booted) throw new Error('game did not boot');
    await ev(PASSAGE_PROBE);

    // full do_patch failure lines from ModLoader logger (type [error]/[warn])
    const patchFails = consoleLines.filter((l) => /TweeReplacer do_patch/.test(l));
    const allErrs = consoleLines.filter((l) => l.startsWith('[error]'));

    // runtime anchor counts for ReOverfits rules
    const anchors = {};
    const checks = [
      ['catDebug', 'Clothing Shop Categories', '<<if $debug is 1>>'],
      ['shopDebug', 'Clothing Shop Widgets', '<<if $debug is 1>>'],
      ['overOutfitShop', 'Clothing Shop Categories', '<<widget "OverOutfitShop">>'],
      ['wardrobeDisabled', 'Widgets Wardrobe', ', disabled: !$debug'],
      ['nabCost', 'Widgets Clothing', '<<elseif $money gte $_cost>>'],
    ];
    for (const [k, passage, needle] of checks) {
      anchors[k] = JSON.parse(await ev(`MODPROBE.count(${JSON.stringify(passage)}, ${JSON.stringify(needle)})`));
    }
    // context around debug occurrences in Clothing Shop Categories
    const debugCtx = JSON.parse(await ev(`MODPROBE.ctx("Clothing Shop Categories", "debug", 120)`));
    const shopDebugCtx = JSON.parse(await ev(`MODPROBE.ctx("Clothing Shop Widgets", "debug", 120)`));

    writeFileSync(OUT, JSON.stringify({ booted, patchFails, errCount: allErrs.length, allErrs: allErrs.slice(0, 40), anchors, debugCtx, shopDebugCtx }, null, 1));
    console.log('booted:', booted);
    console.log('do_patch failures:', patchFails.length);
    patchFails.forEach((l) => console.log('  ', l.slice(0, 220)));
    console.log('anchors:', JSON.stringify(anchors, null, 1));
    console.log('debugCtx(cat):', JSON.stringify(debugCtx).slice(0, 300));
    console.log('debugCtx(shop):', JSON.stringify(shopDebugCtx).slice(0, 300));
    console.log('report:', OUT);
  } finally {
    try { chrome.kill(); } catch {}
    await sleep(1500);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });