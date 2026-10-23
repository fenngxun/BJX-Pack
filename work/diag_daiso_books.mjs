// 专项验证：百货商店 SF 宏（lanSwitch/ModShopZone/getLan）+ 图书馆多本偷书
// 用法：node work/diag_daiso_books.mjs "http://127.0.0.1:8766/Degrees%20of%20Lewdity.html"
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9224;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-diag-'));
const REPORT = 'C:/Users/79403/Desktop/dol/work/diag-daiso-books-report.json';
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
  throw new Error('chrome devtools page not found');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else for (const l of listeners) l(msg);
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    onEvent(l) { listeners.push(l); },
    ready: new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); }),
  };
}

const BJXTEST_SRC = `
(() => {
  const SC = window.SugarCube;
  window.BJXTEST = {
    passage: () => SC.State.passage,
    var: (n) => SC.State.variables[n],
    setVars: (o) => { Object.assign(SC.State.variables, o); return true; },
    run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 200); } },
    goto: (n) => { SC.Engine.play(n); return true; },
    domErrors: () => Array.from(document.querySelectorAll('.error')).map((e) => e.textContent.trim().slice(0, 250)),
    macroHas: (n) => !!(SC.Macro && SC.Macro.has && SC.Macro.has(n)),
    smokeWidget: (name) => {
      try {
        const h = document.createElement('div');
        new SC.Wikifier(h, '<<' + name + '>>');
        return { ok: true, text: h.textContent.trim().slice(0, 300),
                 errs: Array.from(h.querySelectorAll('.error')).map((e) => e.textContent.trim().slice(0, 150)) };
      } catch (e) { return { ok: false, errs: [String(e).slice(0, 200)] }; }
    },
  };
  return true;
})()
`;

const BENIGN = /drawImage|could not be loaded|modList\.json|Failed to load resource|Failed to load mask|net::ERR|LoaderKeyConfig|ModZipReader|favicon|404|Error during effect|randomInt called with invalid parameters|createRadialGradient|Unexpected token|is not of type|broken' state|Failed to execute|\[EXC\] Event|\{optionalBefore\} not satisfies version/i;

const results = { started: new Date().toISOString(), steps: [] };
const step = (name) => { const s = { name, pass: true, details: {} }; results.steps.push(s); return s; };
const consoleLines = [];
let cursor = 0;
const newErrors = () => {
  const out = [];
  for (; cursor < consoleLines.length; cursor++) {
    const l = consoleLines[cursor];
    if ((l.startsWith('[error]') || l.startsWith('[EXC]')) && !BENIGN.test(l)) out.push(l);
  }
  return out;
};

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL,
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

let cdp;
const ev = async (expr, timeout = 25000) => {
  const r = await Promise.race([
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
    sleep(timeout).then(() => { throw new Error('evaluate timeout'); }),
  ]);
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error('page exception: ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 300));
  }
  return r.result.value;
};
const probe = async (needle) => {
  const expr = `(() => {
    const t = Array.from(document.querySelectorAll('#passages .passage')).map(e => e.textContent).join(' ');
    const n = ${JSON.stringify(needle)};
    const i = t.indexOf(n);
    return JSON.stringify({ hit: i >= 0, ctx: i >= 0 ? t.slice(i, i + 60) : ('len=' + t.length + ' head=' + t.slice(0, 60)) });
  })()`;
  return JSON.parse(await ev(expr));
};
const waitPassage = async (name, timeoutMs = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const p = await ev('BJXTEST.passage()').catch(() => null);
    if (p === name) return true;
    await sleep(300);
  }
  return false;
};

try {
  const wsUrl = await getPageWs();
  cdp = connect(wsUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  cdp.onEvent((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ');
      consoleLines.push(`[${msg.params.type}] ${text.slice(0, 400)}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleLines.push('[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 400));
    }
  });

  // 1) boot
  let s = step('boot');
  {
    const t0 = Date.now();
    let booted = false;
    while (Date.now() - t0 < 240000) {
      const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
      if (ok) { booted = true; break; }
      await sleep(2000);
    }
    s.details.booted = booted;
    if (!booted) throw new Error('game did not boot');
    await ev(BJXTEST_SRC);
    await sleep(1000);
    s.details.passage = await ev('BJXTEST.passage()');
    s.details.macroLanSwitch = await ev('BJXTEST.macroHas("lanSwitch")');
    s.details.macroModShopZone = await ev('BJXTEST.macroHas("ModShopZone")');
    s.details.macroBeforeLinkZone = await ev('BJXTEST.macroHas("BeforeLinkZone")');
    s.details.getLan = await ev('typeof window.getLan');
    s.details.getLanLeave = await ev('String(window.getLan && window.getLan("leave"))');
    if (!s.details.macroLanSwitch || !s.details.macroModShopZone || !s.details.macroBeforeLinkZone || s.details.getLan !== 'function') s.pass = false;
    s.details.consoleErrors = newErrors();
  }

  // 2) Start2 初始化
  s = step('init-start2');
  {
    await ev('BJXTEST.goto("Start2")');
    s.details.atStart2 = await waitPassage('Start2');
    if (!s.details.atStart2) s.pass = false;
    await ev('if (!BJXTEST.var("saveVersions")) { BJXTEST.setVars({ saveVersions: [typeof StartConfig !== "undefined" ? StartConfig.version : 0], objectVersion: {} }); }');
    s.details.consoleErrors = newErrors();
  }

  // 3) 百货商店
  s = step('daiso');
  {
    await ev('BJXTEST.setVars({ phase: 0, eventskip: 1 })');
    // 打点：tabSwitch / printShelf / searchType 是否卡住
    await ev(`(() => {
      window.__daisoTrace = [];
      const wrap = (obj, name, tag) => {
        if (!obj || typeof obj[name] !== 'function' || obj[name].__wrapped) return;
        const orig = obj[name];
        obj[name] = function () {
          window.__daisoTrace.push(tag + ':start');
          try { return orig.apply(this, arguments); }
          catch (e) { window.__daisoTrace.push(tag + ':ERR ' + String(e).slice(0, 120)); throw e; }
          finally { window.__daisoTrace.push(tag + ':end'); }
        };
        obj[name].__wrapped = true;
      };
      wrap(window.iShop, 'tabSwitch', 'tabSwitch');
      wrap(window.iShop, 'printShelf', 'printShelf');
      wrap(window.Items, 'searchType', 'searchType');
      return true;
    })()`);
    try {
      await ev('BJXTEST.goto("BaseScene DaisoShop")', 120000);
    } catch (e) {
      s.details.gotoError = String(e);
      s.details.traceAfterGoto = await ev('JSON.stringify(window.__daisoTrace || [])', 8000).catch(() => 'unreadable');
      throw e;
    }
    await sleep(2500);
    s.details.passage = await ev('BJXTEST.passage()');
    s.details.descCN = await probe('你来到了在大创百货商店');
    s.details.shopText = await probe('这里有很多商品出售');
    s.details.leave = await probe('离开');
    s.details.images = await ev(`(() => {
      const imgs = Array.from(document.querySelectorAll('#shopshelf img, #shopbanner img, #shopcartbox img'));
      return JSON.stringify({
        total: imgs.length,
        ok: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
        bad: imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src')).slice(0, 10),
      });
    })()`);
    s.details.domErrors = await ev('BJXTEST.domErrors()');
    const cerr = newErrors();
    s.details.consoleErrors = cerr.filter((l) => /lanSwitch|ModShopZone|getLan|does not exist/i.test(l));
    if (!s.details.descCN.hit || !s.details.shopText.hit || !s.details.leave.hit) s.pass = false;
    {
      const im = JSON.parse(s.details.images || '{}');
      if (!im.total || im.ok !== im.total) s.pass = false;
    }
    if ((s.details.domErrors || []).length) s.pass = false;
    if (s.details.consoleErrors.length) s.pass = false;
  }

  // 4) 偷书：连偷两本
  s = step('steal-two');
  {
    await ev('BJXTEST.setVars({ studyBooks: { rented: "none", stolen: "none", stolenList: [] } })');
    await ev('BJXTEST.run("delete SugarCube.State.variables.bookStolen")');
    await ev('BJXTEST.setVars({ phase2: "steal", phase: 1 })');
    await ev('BJXTEST.goto("Book Rental")');
    s.details.atBookRental1 = await waitPassage('Book Rental');
    await sleep(1200);
    s.details.after1 = await ev('JSON.stringify(BJXTEST.var("studyBooks"))');
    await ev('BJXTEST.setVars({ phase2: "steal", phase: 2 })');
    await ev('BJXTEST.goto("Book Rental")');
    s.details.atBookRental2 = await waitPassage('Book Rental');
    await sleep(1200);
    s.details.after2 = await ev('JSON.stringify(BJXTEST.var("studyBooks"))');
    const a2 = JSON.parse(s.details.after2 || '{}');
    s.details.stolenList = a2.stolenList;
    if (!(a2.stolenList || []).includes('science') || !(a2.stolenList || []).includes('maths')) s.pass = false;

    // 柜台界面：应出现两本归还链接 + 剩余偷书链接，且无「只能拿一本」
    await ev('BJXTEST.setVars({ schoolstate: "late", money: 100000 })');
    s.details.widget = await ev('JSON.stringify(BJXTEST.smokeWidget("bookRentalOptions"))');
    const w = JSON.parse(s.details.widget || '{}');
    s.details.widgetText = w.text;
    s.details.widgetErrs = w.errs;
    s.details.noOneBookLimit = !String(w.text || '').includes('only carry one stolen book');
    if (!s.details.noOneBookLimit || (w.errs || []).length) s.pass = false;
    s.details.consoleErrors = newErrors().filter((l) => /stolen|studyBooks|Book Rental/i.test(l));
  }

  // 5) 归还其中一本（science），列表应剩 maths
  s = step('return-one');
  {
    await ev('BJXTEST.setVars({ phase: 1 })');
    await ev('BJXTEST.goto("Book Rental Return Stolen")');
    s.details.atReturn = await waitPassage('Book Rental Return Stolen');
    await sleep(1500);
    s.details.afterReturn = await ev('JSON.stringify(BJXTEST.var("studyBooks"))');
    const ar = JSON.parse(s.details.afterReturn || '{}');
    s.details.stolenList = ar.stolenList;
    s.details.stolen = ar.stolen;
    if ((ar.stolenList || []).includes('science') || !(ar.stolenList || []).includes('maths')) s.pass = false;
    s.details.domErrors = await ev('BJXTEST.domErrors()');
    s.details.consoleErrors = newErrors().filter((l) => /stolen|studyBooks|Book Rental/i.test(l));
    if ((s.details.domErrors || []).length) s.pass = false;
  }

  // 6) 被动学习按列表叠加
  s = step('passive-study');
  {
    await ev('BJXTEST.setVars({ studyBooks: { rented: "none", stolen: "maths", stolenList: ["maths", "English"] } })');
    await ev('BJXTEST.run("SugarCube.State.variables.maths_exam = 0; SugarCube.State.variables.english_exam = 0")');
    const before = await ev('JSON.stringify({ m: BJXTEST.var("maths_exam"), e: BJXTEST.var("english_exam") })');
    s.details.before = before;
    s.details.widget = await ev('JSON.stringify(BJXTEST.smokeWidget("passiveStudy"))');
    const after = await ev('JSON.stringify({ m: BJXTEST.var("maths_exam"), e: BJXTEST.var("english_exam") })');
    s.details.after = after;
    const b = JSON.parse(before); const a = JSON.parse(after);
    s.details.delta = { maths: a.m - b.m, English: a.e - b.e };
    if (!(a.m > b.m) || !(a.e > b.e)) s.pass = false;
  }

  // 7) 控制台总扫
  s = step('console-sweep');
  {
    const cerr = newErrors();
    s.details.errors = cerr;
    if (cerr.length) s.pass = false;
  }
} catch (e) {
  results.fatal = String(e && e.stack || e);
} finally {
  results.finished = new Date().toISOString();
  writeFileSync(REPORT, JSON.stringify(results, null, 1));
  try { chrome.kill(); } catch {}
  const pass = results.steps.filter((x) => x.pass).length;
  const fail = results.steps.filter((x) => !x.pass).length;
  console.log(JSON.stringify(results, null, 1));
  console.log(`SUMMARY ${pass}/${results.steps.length} pass, ${fail} fail${results.fatal ? ' FATAL: ' + results.fatal : ''}`);
  process.exit(fail || results.fatal ? 1 : 0);
}
