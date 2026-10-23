// 打印 0.5.12.13 新怀孕系统的实现与数据结构
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9247;
const PROFILE = mkdtempSync(join(tmpdir(), 'preg-'));
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
      .then((r) => { if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval err'); return r.result.value; }),
    sleep(t).then(() => { throw new Error('timeout'); }),
  ]);
}

for (let i = 0; i < 180; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)').catch(() => false);
  if (ok) break;
  await sleep(1000);
}
await sleep(3000);

const out = await ev(`JSON.stringify({
  getActive: (window.getActivePregnancies || "").toString().slice(0, 900),
  create: (window.createPregnancy || "").toString().slice(0, 1200),
  clearRec: (window.clearPregnancyRecord || "").toString().slice(0, 700),
  clearPlayer: (window.clearPlayerPregnancies || "").toString().slice(0, 700),
  push: (window.pushPregnancyRecord || "").toString().slice(0, 900),
  getActivePlayer: (window.getPlayerPregnancy || "").toString().slice(0, 600),
})`);
const o = JSON.parse(out);
for (const [k, v] of Object.entries(o)) {
  console.log('\n===== ' + k + ' =====\n' + v);
}

// 用 createPregnancy 造一个真实怀孕，打印 record 结构
const made = await ev(`(() => {
  let err = null, id = null;
  try {
    id = createPregnancy("pc", "human", { type: "human", source: "test" });
  } catch (e) { err = String(e).slice(0, 200); }
  const rec = id != null ? V.pregnancies[id] : null;
  return JSON.stringify({
    id, err,
    keys: rec ? Object.keys(rec) : null,
    sample: rec ? JSON.stringify(rec).slice(0, 900) : null,
    active: (typeof getActivePregnancies === "function") ? getActivePregnancies("pc").length : -1,
    awareFn: (typeof playerAwareTheyArePregnant === "function") ? playerAwareTheyArePregnant() : "n/a",
    isPreg: (typeof playerIsPregnant === "function") ? playerIsPregnant() : "n/a",
    oldStructType: V.sexStats && V.sexStats.vagina ? V.sexStats.vagina.pregnancy.type : "n/a",
    oldFetus: V.sexStats && V.sexStats.vagina ? (V.sexStats.vagina.pregnancy.fetus || []).length : -1,
  });
})()`);
console.log('\n===== createPregnancy 实测 =====\n' + made);

process.exit(0);
