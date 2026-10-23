// 战斗初始性奋 / 单次动作增量实测：确认是不是代码把节奏改快了。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9228;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-arousal-'));
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
const errs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const t = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (/error|Error|EXC|TypeError/.test(t) && !/IndexDBLoader/.test(t)) errs.push(t.slice(0, 240));
  }
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
  V.enemyno = 1; V.enemynomax = 1;
  V.NPCList = [{ fullDescription: "Test", health: 500, healthmax: 500, active: "active",
    stance: "none", penis: "penis", vagina: "none", anus: "anus", mouth: "mouth",
    pronoun: "m", orgasms: 0, maxOrgasms: 1, humiliation: 0, pain: 0 }];
  V.allure = 1000; V.audiencearousal = 0;
  V.options = V.options || {};
  const runInit = () => { try { SugarCube.Wikifier.wikifyEval("<<maninit>>"); } catch (e) {} return V.enemyarousalmax; };

  V.options.bjx_slowarousal = false;
  const off = runInit();
  V.options.bjx_slowarousal = true;
  const on = runInit();
  const onAgain = runInit();
  return JSON.stringify({ off, on, onAgain });
})()`);
console.log('RESULT', out);
const r = JSON.parse(out);
const ok = r.off === 500 && r.on === 1000 && r.onAgain === 1000;
console.log(ok ? 'PASS  1/1' : 'FAIL');
console.log('ERRS', JSON.stringify(errs.slice(-2)));
try { chrome.kill(); } catch {}
process.exit(ok ? 0 : 1);
