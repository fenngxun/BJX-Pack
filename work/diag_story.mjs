// Debug: why do the source assertions miss?
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9242;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-diag-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = readFileSync('C:/Users/79403/Desktop/dol/work/cdp_pack.mjs', 'utf8');

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
  throw new Error('no page');
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  return {
    send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pending.set(mid, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: mid, method, params })); }); },
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
  };
}
async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
  await sleep(3000);
  const ws = connect(await getPageWs()); await ws.ready;
  const ev = async (expr) => {
    const r = await Promise.race([ws.send('Runtime.evaluate', { expression: expr, returnByValue: true }), sleep(40000).then(() => { throw new Error('timeout'); })]);
    if (r.exceptionDetails) throw new Error('exc: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || '').slice(0, 200));
    return r.result.value;
  };
  let t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (await ev(`!!(window.SugarCube && SugarCube.State && SugarCube.State.passage)`).catch(() => false)) break;
    await sleep(2000);
  }
  await ev(src.match(/const BJXTEST_SRC = `([\s\S]*?)`\s*;/)[1]); await sleep(500);
  if (await ev('BJXTEST.dialogOpen()')) { await ev('BJXTEST.ageGateCheck()'); await sleep(300); await ev('BJXTEST.ageGateEnter()'); await sleep(600); }

  console.log('has AG:', await ev(`String(SugarCube.Story.has("Widgets Actions Generation"))`));
  console.log('AG text len:', await ev(`String(SugarCube.Story.get("Widgets Actions Generation").text.length)`));
  console.log('AG has Dragon:', await ev(`String(SugarCube.Story.get("Widgets Actions Generation").text.indexOf("Dragon breath"))`));
  console.log('AG has leftantiques call:', await ev(`String(SugarCube.Story.get("Widgets Actions Generation").text.indexOf("leftantiques"))`));
  console.log('has EM:', await ev(`String(SugarCube.Story.has("Widgets Effects Man"))`));
  console.log('EM len:', await ev(`String(SugarCube.Story.has("Widgets Effects Man") ? SugarCube.Story.get("Widgets Effects Man").text.length : -1)`));
  console.log('EM antiquebell:', await ev(`String(SugarCube.Story.has("Widgets Effects Man") ? SugarCube.Story.get("Widgets Effects Man").text.indexOf("antiquebell") : -1)`));
  console.log('Actions-ish names:', await ev(`Array.from(SugarCube.Story.passages.keys ? SugarCube.Story.passages.keys() : Object.keys(SugarCube.Story.passages)).filter(function(n){return n.indexOf("Actions")>=0}).slice(0,8)`));
  console.log('Effects-ish names:', await ev(`Array.from(SugarCube.Story.passages.keys ? SugarCube.Story.passages.keys() : Object.keys(SugarCube.Story.passages)).filter(function(n){return n.indexOf("Effects")>=0}).slice(0,8)`));

  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
