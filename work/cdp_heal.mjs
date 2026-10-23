// 被内射恢复：恶魔 6 级 10% / 猎手 2~6 级 10/15/20/25/30%，任何战斗生效。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9230;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-heal-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 80; i++) {
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

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
const ws = new WebSocket(await getWs());
const pending = new Map();
let id = 0;
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, (m) => res(m.result));
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Runtime.enable');
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval error');
  return r.result.value;
};

for (let i = 0; i < 120; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)');
  if (ok) break;
  await sleep(1000);
}
await sleep(3000);

const out = await ev(`(() => {
  const V = window.V;
  const run = (demon, hunter, absorb) => {
    V.demon = demon; V.demonhunter = hunter;
    V.demonabsorb = absorb; V.stalk = false;
    V.stress = 1000; V.trauma = 1000; V.pain = 1000;
    V.controlmax = 1000; V.control = 0;
    V.combat = 0; V.NPCList = V.NPCList || [];
    try { SugarCube.Wikifier.wikifyEval("<<endcombat>>"); } catch (e) {}
    return { s: V.stress, t: V.trauma, p: V.pain, c: V.control };
  };
  return JSON.stringify({ demon: run(6, 0, 2), h2: run(0, 2, 2), h3: run(0, 3, 2),
    h4: run(0, 4, 2), h5: run(0, 5, 2), h6: run(0, 6, 2), none: run(0, 0, 0) });
})()`);
const r = JSON.parse(out);
console.log('RESULT', out);
const near = (v, want) => Math.abs(v - want) <= 2;
const ok = near(r.demon.s, 900) && near(r.demon.t, 900) && near(r.demon.p, 900) && near(r.demon.c, 100)
  && near(r.h2.s, 900) && near(r.h3.s, 850) && near(r.h4.s, 800)
  && near(r.h5.s, 750) && near(r.h6.s, 700) && near(r.h6.c, 300)
  && near(r.none.s, 1000) && near(r.none.t, 1000) && near(r.none.p, 1000);
console.log(ok ? 'PASS  1/1' : 'FAIL');
try { chrome.kill(); } catch {}
process.exit(ok ? 0 : 1);
