// 衣柜「一键修复所有衣物」专项验证。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9226;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-repair-'));
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
const clogs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const t = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    if (/error|EXC|TypeError|undefined/i.test(t) && !/IndexDBLoader/.test(t)) clogs.push(t.slice(0, 300));
  }
  if (m.method === 'Runtime.exceptionThrown') clogs.push('EXC ' + String(m.params.exceptionDetails?.exception?.description).slice(0, 300));
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
const play = (name) => ev(`(() => { SugarCube.Engine.play(${JSON.stringify(name)}); return SugarCube.State.passage; })()`);

// A. 无缝纫机：不出现
await ev(`(() => { V.sewingKit = 0; V.location = "home"; return 1; })()`);
await play('Wardrobe');
await sleep(1200);
let has = await ev(`!!document.getElementById("bjx-repair-all")`);
check('no-sewingkit-hidden', has === false, has);

// B. 有缝纫机 + home：出现
await ev(`(() => {
  V.sewingKit = 1; V.location = "home";
  // 造一件破损衣服：优先复制当前穿的，退化成最小物品
  const src = (V.worn && V.worn.head && V.worn.head.name) ? JSON.parse(JSON.stringify(V.worn.head)) : { name: "cap", type: "head", integrity: 1, integrity_max: 100 };
  src.integrity = 1;
  V.wardrobes = V.wardrobes || {};
  V.wardrobes.wardrobe = V.wardrobes.wardrobe || {};
  V.wardrobes.wardrobe.head = [src];
  V.housekeeping = 0;
  return 1;
})()`);
await play('Wardrobe');
await sleep(1200);
has = await ev(`!!document.getElementById("bjx-repair-all")`);
check('sewingkit-visible', has === true, has);

// C. 多 slot 衣柜 + 身上穿的，一次修满
const mk = await ev(`(() => {
  V.wardrobe_location = "wardrobe";
  V.sewingKit = 1; V.location = "home"; V.housekeeping = 0; V.eventskip = 1;
  const mkItem = (slot) => {
    const H = setup.clothes[slot] || {};
    const k = Object.keys(H).find(x => (H[x].integrity_max || 0) > 0);
    if (!k) return null;
    const it = JSON.parse(JSON.stringify(H[k]));
    it.integrity = 1;
    return it;
  };
  const slots = ["head", "over_head", "over_upper", "legs"];
  const box = { unlocked: true, name: "Wardrobe" };
  const want = [];
  for (const sl of slots) { const it = mkItem(sl); if (it) { box[sl] = [it]; want.push("box:" + sl); } }
  V.wardrobes = V.wardrobes || {};
  V.wardrobes.wardrobe = box;
  const wornItem = mkItem("head");
  if (wornItem) { V.worn = V.worn || {}; V.worn.head = wornItem; want.push("worn:head"); }
  V.bjxRepairReturn = "Wardrobe";
  return JSON.stringify(want);
})()`);
await play('BJX Wardrobe Repair All');
await sleep(1500);
const a = await ev(`(() => {
  let broken = 0;
  const box = V.wardrobes.wardrobe;
  for (const k of Object.keys(box)) if (Array.isArray(box[k])) for (const it of box[k]) if (it.integrity < it.integrity_max) broken++;
  if (V.worn && V.worn.head && V.worn.head.integrity < V.worn.head.integrity_max) broken++;
  return JSON.stringify({ passage: SugarCube.State.passage, broken, housekeeping: V.housekeeping });
})()`);
const ar = JSON.parse(a);
console.log('made=', mk);
check('click-enters-passage', ar.passage === 'BJX Wardrobe Repair All', ar);
check('all-restored', ar.broken === 0, ar);
check('housekeeping-plus5', Math.abs((ar.housekeeping ?? 0) - 5) < 0.01, ar);

console.log('\n' + (results.filter((r) => r.p).length) + '/' + results.length + ' passed');
try { chrome.kill(); } catch {}
process.exit(results.every((r) => r.p) ? 0 : 1);
