// Verify every B2 TweeReplacer rule against the LIVE patched passages.
// A rule that did not apply leaves its findString present in the passage body.
// replaceFile rules can't be judged that way (they re-emit the anchor tail),
// so we positively look for a marker from the replacement file head.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9226;
const PROFILE = mkdtempSync(join(tmpdir(), 'b2-rules-'));
const DUMP = 'C:/Users/79403/Desktop/dol/work/b2_rules_dump.json';
const OUT = 'C:/Users/79403/Desktop/dol/work/b2_rule_probe.json';
const BATCH = 40;

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
  throw new Error('devtools page not found');
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
        pending.set(mid, (m) => (m.error ? reject(new Error(method + ': ' + JSON.stringify(m.error))) : resolve(m.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    onEvent(l) { listeners.push(l); },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}

async function main() {
  const rules = JSON.parse(readFileSync(DUMP, 'utf8'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  const wsUrl = await getPageWs();
  const cdp = connect(wsUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');

  const ev = async (expr, timeout = 90000) => {
    const r = await Promise.race([
      cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
      sleep(timeout).then(() => null),
    ]);
    if (!r) return null;
    if (r.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  };

  // wait for boot
  const t0 = Date.now();
  let booted = false;
  while (Date.now() - t0 < 180000) {
    const ok = await ev(`!!(window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage)`, 8000).catch(() => false);
    if (ok) { booted = true; break; }
    await sleep(2000);
  }
  if (!booted) { console.log('NOT BOOTED'); chrome.kill(); process.exit(1); }

  const results = [];
  for (let off = 0; off < rules.length; off += BATCH) {
    const batch = rules.slice(off, off + BATCH).map((r) => ({
      tag: r.tag, i: r.idx, passage: r.passage, mode: r.mode, find: r.find,
      marker: r.fmark || '', sig: r.sig || '',
    }));
    const expr = `(function(rs){
      var mu = window.modUtils, out = [];
      for (var k = 0; k < rs.length; k++) {
        var r = rs[k], d = null, t = null;
        try { d = mu.getPassageData(r.passage); } catch (e) {}
        if (d) t = d.text || d.content || String(d);
        if (!t) { out.push({ tag: r.tag, i: r.i, passage: r.passage, st: 'NO_PASSAGE', plen: 0 }); continue; }
        var hitFind = null;
        try {
          hitFind = (r.mode === 'regex') ? new RegExp(r.find).test(t) : (t.indexOf(r.find) >= 0);
        } catch (e) { hitFind = null; }
        var hitMarker = (r.mode === 'file' && r.marker) ? (t.indexOf(r.marker) >= 0) : false;
        var hitRepl = (r.sig) ? (t.indexOf(r.sig) >= 0) : false;
        var st;
        if (hitMarker) st = 'OK_FILE';
        else if (hitRepl) st = 'OK';
        else if (hitFind === true) st = 'MAYBE_PARTIAL';
        else if (hitFind === false) st = 'OK_REPLACED';
        else st = 'REGEX_ERR';
        out.push({ tag: r.tag, i: r.i, passage: r.passage, st: st, plen: t.length });
      }
      return JSON.stringify(out);
    })(${JSON.stringify(batch)})`;
    const raw = await ev(expr);
    if (!raw) { console.log('batch timeout at', off); break; }
    const arr = JSON.parse(raw);
    results.push(...arr);
    if (off % 160 === 0) console.log('  progress', off + '/' + rules.length);
  }

  const counts = {};
  for (const r of results) counts[r.st] = (counts[r.st] || 0) + 1;
  const bad = results.filter((r) => r.st === 'MAYBE_PARTIAL' || r.st === 'NO_PASSAGE' || r.st === 'REGEX_ERR');
  writeFileSync(OUT, JSON.stringify({ counts, bad }, null, 1));

  console.log('total', results.length, JSON.stringify(counts));
  const byTag = {};
  for (const r of bad) byTag[r.tag] = (byTag[r.tag] || 0) + 1;
  console.log('unapplied by mod:', JSON.stringify(byTag));
  console.log('--- first 40 unapplied ---');
  for (const r of bad.slice(0, 60)) console.log('  ', r.tag, '#' + r.i, r.st, r.passage);
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
