// 荒原汉堡摊条件分支验证：有钱+没吃过 → 菜单；吃过 → 已吃过；没钱 → 钱不够。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9227;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-food-'));
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

const results = [];
const check = (n, p, d) => { results.push({ n, p }); console.log((p ? 'PASS  ' : 'FAIL  ') + n + (p ? '' : '  ' + JSON.stringify(d))); };

async function scene(money, burger) {
  await ev(`(() => { V.money = ${money}; V.moorburger = ${burger}; V.options = V.options || {}; V.options.bjx_animal = true; SugarCube.Engine.play("Moor Food Stand"); return 1; })()`);
  await sleep(1200);
  return ev(`(() => {
    const t = document.querySelector("#passages .passage") ? document.querySelector("#passages .passage").textContent : "";
    return JSON.stringify({
      money: V.money, burger: V.moorburger,
      hasMenu: t.indexOf("狂野狼魂堡") >= 0,
      hasEaten: t.indexOf("今天已经吃过") >= 0,
      hasPoor: t.indexOf("钱不够") >= 0,
    });
  })()`);
}

const a = JSON.parse(await scene(10000, 0));
check('rich-not-eaten-shows-menu', a.hasMenu && !a.hasPoor, a);

const b = JSON.parse(await scene(10000, 1));
check('eaten-shows-eaten', b.hasEaten, b);

const c = JSON.parse(await scene(100, 0));
check('poor-shows-poor', c.hasPoor && !c.hasMenu, c);

console.log('\n' + results.filter((r) => r.p).length + '/' + results.length + ' passed');
try { chrome.kill(); } catch {}
process.exit(results.every((r) => r.p) ? 0 : 1);
