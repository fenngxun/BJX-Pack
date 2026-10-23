// 真实场景验证：胚胎吸收 / 再来一发（真实战斗结束）/ 自行车
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9241;
const PROFILE = mkdtempSync(join(tmpdir(), 'real3-'));
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
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); }),
  };
}

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL,
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

const cdp = connect(await getPageWs());
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

async function ev(expr, timeout = 90000) {
  return Promise.race([
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
      .then((r) => {
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval error');
        return r.result.value;
      }),
    sleep(timeout).then(() => { throw new Error('eval timeout: ' + expr.slice(0, 50)); }),
  ]);
}

console.log('等待 boot ...');
for (let i = 0; i < 180; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)').catch(() => false);
  if (ok) { console.log('boot ok @', i, 's'); break; }
  await sleep(1000);
}
await sleep(4000);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}` + (pass ? '' : '  ' + JSON.stringify(detail)));
};

// ---------- 1. 胚胎吸收：真实怀孕对象 ----------
const embryo = await ev(`(() => {
  // 先初始化 sexStats（等价于开始游戏后的状态）
  const h0 = document.createElement("div");
  try { new SugarCube.Wikifier(h0, "<<physicalAdjustmentsInit>>"); } catch (e) {}
  if (!V.sexStats) V.sexStats = { vagina: { pregnancy: {} }, anus: { pregnancy: {} } };
  if (!V.sexStats.vagina) V.sexStats.vagina = { pregnancy: {} };
  if (!V.sexStats.anus) V.sexStats.anus = { pregnancy: {} };
  // 真实怀孕：type + 1 个 fetus
  V.sexStats.vagina.pregnancy = {
    fetus: [{ type: "human", gender: "Male", time: 10, stats: { gender: "Male" } }],
    givenBirth: 0, parasiteBirthEvents: 0, totalBirthEvents: 0, motherStatus: 0,
    waterBreaking: false, type: "human", timer: 100, timerEnd: 9000,
    awareOf: "human", potentialFathers: [],
  };
  V.sexStats.anus.pregnancy = { fetus: [], type: null, motherStatus: 0, potentialFathers: [] };
  V.demon = 6; V.demonhunter = 0; V.promiscuity = 0; V.hunterbuild = 0;
  V.options.bjx_divine = true;
  V.bjxEmbryoReturn = "Bathroom";
  let err = null;
  try { SugarCube.Engine.play("BJX Embryo Absorb"); } catch (e) { err = String(e).slice(0, 200); }
  return JSON.stringify({ err });
})()`);
await sleep(1200);
const embryoRes = await ev(`(() => {
  const txt = (document.getElementById("passages") || {}).textContent || "";
  return JSON.stringify({
    empty: txt.includes("什么也没有"),
    absorbed: txt.includes("恶魔的体质开始工作"),
    fetus: (V.sexStats.vagina.pregnancy.fetus || []).length,
    type: V.sexStats.vagina.pregnancy.type,
    awareOf: V.sexStats.vagina.pregnancy.awareOf,
    promiscuity: V.promiscuity,
    build: V.hunterbuild,
    noPreg: V.bjxNoPregUntil ? 1 : 0,
    textHead: txt.slice(0, 220).replace(/\\s+/g, " "),
  });
})()`);
const eo = JSON.parse(embryoRes);
check('embryo-absorb-works', eo.empty === false && eo.fetus === 0 && eo.type === null && eo.promiscuity === 20, eo);

// ---------- 2. 再来一发：真实战斗结束（enemyhealth <= 0）----------
const again = await ev(`(() => {
  const mk = () => { const b = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
    Object.assign(b, { active: "active", stance: "none", health: 0, healthmax: 500,
      maxOrgasms: 1, orgasms: 2, virgin: false, penis: 1, vagina: 0, arousal: 500, arousalmax: 500,
      pronoun: "m", type: "man", intro: 0 }); return b; };
  V.NPCList = [mk()]; V.npc = ["Manly"];
  V.demon = 6; V.demonhunter = 0; V.pleaseagain = 0; V.enemyejaculated = 2;
  // 真实打赢：血量归零
  V.enemyhealth = 0; V.enemyhealthmax = 500; V.enemynomax = 1; V.enemyno = 1;
  V.enemyarousalmax = 500; V.enemyarousal = 500; V.enemytype = "man";
  V.options.bjx_divine = true;
  V.passage = "Street Dogs";
  V.bjxAgainOffer = 0;
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, "<<endcombat>>"); } catch (e) { err = String(e).slice(0, 150); }
  return JSON.stringify({ offer: V.bjxAgainOffer, hp: V.bjxAgainHP, pg: V.bjxAgainPassage, err });
})()`);
const ao = JSON.parse(again);
check('pleaseagain-real-defeat', ao.offer === 1, ao);

// ---------- 3. 自行车：passage 里是否真的带锻炼 ----------
const bike = await ev(`(() => {
  const out = {};
  const st = SugarCube.Story;
  out.api = { story: typeof st, get: typeof (st && st.get) };
  let p = null;
  try { p = st.get("Bicycle Sims 1"); } catch (e) { out.err = String(e).slice(0, 120); }
  out.found = !!p;
  if (p) {
    out.keys = Object.keys(p).slice(0, 12);
    const b = p.text || p.source || "";
    out.len = b.length;
    out.ph = (b.match(/<<physique \\d+>>/g) || []).length;
    out.pass = (b.match(/<<pass \\d+>>/g) || []).length;
    out.head = b.slice(0, 200).replace(/\\s+/g, " ");
  }
  return JSON.stringify(out);
})()`);
console.log('BIKE:', bike);
const bo = JSON.parse(bike);
check('bike-passage-exercises', bo.found === true && bo.ph > 0, bo);

// 真实调用一次 physique 宏，确认面板数值会动（同时看提示文字）
const phys = await ev(`(() => {
  V.statFreeze = false; V.exposed = 0;
  const before = V.physique || 0;
  const h = document.createElement("div");
  new SugarCube.Wikifier(h, "<<physique 2>>");
  return JSON.stringify({ before, after: V.physique, txt: (h.textContent || "").trim().slice(0, 80) });
})()`);
console.log('PHYS:', phys);

// ---------- 4. 真实骑行：点一次目的地链接，看体质/疲惫是否变 ----------
await ev(`(() => {
  V.physique = 100; V.physiquesize = 6000; V.tiredness = 50; V.statFreeze = false;
  V.outside = 1; V.exposed = 0; V.combat = 0; V.bjxEmbryoReturn = "Bathroom";
  try { SugarCube.Engine.play("Bicycle Sims 1"); } catch (e) {}
  return null;
})()`);
await sleep(900);
const rideClick = await ev(`(() => {
  const a = document.querySelector('#passages a.link-internal');
  if (!a) return JSON.stringify({ ok: false, why: 'no link', head: ((document.getElementById('passages')||{}).textContent||'').slice(0,120) });
  const before = { ph: V.physique, tr: V.tiredness };
  const target = a.getAttribute('data-passage');
  // click 会销毁当前 Runtime 上下文，必须延后一拍再点，否则 eval 永不返回
  setTimeout(() => { try { a.click(); } catch (e) {} }, 60);
  return JSON.stringify({ ok: true, target, before });
})()`);
console.log('RIDE-CLICK:', rideClick);
// 跳转期间 Runtime 上下文会短暂重建，轮询取最终值
let ra = { ph: -1, tr: -1, passage: '?' };
for (let i = 0; i < 25; i++) {
  await sleep(400);
  try {
    const v = await ev(`JSON.stringify({ ph: V.physique, tr: V.tiredness, passage: SugarCube.State.passage })`, 4000);
    ra = JSON.parse(v);
    if (ra.passage === 'Barb Street') break;
  } catch (e) { /* context rebuilding */ }
}
console.log('RIDE-AFTER:', JSON.stringify(ra));
const rc = JSON.parse(rideClick);
check('bike-ride-raises-physique', rc.ok === true && ra.ph > rc.before.ph, { rc, ra });

console.log('\n===== 汇总 =====');
const bad = results.filter((r) => !r.pass);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
