// 诊断：魅魔 6 级「再来一发」（pleaseagain）在真实战斗中是否作为一个可选动作出现。
// 用法：node diag_pleaseagain.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9226;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-pleaseagain-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BJXTEST_SRC = `
(window.BJXTEST = {
  passage: () => window.SugarCube.State.passage,
  var: (n) => window.SugarCube.State.variables[n],
  setVars: (o) => { Object.assign(window.SugarCube.State.variables, o); return true; },
  run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 300); } },
  goto: (n) => { window.SugarCube.Engine.play(n); return true; },
  linkTexts: () => Array.from(document.querySelectorAll('#passages a.link-internal, #passages a.macro-link, #passages a.link-broken')).map((a) => a.textContent.trim()),
  feetHtml: () => { const e = document.querySelector('#feetaction'); return e ? e.innerHTML.slice(0, 400) : null; },
  feetText: () => { const e = document.querySelector('#feetaction'); return e ? e.textContent.trim().slice(0, 400) : null; },
  bodyText: () => { const e = document.querySelector('#passages .passage'); return e ? e.textContent.trim().slice(0, 600) : null; },
  hasText: (needle) => { const e = document.querySelector('#passages'); return !!e && e.textContent.indexOf(needle) >= 0; },
  domErrors: () => Array.from(document.querySelectorAll('.error')).map((e) => e.textContent.trim().slice(0, 250)),
}); true;
`;

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

const cdp = connect(await getPageWs());
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

async function ev(expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval error');
  return r.result.value;
}

for (let i = 0; i < 120; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)');
  if (ok) break;
  await sleep(1000);
}
await sleep(3000);
await ev(BJXTEST_SRC);

// 1. pack 覆盖是否生效：setupMidOrgasm 宏 handler 是否含 pleaseagain
const macroSrc = await ev(`(() => {
  const h = SugarCube.Macro.get("setupMidOrgasm");
  return h && h.handler ? h.handler.toString() : "MISSING";
})()`);
console.log('[1] setupMidOrgasm 含 pleaseagain:', macroSrc.includes('pleaseagain'), '| 片段:', JSON.stringify(String(macroSrc).slice(0, 220)));

// 2. Widgets Hunter Combat BJX passage 源码
const wpass = await ev(`(() => {
  const p = SugarCube.Story.get("Widgets Hunter Combat BJX");
  return p ? { has: true, len: String(p.text).length, pg: String(p.text).indexOf("pleaseagain") >= 0 } : { has: false };
})()`);
console.log('[2] Widgets Hunter Combat BJX:', JSON.stringify(wpass));

// 3. 0.5 原版 feetActions 是否含 pleaseagain（预期无 —— 说明玩家动作没移植）
const feetSrc = await ev(`(() => {
  const p = SugarCube.Story.get("Widgets Actions Generation") || null;
  return String(p ? p.text : "").indexOf("pleaseagain") >= 0;
})()`);
console.log('[3] actionsGeneration 源码含 pleaseagain:', feetSrc);

// 4. 真实战斗：用 0.5 自带的 Combat Demo 页（<<maninit>> + <<actionsman>>），
//    它能建立完整 NPCList，避免 Deer Rape 那种残缺状态。
const hasDemo = await ev('SugarCube.Story.has("Combat Demo")');
console.log('[4] Combat Demo 存在:', hasDemo);
await ev(`V.demo = { type: "human", position: "missionary", consent: false, debug: true }; V.sexstart = 1;`);
await ev(`V.demon = 6; V.dragon = 0; V.demonhunter = 0; V.againfail = false; V.options.bjx_divine = true; V.options.images = 0; V.options.combatImages = 0;`);
await ev(`BJXTEST.goto("Combat Demo")`);
await sleep(2000);
// 第二次渲染（sexstart 已复位为 0，不重跑 maninit）：把敌人拉到高潮边缘
await ev(`V.enemyarousal = (V.enemyarousalmax || 100) + 1;`);
await ev(`BJXTEST.goto("Combat Demo")`);
await sleep(2000);

const pass = await ev('BJXTEST.passage()');
const links = await ev('JSON.stringify(BJXTEST.linkTexts())');
const feetText = await ev('JSON.stringify(BJXTEST.feetText())');
const bodyText = await ev('JSON.stringify(BJXTEST.bodyText())');
const vars = await ev(`JSON.stringify({ pleaseagain: V.pleaseagain, againfail: V.againfail, enemyarousal: V.enemyarousal, enemyarousalmax: V.enemyarousalmax, finish: V.finish, position: V.position, feetuse: V.feetuse })`);
const errs = await ev('JSON.stringify(BJXTEST.domErrors())');
const hasAgain = await ev('BJXTEST.hasText("再来一发")');
const hasSuoqiu = await ev('BJXTEST.hasText("继续索取")');

console.log('[4] passage:', pass);
console.log('[4] 页面含 "再来一发":', hasAgain, '| 含 "继续索取":', hasSuoqiu);
console.log('[4] links:', links);
console.log('[4] #feetaction 文本:', feetText);
console.log('[4] 变量:', vars);
console.log('[4] 正文片段:', bodyText);
console.log('[4] DOM errors:', errs);

// 5. 受控渲染 feetActions，dump _feetaction 的键（魅魔/龙 6 级 + 敌人满 arousal 时）
const keys = await ev(`(() => {
  try {
    const V = window.V;
    V.position = 0; V.demon = 6; V.dragon = 6; V.pleaseagain = 0;
    V.enemyarousal = 100; V.enemyarousalmax = 100;
    V.options.bjx_divine = true; V.options.bjx_animal = true;
    const h = document.createElement("div");
    // _feetOptions 设成不匹配任何 case 的值，避免触发 feetgrabnew 等依赖 NPCList 的子 widget
    new SugarCube.Wikifier(h, "<<set _feetOptions to 'zzz'>><<feetActions>><<print 'KEYS:' + JSON.stringify(Object.keys(_feetaction))>>");
    return h.textContent;
  } catch (e) { return "EXC:" + String(e).slice(0, 200); }
})()`);
console.log('[5] feetActions 生成的键:', keys);

// 6. 受控渲染 effectsman 的续杯结算（pleaseagain 成功分支）
const eff = await ev(`(() => {
  try {
    const V = window.V;
    Object.assign(V, {
      feetaction: "pleaseagain", feetactiondefault: "rest",
      enemyarousalmax: 500, enemyarousal: 499, enemyhealth: 500, enemyhealthmax: 500,
      againfail: true, demon: 6, dragon: 0, combat: 1, consensual: 0,
      attractiveness: 10000,
    });
    V.options.bjx_divine = true; V.options.bjx_endlessagain = false;
    V.options.images = 0; V.options.combatImages = 0;
    V.settings.blindStatsEnabled = false;
    const h = document.createElement("div");
    new SugarCube.Wikifier(h, "<<effectsman>>");
    const t = h.textContent;
    return JSON.stringify({
      hit: t.indexOf("你的诱惑成功") >= 0,
      fail: t.indexOf("任你百般诱惑") >= 0,
      len: t.length,
      tail: t.slice(-260),
      errs: Array.from(h.querySelectorAll('.error')).map((e) => e.textContent.trim().slice(0, 120)).slice(0, 3),
      arousal: V.enemyarousal, againfail: V.againfail, max: V.enemyarousalmax,
    });
  } catch (e) { return "EXC:" + String(e).slice(0, 200); }
})()`);
console.log('[6] effectsman pleaseagain:', eff);

try { chrome.kill(); } catch {}
process.exit(0);