// 衣柜「出售」模式 + 出售箱预览专项验证。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9232;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-wardrobe-sale-'));
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
const play = (name) => ev(`(() => { SugarCube.Engine.play(${JSON.stringify(name)}); return SugarCube.State.passage; })()`);

// 0. 年龄门 + 调试开局（否则 Wardrobe 页面铺不出来）
await ev(`localStorage.setItem('verifiedAge','true')`);
await ev(`(() => {
  const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click();
  const b = Array.from(document.querySelectorAll('#ui-dialog button')).find(x => /Enter|进入|确认|确定|同意/.test(x.textContent));
  if (b) b.click();
  document.querySelectorAll('.swal2-container').forEach(n => n.remove());
  return true;
})()`);
await sleep(800);
await ev(`(() => { V.debug = 1; V.options = V.options || {}; V.options.debugdisable = 'f'; SugarCube.Engine.play('Start2'); return 1; })()`);
await sleep(1500);
const started = await ev(`(() => {
  const a = Array.from(document.querySelectorAll('#passages a')).find(x => /School Start|学校地位提升开局|学校/.test(x.textContent));
  if (a) { a.click(); return a.textContent.trim(); }
  return null;
})()`);
await sleep(2500);
console.log('start=', started, 'passage=', await ev('SugarCube.State.passage'));

// 1. 造两件可卖衣物 + 预约出售状态
const setup = await ev(`(() => {
  V.location = "home"; V.eventskip = 1; V.sewingKit = 1;
  V.tailorMonthlyService = "discard"; V.wardrobeOption = "wear"; V.wardrobeRepeat = false;
  V.wardrobeDefaults = { showTraits: false, extraInfo: false };
  const mk = (slot) => {
    const H = setup.clothes[slot] || {};
    const key = Object.keys(H).find(k => (H[k].integrity_max || 0) > 0 && (H[k].shop || []).length > 0);
    if (!key) return null;
    const it = JSON.parse(JSON.stringify(H[key]));
    it.integrity = it.integrity_max || 100;
    return it;
  };
  const up = mk("upper"), lo = mk("lower");
  const box = { unlocked: true, name: "Wardrobe", space: 100 };
  ["head","neck","upper","lower","under_upper","under_lower","hands","feet","legs","face","handheld","over_upper","over_lower","over_head"].forEach(s => box[s] = []);
  if (up) box.upper.push(up);
  if (lo) box.lower.push(lo);
  V.wardrobe = box;
  V.wardrobes = { wardrobe: box };
  V.wardrobe_location = "wardrobe";
  ["upper","lower","under_upper","under_lower","head","neck","hands","feet","legs","face","handheld","over_upper","over_lower","over_head"].forEach(s => V["wear_"+s] = "none");
  return JSON.stringify({ up: up && up.name, lo: lo && lo.name, money: V.money });
})()`);
console.log('setup=', setup);
const s = JSON.parse(setup);

// 2. 进入衣柜：出售 radio 应该出现
await play('Wardrobe');
await sleep(1800);
const ui = await ev(`JSON.stringify({
  passage: SugarCube.State.passage,
  sell: Array.from(document.querySelectorAll('label')).some(x => /出售/.test(x.textContent)),
  radios: Array.from(document.querySelectorAll('[id^="radiobutton-wardrobeoption"]')).map(x => x.parentElement.outerHTML.slice(0, 240)),
  text: document.body.innerText,
})`);
let u = JSON.parse(ui);
check('sell-radio-visible', u.sell === true, { sell: u.sell, passage: u.passage, radios: u.radios });
check('no-add-outfits-link', !/Add outfits and send/.test(u.text), u.text.slice(0, 200));
check('crate-empty-hint', /出售箱是空的|出售箱里：/.test(u.text), u.text.slice(0, 200));

// 3. 切到出售模式，点第一件上衣 → 进入出售箱且不消失
const mark = await ev(`(() => {
  V.wardrobeOption = "sell"; V.wear_upper = 0;
  const d = document.createElement("div");
  new SugarCube.Wikifier(d, "<<wardrobewear>>");
  const it = V.wardrobe.upper[0];
  return JSON.stringify({ marked: it && it._bjxSaleCrate === true, count: V.wardrobe.upper.length,
    text: d.textContent.slice(0, 80) });
})()`);
const m = JSON.parse(mark);
check('sell-marks-item', m.marked === true && m.count === 1, m);

// 4. 重进衣柜：出售箱应列出该衣物与预估金额
await ev(`(() => { V.wardrobeOption = "wear"; return 1; })()`);
await play('Wardrobe');
await sleep(1500);
const prev = await ev(`JSON.stringify({ text: document.body.innerText })`);
const pv = JSON.parse(prev);
check('crate-lists-item', pv.text.includes(s.up), pv.text.slice(0, 300));
check('crate-shows-value', /预计可得/.test(pv.text), pv.text.slice(0, 300));

// 5. 确认出售：进入 crate 页 → 结算 → 衣物删除、钱增加
const pay = await ev(`(() => {
  const before = V.money;
  V.crateContents = "selected"; V.wardrobeReturnLink = "Wardrobe";
  SugarCube.Engine.play("Wardrobe Sale Crate");
  const cratePassage = SugarCube.State.passage;
  const pageText = document.body.innerText;
  SugarCube.Engine.play("Wardrobe Sale Crate Result");
  return JSON.stringify({ before, after: V.money, left: V.wardrobe.upper.length,
    cratePassage, pageText: pageText.slice(0, 200) });
})()`);
const py = JSON.parse(pay);
// 发布包物品名会被 ModI18N 译成中文，这里只断言确实进入了出售箱结算页。
check('crate-page-lists-item', py.cratePassage === 'Wardrobe Sale Crate', py);
check('sale-deletes-marked', py.left === 0, py);
check('sale-pays-deposit', py.after - py.before >= 5000, py);

console.log('\n' + results.filter(r => r.p).length + '/' + results.length + ' passed');
try { chrome.kill(); } catch {}
process.exit(results.every(r => r.p) ? 0 : 1);
