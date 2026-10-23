// Batch-verify all 110 TweeReplacer rule anchors against runtime SC2
// passage data. Reports which rules would fail do_patch (findString absent).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9227;
const PROFILE = mkdtempSync(join(tmpdir(), 'anchor-batch-'));
const RULES = JSON.parse(readFileSync('C:/Users/79403/Desktop/dol/work/anchor_rules.json', 'utf-8'));

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
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method)) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    }),
  };
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const wsUrl = await getPageWs();
    const cdp = connect(wsUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');
    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.exceptionDetails) throw new Error('page exception: ' + (r.exceptionDetails.text || '').slice(0, 200));
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

    const results = [];
    for (let i = 0; i < RULES.length; i++) {
      const r = RULES[i];
      const v = await ev(`(() => {
        const mu = window.modUtils;
        let d;
        try { d = mu.getPassageData(${JSON.stringify(r.passage)}); } catch (e) { return JSON.stringify({ count: -1, err: 'EXC' }); }
        if (!d) return JSON.stringify({ count: -1, err: 'NO_PASSAGE' });
        const t = d.text || d.content || String(d);
        const needle = ${JSON.stringify(r.find)};
        let c = 0, j = 0, ctx = null;
        while ((j = t.indexOf(needle, j)) >= 0) { if (ctx === null) ctx = t.slice(Math.max(0, j - 30), j + 30); c++; j += needle.length; }
        return JSON.stringify({ count: c, len: t.length, ctx });
      })()`);
      results.push({ ...r, ...JSON.parse(v) });
    }

    const bad = results.filter((x) => x.count <= 0);
    writeFileSync('C:/Users/79403/Desktop/dol/work/anchor-batch-result.json', JSON.stringify({ total: results.length, badCount: bad.length, bad }, null, 1));
    console.log(`total=${results.length} missingAnchor=${bad.length}`);
    for (const b of bad) {
      console.log(`  [${b.mod}] ${b.passage} :: ${JSON.stringify((b.find || '').slice(0, 60))} => ${b.err || 'count=0'} (len=${b.len})`);
    }
  } finally {
    try { chrome.kill(); } catch {}
    await sleep(1500);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });