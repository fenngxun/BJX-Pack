// For each failing rule, locate an anchor-ish fragment inside the runtime
// passage content and dump surrounding context, so new findStrings can be
// designed against the actual (0.5.10.12 + bjx i18n) passage text.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9227;
const PROFILE = mkdtempSync(join(tmpdir(), 'failctx-'));
const RULES = JSON.parse(readFileSync('C:/Users/79403/Desktop/dol/work/failing_rules.json', 'utf-8'));

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

// derive candidate probe fragments from a findString
function candidates(find) {
  if (!find) return [];
  const out = [];
  // identifiers / attribute paths
  for (const m of find.matchAll(/[A-Za-z_][A-Za-z0-9_.]{5,}/g)) out.push(m[0]);
  // chinese runs
  for (const m of find.matchAll(/[\u4e00-\u9fff]{4,}/g)) out.push(m[0]);
  // macro-ish chunks
  for (const m of find.matchAll(/<<[a-z_]+[^>]{0,30}>>/g)) out.push(m[0]);
  // dedupe, longest-first for uniqueness
  return [...new Set(out)].sort((a, b) => b.length - a.length).slice(0, 8);
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

    const report = [];
    for (const r of RULES) {
      const frags = candidates(r.find);
      const hit = await ev(`(() => {
        const mu = window.modUtils;
        let d;
        try { d = mu.getPassageData(${JSON.stringify(r.passage)}); } catch (e) { return JSON.stringify({ err: 'EXC' }); }
        if (!d) return JSON.stringify({ err: 'NO_PASSAGE' });
        const t = d.text || d.content || String(d);
        const frags = ${JSON.stringify(frags)};
        for (const f of frags) {
          const i = t.indexOf(f);
          if (i >= 0) return JSON.stringify({ frag: f, idx: i, len: t.length, ctx: t.slice(Math.max(0, i - 260), i + 320) });
        }
        return JSON.stringify({ len: t.length, noFrag: true, head: t.slice(0, 300) });
      })()`);
      report.push({ mod: r.mod, passage: r.passage, find: r.find, replace_hint: r.replace_hint, replaceFile: r.replaceFile, probe: JSON.parse(hit) });
    }
    writeFileSync('C:/Users/79403/Desktop/dol/work/failing-ctx.json', JSON.stringify(report, null, 1));
    for (const x of report) {
      console.log('=== [%s] %s (len=%s)' % 0 ? '' : '');
    }
    console.log('report written, entries:', report.length);
  } finally {
    try { chrome.kill(); } catch {}
    await sleep(1500);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });