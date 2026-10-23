// 抓 boot 期 console / 异常，检查 Cheat-Lyra 依赖是否还红。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9225;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-boot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ws() {
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
const sock = new WebSocket(await ws());
const pending = new Map();
let id = 0;
const logs = [];
sock.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (/IndexDBLoader/.test(txt)) return;
    if (/Cheat-Lyra/.test(txt)) logs.push('CHEAT ' + txt);
    else if (/error|Error|cannot|not satisfies|not found/.test(txt)) logs.push(txt);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 200));
  }
});
await new Promise((r) => sock.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, (m) => res(m.result));
  sock.send(JSON.stringify({ id: mid, method, params }));
});
await send('Runtime.enable');
await send('Page.enable');

for (let i = 0; i < 90; i++) {
  const r = await send('Runtime.evaluate', { expression: '!!(window.SugarCube && SugarCube.State && SugarCube.State.passage)', returnByValue: true });
  if (r.result?.value) break;
  await sleep(1000);
}
await sleep(5000);

const probe = await send('Runtime.evaluate', {
  expression: `(() => {
    const list = (window.modList || window.SugarCube?.modList || []);
    const names = Array.isArray(list) ? list.map(m => m.name || m) : Object.keys(list);
    return JSON.stringify({
      cheat: names.filter(n => /Cheat/i.test(String(n))),
      total: names.length,
      cheatsVar: typeof V === "object" ? (V.cheatsEnabled ?? null) : "noV",
      plants: typeof V === "object" ? (V.plants === undefined ? "undefined" : typeof V.plants) : "noV",
      plantsKeys: typeof V === "object" && V.plants ? Object.keys(V.plants).length : -1,
      gardenNew: (() => {
        try {
          V.__plots = { garden: [{stage: 5}, {stage: 3}, {stage: 6}] };
          V.__t = 0;
          SugarCube.Wikifier.wikifyEval('<<set $__t to []>><<if $__plots and $__plots["garden"]>><<set $__t to $__plots["garden"].filter(function(p){return p.stage >= 5;})>><</if>>');
          return V.__t.length;
        } catch (e) { return "EXC " + String(e).slice(0, 80); }
      })(),
      gardenOld: (() => {
        try {
          V.__t2 = null;
          SugarCube.Wikifier.wikifyEval('<<set $__t2 to ($__plots["garden"] ?? []).filter(p => p.stage >= 5)>>');
          return Array.isArray(V.__t2) ? V.__t2.length : String(V.__t2);
        } catch (e) { return "EXC " + String(e).slice(0, 90); }
      })(),
    });
  })()`, returnByValue: true,
});
const cheat = logs.filter((l) => /Cheat-Lyra|cheat/i.test(l));
console.log('--- errors containing Cheat ---');
console.log(cheat.length ? cheat.join('\n') : '(none)');
console.log('--- all error-ish lines (' + logs.length + ') ---');
console.log(logs.slice(0, 40).join('\n'));
console.log('--- modList probe ---');
console.log(probe.result?.value);

try { chrome.kill(); } catch {}
process.exit(0);
