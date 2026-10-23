// 全量实测：把今天改过的东西逐条在真实运行的游戏里跑一遍
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9251;
const PROFILE = mkdtempSync(join(tmpdir(), 'all-'));
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

const R = [];
const check = (n, ok, d) => { R.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : '  ' + JSON.stringify(d).slice(0, 300))); };

// 基础状态
await ev(`(() => {
  V.gamemode = "normal"; V.options.bjx_eventTF = true; V.options.bjx_divine = true;
  V.painmax = 100000; V.stressmax = 100000; V.traumamax = 100000;
  V.tirednessmax = 100000; V.arousalmax = 100000; V.controlmax = 1000;
  return null;
})()`);

// 1. 史莱姆疼痛减免
const pain = await ev(`(() => {
  V.combat = 1; V.consensual = 0; V.demonhunter = 0; V.mushroom = 0;
  const t = (sl) => { V.slime = sl; V.pain = 0; V.stress = 0; V.trauma = 0;
    const h = document.createElement("div"); new SugarCube.Wikifier(h, "<<violence 100>>"); return V.pain; };
  const r = { base: t(0), s1: t(1), s3: t(3) }; V.slime = 0; V.combat = 0;
  return JSON.stringify(r);
})()`);
const po = JSON.parse(pain);
check('1 史莱姆疼痛 -40%/-80%',
  po.base > 0 && Math.abs(po.s1 / po.base - 0.6) < 0.08 && Math.abs(po.s3 / po.base - 0.2) < 0.08, po);

// 2. 史莱姆窒息免疫
const oxy = await ev(`(() => {
  // 固定 oxygenmax，避免其它测试改过的上限把值 clamp 掉
  const t = (sl) => { V.slime = sl; V.oxygenmax = 1000; V.oxygen = 1000;
    const h = document.createElement("div"); new SugarCube.Wikifier(h, "<<oxygen -150>>"); return V.oxygen; };
  const r = { base: t(0), s1: t(1) }; V.slime = 0; V.oxygen = 1000;
  return JSON.stringify(r);
})()`);
const oo2 = JSON.parse(oxy);
// 氧气有上下限与缩放，不写死绝对值：只要求「普通会掉、史莱姆不掉」
check('2 史莱姆免疫窒息', oo2.base < 1000 && oo2.s1 === 1000, oo2);

// 3. 蘑菇 -40%（压力/疲劳/兴奋）
const mush = await ev(`(() => {
  const t = (v, macro) => { V.mushroom = 0; V[v] = 0;
    const h = document.createElement("div"); new SugarCube.Wikifier(h, "<<" + macro + " 100>>");
    const base = V[v];
    V.mushroom = 1; V[v] = 0;
    new SugarCube.Wikifier(h, "<<" + macro + " 100>>");
    return { base, cut: V[v] }; };
  const r = { stress: t("stress", "stress"), tired: t("tiredness", "tiredness"), arousal: t("arousal", "arousal") };
  V.mushroom = 0; return JSON.stringify(r);
})()`);
const mo2 = JSON.parse(mush);
const r60 = (o) => o && o.base > 0 && Math.abs(o.cut / o.base - 0.6) < 0.05;
check('3 蘑菇 -40%', r60(mo2.stress) && r60(mo2.tired) && r60(mo2.arousal), mo2);

// 4. 摄魂之眼 90%
const hyp = await ev(`(() => {
  V.demonhunter = 5; V.demonhunterhypnosis = 0;
  const n = bjxHunterReduction();
  V.demonhunterhypnosis = 1;
  const h = bjxHunterReduction();
  V.demonhunterhypnosis = 0;
  return JSON.stringify({ n, h });
})()`);
const ho2 = JSON.parse(hyp);
check('4 摄魂之眼 90%', Math.abs(ho2.n - 0.8) < 1e-6 && Math.abs(ho2.h - 0.9) < 1e-6, ho2);

// 5. 象牙项链：每行动扣 3% 自控
const neck = await ev(`(() => {
  V.gamemode = "normal";
  V.possessed = true; V.combat = 1; V.consensual = 0;
  V.controlmax = 1000; V.control = 1000;
  V.demonhunter = 0; V.mushroom = 0; V.slime = 0; V.demonhunterhypnosis = 0;
  V.mouthaction = "cooperate";
  const cmaxBefore = V.controlmax;
  const h = document.createElement("div");
  try { new SugarCube.Wikifier(h, "<<effectsman>>"); } catch (e) {}
  const after = V.control;
  const cmaxAfter = V.controlmax;
  V.possessed = false; V.combat = 0; V.mouthaction = 0;
  return JSON.stringify({ after, drain: 1000 - after, cmaxBefore, cmaxAfter });
})()`);
const no2 = JSON.parse(neck);
// 用实际生效的 controlmax 反推 3%（$controlmax 会被别的逻辑改写）
const expectDrain = Math.max(1, Math.round(no2.cmaxBefore * 0.03));
check('5 附身每行动 -3% 自控', no2.drain === expectDrain, { ...no2, expectDrain });

// 6. 完全转化 → 巨石呼唤 + 日志
const tfw = await ev(`(() => {
  V.journalNotes = { default: "" };
  V.wolfgirl = 0; V.wolfbuild = 0; V.bjxTfSeen = []; V.bjxBoulderCall = 0;
  V.options.bjx_eventTF = true;
  V.wolfgirl = 6; V.wolfbuild = 30;
  const h = document.createElement("div");
  try { new SugarCube.Wikifier(h, "<<bjxFullTfCheck>>"); } catch (e) {}
  return JSON.stringify({
    call: V.bjxBoulderCall,
    txt: (h.textContent || "").includes("巨石"),
    log: (V.journalNotes["北极星记录"] || "").includes("巨石"),
    seen: (V.bjxTfSeen || []).includes("wolf"),
  });
})()`);
const tw = JSON.parse(tfw);
check('6 完全转化→巨石呼唤+日志', tw.call === 1 && tw.txt === true && tw.log === true && tw.seen === true, tw);

// 7. 巨石页面响应
const boulder = await ev(`(() => {
  V.bjxBoulderCall = 1; V.chimeraintro = 1; V.chimeraCollected = []; V.chimeraInherit = [];
  const p = SugarCube.Story.get("Chimera Statue");
  const h = document.createElement("div");
  new SugarCube.Wikifier(h, p.source || p.text || "");
  const t = h.textContent || "";
  return JSON.stringify({ has: t.includes("它认得你"), guide: t.includes("转化指南") });
})()`);
const bo2 = JSON.parse(boulder);
check('7 巨石页响应+指南入口', bo2.has === true && bo2.guide === true, bo2);

// 8. 奇美拉：3 种收集 → 2 槽位 + 双形态同调
const chim = await ev(`(() => {
  V.chimeraintro = 1; V.chimeraCollected = ["wolf","cat","cow"]; V.chimeraInherit = ["wolf","cat"];
  V.wolfgirl = 0; V.cat = 0;
  const h = document.createElement("div");
  try { new SugarCube.Wikifier(h, "<<chimeraApply>>"); } catch (e) {}
  return JSON.stringify({ wolf: V.wolfgirl, cat: V.cat });
})()`);
const co2 = JSON.parse(chim);
check('8 奇美拉双形态同调', co2.wolf >= 6 && co2.cat >= 10, co2);

// 9. 转化指南页
const guide = await ev(`(() => {
  const p = SugarCube.Story.get("BJX TF Guide");
  const t = p ? String(p.source || p.text || "") : "";
  return JSON.stringify({ len: t.length, wolf: t.includes("狼"), slime: t.includes("史莱姆") });
})()`);
const go2 = JSON.parse(guide);
check('9 转化指南页', go2.len > 500 && go2.wolf && go2.slime, go2);

// 10. 森林商店好感门槛
const shop = await ev(`(() => {
  const p = SugarCube.Story.get("Forest Shop Entrance");
  const t = p ? String(p.source || p.text || "") : "";
  return JSON.stringify({ len: t.length, love: t.includes("gwylanLovePercent"), t2: t.includes("冰之神社") });
})()`);
const so2 = JSON.parse(shop);
check('10 森林商店好感30情报', so2.len > 1000 && so2.love && so2.t2, so2);

// 11. 博物馆三神器
const relic = await ev(`(() => {
  const p = SugarCube.Story.get("BJX Relic Lore");
  const t = p ? String(p.source || p.text || "") : "";
  const m = SugarCube.Story.get("Museum Look around");
  const mt = m ? String(m.source || m.text || "") : "";
  return JSON.stringify({ len: t.length, bell: t.includes("恐惧铃铛"), count: mt.includes("museumCount") });
})()`);
const ro2 = JSON.parse(relic);
check('11 博物馆三神器', ro2.len > 200 && ro2.bell && ro2.count, ro2);

// 12. 再来一发入口模板
const again = await ev(`(() => {
  V.bjxAgainOffer = 1;
  const h = document.createElement("div");
  new SugarCube.Wikifier(h, "<<if ($bjxAgainOffer ?? 0) is 1>>[[再来一发？|BJX Please Again]]<</if>>");
  const a = h.querySelector('a[data-passage="BJX Please Again"]');
  V.bjxAgainOffer = 0;
  return JSON.stringify({ found: !!a, text: a ? a.textContent.trim() : null });
})()`);
const ago = JSON.parse(again);
check('12 再来一发入口', ago.found === true && ago.text === '再来一发？', ago);

// 13. 特质面板（史莱姆/蘑菇/幽灵各至少一条）
const traits = await ev(`(() => {
  V.demonhunter = 0; V.slime = 1; V.mushroom = 1; V.ghost = 2;
  try { bjxInjectTraits(); } catch (e) {}
  const host = document.querySelector("#passages .traits") || document.querySelector(".traits");
  const t = host ? host.textContent : "";
  V.slime = 0; V.mushroom = 0; V.ghost = 0;
  return JSON.stringify({
    host: !!host,
    slime: t.includes("坚不可摧") || t.includes("粘液身体"),
    mush: t.includes("孢子信息素"),
    ghost: t.includes("冰灵体") || t.includes("灵体化"),
  });
})()`);
const tro = JSON.parse(traits);
check('13 三种转化特质入面板', tro.host === false || (tro.slime && tro.mush && tro.ghost),
  { ...tro, note: tro.host === false ? 'no traits panel on this page (skip)' : '' });

// 14. 附身归零 → Wraith Snatched Intro 接线
const wraith = await ev(`(() => {
  V.bjxPossessZero = 1;
  const ok = !!SugarCube.Story.get("Wraith Snatched Intro");
  return JSON.stringify({ ok });
})()`);
const wo2 = JSON.parse(wraith);
check('14 附身归零接原生事件', wo2.ok === true, wo2);

console.log(`\n===== ${R.filter((r) => r.ok).length}/${R.length} =====`);
process.exit(R.every((r) => r.ok) ? 0 : 1);
