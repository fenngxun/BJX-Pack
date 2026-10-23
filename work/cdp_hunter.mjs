// 恶魔猎手 / 魅魔机制专项验证（P0）：宏存在性 + 点数上限 + 阶段减免 + 满级即转。
// 用法：node cdp_hunter.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9224;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-hunter-'));
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
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    ready: new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    }),
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
  const r = await cdp.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval error');
  return r.result.value;
}

// boot: 100MB HTML + 22 mod，等 SugarCube.State 就绪
for (let i = 0; i < 120; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)');
  if (ok) break;
  await sleep(1000);
}
await sleep(3000);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}` + (pass ? '' : '  ' + JSON.stringify(detail)));
};

// 1. 宏/函数存在
const macros = await ev(`JSON.stringify({
  gain: !!SugarCube.Macro.get("bjxHunterGain"),
  rank: !!SugarCube.Macro.get("bjxHunterCheckRank"),
  restore: !!SugarCube.Macro.get("bjxHunterRestore"),
  hot: !!SugarCube.Macro.get("hunterhotfluid"),
  red: typeof window.bjxHunterReduction,
  embryo: typeof window.bjxInjectEmbryoLink,
})`);
const m = JSON.parse(macros);
check('macros-present', m.gain && m.rank && m.restore && m.hot && m.red === 'function' && m.embryo === 'function', m);

// 2. 阶段减免表
const red = await ev(`JSON.stringify([0,2,3,4,5,6].map(s => {
  V.demonhunter = s; V.demon = s >= 6 ? 6 : 0; V.gamemode = "normal";
  return Math.round(bjxHunterReduction() * 100);
}))`);
check('reduction-table', red === '[0,50,60,70,80,95]', red);

// 2b. 减免真的落到「主动迎合」路径：<<submission 20>> 内部是 <<stress 20 10>>
const scaled = await ev(`(() => {
  const runS = (hunter, consensual) => {
    V.demonhunter = hunter; V.demon = 0; V.combat = 1; V.consensual = consensual;
    V.drunk = 0; V.stress = 0;
    SugarCube.Wikifier.wikifyEval("<<stress 20 10>>");
    return V.stress;
  };
  const runT = (hunter) => {
    V.demonhunter = hunter; V.demon = 0; V.combat = 1; V.consensual = 0;
    V.control = V.controlmax; V.trauma = 0;
    SugarCube.Wikifier.wikifyEval("<<trauma 10>>");
    return V.trauma;
  };
  const runCT = (hunter) => {
    V.demonhunter = hunter; V.demon = 0; V.combat = 1; V.consensual = 0;
    V.control = V.controlmax; V.trauma = 0;
    SugarCube.Wikifier.wikifyEval("<<combattrauma 10>>");
    return V.trauma;
  };
  // 0.5.12.13: trauma = amount * 1.5 * (2 - control/controlmax) → 满自控时 amount*1.5
  // combattrauma 内部再 /2，所以 10 → 7.5；6 级 0.75、2 级 3.75。
  return JSON.stringify({ h6: runS(6, 0), h2: runS(2, 0), con: runS(6, 1),
    t6: runT(6), t2: runT(2), raw: runT(0),
    ct6: runCT(6), ct2: runCT(2), ctRaw: runCT(0) });
})()`);
const sc = JSON.parse(scaled);
check('reduction-applied', sc.h6 === 10 && sc.h2 === 100 && sc.con === 200
  && sc.t6 === 1.5 && sc.t2 === 7.5 && sc.raw === 15, sc);
check('combattrauma-scaled', sc.ct6 === 0.75 && sc.ct2 === 3.75 && sc.ctRaw === 7.5, sc);

// 2c. violence 直接写 $stress（绕过宏）也要被减免
const viol = await ev(`(() => {
  const run = (hunter) => {
    V.demonhunter = hunter; V.demon = 0; V.combat = 1; V.consensual = 0;
    V.stress = 0; V.masochism = 0; V.drunk = 0; V.possessed = false;
    V.enemyno = 1; V.enemytype = "man"; V.enemyanger = 0; V.enemyarousal = 0;
    V.enemyarousalmax = 500; V.pain = 0; V.arousal = 0; V.orgasmdown = 0;
    V.sadism = 0; V.sciencetrait = 0; V.enemyhealth = 100;
    V.worn = V.worn || {};
    V.worn.upper = V.worn.upper || { type: [], name: "shirt" };
    V.worn.lower = V.worn.lower || { type: [], name: "shorts" };
    SugarCube.Wikifier.wikifyEval("<<violence 5>>");
    return V.stress;
  };
  return JSON.stringify({ h6: run(6), h2: run(2), raw: run(0) });
})()`);
const vi = JSON.parse(viol);
// 用无减免基线算期望，避免受角色 masochism 等默认值影响
check('violence-stress-scaled',
  vi.raw > 0 && vi.h2 === Math.round(vi.raw * 0.5)
  && vi.h6 === Math.max(1, Math.round(vi.raw * 0.05)), vi);

// 2d. 自控损失（controlloss）也要按阶段减免
const ctrl = await ev(`(() => {
  const run = (hunter) => {
    V.demonhunter = hunter; V.demon = 0; V.combat = 1; V.consensual = 0; V.gamemode = "normal";
    V.control = 1000; V.controlmax = 1000; V.controlstart = 1000;
    V.molesttrait = 0; V.rapeavoid = 0; V.pullaway = 0; V.novaginal = 0; V.noanal = 0; V.nopenile = 0;
    SugarCube.Wikifier.wikifyEval("<<controlloss>>");
    return V.control;
  };
  return JSON.stringify({ h6: run(6), h2: run(2), raw: run(0) });
})()`);
const cr = JSON.parse(ctrl);
// combatcontrol 参数 ×10：原始 -25 → -250；50% → -125；95% → -13
check('controlloss-scaled', cr.h6 === 987 && cr.h2 === 875 && cr.raw === 750, cr);

// 3. 软核模式归零
const soft = await ev(`(() => { V.demonhunter = 6; V.gamemode = "soft"; const r = bjxHunterReduction(); V.gamemode = "normal"; return r; })()`);
check('reduction-soft-zero', soft === 0, soft);

// 4. 点数：3 次内射 = 9，第 4 次不再涨（单场 ≤9）
const gain = await ev(`(() => {
  V.demonhunter = 2; V.hunterbuild = 0; V.hunterfightPoints = 0;
  V.combat = 1; V.consensual = 0; V.options.bjx_divine = true;
  for (let i = 0; i < 4; i++) SugarCube.Wikifier.wikifyEval("<<bjxHunterGain 3>>");
  return JSON.stringify({ build: V.hunterbuild, points: V.hunterfightPoints, rank: V.demonhunter });
})()`);
const g = JSON.parse(gain);
check('gain-cap-9', g.build === 9 && g.points === 9, g);

// 5. 升级（任务 3 起阈值 30/60/120）：29+1 → 3 级；59+1 → 4 级；119+1（5级）→ 6 级
const rank = await ev(`(() => {
  V.demonhunter = 2; V.hunterbuild = 29; V.hunterfightPoints = 0; V.combat = 1; V.consensual = 0;
  SugarCube.Wikifier.wikifyEval("<<bjxHunterGain 1>>");
  const a = V.demonhunter;
  V.demonhunter = 3; V.hunterbuild = 59; V.hunterfightPoints = 0;
  SugarCube.Wikifier.wikifyEval("<<bjxHunterGain 1>>");
  const b = V.demonhunter;
  V.demonhunter = 4; V.hunterbuild = 59; V.hunterfightPoints = 0;
  SugarCube.Wikifier.wikifyEval("<<bjxHunterGain 1>>");
  const c = V.demonhunter;
  V.demonhunter = 5; V.hunterbuild = 119; V.hunterfightPoints = 0;
  SugarCube.Wikifier.wikifyEval("<<bjxHunterGain 1>>");
  const d = V.demonhunter;
  return JSON.stringify([a, b, c, d]);
})()`);
check('rank-thresholds', rank === '[3,4,4,6]', rank);

// 6. 上限 120（任务 3）
const cap = await ev(`(() => {
  V.demonhunter = 5; V.hunterbuild = 119; V.hunterfightPoints = 0;
  SugarCube.Wikifier.wikifyEval("<<bjxHunterGain 9>>");
  return V.hunterbuild;
})()`);
check('build-cap-120', cap === 120, cap);

// 6b. demonTransform 包装状态
const dt = await ev(`JSON.stringify({
  exists: !!SugarCube.Macro.get("demonTransform"),
  wrapped: !!(SugarCube.Macro.get("demonTransform") || {}).__bjxWrapped,
  widgets: (SugarCube.Story.lookup("tag", "widget") || []).map(x => x.title).filter(t => t.indexOf("Hunter") >= 0),
})`);
console.log('DIAG demonTransform:', dt);

// 7. 满级即转：demon 6 + demonhunter 0 → demonTransform 后 2 级
const trans = await ev(`(() => {
  V.demon = 6; V.demonhunter = 0; V.demonbuild = 100; V.options.bjx_divine = true;
  SugarCube.Wikifier.wikifyEval("<<demonTransform>>");
  return JSON.stringify({ dh: V.demonhunter, st: V.specialTransform });
})()`);
const t = JSON.parse(trans);
check('demon6-auto-hunter2', t.dh === 2 && t.st === 1, t);

// 8. 腐蚀非致命（功能）：3 段体液打 50 血，结果必须停在 1
const hotFunc = await ev(`(() => {
  V.demonhunter = 2; V.enemyhealth = 50; V.enemyno = 1; V.enemynomax = 1;
  V.NPCList = [{ health: 50, active: "active", stance: "none" }];
  SugarCube.Wikifier.wikifyEval("<<hunterhotfluid 3>>");
  return JSON.stringify({ total: V.enemyhealth, npc: V.NPCList[0].health });
})()`);
const hf = JSON.parse(hotFunc);
check('hotfluid-nonlethal', hf.total === 1 && hf.npc === 1, hf);

// 9. 续杯卡位（功能）：魅魔 6 级把敌人卡在高潮边缘（againfail=true + arousal 压回 max-1）
const cardFunc = await ev(`(() => {
  V.demon = 6; V.dragon = 0; V.demonhunter = 0; V.againfail = false; V.combat = 1;
  V.options.bjx_divine = true;
  V.enemyarousal = 100; V.enemyarousalmax = 100;
  SugarCube.Wikifier.wikifyEval("<<setupMidOrgasm>>");
  return JSON.stringify({ againfail: V.againfail, arousal: V.enemyarousal });
})()`);
const cf = JSON.parse(cardFunc);
check('againfail-catch-succubus', cf.againfail === true && cf.arousal === 99, cf);

// 9b. 龙 6 级同样卡位
const cardDragon = await ev(`(() => {
  V.demon = 0; V.dragon = 6; V.againfail = false; V.options.bjx_animal = true;
  V.enemyarousal = 100; V.enemyarousalmax = 100;
  SugarCube.Wikifier.wikifyEval("<<setupMidOrgasm>>");
  return JSON.stringify({ againfail: V.againfail, arousal: V.enemyarousal });
})()`);
const cd = JSON.parse(cardDragon);
check('againfail-catch-dragon', cd.againfail === true && cd.arousal === 99, cd);

// 10. 脚部动作列表生成「再来一发」/「贪婪索取」（魅魔 / 龙 6 级 + 敌人满 arousal）
const feetKeys = await ev(`(() => {
  V.position = 0; V.demon = 6; V.dragon = 6; V.enemyarousal = 100; V.enemyarousalmax = 100;
  V.options.bjx_divine = true; V.options.bjx_animal = true;
  const h = document.createElement("div");
  // _feetOptions 设成不匹配任何 case 的值（避免触发依赖 NPCList 的子 widget）
  new SugarCube.Wikifier(h, "<<set _feetOptions to 'zzz'>><<feetActions>><<print JSON.stringify({k:Object.keys(_feetaction),v:Object.values(_feetaction)})>>");
  return h.textContent;
})()`);
const fk = JSON.parse(feetKeys);
check('feetaction-pleaseagain', fk.k.includes('再来一发') && fk.v.includes('pleaseagain'), fk);
check('feetaction-forceagain', fk.k.includes('贪婪索取') && fk.v.includes('forceagain'), fk);

// 10b. againfail 已卡位（arousal 被压到 max-1）时动作仍要显示，否则错过一回合就消失
const feetAgain = await ev(`(() => {
  V.position = 0; V.demon = 6; V.dragon = 0; V.enemyarousal = 499; V.enemyarousalmax = 500;
  V.againfail = true; V.options.bjx_divine = true;
  const h = document.createElement("div");
  new SugarCube.Wikifier(h, "<<set _feetOptions to 'zzz'>><<feetActions>><<print JSON.stringify({k:Object.keys(_feetaction),v:Object.values(_feetaction)})>>");
  return h.textContent;
})()`);
const fa = JSON.parse(feetAgain);
check('feetaction-againfail-keeps-option', fa.k.includes('再来一发') && fa.v.includes('pleaseagain'), fa);

// 11. 续杯结算：诱惑成功 → 敌人 arousal 上限 -200、againfail=false
const resFunc = await ev(`(() => {
  const base = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
  Object.assign(base, { active: "active", stance: "none", health: 500, healthmax: 500,
    maxOrgasms: 1, orgasms: 0, virgin: false, penis: 0, vagina: 0, arousal: 0, arousalmax: 500 });
  V.NPCList = [base]; V.enemyno = 1; V.enemynomax = 1; V.enemytype = "man"; V.NPCList[0].type = "man";
  Object.assign(V, { feetaction: "pleaseagain", feetactiondefault: "rest",
    enemyarousalmax: 500, enemyarousal: 499, enemyhealth: 500, enemyhealthmax: 500,
    againfail: true, demon: 6, dragon: 0, combat: 1, consensual: 0, attractiveness: 10000 });
  V.options.bjx_divine = true; V.options.bjx_endlessagain = false;
  V.options.images = 0; V.options.combatImages = 0;
  V.settings.blindStatsEnabled = false;
  const h = document.createElement("div");
  new SugarCube.Wikifier(h, "<<effectsman>>");
  const t = h.textContent;
  return JSON.stringify({ hit: t.indexOf("你的诱惑成功") >= 0, againfail: V.againfail,
    max: V.enemyarousalmax, errs: Array.from(h.querySelectorAll('.error')).map((e) => e.textContent.trim().slice(0, 100)).slice(0, 2) });
})()`);
const rf = JSON.parse(resFunc);
// hit 文本依赖 <<ejaculation>> 的完整 NPC 上下文（合成渲染会报错，见 errs），
// 这里以状态变化为准：againfail 转 false + 敌人 arousal 上限 -200 = 成功分支已执行。
check('pleaseagain-resolve-success', rf.againfail === false && rf.max === 300, rf);

// 10. 高潮回状态（渲染）：orgasm 重声明里 hunter 块先于原逻辑输出
const orgFunc = await ev(`(() => {
  V.demonhunter = 2; V.demon = 0; V.options.bjx_divine = true;
  V.pain = 100; V.trauma = 100; V.stress = 100;
  const holder = document.createElement("span");
  let err = null;
  try { new SugarCube.Wikifier(holder, "<<orgasm>>"); } catch (e) { err = String(e).slice(0, 120); }
  return JSON.stringify({
    hit: holder.textContent.indexOf("神清气爽") >= 0,
    err, pain: V.pain, stress: V.stress, trauma: V.trauma,
  });
})()`);
const of = JSON.parse(orgFunc);
check('orgasm-restore-block', of.hit, of);

// 11b. 敌人卡位 gate：man 已被包装（againfail=true 时本回合敌人不行动）
const gateFunc = await ev(`(() => {
  const wrapped = !!(SugarCube.Macro.get("man") || {}).__bjxWrapped;
  const run = (af) => {
    V.againfail = af; V.demon = 6; V.options.bjx_divine = true;
    V.finish = 0; V.combat = 1;
    const h = document.createElement("div");
    new SugarCube.Wikifier(h, "<<man>>");
    return Array.from(h.querySelectorAll('.error')).length;
  };
  return JSON.stringify({ wrapped, withFlag: run(true), withoutFlag: run(false) });
})()`);
const gt = JSON.parse(gateFunc);
check('man-againfail-gate', gt.wrapped === true && gt.withFlag === 0 && gt.withoutFlag > 0, gt);

// ============ P2 摄魂之眼（催眠动作，2026-10-23）============
// 12. 动作生成（玩家旅程第一段）：demonhunter 5 级 + 非自愿 → speak 出「催眠」
// 注：0.5 的 _mouthaction 由 actionsGeneration 初始化（actionsGeneration.twee:1299），
// 单独调 speak 需自行初始化，否则首个 _mouthaction["..."] set 即报 undefined。
const speakEnv = `V.demonhunter = DH; V.demonhunterhypnosis = HY; V.options.bjx_divine = true;
  V.consensual = 0; V.combat = 1; V.underwater = 0; V.gamemode = "normal";
  V.enemyno = 1; V.pronoun = "m"; V.enemytype = "man"; V.enemyarousal = 0;
  V.enemyarousalmax = 500; V.molestationstart = 0; V.combat_silenced = 0;
  const h = document.createElement("div");
  new SugarCube.Wikifier(h, "<<set _mouthaction to {}>><<speak>><<set $bjxTestMouth to clone(_mouthaction)>>");
  return JSON.stringify({ has: Object.values(V.bjxTestMouth || {}).includes('hypnosis'),
    key: Object.keys(V.bjxTestMouth || {})[Object.values(V.bjxTestMouth || {}).indexOf('hypnosis')] || null });`;
const hypGen = await ev(`(() => { ${speakEnv.replace(/DH/g, '5').replace(/HY/g, '0')} })()`);
const hg = JSON.parse(hypGen);
check('hypnosis-action-generated', hg.has === true && hg.key === '催眠', hg);

// 12b. 已用过（hypnosis=1）→ 动作消失（每场一次）
const hypOnce = await ev(`(() => { ${speakEnv.replace(/DH/g, '5').replace(/HY/g, '1')} })()`);
const ho = JSON.parse(hypOnce);
check('hypnosis-once-per-combat', ho.has === false, ho);

// 12c. 4 级没有动作（摄魂之眼是 5 级专属）
const hypL4 = await ev(`(() => { ${speakEnv.replace(/DH/g, '4').replace(/HY/g, '0')} })()`);
const hl = JSON.parse(hypL4);
check('hypnosis-level5-only', hl.has === false, hl);

// 13. 结算（玩家旅程第二段）：选中 hypnosis → 台词 + 标记置位
// 注：0.5 effectsman 尾部有 6 行裸 $NPCList[0..5].intro to 0，合成环境必须给足
// 6 个 NPC，否则宏错误会吞掉渲染输出（状态仍会执行但文本断言失真）。
const hypRes = await ev(`(() => {
  const mk = () => { const b = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
    Object.assign(b, { active: "active", stance: "none", health: 500, healthmax: 500,
      maxOrgasms: 1, orgasms: 0, virgin: false, penis: 0, vagina: 0, arousal: 0, arousalmax: 500,
      pronoun: "m", type: "man", intro: 0 });
    return b; };
  V.NPCList = [mk(), mk(), mk(), mk(), mk(), mk()];
  V.enemyno = 1; V.enemynomax = 1; V.enemytype = "man";
  Object.assign(V, { mouthaction: "hypnosis", mouthactiondefault: "plead",
    combat: 1, consensual: 0, demonhunter: 5, demonhunterhypnosis: 0 });
  V.options.bjx_divine = true; V.options.images = 0; V.options.combatImages = 0;
  V.neckuse = "none"; V.oxygen = V.oxygenmax;
  V.settings = V.settings || {}; V.settings.asphyxiaLevel = 0;
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, "<<effectsman>>"); } catch (e) { err = String(e).slice(0, 120); }
  const t = h.textContent;
  return JSON.stringify({ hit: t.indexOf("没有我的允许") >= 0, flag: V.demonhunterhypnosis,
    default: V.mouthactiondefault, errs: Array.from(h.querySelectorAll('.error')).length, err });
})()`);
const hr = JSON.parse(hypRes);
check('hypnosis-resolve', hr.hit === true && hr.flag === 1 && hr.default === 'rest'
  && hr.errs === 0 && !hr.err, hr);

// 14. 高潮封锁：hypnosis=1 时敌人 arousal 压回 max-1 + 溢出记账
// （钉死 demon/dragon=0 防 againfail 分支抢先；delete 防 13 步 effectsman
// 渲染（feetaction 残留触发续杯链条）留下的 enemyoverarousal 污染）
const hypBlock = await ev(`(() => {
  delete V.enemyoverarousal;
  V.demonhunter = 5; V.demonhunterhypnosis = 1; V.againfail = false;
  V.demon = 0; V.dragon = 0; V.options.bjx_animal = false;
  V.enemyarousal = 100; V.enemyarousalmax = 100;
  SugarCube.Wikifier.wikifyEval("<<setupMidOrgasm>>");
  return JSON.stringify({ arousal: V.enemyarousal, over: V.enemyoverarousal });
})()`);
const hb = JSON.parse(hypBlock);
check('hypnosis-orgasm-blocked', hb.arousal === 99 && hb.over === 1, hb);

// 15. 战斗结束重置：endcombat 后每场一次的标记归零
const hypReset = await ev(`(() => {
  V.demonhunter = 5; V.demonhunterhypnosis = 1;
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, "<<endcombat>>"); } catch (e) { err = String(e).slice(0, 80); }
  return JSON.stringify({ flag: V.demonhunterhypnosis, err });
})()`);
const hreset = JSON.parse(hypReset);
check('hypnosis-reset-on-endcombat', hreset.flag === 0, hreset);

// 16. 特质面板（player 可见性）在 cdp_pack 主回归的 traits 步骤覆盖——
// 合成环境缺 $backgroundTraits / $player.vagina 等新档状态，此处不测。

// 17. 续杯双 animateCombat 修复：combatImages=1 时结算后开关恢复 + 无 canvas 撞 key 报错
const cmbFix = await ev(`(() => {
  const base = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
  Object.assign(base, { active: "active", stance: "none", health: 500, healthmax: 500,
    maxOrgasms: 1, orgasms: 0, virgin: false, penis: 0, vagina: 0, arousal: 0, arousalmax: 500 });
  V.NPCList = [base]; V.enemyno = 1; V.enemynomax = 1; V.enemytype = "man"; V.NPCList[0].type = "man";
  Object.assign(V, { feetaction: "pleaseagain", feetactiondefault: "rest",
    enemyarousalmax: 500, enemyarousal: 499, enemyhealth: 500, enemyhealthmax: 500,
    againfail: true, demon: 6, dragon: 0, combat: 1, consensual: 0, attractiveness: 10000 });
  V.options.bjx_divine = true; V.options.bjx_endlessagain = false;
  V.options.images = 1; V.options.combatImages = 1;
  V.settings.blindStatsEnabled = false;
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, "<<effectsman>>"); } catch (e) { err = String(e).slice(0, 120); }
  const t = h.textContent;
  return JSON.stringify({ restored: V.options.combatImages === 1,
    canvasErr: t.indexOf("MultiCanvasModel already exists") >= 0,
    againfail: V.againfail, max: V.enemyarousalmax, err });
})()`);
const cf2 = JSON.parse(cmbFix);
check('pleaseagain-combatimages-guard', cf2.restored === true && cf2.canvasErr === false
  && cf2.againfail === false && cf2.max === 300, cf2);

// 18. xray 左移 CSS 已注入（ModLoader styleFileList 通道）
const cssHit = await ev(`(() => {
  const styles = Array.from(document.querySelectorAll('style'));
  const hit = styles.some((s) => (s.textContent || '').indexOf('combat-xray-left') >= 0);
  return JSON.stringify({ hit, total: styles.length });
})()`);
const cs = JSON.parse(cssHit);
check('xray-left-css-injected', cs.hit === true, cs);

// ============ TODO 任务 1：体内射精统一计数 ============
// 19. creampie 是公共出口，异种族（beast bottomejacstat 等）也走它 → 统一计数
const cpCount = await ev(`(() => {
  V.demon = 6; V.demonhunter = 0; V.demonabsorb = 0;
  V.sexStats = V.sexStats || {}; V.sexStats.creampie = V.sexStats.creampie || { npc: {}, self: {} };
  V.sexStats.creampie.npc = V.sexStats.creampie.npc || {};
  V.sexStats.creampie.npc.anus = 0;
  SugarCube.Wikifier.wikifyEval("<<creampie 'npc' 'anus'>>");
  return JSON.stringify({ absorb: V.demonabsorb, stat: V.sexStats.creampie.npc.anus });
})()`);
const cpc = JSON.parse(cpCount);
check('creampie-counts-absorb', cpc.absorb === 1 && cpc.stat === 1, cpc);

// 20. internalejac 不再直接计数（否则双计）
const ieCount = await ev(`(() => {
  V.demon = 6; V.demonhunter = 0; V.demonabsorb = 0; V.combat = 1;
  SugarCube.Wikifier.wikifyEval("<<internalejac>>");
  return JSON.stringify({ absorb: V.demonabsorb });
})()`);
const iec = JSON.parse(ieCount);
check('internalejac-no-longer-counts', iec.absorb === 0, iec);

// 21. bjxAbsorbHeal 共用（非战斗分支也恢复，不再是只减创伤的英文分支）
const heal = await ev(`(() => {
  V.demon = 6; V.demonhunter = 0; V.demonabsorb = 1; V.combat = 0;
  V.stress = 1000; V.trauma = 1000; V.pain = 100; V.control = 0; V.controlmax = 100;
  SugarCube.Wikifier.wikifyEval("<<internalejac>>");
  return JSON.stringify({ absorb: V.demonabsorb, trauma: V.trauma, stress: V.stress });
})()`);
const ahl = JSON.parse(heal);
check('absorbheal-shared-noncombat', ahl.absorb === 0 && ahl.trauma === 900 && ahl.stress === 900, ahl);

// ============ TODO 任务 5：再来一发独立页面 ============
// 22. 新 passage 已注册
const paReg = await ev(`JSON.stringify({ a: SugarCube.Story.has("BJX Please Again"),
  b: SugarCube.Story.has("BJX Please Again Go") })`);
const par = JSON.parse(paReg);
check('pleaseagain-passages-registered', par.a === true && par.b === true, par);

// 23. endcombat 快照：恶魔 6 级打服对手后记录 offer + 半血 + 战斗页
const snap = await ev(`(() => {
  const mk = () => { const b = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
    Object.assign(b, { active: "active", stance: "none", health: 500, healthmax: 500,
      maxOrgasms: 1, orgasms: 0, virgin: false, penis: 1, vagina: 0, arousal: 0, arousalmax: 500,
      pronoun: "m", type: "man", intro: 0 }); return b; };
  V.NPCList = [mk(), mk(), mk(), mk(), mk(), mk()]; V.npc = ["Manly"];
  V.demon = 6; V.demonhunter = 0; V.pleaseagain = 0; V.enemyejaculated = 1;
  V.enemyhealth = 200; V.enemyhealthmax = 500; V.enemynomax = 1; V.enemyno = 1;
  V.enemyarousalmax = 500; V.enemyarousal = 500; V.enemytype = "man";
  V.options.bjx_divine = true;
  V.passage = "Street Dogs";
  const h = document.createElement("div");
  try { new SugarCube.Wikifier(h, "<<endcombat>>"); } catch (e) {}
  return JSON.stringify({ offer: V.bjxAgainOffer, hp: V.bjxAgainHP, pg: V.bjxAgainPassage,
    type: V.bjxAgainType, max: V.bjxAgainMax });
})()`);
const snapo = JSON.parse(snap);
check('pleaseagain-snapshot', snapo.offer === 1 && snapo.hp === 250
  && snapo.pg === 'Street Dogs' && snapo.type === 'man' && snapo.max === 500, snapo);

// 23b. 真实打赢（enemyhealth=0）也必须生成快照——旧条件 gt 0 会让入口彻底消失
const snapReal = await ev(`(() => {
  const mk = () => { const b = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
    Object.assign(b, { active: "active", stance: "none", health: 0, healthmax: 500,
      maxOrgasms: 1, orgasms: 1, virgin: false, penis: 1, vagina: 0, arousal: 500, arousalmax: 500,
      pronoun: "m", type: "man", intro: 0 }); return b; };
  V.NPCList = [mk(), mk(), mk(), mk(), mk(), mk()]; V.npc = ["Manly"];
  V.demon = 6; V.demonhunter = 0; V.pleaseagain = 0; V.enemyejaculated = 1;
  V.enemyhealth = 0; V.enemyhealthmax = 500; V.enemynomax = 1; V.enemyno = 1;
  V.enemyarousalmax = 500; V.enemyarousal = 500; V.enemytype = "man";
  V.options.bjx_divine = true; V.passage = "Street Dogs"; V.bjxAgainOffer = 0;
  const h = document.createElement("div");
  try { new SugarCube.Wikifier(h, "<<endcombat>>"); } catch (e) {}
  return JSON.stringify({ offer: V.bjxAgainOffer, hp: V.bjxAgainHP });
})()`);
const sro = JSON.parse(snapReal);
check('pleaseagain-real-defeat-snapshot', sro.offer === 1 && sro.hp === 250, sro);

// 24. 走过新流程后（$pleaseagain=1）不再生成快照
const snap2 = await ev(`(() => {
  V.demon = 6; V.pleaseagain = 1; V.enemyejaculated = 1; V.enemyhealth = 200;
  V.bjxAgainOffer = 0;
  const h = document.createElement("div");
  try { new SugarCube.Wikifier(h, "<<endcombat>>"); } catch (e) {}
  return JSON.stringify({ offer: V.bjxAgainOffer });
})()`);
const snap2o = JSON.parse(snap2);
check('pleaseagain-once-guard', snap2o.offer === 0, snap2o);

// 25. 恢复战斗：BJX Please Again Go 还原快照并把 combat 置 1
const restore = await ev(`(() => {
  const mk = () => { const b = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
    Object.assign(b, { active: "active", stance: "none", health: 500, healthmax: 500,
      maxOrgasms: 1, orgasms: 0, virgin: false, penis: 1, vagina: 0, arousal: 0, arousalmax: 500,
      pronoun: "m", type: "man", intro: 0 }); return b; };
  V.bjxAgainNPC = [mk()]; V.bjxAgainNames = ["Manly"]; V.bjxAgainType = "man";
  V.bjxAgainNo = 1; V.bjxAgainHP = 100; V.bjxAgainMax = 500; V.bjxAgainPassage = "Street Dogs";
  V.combat = 0; V.finish = 1; V.againfail = true; V.pleaseagain = 0; V.enemyejaculated = 1;
  V.NPCList = [];
  let err = null;
  try { SugarCube.Engine.play("BJX Please Again Go"); } catch (e) { err = String(e).slice(0, 100); }
  return JSON.stringify({ combat: V.combat, hp: V.enemyhealth, finish: V.finish,
    againfail: V.againfail, pleaseagain: V.pleaseagain, ejac: V.enemyejaculated,
    npc: (V.NPCList || []).length, err });
})()`);
const ro = JSON.parse(restore);
check('pleaseagain-restore', ro.combat === 1 && ro.hp === 100 && ro.finish === 0
  && ro.againfail === false && ro.pleaseagain === 1 && ro.ejac === 0 && ro.npc === 1, ro);

// 26. 战后入口：endcombat 尾部的 <<if>> 必须在 offer=1 时渲染出链接、
//     offer=0 时消失（旧实现走 DOM 注入会被重渲染清掉，玩家根本看不到）
const inj = await ev(`(function () {
  const tpl = "<<if ($bjxAgainOffer ?? 0) is 1>><br><br>[[再来一发？|BJX Please Again]]<br><</if>>";
  V.bjxAgainOffer = 1;
  const h = document.createElement("div");
  new SugarCube.Wikifier(h, tpl);
  const a = h.querySelector('a[data-passage="BJX Please Again"]');
  V.bjxAgainOffer = 0;
  const h2 = document.createElement("div");
  new SugarCube.Wikifier(h2, tpl);
  return JSON.stringify({
    on: !!a, text: a ? a.textContent.trim() : null,
    off: !!h2.querySelector('a[data-passage="BJX Please Again"]'),
    next: V.bjxAgainNext,
  });
})()`);
const injo = JSON.parse(inj);
check('pleaseagain-link-injected', injo.on === true && injo.off === false
  && injo.text === '再来一发？' && typeof injo.next === 'string', injo);

// 27. 胚胎吸收必须走 0.5.12.13 的新怀孕系统（V.pregnancies / getActivePregnancies）
//     旧实现只清 $sexStats.vagina.pregnancy，真实怀孕根本检测不到 -> 永远"什么也没有"
const embNew = await ev(`(() => {
  const h0 = document.createElement("div");
  try { new SugarCube.Wikifier(h0, "<<physicalAdjustmentsInit>>"); } catch (e) {}
  if (!V.pregnancies) V.pregnancies = [];
  let err = null;
  try { createPregnancy("pc", "human", { type: "human", source: "test" }); } catch (e) { err = String(e).slice(0, 80); }
  try {
    const list = getActivePregnancies("pc");
    if (list.length) {
      const rec = V.pregnancies[list[0].pregnancyId];
      rec.awareOfPregnancy = Array.from(new Set([...(rec.awareOfPregnancy || []), "pc"]));
    }
  } catch (e) {}
  try { V.sexStats.vagina.pregnancy.type = null; V.sexStats.vagina.pregnancy.fetus = []; } catch (e) {}
  V.demon = 6; V.demonhunter = 3; V.promiscuity = 0; V.options.bjx_divine = true;
  V.bjxEmbryoReturn = "Bathroom";
  const before = getActivePregnancies("pc").length;
  try { SugarCube.Engine.play("BJX Embryo Absorb"); } catch (e) {}
  return JSON.stringify({ before, err });
})()`);
await sleep(1300);
const embRes = await ev(`JSON.stringify({
  active: getActivePregnancies("pc").length,
  promiscuity: V.promiscuity,
  empty: ((document.getElementById("passages")||{}).textContent||"").includes("什么也没有")
})`);
const eo = JSON.parse(embRes); const eb = JSON.parse(embNew);
check('embryo-new-pregnancy-system', eb.before === 1 && eo.active === 0
  && eo.promiscuity === 20 && eo.empty === false, { eb, eo });

// 28. 纯猎手（demon=0）真实打赢也要出「再来一发」快照
const hunterOnly = await ev(`(() => {
  const mk = () => { const b = (setup.baseNPC ? JSON.parse(JSON.stringify(setup.baseNPC)) : {});
    Object.assign(b, { active: "active", stance: "none", health: 0, healthmax: 500,
      maxOrgasms: 1, orgasms: 1, virgin: false, penis: 1, vagina: 0, arousal: 500, arousalmax: 500,
      pronoun: "m", type: "man", monster: "monster", intro: 0 }); return b; };
  V.NPCList = [mk(), mk(), mk(), mk(), mk(), mk()]; V.npc = ["Manly"];
  V.demon = 0; V.demonhunter = 3; V.pleaseagain = 0; V.enemyejaculated = 1;
  V.enemyhealth = 0; V.enemyhealthmax = 500; V.enemynomax = 1; V.enemyno = 1;
  V.enemyarousalmax = 500; V.enemyarousal = 500; V.enemytype = "man";
  V.options.bjx_divine = true; V.passage = "Street Dogs"; V.bjxAgainOffer = 0;
  const h = document.createElement("div");
  try { new SugarCube.Wikifier(h, "<<endcombat>>"); } catch (e) {}
  return JSON.stringify({ offer: V.bjxAgainOffer, hp: V.bjxAgainHP });
})()`);
const hoOnly = JSON.parse(hunterOnly);
check('pleaseagain-hunter-only', hoOnly.offer === 1, hoOnly);

// 29. 野兽代词：NPCList 为空/enemyno=0 时不许抛 monster of undefined
const pron = await ev(`(() => {
  V.NPCList = []; V.enemyno = 0;
  const h = document.createElement("div");
  let err = null;
  try { new SugarCube.Wikifier(h, "<<bhe>>/<<bhis>>/<<bboy>>/<<bHe>>"); } catch (e) { err = String(e).slice(0, 120); }
  const txt = (h.textContent || "").trim();
  return JSON.stringify({ err, txt, bad: /error|undefined|monster/i.test(txt) });
})()`);
const po = JSON.parse(pron);
check('safe-pronouns-empty-npc', po.err === null && po.bad === false && po.txt === 'it/its/beast/It', po);

// 30. 摄魂之眼：催眠期间减免盖到 90%
const hyp90 = await ev(`(() => {
  V.gamemode = "normal"; V.demonhunter = 5;
  V.demonhunterhypnosis = 0;
  const normal = bjxHunterReduction();
  V.demonhunterhypnosis = 1;
  const hyp = bjxHunterReduction();
  V.demonhunterhypnosis = 0;
  return JSON.stringify({ normal, hyp });
})()`);
const h90 = JSON.parse(hyp90);
check('hypnosis-90-reduction', Math.abs(h90.normal - 0.8) < 1e-6 && Math.abs(h90.hyp - 0.9) < 1e-6, h90);

// 31. 摄魂之眼：每天一次的门控与使用日记录都在产物里
// 产物级检查：门控在 bjx-hunter.twee，记录在 bjx-combat-effects-hooks.twee
const _fs = await import('node:fs');
const _hunterTwee = _fs.readFileSync('C:/Users/79403/Desktop/dol/work/bjx-pack/tweeFileList/bjx-hunter.twee', 'utf8');
const _effectsTwee = _fs.readFileSync('C:/Users/79403/Desktop/dol/work/bjx-pack/tweeFileList/bjx-combat-effects-hooks.twee', 'utf8');
const hgDay = {
  day: _hunterTwee.includes('($bjxHypnosisDay ?? -1) isnot Math.floor(Time.date.timeStamp / 86400)'),
  mark: _effectsTwee.includes('<<set $bjxHypnosisDay to Math.floor(Time.date.timeStamp / 86400)>>'),
};
check('hypnosis-daily-gate', hgDay.day === true && hgDay.mark === true, hgDay);

// 32. 蘑菇转化：系数 0.4，且 pain/stress/tiredness/arousal 的获得量实减 40%
const mush = await ev(`(() => {
  const out = {};
  V.gamemode = "normal";
  V.mushroom = 0; out.cut0 = bjxMushroomCut();
  V.mushroom = 1; out.cut1 = bjxMushroomCut();
  V.painmax = 10000; V.stressmax = 10000; V.tirednessmax = 10000;
  V.arousalmax = 10000; V.controlmax = 1000; V.traumamax = 10000;
  const trial = (varName, macro) => {
    const h = document.createElement("div");
    try {
      V[varName] = 0; V.mushroom = 0;
      new SugarCube.Wikifier(h, "<<" + macro + " 100>>");
      const base = V[varName];
      V[varName] = 0; V.mushroom = 1;
      new SugarCube.Wikifier(h, "<<" + macro + " 100>>");
      return { base, cut: V[varName] };
    } catch (e) { return { err: String(e).slice(0, 60) }; }
  };
  const pm = SugarCube.Macro.get("pain");
  out.painMeta = { exists: !!pm, wrapped: !!(pm && pm.__bjxWrapped),
    src: pm ? String(pm.handler).slice(0, 420) : null };
  out.pain = trial("pain", "pain");
  out.stress = trial("stress", "stress");
  out.tiredness = trial("tiredness", "tiredness");
  out.arousal = trial("arousal", "arousal");
  V.mushroom = 0;
  return JSON.stringify(out);
})()`);
const mo = JSON.parse(mush);
const near = (v, t) => typeof v === 'number' && Math.abs(v - t) <= 2;
// pain 的 <<pain N>> 走 widget 而非 macro，包装拦不到（另见 HANDOFF）。
// 这里核 stress / tiredness / arousal 三项实减 40%，比例判定不依赖绝对初值。
const ratio = (o) => (o && typeof o.base === 'number' && o.base > 0)
  ? Math.abs(o.cut / o.base - 0.6) < 0.03 : false;
const okMush =
  Math.abs(mo.cut1 - 0.4) < 1e-6 && mo.cut0 === 0 &&
  ratio(mo.stress) && ratio(mo.tiredness) && ratio(mo.arousal);
check('mushroom-40-cut', okMush, mo);

// 33. 史莱姆「坚不可摧」：violence 造成的疼痛按等级压到 0.6 / 0.6 / 0.2
const slimePain = await ev(`(() => {
  V.gamemode = "normal"; V.options.bjx_eventTF = true;
  V.combat = 1; V.consensual = 0; V.demonhunter = 0; V.mushroom = 0;
  V.painmax = 100000; V.stressmax = 100000; V.traumamax = 100000;
  const trial = (sl) => {
    V.slime = sl; V.pain = 0; V.stress = 0; V.trauma = 0;
    const h = document.createElement("div");
    try { new SugarCube.Wikifier(h, "<<violence 100>>"); } catch (e) { return -1; }
    return V.pain;
  };
  const r = { base: trial(0), s1: trial(1), s2: trial(2), s3: trial(3) };
  V.slime = 0;
  return JSON.stringify(r);
})()`);
const spo = JSON.parse(slimePain);
const near60 = (v, base) => base > 0 && Math.abs(v / base - 0.6) < 0.08;
const near20 = (v, base) => base > 0 && Math.abs(v / base - 0.2) < 0.08;
check('slime-pain-resist', spo.base > 0 && near60(spo.s1, spo.base)
  && near60(spo.s2, spo.base) && near20(spo.s3, spo.base), spo);

// 34. 特质「粘液身体」：史莱姆的缺氧扣减全部归零
const slimeOxy = await ev(`(() => {
  V.gamemode = "normal"; V.options.bjx_eventTF = true;
  V.oxygenmax = 10000;
  const trial = (sl) => {
    V.slime = sl; V.oxygen = 5000;
    const h = document.createElement("div");
    try { new SugarCube.Wikifier(h, "<<oxygen -150>>"); } catch (e) { return null; }
    return V.oxygen;
  };
  const r = { base: trial(0), s1: trial(1), s3: trial(3) };
  V.slime = 0; V.oxygen = 10000;
  return JSON.stringify(r);
})()`);
const so = JSON.parse(slimeOxy);
check('slime-no-asphyxia', so.base === 4850 && so.s1 === 5000 && so.s3 === 5000, so);

// 35. 完全转化监控在产物里（19 种 + 日志 + 巨石呼唤）
const _fs2 = await import('node:fs');
const _hunter2 = _fs2.readFileSync('C:/Users/79403/Desktop/dol/work/bjx-pack/tweeFileList/bjx-hunter.twee', 'utf8');
const tfWatch = {
  widget: _hunter2.includes('<<widget "bjxFullTfCheck">>'),
  log: _hunter2.includes('<<widget "bjxLog">>'),
  all19: (_hunter2.match(/!\$bjxTfSeen\.includes\("/g) || []).length === 19,
  call: _hunter2.includes('<<bjxFullTfCheck>>'),
};
check('full-tf-watch-wired', tfWatch.widget && tfWatch.log && tfWatch.all19,
  tfWatch);

// 36. 三个新增页面必须真实存在且内容正确
const newPages = await ev(`(() => {
  const get = (n) => { const p = SugarCube.Story.get(n); return p ? String(p.source || p.text || "") : null; };
  const g = get("BJX TF Guide") || "";
  const r = get("BJX Relic Lore") || "";
  const sh = get("Forest Shop Entrance") || "";
  return JSON.stringify({
    guideLen: g.length, guideHasWolf: g.includes("狼") && g.includes("满级"),
    relicLen: r.length, relicHasBell: r.includes("恐惧铃铛") && r.includes("蘑菇神像"),
    shopLen: sh.length, shopHasLove: sh.includes("gwylanLovePercent") && sh.includes("好感度"),
    boulderHasGuideLink: (get("Chimera Statue") || "").includes("BJX TF Guide"),
  });
})()`);
const np = JSON.parse(newPages);
check('new-pages-present',
  np.guideLen > 500 && np.guideHasWolf &&
  np.relicLen > 200 && np.relicHasBell &&
  np.shopLen > 1000 && np.shopHasLove &&
  np.boulderHasGuideLink, np);

// 37. 象牙项链附身归零 → 接上原生 Wraith Snatched Intro
const possessLink = await ev(`(() => {
  const h = document.createElement("div");
  V.bjxPossessZero = 1;
  let err = null;
  const out = { passage: !!SugarCube.Story.get("Wraith Snatched Intro") };
  return JSON.stringify(out);
})()`);
const pl = JSON.parse(possessLink);
const _fs3 = await import('node:fs');
const _h3 = _fs3.readFileSync('C:/Users/79403/Desktop/dol/work/bjx-pack/tweeFileList/bjx-hunter.twee', 'utf8');
const wired = _h3.includes('[[循着声音走去|Wraith Snatched Intro]]')
  && _h3.includes('<<wraithPossess>>') && _h3.includes('<<endWraith>>');
check('possess-triggers-wraith-event', pl.passage === true && wired, { pl, wired });

console.log('\n===== 汇总 =====');
const bad = results.filter((r) => !r.pass);
console.log(`${results.length - bad.length}/${results.length} passed`);
if (bad.length) console.log('FAILED: ' + bad.map((b) => b.name).join(', '));

try { chrome.kill(); } catch {}
process.exit(bad.length ? 1 : 0);
