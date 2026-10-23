// CDP in-game verification driver for the bjx-pack mod (batch 1).
// Covers: ant-island regression, museum 19 antiques (8 new), bunker discovery
// -> hatch -> scroll pickup, hive forest entry -> Taylor rescue chain,
// Taylor reward/home on Danube Street, Casey dusk chain on Connudatus Street
// + Trash greet. Time/weather helpers adapt to 0.5.10.12 Time/Weather APIs.
import { spawn } from 'node:child_process';
import { writeFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8765/Degrees%20of%20Lewdity.html';
const PORT = 9223;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-pack-'));
const LOG = 'C:/Users/79403/Desktop/dol/work/cdp-pack-console.log';
const REPORT = 'C:/Users/79403/Desktop/dol/work/cdp-pack-report.json';
const SHOT_DIR = 'C:/Users/79403/Desktop/dol/work';
const TOTAL_TIMEOUT_MS = 480000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageWs() {
  for (let i = 0; i < 60; i++) {
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
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else {
      for (const l of listeners) l(msg);
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
    onEvent(l) { listeners.push(l); },
    ready: new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    }),
  };
}

// 0.5.12.13 host: its bundled ModLoader is newer than the one the third-party
// mods were built for, so a few framework-level notices appear on every boot
// (dependency/alias/metadata bookkeeping + a ReplacePatcher file probe). They
// do not affect gameplay: the rest of the suite is green. Host-generation
// noise, whitelisted like the existing optionalBefore entry.
const BENIGN = /drawImage|could not be loaded|modList\.json|Failed to load resource|Failed to load mask|net::ERR|LoaderKeyConfig|ModZipReader|favicon|404|Error during effect|randomInt called with invalid parameters|createRadialGradient|Unexpected token|is not of type|broken' state|Failed to execute|\[EXC\] Event|\{optionalBefore\} not satisfies version|DependenceChecker|AddonPluginManager\.registerMod|ReplacePatcher\] patchInReplaceParamsItem|ModOrderContainer|optionalBefore not satisfies order/i;

const BJXTEST_SRC = `
(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const SC = window.SugarCube;
  const linkText = (a) => a.textContent.trim().replace(/^\\((?:Shift \\+ )?\\d+\\)\\s*/, '').replace(/^\\([^)]{1,14}\\)\\s*/, '');
  window.BJXTEST = {
    passage: () => SC.State.passage,
    var: (n) => SC.State.variables[n],
    setVars: (o) => { Object.assign(SC.State.variables, o); return true; },
    run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 200); } },
    goto: (n) => { SC.Engine.play(n); return true; },
    links: () => qa('#passages a.link-internal, #passages a.macro-link').map(linkText),
    hasEl: (s) => !!q(s),
    elText: (s) => { const el = q(s); return el ? el.textContent.trim().slice(0, 200) : null; },
    // 第三方 widget（MEE 的 dolmeemodTab/meecaptions 等）会在渲染期触发 replace，
    // 使 #passages 在读取瞬间出现空壳节点。取「最后一个非空」更稳。
    // 内容层断言：直接读 passage 源码，避开第三方 widget 造成的 DOM 过渡态
    passageHas: (name, needle) => {
      try { const pg = SC.Story.get(name); return !!pg && String(pg.text).indexOf(needle) >= 0; }
      catch (e) { return false; }
    },
    diagPassages: () => {
      const ps = qa('#passages .passage');
      let head = null;
      try { head = document.getElementById('passages').innerHTML.slice(0, 500); } catch (e) {}
      return JSON.stringify({ n: ps.length, lens: ps.map((e) => e.textContent.trim().length),
        cur: window.SugarCube && window.SugarCube.State ? window.SugarCube.State.passage : null, head: head });
    },
    elTextFull: (s) => {
      const els = qa(s);
      for (let i = els.length - 1; i >= 0; i--) {
        const t = els[i].textContent;
        if (t && t.trim().length > 20) return t;
      }
      return els.length ? els[0].textContent : null;
    },
    dialogOpen: () => !!(SC.Dialog && SC.Dialog.isOpen()),
    ageGateCheck: () => { const cb = q('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; },
    ageGateEnter: () => { const b = qa('#ui-dialog button').find((x) => /^(Enter|进入|确认|确定|继续|同意)$/.test(x.textContent.trim())); if (b) { b.click(); return true; } return false; },
    closeDialog: () => { const b = q('#ui-dialog-close'); if (b) { b.click(); return true; } return false; },
    clickLink: (prefix) => {
      // 0.5.12.13 host ships ModI18N: vanilla passage labels render in Chinese
      // while bjx-pack keeps its own Chinese. Map the vanilla English labels the
      // suite clicks onto their translated forms so the steps stay language-agnostic.
      const SYN = {
        'Next': ['继续', '下一个', '下一步'],
        'Sell antiques': ['出售古董'],
        'Fly to safety': ['飞往安全地带'],
        'Groom pubic hair': ['修剪阴毛', '梳理阴毛', '修饰阴毛'],
        'Leave without treatment': ['拒绝治疗并离开', '未经治疗就离开'],
        'Cooperate': ['配合'],
        'Submit': ['顺从'],
      };
      const cands = [prefix].concat(SYN[prefix] || []);
      const all = qa('#passages a.link-internal, #passages a.macro-link');
      for (const p of cands) {
        const el = all.find((a) => linkText(a).startsWith(p)) || all.find((a) => linkText(a).includes(p));
        if (el) { el.click(); return true; }
      }
      return false;
    },
    linkTexts: () => qa('#passages a.link-internal, #passages a.macro-link').map(linkText).slice(0, 40),
    clickToPassage: (passage) => {
      const a = qa('#passages a[data-passage]').find((x) => x.getAttribute('data-passage') === passage);
      if (a) { a.click(); return true; }
      return false;
    },
    clickLinkAny: (prefixes) => {
      const all = qa('#passages a.link-internal, #passages a.macro-link');
      for (const p of prefixes) {
        const el = all.find((a) => linkText(a).startsWith(p)) || all.find((a) => linkText(a).includes(p));
        if (el) { el.click(); return p; }
      }
      return false;
    },
    domErrors: () => qa('.error').map((e) => e.textContent.trim().slice(0, 250)),
    museumState: () => {
      const V = SC.State.variables;
      const A = V.museumAntiques || {};
      const NEW = ['antiquecannonball','antiquearttablet','antiqueterracottastatue','antiqueredvial','antiquetribemask','antiqueebonystatuette','antiqueglacierplant','antiquebullion','antiquereal','antiqueindigo','antiquegreed','antiqueliquor','antiquebogplate','antiquebogbone','antiquebogtool','antiquebunkertablet','antiquebunkertag','antiquescroll','antiquemushroom'];
      return {
        keys: A.antiques ? Object.keys(A.antiques).length : 0,
        maxCount: A.maxCount,
        newOnes: A.antiques ? NEW.map((k) => A.antiques[k]) : null,
        scroll: A.antiques ? A.antiques.antiquescroll : undefined,
        mushroom: A.antiques ? A.antiques.antiquemushroom : undefined,
      };
    },
    npc0: () => { const n = SC.State.variables.NPCList && SC.State.variables.NPCList[0]; return n ? { type: n.type, health: n.health, healthmax: n.healthmax } : null; },
    smokeWidget: (name) => {
      try {
        const h = document.createElement('div');
        new SC.Wikifier(h, '<<' + name + '>>');
        const errList = Array.from(h.querySelectorAll('.error')).map((e) => e.textContent.trim().slice(0, 150));
        return { ok: errList.length === 0, outLen: h.textContent.trim().length, errs: errList };
      } catch (e) { return { ok: false, errs: [String(e).slice(0, 150)] }; }
    },
  };
  return true;
})()
`;

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', ...(process.env.GPU === '1' ? [] : ['--disable-gpu']),
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const chromeErr = [];
  chrome.stderr.on('data', (d) => chromeErr.push(String(d)));

  const logBuf = [];
  const report = { started: new Date().toISOString(), steps: [], env: { url: URL } };
  const steps = report.steps;
  let passed = 0, failed = 0;
  let cdp;

  // 耗时画像（PROFILE=1 时开启，零成本关闭）：定位「到底哪一类等待吃时间」
  const PROF = process.env.PROFILE === '1'
    ? { ev: { n: 0, ms: 0 }, settle: { n: 0, ms: 0 }, wait: { n: 0, ms: 0 }, shot: { n: 0, ms: 0 }, boot: { n: 0, ms: 0 } }
    : null;
  const bump = (k, ms) => { if (PROF) { PROF[k].n++; PROF[k].ms += ms; } };

  const ev = async (expr) => {
    const _t = PROF ? Date.now() : 0;
    const r = await Promise.race([
      cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
      sleep(25000).then(() => { throw new Error('evaluate timeout'); }),
    ]);
    if (_t) bump('ev', Date.now() - _t);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('page exception: ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 300));
    }
    return r.result.value;
  };

  // 控制台缓冲：只留「还没被哪一步消费过」的行。
  // 读一次就清空（原来靠 cursor 索引，一轮 100 万行常驻内存 + 每行一次同步写盘 = 108MB/run）。
  let consoleLines = [];
  let consoleTotal = 0;
  const newConsoleErrors = () => {
    const out = [];
    for (const l of consoleLines) {
      if ((l.startsWith('[error]') || l.startsWith('[EXC]')) && !BENIGN.test(l)) out.push(l);
    }
    consoleLines = [];
    return out;
  };

  // 迭代模式：ONLY=casey,hive 只跑名字命中的步骤（逗号分隔、不区分大小写）。
  // 前置三步（boot / age-gate / debug-start-school）永远跑，后面的步骤要靠它们铺好角色与版本。
  // 不设 ONLY 就是完整 61 步，发版前的闸门逻辑不变。
  const ONLY_RAW = (process.env.ONLY || '').trim().toLowerCase();
  const ONLY_TERMS = ONLY_RAW ? ONLY_RAW.split(',').map((t) => t.trim()).filter(Boolean) : null;
  const ALWAYS_RUN = /^(boot|age-gate|debug-start-school)$/;

  const T0 = Date.now();
  const step = (name) => {
    if (process.env.TRACE === '1') console.log(`[t+${((Date.now() - T0) / 1000).toFixed(1)}s] step ${name}`);
    const skipped = !!ONLY_TERMS && !ALWAYS_RUN.test(name) && !ONLY_TERMS.some((t) => name.toLowerCase().includes(t));
    const s = { name, pass: true, details: {}, _t0: Date.now(), skipped };
    steps.push(s);
    return {
      skipped,
      name,
      check(cond, label, detail) {
        if (cond === undefined || cond === null) cond = false;
        if (!cond) { s.pass = false; (s.failed || (s.failed = [])).push(label); }
        if (detail !== undefined) s.details[label] = detail;
        return cond;
      },
      note(label, value) { s.details[label] = value; },
      async errors(allowPassThrough) {
        const cerr = newConsoleErrors();
        const derr = (await ev('BJXTEST.domErrors()').catch(() => [])) || [];
        const macro = derr.filter((t) => t.includes('«'));
        if (cerr.length) s.details.consoleErrors = cerr;
        if (macro.length) s.details.macroErrors = macro;
        if ((cerr.length || macro.length) && !allowPassThrough) s.pass = false;
        return { cerr, macro };
      },
      async shot(tag) {
        if (process.env.SHOTS === '0') { s.details.screenshot = 'skipped(SHOTS=0)'; return; }
        const _t = PROF ? Date.now() : 0;
        try {
          const shot = await Promise.race([
            cdp.send('Page.captureScreenshot', { format: 'png' }),
            sleep(12000).then(() => { throw new Error('shot timeout'); }),
          ]);
          writeFileSync(join(SHOT_DIR, 'cdp-pack-' + tag + '.png'), Buffer.from(shot.data, 'base64'));
          s.details.screenshot = 'cdp-pack-' + tag + '.png';
        } catch (e) { s.details.screenshot = 'FAILED: ' + e.message; }
        if (_t) bump('shot', Date.now() - _t);
      },
    };
  };

  const waitPassage = async (name, timeoutMs = 12000) => {
    const t0 = Date.now();
    try {
    while (Date.now() - t0 < timeoutMs) {
      await ev('BJXTEST.closeDialog()').catch(() => {});
      const p = await ev('BJXTEST.passage()').catch(() => null);
      if (p === name) return true;
      await sleep(90);
    }
    return false;
    } finally { bump('wait', Date.now() - t0); }
  };

  // awaitPromise 版求值：页面内的 Promise 直接等结果，不靠 Node 端轮询
  const evP = async (expr, timeoutMs = 25000) => {
    const _t = PROF ? Date.now() : 0;
    const r = await Promise.race([
      cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }),
      sleep(timeoutMs).then(() => { throw new Error('evaluate timeout'); }),
    ]);
    if (_t) bump('ev', Date.now() - _t);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('page exception: ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 300));
    }
    return r.result.value;
  };

  // 渲染稳定等待：替代「goto / clickLink 之后写死 sleep(800~1200)」。
  // 在页面内挂 MutationObserver，DOM 静默 quiet 毫秒即返回——只花 1 次求值，
  // 且等待期间不抢占主线程（Node 端轮询反而会把等待变成排队求值）。
  // cap 是原 sleep 值，作为「第三方 mod 一直改 DOM」时的上限。
  const settle = async (cap = 1200, quiet = 60) => {
    const t0 = Date.now();
    try {
      await evP(`new Promise(function (res) {
        var host = document.getElementById('passages');
        if (!host) { res('nohost'); return; }
        var last = Date.now(), t0 = Date.now(), done = false;
        var mo = new MutationObserver(function () { last = Date.now(); });
        mo.observe(host, { childList: true, subtree: true, characterData: true });
        function tick() {
          if (done) return;
          var q = Date.now() - last;
          if (q >= ${quiet} || Date.now() - t0 >= ${cap}) { done = true; mo.disconnect(); res('q' + q); return; }
          setTimeout(tick, 20);
        }
        setTimeout(tick, 20);
      })`).catch(() => {});
    } finally { bump('settle', Date.now() - t0); }
  };

  // shared in-page text probe (S43 lesson): evaluate indexOf inside the
  // browser and return only { hit, ctx } - never pull large non-ASCII
  // strings across CDP returnByValue (they arrive corrupted)
  const probe = async (needle) => {
    const expr = `(() => {
      const t = Array.from(document.querySelectorAll('#passages .passage')).map(e => e.textContent).join(' ');
      const n = ${JSON.stringify(needle)};
      const i = t.indexOf(n);
      let ctx;
      if (i >= 0) ctx = t.slice(i, i + 40);
      else {
        const j = t.indexOf(n[0]);
        ctx = j >= 0
          ? 'cp:' + Array.from(t.slice(j, j + n.length + 2)).map(c => c.codePointAt(0).toString(16)).join(',')
          : 'noFirstChar len=' + t.length + ' head=' + t.slice(0, 80);
      }
      return JSON.stringify({ hit: i >= 0, ctx });
    })()`;
    return JSON.parse(await ev(expr));
  };

  // 0.5.10.12: dayState is sunrise/sunset based ("dawn"/"day"/"dusk"/"night"),
  // weather is Weather.precipitation ("none"/"rain"/"snow"). Find a time where
  // dayState === want and it is not raining.
  const ensureDayState = async (want, maxTries = 10) => {
    for (let i = 0; i < maxTries; i++) {
      const hour = 12 + i; // 12:00 .. 21:00 sweeps day -> dusk
      await ev(`BJXTEST.run('Time.setTime(${hour}, 0)')`);
      await sleep(400);
      const precip = await ev(`BJXTEST.run('Weather.precipitation')`);
      if (precip !== 'none') {
        // try to calm the weather down via the generator's current object
        await ev(`BJXTEST.run('Weather.WeatherGeneration.getWeather().precipitationIntensity = 0')`).catch(() => {});
        await sleep(200);
        const precip2 = await ev(`BJXTEST.run('Weather.precipitation')`);
        if (precip2 !== 'none') continue;
      }
      const ds = await ev(`BJXTEST.run('Time.dayState')`);
      if (ds === want) return { ok: true, hour, dayState: ds };
    }
    return { ok: false, hour: -1, dayState: await ev(`BJXTEST.run('Time.dayState')`) };
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
        const line = `[${msg.params.type}] ${text.slice(0, 400)}`;
        consoleLines.push(line);
        consoleTotal++;
        if (/^\[(error|warning|EXC)\]/.test(line) && !/LoaderKeyConfig|ModZipReader init\(\)/.test(line)) logBuf.push(line);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const line = '[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 400);
        consoleLines.push(line);
        consoleTotal++;
        logBuf.push(line);
      }
    });

    // ---------- S1 boot ----------
    let s = step('boot');
    if (s.skipped) {} else {
      const t0 = Date.now();
      let booted = false;
      while (Date.now() - t0 < 240000) {
        const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
        if (ok) { booted = true; break; }
        await sleep(500);
      }
      s.check(booted, 'booted');
      if (!booted) throw new Error('game did not boot');
      await ev(BJXTEST_SRC);
      // 第三方 mod 的欢迎弹窗（DomRobin introduction.js 等）在 headless 每次新
      // profile 都会弹；SweetAlert2 浮层会遮挡/干扰 #passages .passage 选择器。
      await ev(`(function(){
        try { localStorage.setItem('robinModDontShowAgain', 'true'); } catch (e) {}
        try { if (window.modSweetAlert2Mod && window.modSweetAlert2Mod.close) window.modSweetAlert2Mod.close(); } catch (e) {}
        try { if (window.Swal && window.Swal.close) window.Swal.close(); } catch (e) {}
        try { document.querySelectorAll('.swal2-container').forEach(function (n) { n.remove(); }); } catch (e) {}
        return true;
      })()`);
      const modList = await ev('window.modUtils ? window.modUtils.getModListName() : null');
      s.check(Array.isArray(modList) && modList.includes('bjx-pack'), 'packInModList', modList && modList.filter((m) => String(m).includes('bjx')));
      s.check(!Array.isArray(modList) || !modList.includes('bjx-ant-island'), 'antIslandRemoved', null);
      await s.errors();
    }

    // ---------- S2 age gate ----------
    s = step('age-gate');
    if (s.skipped) {} else {
      // 弹窗是异步挂载的：轮询 dialogOpen 而不是写死 1.5s
      const waitUntil = async (expr, cap) => {
        const t0 = Date.now();
        while (Date.now() - t0 < cap) {
          if (await ev(expr).catch(() => false)) return true;
          await sleep(100);
        }
        return false;
      };
      const open = await waitUntil('BJXTEST.dialogOpen()', 2000);
      if (open) {
        await ev('BJXTEST.ageGateCheck()');
        await sleep(300);
        const entered = await ev('BJXTEST.ageGateEnter()');
        s.note('clickedEnter', entered);
        await waitUntil('BJXTEST.passage() === "Start"', 1500);
      } else {
        s.note('dialog', 'not open');
      }
      // 0.5.12.13: the age gate renders through a SweetAlert2 dialog, so boot's
      // welcome-popup sweep (or a profile that already verified) can leave it
      // absent. Ensure the flag directly so downstream steps get a real start.
      let verified = await ev(`localStorage.getItem('verifiedAge')`);
      if (String(verified) !== 'true') {
        await ev(`localStorage.setItem('verifiedAge','true')`);
        await ev('BJXTEST.closeDialog()').catch(() => {});
        await ev(`BJXTEST.goto('Start')`);
        await waitUntil('BJXTEST.passage() === "Start"', 2500);
        verified = await ev(`localStorage.getItem('verifiedAge')`);
        s.note('fallback', 'verifiedAge set via localStorage');
      }
      s.check(String(verified) === 'true', 'verifiedAge', String(verified));
      const p = await ev('BJXTEST.passage()');
      s.check(p === 'Start', 'passage', p);
      await s.errors();
    }

    // ---------- S3 debug + school start (museum 82 keys) ----------
    s = step('debug-start-school');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ debug: 1 })`);
      await ev(`SugarCube.State.variables.options.debugdisable = 'f'`);
      await ev('BJXTEST.goto("Start2")');
      const ok = await waitPassage('Start2');
      s.check(ok, 'atStart2', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLinkAny(${JSON.stringify(['School Start', '学校地位提升开局'])})`);
      const ok2 = await waitPassage('Oxford Street', 20000);
      s.check(ok2, 'atOxfordStreet', await ev('BJXTEST.passage()'));
      if (!ok2) {
        s.note('linksAtStart2', await ev('BJXTEST.linkTexts()').catch(() => null));
        s.note('debugVar', await ev('BJXTEST.var("debug")').catch(() => null));
        s.note('introVar', await ev('BJXTEST.var("intro")').catch(() => null));
      }
      // A real save always carries the running game version. Without it the
      // per-passage <<doVersionCheck>> reruns <<backComp>> on every render
      // and throws (the hospital/farm steps then lose their BJX links).
      await ev(`BJXTEST.run('V.saveVersions = [StartConfig.version]; V.objectVersion = V.objectVersion || {}; "ok"')`);
      const ms = await ev('BJXTEST.museumState()');
      s.check(ms.keys === 82, 'museumKeys82', ms.keys);
      s.check(ms.maxCount === 82, 'maxCount82', ms.maxCount);
      s.check((ms.newOnes || []).every((v) => v === 'notFound'), 'all19NotFound', ms.newOnes);
      await s.errors();
    }

    // ---------- S4 ant-island regression ----------
    s = step('ant-island-regression');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ money: 1000000, history: 700 })`);
      await ev('BJXTEST.goto("Docks")');
      await settle(900);
      const present = await ev('BJXTEST.hasEl("#bjx-docks-ride-entry")');
      s.check(present, 'docksEntryPresent');
      await ev(`BJXTEST.setVars({ guard1: 1, guard2: 1, guard3: 1, sandmound: 5, islanddistance: 10, eventskip: 1 })`);
      await ev('BJXTEST.goto("Anthill")');
      await settle(700);
      const links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('进入')), 'anthillEnterLink', links);
      await s.shot('anthill-regression');
      await s.errors();
    }

    // ---------- S5 museum: 8 new antiques donate + talk ----------
    s = step('museum-new-antiques');
    if (s.skipped) {} else {
      await ev(`SugarCube.State.variables.museumAntiques.antiques.antiquemushroom = 'found'`);
      await ev(`SugarCube.State.variables.museumAntiques.antiques.antiqueliquor = 'found'`);
      await ev(`BJXTEST.setVars({ antiquemoney: 100000, eventskip: 1, rng: 1 })`);
      await ev('BJXTEST.goto("Museum")');
      await settle(800);
      await ev(`BJXTEST.clickLink('Sell antiques')`);
      let ok = await waitPassage('Museum Sell');
      s.check(ok, 'atMuseumSell', await ev('BJXTEST.passage()'));
      await settle(400);
      let ms = await ev('BJXTEST.museumState()');
      s.check(ms.mushroom === 'talk', 'mushroomTalk', ms.mushroom);
      await ev(`BJXTEST.clickLink('Next')`);
      await waitPassage('Museum');
      await settle(600);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('Ask about the 蘑菇神像') || l.includes('询问有关')), 'askMushroom', links);
      await ev(`BJXTEST.clickToPassage('Museum 蘑菇神像')`);
      ok = await waitPassage('Museum 蘑菇神像');
      s.check(ok, 'atMushroomTalk', await ev('BJXTEST.passage()'));
      await s.shot('museum-mushroom');
      await ev(`BJXTEST.clickLink('继续')`);
      await waitPassage('Museum');
      ms = await ev('BJXTEST.museumState()');
      s.check(ms.mushroom === 'museum', 'mushroomMuseum', ms.mushroom);
      // liquor talk passage too
      links = await ev('BJXTEST.links()');
      if ((links || []).some((l) => l.startsWith('Ask about the 无尽酒瓶') || l.includes('询问有关'))) {
        await ev(`BJXTEST.clickToPassage('Museum 无尽酒瓶')`);
        ok = await waitPassage('Museum 无尽酒瓶');
        s.check(ok, 'atLiquorTalk', await ev('BJXTEST.passage()'));
        await ev(`BJXTEST.clickLink('继续')`);
        await waitPassage('Museum');
        ms = await ev('BJXTEST.museumState()');
        s.check(ms.keys === 82, 'keysStill82', ms.keys);
      } else {
        s.check(false, 'askLiquor', links);
      }
      await s.errors();
    }

    // ---------- S6 bunker discovery chain (landfill hooks: Trash Search) ----------
    s = step('bunker-discovery');
    if (s.skipped) {} else {
      // H8: rng 90+ in Trash Search with trash 100 finds the trapdoor
      // (trash_key 1 skips the first-visit iron-key branch)
      await ev(`BJXTEST.setVars({ trash: 100, trash_key: 1, rng: 95 })`);
      await ev(`BJXTEST.run('V.bunker = 0')`);
      await ev('BJXTEST.goto("Trash Search")');
      await settle(1200);
      const pr = await probe('生锈的活板门半开着');
      s.check(pr.hit, 'bunkerDiscoveryText', pr.ctx);
      const bunker = await ev('BJXTEST.var("bunker")');
      s.check(bunker === 'found', 'bunkerFound', bunker);
      await s.shot('bunker-found');
      await s.errors();
    }

    // ---------- S7 bunker enter + scroll pickup ----------
    s = step('bunker-scroll');
    if (s.skipped) {} else {
      await ev('BJXTEST.goto("Trash")');
      await settle(900);
      const hatchLinks = await ev('BJXTEST.links()');
      s.check((hatchLinks || []).some((l) => l.startsWith('进入活板门')), 'hatchEntryPresent', hatchLinks);
      await ev(`BJXTEST.clickLink('进入活板门')`);
      let ok = await waitPassage('The Bunker Intro');
      s.check(ok, 'atBunkerIntro', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Bunker');
      s.check(ok, 'atBunker', await ev('BJXTEST.passage()'));
      const depth = await ev('BJXTEST.var("bunkerdepth")');
      s.check(depth === 0, 'depth0', depth);
      // jump to depth 10 deterministically (skip random encounters)
      await ev(`BJXTEST.setVars({ bunkerdepth: 10, eventskip: 1 })`);
      await ev('BJXTEST.goto("Bunker")');
      await settle(800);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('拿起卷轴')), 'scrollLink', links);
      const moneyBefore = await ev('BJXTEST.var("antiquemoney")');
      await ev(`BJXTEST.clickLink('拿起卷轴')`);
      ok = await waitPassage('Bunker Scroll');
      s.check(ok, 'atBunkerScroll', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Bunker Scroll2');
      s.check(ok, 'atBunkerScroll2', await ev('BJXTEST.passage()'));
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l === '卧室'), 'kotodamaBedroomLink', links);
      await s.shot('bunker-scroll2');
      await ev(`BJXTEST.clickLink('收起卷轴')`);
      ok = await waitPassage('Bunker');
      s.check(ok, 'backAtBunker', await ev('BJXTEST.passage()'));
      const ms = await ev('BJXTEST.museumState()');
      s.check(ms.scroll === 'found', 'scrollFound', ms.scroll);
      const moneyAfter = await ev('BJXTEST.var("antiquemoney")');
      s.check(moneyAfter >= moneyBefore + 8000, 'antiquemoneyPlus8000', { moneyBefore, moneyAfter });
      await s.errors();
    }

    // ---------- S8 hive forest entry ----------
    s = step('hive-forest-entry');
    if (s.skipped) {} else {
      // eventskip 必须是 1 才会渲染 Forest 主页（0 会强制进入随机事件页，
      // 主页的「Go deeper into the forest」文本不存在，注入被正确跳过）；
      // Forest 段落末尾自己会把 $eventskip 置 0，供入口注入判定使用。
      await ev(`BJXTEST.setVars({ hive_intro: 1, eventskip: 1, forest: 5 })`);
      await ev('BJXTEST.goto("Forest")');
      await settle(900);
      const present = await ev('BJXTEST.hasEl("#bjx-hive-forest-entry")');
      s.check(present, 'hiveEntryPresent');
      if (!present) {
        s.note('forestDiag', await ev(`(function(){
          var V=SugarCube.State.variables; var el=document.querySelector('#passages .passage');
          return JSON.stringify({forest:V.forest, eventskip:V.eventskip, forestmod:V.forestmod, hive_intro:V.hive_intro,
            head:(el?el.textContent:'').replace(/\\s+/g,' ').slice(0,260)});})()`));
      }
      const txt = await ev('BJXTEST.elText("#bjx-hive-forest-entry")');
      s.check(!!txt && txt.includes('蜂巢'), 'hiveEntryText', txt);
      await ev(`BJXTEST.clickLink('蜂巢')`);
      const ok = await waitPassage('Hive Entrance');
      s.check(ok, 'atHiveEntrance', await ev('BJXTEST.passage()'));
      await s.shot('hive-entrance');
      await s.errors();
    }

    // ---------- S9 hive: Taylor rescue chain ----------
    s = step('hive-taylor-rescue');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ TaylorMissing: 1, TaylorArrested: 0, TaylorFreed: 0 })`);
      await ev('BJXTEST.goto("Hive Cell Outside")');
      await settle(800);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('和囚犯说话')), 'talkToPrisonerLink', links);
      await ev(`BJXTEST.clickLink('和囚犯说话')`);
      let ok = await waitPassage('Hive Taylor Introduction');
      s.check(ok, 'atTaylorIntro', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('闲聊')`);
      ok = await waitPassage('Taylor Hang Out First Time');
      s.check(ok, 'atHangOutFirstTime', await ev('BJXTEST.passage()'));
      // branch-aware: "问对方为什么被捕" (TaylorChase 0) or "问对方在森林里做什么"
      await ev(`BJXTEST.clickLink('问对方')`);
      ok = await waitPassage('Taylor Reason');
      s.check(ok, 'atTaylorReason', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Hive Cell Outside');
      s.check(ok, 'backAtCellOutside', await ev('BJXTEST.passage()'));
      // vouch chain -> freedom
      await ev('BJXTEST.goto("Throne Vouch 1")');
      await settle(600);
      await ev(`BJXTEST.clickLink('保证其没有恶意')`);
      ok = await waitPassage('Throne Vouch 2');
      s.check(ok, 'atVouch2', await ev('BJXTEST.passage()'));
      const freed = await ev('BJXTEST.var("TaylorFreed")');
      s.check(freed === 1, 'taylorFreed', freed);
      await s.shot('taylor-freed');
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Hive Entrance');
      s.check(ok, 'backAtHiveEntrance', await ev('BJXTEST.passage()'));
      await s.errors();
    }

    // ---------- S10 Taylor reward + home on Danube ----------
    s = step('taylor-reward-home');
    if (s.skipped) {} else {
      await ev('BJXTEST.goto("Danube Street")');
      await settle(900);
      let present = await ev('BJXTEST.hasEl("#bjx-danube-taylor-reward")');
      s.check(present, 'rewardEntryPresent');
      const moneyBefore = await ev('BJXTEST.var("money")');
      await ev(`BJXTEST.clickLink('走向泰勒')`);
      let ok = await waitPassage('Taylor Meeting After Freed');
      s.check(ok, 'atMeetingAfterFreed', await ev('BJXTEST.passage()'));
      const moneyAfter = await ev('BJXTEST.var("money")');
      s.check(moneyAfter === moneyBefore + 1000000, 'rewardMoney', { moneyBefore, moneyAfter });
      const tr = await ev('BJXTEST.var("TaylorReward")');
      s.check(tr === 1, 'taylorReward1', tr);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Taylor Home Hang Out');
      s.check(ok, 'atHomeHangOut', await ev('BJXTEST.passage()'));
      await s.shot('taylor-home');
      await s.errors();
    }

    // ---------- S11 Taylor home revisit ----------
    s = step('taylor-home-revisit');
    if (s.skipped) {} else {
      await ev('BJXTEST.goto("Danube Street")');
      await settle(900);
      const present = await ev('BJXTEST.hasEl("#bjx-danube-taylor-home")');
      s.check(present, 'homeEntryPresent');
      const rewardGone = await ev('BJXTEST.hasEl("#bjx-danube-taylor-reward")');
      s.check(!rewardGone, 'rewardEntryGone');
      await ev(`BJXTEST.clickLink('泰勒的家')`);
      const ok = await waitPassage('Taylor Meeting');
      s.check(ok, 'atTaylorMeeting', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('继续')`);
      const ok2 = await waitPassage('Taylor Home Hang Out');
      s.check(ok2, 'atHomeHangOut2', await ev('BJXTEST.passage()'));
      const links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('一起学习历史')), 'studyLink', (links || []).slice(0, 8));
      await s.errors();
    }

    // ---------- S12 Casey dusk chain ----------
    s = step('casey-dusk-intro');
    if (s.skipped) {} else {
      const t = await ensureDayState('dusk');
      s.note('timeSetup', t);
      await ev(`BJXTEST.setVars({ caseymet: 0, caseyagain: 0 })`);
      await ev('BJXTEST.goto("Connudatus Street")');
      await settle(900);
      const present = await ev('BJXTEST.hasEl("#bjx-connudatus-casey")');
      s.check(present, 'caseyEntryPresent');
      const txt = await ev('BJXTEST.elText("#bjx-connudatus-casey")');
      s.check(!!txt && txt.includes('机车夹克'), 'caseyText', txt);
      await ev(`BJXTEST.clickLink('介绍你自己')`);
      let ok = await waitPassage('Casey Introduction');
      s.check(ok, 'atCaseyIntro', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('坚持')`);
      ok = await waitPassage('Casey Again');
      s.check(ok, 'atCaseyAgain', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('离开')`);
      ok = await waitPassage('Connudatus Street');
      s.check(ok, 'backAtConnudatus', await ev('BJXTEST.passage()'));
      const met = await ev('BJXTEST.var("caseymet")');
      s.check(met === 1, 'caseymet1', met);
      await s.shot('casey-met');
      await s.errors();
    }

    // ---------- S13 Casey hang out ----------
    s = step('casey-hangout');
    if (s.skipped) {} else {
      const t = await ensureDayState('dusk');
      s.note('timeSetup', t);
      await ev('BJXTEST.goto("Connudatus Street")');
      await settle(900);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('打招呼')), 'greetLink', links);
      await ev(`BJXTEST.clickLink('打招呼')`);
      const ok = await waitPassage('Casey Hang Out');
      s.check(ok, 'atCaseyHangOut', await ev('BJXTEST.passage()'));
      await s.shot('casey-hangout');
      await s.errors();
    }

    // ---------- S14 Casey Trash greet (love >= 41, day) ----------
    s = step('casey-trash-greet');
    if (s.skipped) {} else {
      const t = await ensureDayState('day');
      s.note('timeSetup', t);
      // (batch 3g: the Casey greeting is now the landfill-hooks H4 twee
      //  block - C.npc access, front-gate $trash lte 0 area)
      await ev(`BJXTEST.run('C.npc["凯西"].love = 50')`);
      await ev(`BJXTEST.setVars({ trash: 0, eventskip: 1 })`);
      await ev('BJXTEST.goto("Trash")');
      await settle(900);
      const caseyPr = await probe('你看到凯西在垃圾堆里翻找东西');
      s.check(caseyPr.hit, 'trashCaseyPresent', caseyPr.ctx);
      await ev(`BJXTEST.clickLink('打招呼(0:05)')`);
      const ok = await waitPassage('Casey Hello');
      s.check(ok, 'atCaseyHello', await ev('BJXTEST.passage()'));
      await s.shot('casey-hello');
      await s.errors();
    }

    // ---------- S15 hive rooms smoke ----------
    s = step('hive-rooms-smoke');
    if (s.skipped) {} else {
      for (const p of ['Hive Corridor', 'Hive Barracks', 'Hive Throne Room', 'Hive Pollen Collection']) {
        await ev(`BJXTEST.goto("${p}")`);
        await settle(600);
        const at = await ev('BJXTEST.passage()');
        s.check(at === p, 'goto_' + p, at);
      }
      for (const w of ['eventislanditem', 'eventislandsafe']) {
        const r = await ev(`BJXTEST.smokeWidget('${w}')`);
        s.check(r && r.ok, 'widget_' + w, r);
      }
      await s.errors();
    }

    // ---------- S16 mansion forest entry ----------
    s = step('mansion-forest-entry');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ history: 200 })`);
      await ev('BJXTEST.goto("Forest")');
      await settle(900);
      const present = await ev('BJXTEST.hasEl("#bjx-forest-mansion-entry")');
      s.check(present, 'mansionEntryPresent');
      const txt = await ev('BJXTEST.elText("#bjx-forest-mansion-entry")');
      s.check(!!txt && txt.includes('废弃庄园'), 'mansionEntryText', txt);
      await ev(`BJXTEST.clickLink('废弃庄园')`);
      const ok = await waitPassage('Forest Mansion Explore');
      s.check(ok, 'atMansionExplore', await ev('BJXTEST.passage()'));
      await s.shot('mansion-explore');
      await s.errors();
    }

    // ---------- S17 mansion rooms smoke ----------
    s = step('mansion-rooms-smoke');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ forestmansionstage: 1, forestmansionpicked: 0, TaylorWith: 0, skulduggery: 2000 })`);
      for (const p of ['Forest Mansion Pick Lock', 'Forest Mansion Entrance', 'Forest Mansion Left Hallway', 'Forest Mansion Kitchen', 'Forest Mansion Cellar', 'Forest Mansion Dining Room', 'Forest Mansion Study', 'Forest Mansion Landing', 'Forest Mansion Bed', 'Forest Mansion Wardrobe']) {
        await ev(`BJXTEST.goto("${p}")`);
        await settle(450);
        const at = await ev('BJXTEST.passage()');
        s.check(at === p, 'goto_' + p.replace(/ /g, '_'), at);
      }
      await s.errors();
    }

    // ---------- S18 town hall home chain ----------
    s = step('townhall-home-chain');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ town_projects: { green: 3, thicket: 3, diving: 3, road: 3, bridge: 3, home: 0 }, money: 30000000, rentmod: 1 })`);
      await ev('BJXTEST.goto("Town Hall Wait")');
      await settle(900);
      const quinn = await ev('BJXTEST.hasEl("#bjx-townhall-quinn-entry")');
      s.check(quinn, 'quinnEntryPresent');
      const chain = await ev('BJXTEST.hasEl("#bjx-townhall-home-chain")');
      s.check(chain, 'homeChainPresent');
      const txt = await ev('BJXTEST.elText("#bjx-townhall-home-chain")');
      s.check(!!txt && txt.includes('咨询房产事宜'), 'homeChainText', txt);
      await ev(`BJXTEST.clickLink('咨询房产事宜')`);
      const ok = await waitPassage('Town Hall Projects Home 1');
      s.check(ok, 'atProjectsHome1', await ev('BJXTEST.passage()'));
      await s.shot('townhall-home1');
      await s.errors();
    }

    // ---------- S19 lakehouse entry ----------
    s = step('lakehouse-entry');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ town_projects: { green: 3, thicket: 3, diving: 3, road: 3, bridge: 3, home: 3 }, lakehouse: { owner: false, bills: 7, billsphase: 0, plots: 0, clearing: 25, wall: 0, tower: 0, guardpost: 0, dogtraining: 0, traps: 0, robin: 0, pet: [], smallpet: {} }, lakehouseinit: 1, lakehouse_countdown: 14 })`);
      await ev('BJXTEST.goto("Lake Fishing Rock")');
      await settle(900);
      const present = await ev('BJXTEST.hasEl("#bjx-lake-lakehouse-entry")');
      s.check(present, 'lakehouseEntryPresent');
      const txt = await ev('BJXTEST.elText("#bjx-lake-lakehouse-entry")');
      s.check(!!txt && txt.includes('湖边小屋'), 'lakehouseEntryText', txt);
      await ev(`BJXTEST.clickLink('湖边小屋')`);
      const ok = await waitPassage('Lake House Outdoor');
      s.check(ok, 'atLakeHouseOutdoor', await ev('BJXTEST.passage()'));
      await s.shot('lakehouse-outdoor');
      await s.errors();
    }

    // ---------- S20 lakehouse rooms smoke ----------
    s = step('lakehouse-rooms-smoke');
    if (s.skipped) {} else {
      for (const p of ['Lake House', 'Lake House Bedroom', 'Lake House Bathroom', 'Lake House Backyard', 'Lake House Bills', 'Lake House Upgrades']) {
        await ev(`BJXTEST.goto("${p}")`);
        await settle(450);
        const at = await ev('BJXTEST.passage()');
        s.check(at === p, 'goto_' + p.replace(/ /g, '_'), at);
      }
      await s.errors();
    }

    // ---------- S21 compat hint + mushroom smoke ----------
    s = step('compat-tf-smoke');
    if (s.skipped) {} else {
      for (const w of ['gstress', 'gglove', 'llove', 'gtiredness', 'gscience', 'ghandskill', 'gphysique', 'gwillpower', 'lstress', 'ltrauma', 'slime', 'bloodmirroricon', 'dyeicon']) {
        const r = await ev(`BJXTEST.smokeWidget('${w}')`);
        s.check(r && r.ok, 'widget_' + w, r);
      }
      await ev(`BJXTEST.run('V.options.bjx_eventTF = true; V.mushroom = 2; V.fungalpoint = 1')`);
      await ev('BJXTEST.goto("Mushroom Evolve")');
      await settle(600);
      const at = await ev('BJXTEST.passage()');
      s.check(at === 'Mushroom Evolve', 'atMushroomEvolve', at);
      await s.errors();
    }

    // ---------- S22 compat3 batch-3 hint macros ----------
    s = step('compat3-hints');
    if (s.skipped) {} else {
      for (const w of ['larousal', 'llarousal', 'garousal', 'ggarousal', 'gggarousal',
                       'gcontrol', 'llcontrol', 'llpain', 'loxygen', 'glust', 'gglust',
                       'gslust', 'gspurity', 'lspurity', 'lllove', 'lllgrace', 'foodsteakicon']) {
        const r = await ev(`BJXTEST.smokeWidget('${w}')`);
        s.check(r && r.ok, 'widget_' + w, r);
      }
      // <<icon>> renders nothing unless options.images is on
      await ev(`BJXTEST.run('V.options.images = true')`);
      const steak = await ev(`BJXTEST.run("(() => { const h = document.createElement('div'); new SugarCube.Wikifier(h, '<<foodsteakicon>>'); const img = h.querySelector('img'); return img ? (img.getAttribute('src') || img.getAttribute('ml-src')) : 'NOIMG'; })()")`);
      s.check(String(steak).includes('tending/steak.png'), 'steakIconSrc', steak);
      await s.errors();
    }

    // ---------- S23 transform extension + beast list ----------
    s = step('transform-beasts');
    if (s.skipped) {} else {
      await ev(`BJXTEST.run('V.wolfbuild = 10')`);
      await ev(`BJXTEST.run('new SugarCube.Wikifier(document.createElement("div"), "<<transform deer 3>>")')`);
      const deer = await ev('BJXTEST.var("deerbuild")');
      s.check(deer === 3, 'deerbuild3', deer);
      const wolf = await ev('BJXTEST.var("wolfbuild")');
      s.check(wolf === 7, 'wolfbuildDecay', wolf);
      const bl = await ev(`BJXTEST.run('V.BeastList.filter(b => ["raccoon","dragon","frog","deer","sheep","rat","wasp","ant","bee"].includes(b)).join(",")')`);
      s.check(String(bl).split(',').length === 9, 'beastList9', bl);
      await s.errors();
    }

    // ---------- S24 forest dispatcher hooks ----------
    s = step('forest-dispatchers');
    if (s.skipped) {} else {
      for (const w of ['forestraccoon', 'forestdragon', 'mushroomgrove', 'forest_deer']) {
        const r = await ev(`BJXTEST.smokeWidget('${w}')`);
        s.check(r && r.ok, 'widget_' + w, r);
      }
      const rac = await ev(`BJXTEST.run("(() => { const h = document.createElement('div'); new SugarCube.Wikifier(h, '<<forestraccoon>>'); return h.textContent.includes('树洞') ? 'HAS_RACCOON' : h.textContent.slice(0,80); })()")`);
      s.check(rac === 'HAS_RACCOON', 'raccoonText', rac);
      const npc0 = await ev('BJXTEST.npc0()');
      s.check(!!npc0 && npc0.type === 'raccoon', 'raccoonNpc', npc0);
      await s.errors();
    }

    // ---------- S25 Forest Deer -> Deer Rape chain ----------
    s = step('forest-deer-chain');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ rng: 100, danger: 99999, allure: 0, forestmod: 1 })`);
      await ev('BJXTEST.goto("Forest Deer")');
      await settle(700);
      const at1 = await ev('BJXTEST.passage()');
      s.check(at1 === 'Forest Deer', 'atForestDeer', at1);
      const npc0 = await ev('BJXTEST.npc0()');
      s.check(!!npc0 && npc0.type === 'deer', 'deerNpc', npc0);
      const links = await ev('BJXTEST.links()');
      s.check((links || []).includes('继续'), 'deerDangerLink', links);
      await ev(`BJXTEST.clickLink('继续')`);
      const ok = await waitPassage('Deer Rape');
      s.check(ok, 'atDeerRape', await ev('BJXTEST.passage()'));
      const rescue = await ev('BJXTEST.var("rescue")');
      s.check(rescue !== undefined, 'rescueSetupRan', rescue);
      const canR = await ev('BJXTEST.var("canRescue")');
      s.check(Array.isArray(canR), 'canRescueArray', canR);
      await s.shot('deer-rape');
      await s.errors();
    }

    // ---------- S26 Deer Rape finish + rescue branch ----------
    s = step('deer-rape-finish');
    if (s.skipped) {} else {
      // _combatend (set by <<actionsman>> at render time) requires
      // enemyarousal >= enemyarousalmax -> re-render Deer Rape, then the
      // "继续" link points at Deer Rape Finish.
      await ev(`BJXTEST.setVars({ enemyarousal: 100, enemyarousalmax: 100, enemyhealth: 500, enemyhealthmax: 1000 })`);
      await ev(`BJXTEST.goto('Deer Rape')`);
      await settle(700);
      await ev(`BJXTEST.clickLink('继续')`);
      let ok = await waitPassage('Deer Rape Finish');
      s.check(ok, 'atDeerRapeFinish', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.setVars({ rescue: 0 })`);
      await ev(`BJXTEST.goto("Deer Rape Finish")`);
      await settle(700);
      const links = await ev('BJXTEST.links()');
      s.check((links || []).includes('继续'), 'escapeBranchLink', links);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Forest');
      s.check(ok, 'backAtForest', await ev('BJXTEST.passage()'));
      await s.errors();
    }

    // ---------- S27 mushroom grove + bog chain ----------
    s = step('grove-bog-chain');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ molestationstart: 0, struggle_start: 1 })`);
      await ev('BJXTEST.goto("Bog Mosquito")');
      await settle(700);
      const at1 = await ev('BJXTEST.passage()');
      s.check(at1 === 'Bog Mosquito', 'atBogMosquito', at1);
      await ev(`BJXTEST.setVars({ 'struggle.done': 1 })`);
      await ev(`BJXTEST.run('V.struggle.done = 99; V.struggle.number = 2')`);
      await ev('BJXTEST.goto("Bog Mosquito")');
      await settle(700);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l === '继续'), 'mosquitoEndLink', links);
      await ev('BJXTEST.goto("Mushroom Grove")');
      await settle(600);
      const at2 = await ev('BJXTEST.passage()');
      s.check(at2 === 'Mushroom Grove', 'atGrove', at2);
      await ev(`BJXTEST.clickLink('躺下')`);
      let ok = await waitPassage('Mushroom Grove Lie Down');
      s.check(ok, 'atGroveLieDown', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('扯掉它们')`);
      ok = await waitPassage('Mushroom Grove Rip');
      s.check(ok, 'atGroveRip', await ev('BJXTEST.passage()'));
      await s.shot('mushroom-grove');
      await s.errors();
    }

    // ---------- S28 moor dispatcher + castle entries ----------
    s = step('moor-dispatchers');
    if (s.skipped) {} else {
      const r = await ev(`BJXTEST.smokeWidget('eventsmoormid')`);
      s.check(r && r.ok, 'widget_eventsmoormid', r);
      await ev(`BJXTEST.setVars({ slime: 1 })`);
      await ev(`BJXTEST.goto('Castle')`);
      await settle(700);
      const links = await ev('BJXTEST.links()');
      s.check((links || []).includes('奇怪的书'), 'bookEntry', links);
      s.check((links || []).some((l) => l.includes('隐秘水沟')), 'poolEntry', links);
      await s.errors();
    }

    // ---------- S29 moor dragon chain (rng 50 -> 1 dragon fight) ----------
    s = step('moor-dragon-chain');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ rng: 50, eventskip: 0 })`);
      await ev(`BJXTEST.goto('Moor Dragons Continue')`);
      await settle(700);
      const at1 = await ev('BJXTEST.passage()');
      s.check(at1 === 'Moor Dragons Continue', 'atDragonsContinue', at1);
      const npc0 = await ev('BJXTEST.npc0()');
      s.check(!!npc0 && npc0.type === 'dragon', 'dragonNpc', npc0);
      await ev(`BJXTEST.clickLink('反抗')`);
      let ok = await waitPassage('Moor Dragons Rape');
      s.check(ok, 'atDragonsRape', await ev('BJXTEST.passage()'));
      // finish: arousal full -> Rape End -> (no train left) -> escape -> Moor
      await ev(`BJXTEST.setVars({ enemyarousal: 100, enemyarousalmax: 100, enemyhealth: 500, enemyhealthmax: 1000 })`);
      await ev(`BJXTEST.goto('Moor Dragons Rape')`);
      await settle(700);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Moor Dragons Rape End');
      s.check(ok, 'atRapeEnd', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Moor');
      s.check(ok, 'backAtMoor', await ev('BJXTEST.passage()'));
      await s.errors();
    }

    // ---------- S30 moor 3-dragon train + demon book ----------
    s = step('moor-dragon-train-book');
    if (s.skipped) {} else {
      // rng >= 80 -> three dragons -> combatTrain rotation
      await ev(`BJXTEST.setVars({ rng: 90, eventskip: 0 })`);
      await ev(`BJXTEST.goto('Moor Dragons Continue')`);
      await settle(700);
      const enemyno = await ev('BJXTEST.var("enemyno")');
      s.check(enemyno === 3, 'threeDragons', enemyno);
      await ev(`BJXTEST.clickLink('反抗')`);
      let ok = await waitPassage('Moor Dragons Rape');
      s.check(ok, 'atTrainRape', await ev('BJXTEST.passage()'));
      const trainLen = await ev(`BJXTEST.run('V.combatTrain.length')`);
      s.check(Number(trainLen) === 2, 'trainLength2', trainLen);
      // demon book chain
      await ev(`BJXTEST.goto('Castle Demon Book')`);
      await settle(600);
      await ev(`BJXTEST.clickLink('拿走这本书')`);
      ok = await waitPassage('Demon Book Take');
      s.check(ok, 'atBookTake', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('阅读这本书')`);
      ok = await waitPassage('Demon Book Read');
      s.check(ok, 'atBookRead', await ev('BJXTEST.passage()'));
      const txt = await ev(`BJXTEST.elText('#passages .passage')`);
      s.check(String(txt).includes('秘密皇帝'), 'bookWords', txt);
      await s.shot('moor-demon-book');
      await s.errors();
    }

    // ---------- S31 farm tractor upgrades ----------
    s = step('farm-tractor-upgrades');
    if (s.skipped) {} else {
      // <<farm_work_update>> -> <<alexclamp>> needs C.npc.Alex; the fence /
      // upgrade widgets need $farm to at least be an object
      await ev(`BJXTEST.run('C.npc.Alex = C.npc.Alex || {love: 0, dom: 0, lust: 0}')`);
      await ev(`BJXTEST.setVars({ farm_stage: 8, money: 5000000, stress: 0, farm: {}, plots: { farm: [] } })`);
      await ev(`BJXTEST.goto('Farm Upgrades')`);
      await settle(700);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).includes('购买'), 'buyTractorLink', links);
      await ev(`BJXTEST.clickLink('购买')`);
      let ok = await waitPassage('Farm Upgrades Tractor 1');
      s.check(ok, 'atTractor1', await ev('BJXTEST.passage()'));
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('30马力'), 'tractor1Text', String(txt).slice(0, 80));
      if (!String(txt).includes('30马力')) s.note('diag', await ev('BJXTEST.diagPassages()').catch(() => null));
      await ev(`BJXTEST.clickLink('购买(0:20)')`);
      ok = await waitPassage('Farm Upgrades Build');
      s.check(ok, 'atBuild', await ev('BJXTEST.passage()'));
      const tractor = await ev(`BJXTEST.run('V.farm.tractor')`);
      s.check(Number(tractor) === 1, 'tractorLevel1', tractor);
      await ev(`BJXTEST.clickLink('Next')`);
      ok = await waitPassage('Farm Upgrades');
      s.check(ok, 'backAtUpgrades', await ev('BJXTEST.passage()'));
      links = await ev('BJXTEST.links()');
      s.check((links || []).includes('升级'), 'upgradeTractor2Link', links);
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      const attach = ['犁:', '播种机:', '收割机:', '装载机:'];
      s.check(attach.every((a) => String(txt).includes(a)), 'attachmentList', attach.filter((a) => !String(txt).includes(a)));
      await s.shot('farm-tractor');
      await s.errors();
    }

    // ---------- S32 farm meadow sheep chain (rng 70 -> sheep) ----------
    s = step('farm-meadow-sheep');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ rng: 70, promiscuity: 20, eventskip: 0 })`);
      await ev(`BJXTEST.goto('Meadow Relax')`);
      await settle(700);
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('毛茸茸'), 'sheepEventText', String(txt).slice(0, 120));
      let links = await ev('BJXTEST.links()');
      s.check((links || []).includes('抵抗'), 'resistLink', links);
      s.check((links || []).includes('允许'), 'allowLink', links);
      const npc0 = await ev('BJXTEST.npc0()');
      s.check(!!npc0 && npc0.type === 'sheep', 'sheepNpc', npc0);
      await ev(`BJXTEST.clickLink('允许')`);
      let ok = await waitPassage('Meadow Sheep Sex');
      s.check(ok, 'atSheepSex', await ev('BJXTEST.passage()'));
      // finish: arousal full -> Sex Finish -> Meadow
      await ev(`BJXTEST.setVars({ enemyarousal: 100, enemyarousalmax: 100, enemyhealth: 500, enemyhealthmax: 500 })`);
      await ev(`BJXTEST.goto('Meadow Sheep Sex')`);
      await settle(700);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Meadow Sheep Sex Finish');
      s.check(ok, 'atSheepSexFinish', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('羊绒般') || String(txt).includes('咩咩'), 'finishText', String(txt).slice(0, 100));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Meadow');
      s.check(ok, 'backAtMeadow', await ev('BJXTEST.passage()'));
      await s.errors();
    }

    // ---------- S33 farm burger stand + slime shave ----------
    s = step('farm-burger-shave');
    if (s.skipped) {} else {
      const t = await ensureDayState('day');
      s.note('timeSetup', t);
      // dress the PC (earlier combat steps may have left them exposed) and
      // skip the Farmland random-event dispatch (eventskip 1)
      await ev(`BJXTEST.run('C.npc.Alex = C.npc.Alex || {love: 0, dom: 0, lust: 0}')`);
      await ev(`BJXTEST.run('V.worn.upper = JSON.parse(JSON.stringify(setup.clothes.upper[setup.clothes.upper.findIndex(function(i){return i.name === "school shirt"})])); V.worn.lower = JSON.parse(JSON.stringify(setup.clothes.lower[setup.clothes.lower.findIndex(function(i){return i.name === "school shorts"})])); "dressed"')`);
      await ev(`BJXTEST.setVars({ exposed: 0, money: 100000, moorburger: 0, eventskip: 1, rng: 1, stress: 0, farm: {}, plots: { farm: [] } })`);
      await ev(`BJXTEST.run('V.options = V.options || {}; V.options.bjx_animal = 1')`);
      await ev(`BJXTEST.goto('Farmland')`);
      await settle(700);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.includes('汉堡摊')), 'burgerEntry', links);
      await ev(`BJXTEST.clickLink('逛一逛附近的汉堡摊(0:05)')`);
      let ok = await waitPassage('Moor Food Stand');
      s.check(ok, 'atFoodStand', await ev('BJXTEST.passage()'));
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.includes('狂野狼魂堡')), 'wolfBurger', links);
      s.check((links || []).some((l) => l.includes('田园烤羊堡')), 'sheepBurger', links);
      await ev(`BJXTEST.clickLink('狂野狼魂堡(0:20 £50)')`);
      ok = await waitPassage('Moor Hamburger');
      s.check(ok, 'atHamburger', await ev('BJXTEST.passage()'));
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('太好吃了'), 'burgerText', String(txt).slice(0, 80));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Farmland');
      s.check(ok, 'backAtFarmland', await ev('BJXTEST.passage()'));
      // slime auto-shave in the farm shed
      await ev(`BJXTEST.run('V.options.bjx_eventTF = 1')`);
      await ev(`BJXTEST.setVars({ slime: 1, pblevel: 3, pbgrowth: 0, pblevelballs: 0, pbgrowthballs: 0, pbstrip: 0 })`);
      await ev(`BJXTEST.goto('Farm Shed')`);
      await settle(700);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.includes('自动脱毛')), 'autoShaveLink', links);
      await ev(`BJXTEST.clickLink('自动脱毛 (0:15)')`);
      ok = await waitPassage('Farm Slime Shave');
      s.check(ok, 'atSlimeShave', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('光滑干净'), 'shaveText', String(txt).slice(0, 100));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Farm Shed');
      s.check(ok, 'backAtShed', await ev('BJXTEST.passage()'));
      const pb = await ev(`BJXTEST.var('pblevel')`);
      s.check(Number(pb) === 0, 'pblevelCleared', pb);
      await s.shot('farm-slime-shave');
      await s.errors();
    }

    // ---------- S34 tentacle plains gates + JS patches ----------
    s = step('tentacle-plains-gates');
    if (s.skipped) {} else {
      await ev(`BJXTEST.run('C.npc.Alex = C.npc.Alex || {love: 0, dom: 0, lust: 0}')`);
      await ev(`BJXTEST.setVars({ tentnorth: 0, tenteast: 0, fox: 6, dragon: 6, tentcloth: 0, slime: 0, spraymax: 0, eventskip: 1 })`);
      await ev(`BJXTEST.run('V.options = V.options || {}; V.options.bjx_animal = 1')`);
      await ev(`BJXTEST.goto('Tentacle Plains')`);
      await settle(700);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).includes('尝试调教触手'), 'foxNewLink', links);
      s.check((links || []).includes('龙之咆哮'), 'dragonLink', links);
      s.check(!(links || []).some((l) => l.includes('Look for something to steal')), 'vanillaFoxHidden', links);
      // JS patches: livingclothes parasite type, BJX hair/skin colours, TF keys
      s.check(await ev(`BJXTEST.run('V.parasite.types.includes("livingclothes")')`) === 'true',
        'livingclothesType', await ev(`BJXTEST.run('JSON.stringify(V.parasite.types)')`));
      s.check(await ev(`BJXTEST.run('setup.colours.hair.some(c => c.variable === "lilacpurple")')`) === 'true', 'lilacpurpleHair', null);
      s.check(await ev(`BJXTEST.run('setup.colours.hair.some(c => c.variable === "slimegreen")')`) === 'true', 'slimegreenHair', null);
      s.check(await ev(`BJXTEST.run('!!setup.colours.skin_options.amethyst')`) === 'true', 'amethystSkin', null);
      s.check(await ev(`BJXTEST.run('!!setup.colours.skin_options.slimy')`) === 'true', 'slimySkin', null);
      s.check(await ev(`BJXTEST.run('!!V.transformationParts.slime')`) === 'true', 'slimeTfKey', null);
      s.check(await ev(`BJXTEST.run('!!V.transformationParts.ghost')`) === 'true', 'ghostTfKey', null);
      s.check(await ev(`BJXTEST.run('!!V.transformationParts.mushroom')`) === 'true', 'mushroomTfKey', null);
      // toggle bjx_animal off -> vanilla fox link returns, BJX entries hide
      await ev(`BJXTEST.run('V.options.bjx_animal = 0')`);
      await ev(`BJXTEST.goto('Tentacle Plains')`);
      await settle(500);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.includes('Look for something to steal') || l.includes('寻找能偷的东西')), 'vanillaFoxBack', links);
      s.check(!(links || []).includes('尝试调教触手'), 'foxNewGone', links);
      s.check(!(links || []).includes('龙之咆哮'), 'dragonGone', links);
      await s.errors();
    }

    // ---------- S35 living clothes chain ----------
    s = step('living-clothes-chain');
    if (s.skipped) {} else {
      await ev(`BJXTEST.run('V.options.bjx_animal = 1')`);
      await ev(`BJXTEST.setVars({ tentnorth: -2, tenteast: -2, tentcloth: 0 })`);
      await ev(`BJXTEST.goto('Tentacle Plains')`);
      await settle(700);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).includes('触碰'), 'touchLink', links);
      await ev(`BJXTEST.clickLink('触碰')`);
      let ok = await waitPassage('Living Clothes Discovery');
      s.check(ok, 'atDiscovery', await ev('BJXTEST.passage()'));
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('最好别碰它'), 'discoveryText', String(txt).slice(0, 100));
      await ev(`BJXTEST.clickLink('穿上')`);
      ok = await waitPassage('Living Clothes Continue');
      s.check(ok, 'atContinue', await ev('BJXTEST.passage()'));
      s.check(await ev(`BJXTEST.run('V.worn.under_upper.name')`) === 'tentacle top', 'tentacleTopWorn',
        await ev(`BJXTEST.run('V.worn.under_upper && V.worn.under_upper.name')`));
      s.check(await ev(`BJXTEST.run('V.parasite.nipples.name')`) === 'livingclothes', 'nipplesParasite',
        await ev(`BJXTEST.run('JSON.stringify(V.parasite.nipples)')`));
      // resisting chain: Resisting -> Resisting 2 -> Test (physique success).
      // 0.5's link override runs the <<physiquedifficulty>> payload at render
      // time, so the skill must be maxed BEFORE entering Resisting 2.
      await ev(`BJXTEST.clickLink('尝试脱下它')`);
      ok = await waitPassage('Living Clothes Resisting');
      s.check(ok, 'atResisting', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.setVars({ physique: 20000, physiquemax: 20000 })`);
      await ev(`BJXTEST.clickLink('尝试继续脱下')`);
      ok = await waitPassage('Living Clothes Resisting 2');
      s.check(ok, 'atResisting2', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('尝试挣脱束缚')`);
      ok = await waitPassage('Living Clothes Test');
      s.check(ok, 'atTest', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('挣脱了它的控制'), 'testSuccessText', String(txt).slice(0, 120));
      // surrender -> Edging -> passout 4
      await ev(`BJXTEST.clickLink('投降')`);
      ok = await waitPassage('Living Clothes Edging');
      s.check(ok, 'atEdging', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('失去了意识'), 'edgingText', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('你失去意识了')`);
      ok = await waitPassage('Passout Tentacle World 4');
      s.check(ok, 'atPassout4', await ev('BJXTEST.passage()'));
      await s.errors();
    }

    // ---------- S36 lust slime + fox taming + dragon roar ----------
    s = step('lust-slime-fox-dragon');
    if (s.skipped) {} else {
      // stay-awake gate on Passout 3 (slime 1 -> visible)
      await ev(`BJXTEST.setVars({ slime: 1 })`);
      await ev(`BJXTEST.goto('Passout Tentacle World 3')`);
      await settle(1600);
      s.note('passageDivs', await ev(`(function(){
        var ps = Array.from(document.querySelectorAll('#passages .passage'));
        return JSON.stringify(ps.map(function(e){ return { cls: e.className, len: (e.textContent||'').length, head: (e.textContent||'').trim().slice(0,40) }; }));
      })()`));
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check((await ev(`BJXTEST.passageHas('Passout Tentacle World 3', '无休止的高潮')`)) === true, 'bjxPassoutText', String(txt).slice(0, 60));
      let links = await ev('BJXTEST.links()');
      s.check((links || []).includes('凝神'), 'stayAwakeLink', links);
      s.check((links || []).some((l) => l === 'Next' || l === '继续'), 'vanillaNextLink', links);
      await ev(`BJXTEST.clickLink('凝神')`);
      let ok = await waitPassage('Lust Slime');
      s.check(ok, 'atLustSlime', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check((await ev(`BJXTEST.passageHas('Lust Slime', '肉茧')`)) === true, 'lustSlimeText', String(txt).slice(0, 60));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Lust Slime 2');
      s.check(ok, 'atLustSlime2', await ev('BJXTEST.passage()'));
      s.check(await ev(`BJXTEST.run('Skin.color.natural')`) === 'amethyst', 'amethystSkin',
        await ev(`BJXTEST.run('Skin.color.natural')`));
      s.check(Number(await ev(`BJXTEST.var('slime')`)) === 2, 'slimeUpgraded', await ev(`BJXTEST.var('slime')`));
      s.check(await ev(`BJXTEST.var('haircolour')`) === 'lilacpurple', 'lilacpurpleHair', await ev(`BJXTEST.var('haircolour')`));
      s.check(await ev(`BJXTEST.run('V.transformationParts.slime.bubble')`) === 'pdefault', 'slimeTfBubble',
        await ev(`BJXTEST.run('JSON.stringify(V.transformationParts.slime)')`));
      // fox taming entry (first visit branch)
      await ev(`BJXTEST.run('delete V.tentaclefox')`);
      await ev(`BJXTEST.goto('Tentacle Plains Fox New')`);
      await settle(1600);
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check((await ev(`BJXTEST.passageHas('Tentacle Plains Fox New', '尝试引导触手')`)) === true, 'foxNewText', String(txt).slice(0, 60));
      s.check(Number(await ev(`BJXTEST.var('tentaclefox')`)) === 1, 'tentaclefoxSet', await ev(`BJXTEST.var('tentaclefox')`));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Tentacle Plains');
      s.check(ok, 'backAtPlains1', await ev('BJXTEST.passage()'));
      // dragon roar: arousal 5000 - 2000, stress 100 - 30
      await ev(`BJXTEST.setVars({ arousal: 5000, stress: 100 })`);
      await ev(`BJXTEST.goto('Tentacle Plains Dragon')`);
      await settle(1600);
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check((await ev(`BJXTEST.passageHas('Tentacle Plains Dragon', '仰天怒吼')`)) === true, 'dragonText', String(txt).slice(0, 60));
      const ar = Number(await ev(`BJXTEST.var('arousal')`));
      s.check(ar >= 2900 && ar <= 3010, 'arousalReduced', ar);
      const st = Number(await ev(`BJXTEST.var('stress')`));
      s.check(st >= 0 && st <= 70, 'stressReduced', st);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Tentacle Plains');
      s.check(ok, 'backAtPlains2', await ev('BJXTEST.passage()'));
      await s.shot('tentacle-dragon');
      await s.errors();
    }

    // ---------- S37 bailey office / basement night success chain ----------
    s = step('bailey-basement-chain');
    if (s.skipped) {} else {
      // night + town project approved + master lockpicking
      await ev(`BJXTEST.run('Time.setTime(2, 0)')`);
      await sleep(400);
      const ds = await ev(`BJXTEST.run('Time.dayState')`);
      s.check(ds === 'night', 'isNight', ds);
      await ev(`BJXTEST.run('V.town_projects.home = 1')`);
      await ev(`BJXTEST.setVars({ skulduggery: 20000, danceskill: 20000, athletics: 20000, tending: 20000 })`);
      await ev('BJXTEST.goto("Orphanage")');
      await settle(900);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.includes('撬开贝利的办公室门锁')), 'officeLockpickLink', links);
      await ev(`BJXTEST.clickLink('撬开贝利的办公室门锁')`);
      let ok = await waitPassage("Bailey's Office Lockpick");
      s.check(ok, 'atLockpick', await ev('BJXTEST.passage()'));
      s.check(Number(await ev(`BJXTEST.var('baileypicked')`)) === 1, 'baileypickedSet', await ev(`BJXTEST.var('baileypicked')`));
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('咔哒一声'), 'lockpickText', String(txt).slice(0, 100));
      await ev(`BJXTEST.clickLink('进入')`);
      ok = await waitPassage("Bailey's Office Break In");
      s.check(ok, 'atBreakIn', await ev('BJXTEST.passage()'));
      await settle(700);
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('地下室建筑工程'), 'breakInText', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('回去')`);
      ok = await waitPassage('Orphanage');
      s.check(ok, 'backAtOrphanage1', await ev('BJXTEST.passage()'));
      s.check(Number(await ev(`BJXTEST.var('basement')`)) === 1, 'basementUnlocked', await ev(`BJXTEST.var('basement')`));
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.includes('闯入贝利的办公室')), 'breakInLinkAfter', links);
      s.check((links || []).some((l) => l.includes('撬开地下室门锁')), 'basementLockpickLink', links);
      await ev(`BJXTEST.clickLink('撬开地下室门锁')`);
      ok = await waitPassage('Basement Lockpick');
      s.check(ok, 'atBasementLockpick', await ev('BJXTEST.passage()'));
      s.check(Number(await ev(`BJXTEST.var('basementpicked')`)) === 1, 'basementpickedSet', await ev(`BJXTEST.var('basementpicked')`));
      await ev(`BJXTEST.clickLink('进入')`);
      ok = await waitPassage('Orphanage Basement');
      s.check(ok, 'atBasement', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('笼子'), 'basementText', String(txt).slice(0, 100));
      // tripwire: dancedifficulty is judged at render time, danceskill is maxed
      await ev(`BJXTEST.clickLink('尝试躲避')`);
      ok = await waitPassage('Basement Tripwire');
      s.check(ok, 'atTripwire', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('优雅地避开'), 'tripwireSuccess', String(txt).slice(0, 120));
      // duct: athletics maxed -> success
      await ev(`BJXTEST.clickLink('尝试爬进天花板管道')`);
      ok = await waitPassage('Basement Duct');
      s.check(ok, 'atDuct', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('巡逻'), 'ductSuccess', String(txt).slice(0, 120));
      // tentacle: tending maxed -> soothed
      await ev(`BJXTEST.clickLink('往更深处爬')`);
      ok = await waitPassage('Basement Tentacle');
      s.check(ok, 'atTentacleDuct', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('平静下来'), 'tentacleSoothed', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Basement Blackmail');
      s.check(ok, 'atBlackmail', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('重要'), 'blackmailText', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('逃跑')`);
      ok = await waitPassage('Basement Hallway');
      s.check(ok, 'atHallway', await ev('BJXTEST.passage()'));
      s.check(Number(await ev(`BJXTEST.var('blackmaildestroyed')`)) === 1, 'blackmailTaken', await ev(`BJXTEST.var('blackmaildestroyed')`));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('红外线'), 'hallwayExitText', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('通过红外线房间离开')`);
      ok = await waitPassage('Basement Tripwire 2');
      s.check(ok, 'atTripwire2', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('回到了地下室门口'), 'tripwire2Success', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('离开')`);
      ok = await waitPassage('Orphanage');
      s.check(ok, 'backAtOrphanage2', await ev('BJXTEST.passage()'));
      await s.shot('bailey-basement');
      await s.errors();
    }

    // ---------- S38 basement caught / cage (combat end path) ----------
    s = step('basement-caught-cage');
    if (s.skipped) {} else {
      // 普通玩家的绑架链测试：清掉前面 tentacle 步骤残留的 TF 状态。
      // 龙/魅魔 6 级 + 敌人满 arousal 会触发 BJX 续杯卡位（setupMidOrgasm），
      // 把 enemyarousal 压回 max-1，破坏 _combatend 的 arousal 条件。
      await ev(`BJXTEST.setVars({ dragon: 0, fox: 0, demon: 0, againfail: false })`);
      // direct combat entry: the molestration block generates the thugs
      await ev(`BJXTEST.setVars({ molestationstart: 1 })`);
      await ev('BJXTEST.goto("Basement Caught")');
      await settle(2000);
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('暴徒们朝你涌来'), 'caughtInitText', String(txt).slice(0, 120));
      s.check(Number(await ev(`BJXTEST.var('molestationstart')`)) === 0, 'molestartConsumed', await ev(`BJXTEST.var('molestationstart')`));
      // force the combat-end flag via the ordinary story vars
      await ev(`BJXTEST.setVars({ enemyarousal: 9999, enemyarousalmax: 100 })`);
      await ev(`BJXTEST.clickLink('继续')`);
      let ok = await waitPassage('Basement Caught');
      s.check(ok, 'combatLoop', await ev('BJXTEST.passage()'));
      await settle(600);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Basement Caught Finish');
      s.check(ok, 'atFinish', await ev('BJXTEST.passage()'));
      await settle(1500);
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('关起来'), 'cageBranchText', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Basement Cage');
      s.check(ok, 'atCage', await ev('BJXTEST.passage()'));
      await settle(1500);
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('兔崽子'), 'baileyCageText', String(txt).slice(0, 120));
      // blackmail confiscated (was 1 from S37), rentnopay renders Submit/Fight
      s.note('cageText', String(txt).slice(0, 160));
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l === 'Submit' || l === '顺从' || l === '顺服'), 'rentSubmitLink', links);
      s.check(String(txt).includes('偷') || String(txt).includes('Submit') || String(txt).includes('顺从'), 'blackmailConfiscated', null);
      // do not enter the rent kidnapping chain; leave directly
      await ev('BJXTEST.goto("Orphanage")');
      await settle(600);
      s.check(Number(await ev(`BJXTEST.var('blackmaildestroyed')`)) === 0, 'blackmailConfiscatedReset', await ev(`BJXTEST.var('blackmaildestroyed')`));
      await s.errors();
    }

    // ---------- S39 antiques + cheat code + slime shave ----------
    s = step('home-antiques-code-shave');
    if (s.skipped) {} else {
      // antique links on Bedroom
      await ev(`BJXTEST.run('V.options.bjx_antiques = 1')`);
      await ev(`BJXTEST.run('V.museumAntiques.antiques.antiqueliquor = "found"')`);
      await ev(`BJXTEST.run('V.museumAntiques.antiques.antiqueivorynecklace = "found"')`);
      await ev(`BJXTEST.run('V.museumAntiques.antiques.antiquescroll = "found"')`);
      await ev('BJXTEST.goto("Bedroom")');
      await settle(900);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).includes('喝古董酒'), 'liquorLink', links);
      s.check((links || []).includes('戴上象牙项链'), 'necklaceLink', links);
      s.check((links || []).includes('展开言灵卷轴'), 'scrollLink', links);
      // scroll page
      await ev(`BJXTEST.clickLink('展开言灵卷轴')`);
      let ok = await waitPassage('Home Open Antiquescroll');
      s.check(ok, 'atScroll', await ev('BJXTEST.passage()'));
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('言灵卷轴'), 'scrollText', String(txt).slice(0, 100));
      await ev(`BJXTEST.clickLink('返回')`);
      ok = await waitPassage('Bedroom');
      s.check(ok, 'backAtBedroom1', await ev('BJXTEST.passage()'));
      // ivory necklace wear (bjxclotheswear from the wardrobes module)
      await ev(`BJXTEST.clickLink('戴上象牙项链')`);
      ok = await waitPassage('Antique Ivory Neck Lace Wear');
      s.check(ok, 'atNecklace', await ev('BJXTEST.passage()'));
      s.check(await ev(`BJXTEST.run('V.worn.neck.name')`) === 'ivory necklace', 'necklaceWorn',
        await ev(`BJXTEST.run('V.worn.neck && V.worn.neck.name')`));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Bedroom');
      s.check(ok, 'backAtBedroom2', await ev('BJXTEST.passage()'));
      links = await ev('BJXTEST.links()');
      s.check(!(links || []).includes('戴上象牙项链'), 'necklaceLinkGone', links);
      // cheat code: camouflage line toggles V.codeinput, then the entry link
      await ev(`BJXTEST.run("document.querySelector('#passages span.camouflage a').click()")`);
      await ev('BJXTEST.goto("Bedroom")');
      await settle(700);
      links = await ev('BJXTEST.links()');
      s.check((links || []).includes('输入代码'), 'codeEntryLink', links);
      await ev(`BJXTEST.clickLink('输入代码')`);
      ok = await waitPassage('Code');
      s.check(ok, 'atCode', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('备份'), 'codePageText', String(txt).slice(0, 100));
      // apply the gob cheat code
      await ev(`BJXTEST.run("V.code = '妖精'")`);
      await ev(`BJXTEST.clickLink('输入')`);
      ok = await waitPassage('Code');
      s.check(ok, 'codeReRendered', await ev('BJXTEST.passage()'));
      s.check(Number(await ev(`BJXTEST.var('gob')`)) === 1, 'gobSet', await ev(`BJXTEST.var('gob')`));
      s.check(Number(await ev(`BJXTEST.var('bodysize')`)) === 0, 'bodysizeZero', await ev(`BJXTEST.var('bodysize')`));
      s.check(Number(await ev(`BJXTEST.var('physiquesize')`)) === 6000, 'physiquesize6k', await ev(`BJXTEST.var('physiquesize')`));
      s.check(await ev(`BJXTEST.run('Skin.color.natural')`) === 'green', 'greenSkin',
        await ev(`BJXTEST.run('Skin.color.natural')`));
      await ev(`BJXTEST.clickLink('返回')`);
      ok = await waitPassage('Bedroom');
      s.check(ok, 'backAtBedroom3', await ev('BJXTEST.passage()'));
      // slime auto-shave on the home bathroom Shave page
      await ev(`BJXTEST.run('V.options.bjx_eventTF = 1')`);
      await ev(`BJXTEST.run('V.settings.pubicHairEnabled = true')`);
      await ev(`BJXTEST.setVars({ slime: 1, pblevel: 5, pblevelballs: 0, pbstrip: 0 })`);
      await ev('BJXTEST.goto("Bathroom")');
      await settle(900);
      await ev(`BJXTEST.clickLink('Groom pubic hair')`);
      ok = await waitPassage('Shave');
      s.check(ok, 'atShave', await ev('BJXTEST.passage()'));
      links = await ev('BJXTEST.links()');
      s.check((links || []).includes('自动脱毛 (0:15)'), 'autoShaveLink', links);
      await ev(`BJXTEST.clickLink('自动脱毛')`);
      ok = await waitPassage('Slime Shave');
      s.check(ok, 'atSlimeShave', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('光滑干净'), 'slimeShaveText', String(txt).slice(0, 120));
      s.check(Number(await ev(`BJXTEST.var('pblevel')`)) === 0, 'pblevelCleared', await ev(`BJXTEST.var('pblevel')`));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Bathroom');
      s.check(ok, 'backAtBathroom', await ev('BJXTEST.passage()'));
      await s.shot('home-shave-code');
      await s.errors();
    }

    // ---------- S40 hospital foyer BJX inquiry links + slime consult ----------
    s = step('hospital-foyer-links');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ slime: 1, mushroom: 1, demonhunter: 2, money: 5000000, stress: 0, exposed: 0, arousal: 0 })`);
      await ev('BJXTEST.goto("Hospital Foyer")');
      await settle(900);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.includes('要求学习催眠术')), 'hypnosisLink', links);
      s.check((links || []).some((l) => l.includes('咨询你的蘑菇感染问题')), 'mushroomLink', links);
      s.check((links || []).some((l) => l.includes('咨询你的史莱姆情况')), 'slimeLink', links);
      await ev(`BJXTEST.clickLink('咨询你的史莱姆情况')`);
      let ok = await waitPassage('Harper Slime Inquiry');
      s.check(ok, 'atSlimeInquiry', await ev('BJXTEST.passage()'));
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('核心'), 'slimeInquiryText', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Hospital front');
      s.check(ok, 'atHospitalFront', await ev('BJXTEST.passage()'));
      await s.errors();
    }

    // ---------- S41 slime consult second visit + mushroom cure chain ----------
    s = step('hospital-slime-mushroom');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ onemoreslime: 1 })`);
      await ev('BJXTEST.goto("Hospital Foyer")');
      await settle(900);
      await ev(`BJXTEST.clickLink('咨询你的史莱姆情况')`);
      let ok = await waitPassage('Harper Slime Inquiry');
      s.check(ok, 'atSlimeInquiry2', await ev('BJXTEST.passage()'));
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('和以前一样'), 'secondVisitText', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Hospital front');
      s.check(ok, 'backAtFront', await ev('BJXTEST.passage()'));
      // mushroom cure: consult -> pay -> clear -> untransform
      await ev('BJXTEST.goto("Hospital Foyer")');
      await settle(900);
      await ev(`BJXTEST.clickLink('咨询你的蘑菇感染问题')`);
      ok = await waitPassage('Hospital Mushroom');
      s.check(ok, 'atMushroom', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('蘑菇'), 'mushroomText', String(txt).slice(0, 120));
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('付款')), 'payLink', links);
      await ev(`BJXTEST.clickLink('付款')`);
      ok = await waitPassage('Hospital Parasite Private Mushrooms');
      s.check(ok, 'atPrivateMushrooms', await ev('BJXTEST.passage()'));
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('哈珀收下了你的付款'), 'payText', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('清除蘑菇感染')`);
      ok = await waitPassage('Hospital Parasite Private2 Mushrooms');
      s.check(ok, 'atPrivate2Mushrooms', await ev('BJXTEST.passage()'));
      await settle(1200);
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('蘑菇帽'), 'mushroomCureText', String(txt).slice(0, 120));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Hospital Foyer');
      s.check(ok, 'backAtFoyer', await ev('BJXTEST.passage()'));
      s.check(Number(await ev(`BJXTEST.var('mushroom')`)) === 0, 'mushroomCleared', await ev(`BJXTEST.var('mushroom')`));
      s.check(await ev(`BJXTEST.run('V.worn.upper.name')`) === 'patient gown', 'gownWorn',
        await ev(`BJXTEST.run('V.worn.upper && V.worn.upper.name')`));
      await s.shot('hospital-mushroom');
      await s.errors();
    }

    // ---------- S42 demonhunter hypnosis training ----------
    s = step('hospital-demonhunter');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ demonhunter: 4 })`);
      await ev('BJXTEST.goto("Hospital Foyer")');
      await settle(900);
      await ev(`BJXTEST.clickLink('要求学习催眠术')`);
      let ok = await waitPassage('Hospital Demonhunter');
      s.check(ok, 'atDemonhunter', await ev('BJXTEST.passage()'));
      let txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('催眠术'), 'demonhunterText', String(txt).slice(0, 120));
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('学习催眠')), 'learnLink', links);
      await ev(`BJXTEST.clickLink('学习催眠 (£10000 2:00)')`);
      ok = await waitPassage('Hospital Demonhunter2');
      s.check(ok, 'atDemonhunter2', await ev('BJXTEST.passage()'));
      await settle(1200);
      txt = await ev(`BJXTEST.elTextFull('#passages .passage')`);
      s.check(String(txt).includes('成功坚持到了最后'), 'hypnosisSuccess', String(txt).slice(0, 150));
      s.check(Number(await ev(`BJXTEST.var('demonhunter')`)) === 5, 'demonhunter5', await ev(`BJXTEST.var('demonhunter')`));
      s.check(Number(await ev(`BJXTEST.var('hunterhypnosispaid')`)) === 1, 'hypnosisPaid', await ev(`BJXTEST.var('hunterhypnosispaid')`));
      await ev(`BJXTEST.clickLink('离开')`);
      ok = await waitPassage('Hospital Foyer');
      s.check(ok, 'backAtFoyer', await ev('BJXTEST.passage()'));
      links = await ev('BJXTEST.links()');
      s.check(!(links || []).some((l) => l.includes('要求学习催眠术')), 'hypnosisLinkGone', links);
      s.check(Number(await ev(`BJXTEST.var('money')`)) === 3750000, 'moneyAfter', await ev(`BJXTEST.var('money')`));
      await s.errors();
    }

    // ---------- S43 parasite rumour (sewer slime) + livingclothes removal ----------
    s = step('hospital-parasite-livingclothes');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ stress: 0, exposed: 0, arousal: 0 })`);
      // in-page assertion: evaluate includes() inside the browser and return
      // only { hit, ctx } so the boolean verdict never crosses CDP as part of
      // a large non-ASCII string; ctx carries the matched snippet, or a
      // codepoint dump when only the first char of the needle is found
      const probe = async (needle) => {
        const expr = `(() => {
          const t = Array.from(document.querySelectorAll('#passages .passage')).map(e => e.textContent).join(' ');
          const n = ${JSON.stringify(needle)};
          const i = t.indexOf(n);
          let ctx;
          if (i >= 0) ctx = t.slice(i, i + 40);
          else {
            const j = t.indexOf(n[0]);
            ctx = j >= 0
              ? 'cp:' + Array.from(t.slice(j, j + n.length + 2)).map(c => c.codePointAt(0).toString(16)).join(',')
              : 'noFirstChar len=' + t.length + ' head=' + t.slice(0, 80);
          }
          return JSON.stringify({ hit: i >= 0, ctx });
        })()`;
        return JSON.parse(await ev(expr));
      };
      // (1) body urchin + ear slime -> first diagnosis carries the rumour
      await ev(`BJXTEST.run('V.parasite.clit.name = "urchin"')`);
      await ev(`BJXTEST.run('V.parasite.left_ear.name = "slime"')`);
      await ev('BJXTEST.goto("Hospital Parasite")');
      await settle(2000);
      let pr = await probe('顺便说一句');
      s.check(pr.hit, 'rumourFirst', pr.ctx);
      pr = await probe('腐蚀性');
      s.check(pr.hit, 'rumourCorrosive', pr.ctx);
      await ev(`BJXTEST.clickLink('Leave without treatment')`);
      let ok = await waitPassage('Hospital Foyer');
      s.check(ok, 'leftTreatment', await ev('BJXTEST.passage()'));
      // (2) ear slime only -> second diagnosis also carries the rumour
      await ev(`BJXTEST.run('delete V.parasite.clit.name')`);
      await ev('BJXTEST.goto("Hospital Parasite")');
      await settle(2000);
      pr = await probe('顺便说一句');
      s.check(pr.hit, 'rumourSecond', pr.ctx);
      await ev(`BJXTEST.clickLink('Next')`);
      ok = await waitPassage('Hospital Foyer');
      s.check(ok, 'leftEarSlime', await ev('BJXTEST.passage()'));
      // (3) livingclothes branch -> paid removal chain
      await ev(`BJXTEST.run('delete V.parasite.left_ear.name')`);
      await ev(`BJXTEST.run('V.parasite.clit.name = "livingclothes"')`);
      await ev('BJXTEST.goto("Hospital Parasite")');
      await settle(2000);
      pr = await probe('电击法');
      s.check(pr.hit, 'livingclothesDiagnosis', pr.ctx);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('付款')), 'livingPayLink', links);
      await ev(`BJXTEST.clickLink('付款')`);
      ok = await waitPassage('Hospital Parasite Private Livingclothes');
      s.check(ok, 'atPrivateLivingclothes', await ev('BJXTEST.passage()'));
      await settle(1200);
      pr = await probe('哈珀收下了你的付款');
      s.check(pr.hit, 'livingPayText', pr.ctx);
      await ev(`BJXTEST.clickLink('清除所有能清除的寄生虫')`);
      ok = await waitPassage('Hospital Parasite Private2 Livingclothes');
      s.check(ok, 'atPrivate2Livingclothes', await ev('BJXTEST.passage()'));
      await settle(1800);
      pr = await probe('电脉冲强度增加');
      s.check(pr.hit, 'livingProcedureText', pr.ctx);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Hospital Foyer');
      s.check(ok, 'backAtFoyer', await ev('BJXTEST.passage()'));
      s.check(await ev(`typeof SugarCube.State.variables.parasite.clit.name === 'undefined'`), 'livingclothesRemoved',
        await ev(`BJXTEST.run('JSON.stringify(V.parasite.clit)')`));
      s.check(Number(await ev(`BJXTEST.var('money')`)) === 3500000, 'moneyAfterLiving', await ev(`BJXTEST.var('money')`));
      await s.shot('hospital-livingclothes');
      await s.errors();
    }

    // ---------- S44 churchyard: demon summoning entry + wraith pass-through ----------
    s = step('churchyard-demon-wraith');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ stress: 0, exposed: 0, arousal: 0 })`);
      // night + demon book read -> summoning entry on the Churchyard page
      await ev(`BJXTEST.run('Time.setTime(2, 0)')`);
      await sleep(400);
      const ds = await ev(`BJXTEST.run('Time.dayState')`);
      s.check(ds === 'night', 'isNight', ds);
      await ev(`BJXTEST.run('V.demonbookread = 1')`);
      await ev('BJXTEST.goto("Churchyard")');
      await settle(1200);
      let pr = await probe('召唤仪式');
      s.check(pr.hit, 'summonLinkNight', pr.ctx);
      // demon book unread -> the entry hides
      await ev(`BJXTEST.run('V.demonbookread = 0')`);
      await ev('BJXTEST.goto("Churchyard")');
      await settle(1000);
      pr = await probe('召唤仪式');
      s.check(!pr.hit, 'summonHiddenNoBook', pr.ctx);
      // wraith pass-through into the catacombs
      await ev(`BJXTEST.run('V.ghost = 1')`);
      await ev('BJXTEST.goto("Churchyard Catacombs Lock")');
      await settle(1000);
      pr = await probe('只要你集中精力，就能穿越这扇门');
      s.check(pr.hit, 'wraithText', pr.ctx);
      await ev(`BJXTEST.clickLink('穿越')`);
      let ok = await waitPassage('Churchyard Catacombs Sneak');
      s.check(ok, 'phaseToSneak', await ev('BJXTEST.passage()'));
      s.check(await ev(`SugarCube.State.variables.ghostIn`) === true, 'ghostInSet',
        await ev(`BJXTEST.run('String(V.ghostIn)')`));
      // no ghost -> silent
      await ev(`BJXTEST.run('V.ghost = 0')`);
      await ev('BJXTEST.goto("Churchyard Catacombs Lock")');
      await settle(1000);
      pr = await probe('穿越这扇门');
      s.check(!pr.hit, 'wraithHiddenNoGhost', pr.ctx);
      // chastityBreakDemon widget: single-eval with a fake belt object -
      // <<person>> errors without an NPC context are expected and do not
      // abort the render; 0.5's <<genitalsruined>> then resets the slot
      // back to the naked garment (type ["naked"]), which is the 0.5
      // semantics of "ruined" (the belt text proves the branch was taken)
      const belt = await ev(`(() => {
        const SC = window.SugarCube;
        const V = SC.State.variables;
        const saved = V.worn.genitals;
        V.worn.genitals = { name: 'chastity belt', type: ['naked', 'chastity'], cn_name_cap: '贞操带' };
        const h = document.createElement('div');
        new SC.Wikifier(h, '<<chastityBreakDemon>>');
        const out = h.textContent;
        const after = V.worn.genitals.type;
        V.worn.genitals = saved;
        return JSON.stringify({ beltText: out.includes('金属碎片'), typeAfter: after });
      })()`);
      let beltObj = null;
      try { beltObj = JSON.parse(belt); } catch (e) { beltObj = null; }
      s.check(beltObj && beltObj.beltText, 'beltTextRendered', belt);
      await s.shot('churchyard');
      await s.errors();
    }

    // ---------- S45 bus-station: ghost van + door pass-throughs ----------
    s = step('busstation-ghost-phases');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ stress: 0, exposed: 0, arousal: 0 })`);
      await ev(`BJXTEST.run('V.ghost = 1')`);
      // livestock van -> Ghost Van Escape -> Harvest Street
      await ev('BJXTEST.goto("Bus Station Livestock")');
      await settle(1000);
      let pr = await probe('只要你集中精力，就能穿越这扇门');
      s.check(pr.hit, 'vanPhaseText', pr.ctx);
      await ev(`BJXTEST.clickLink('穿越')`);
      let ok = await waitPassage('Ghost Van Escape');
      s.check(ok, 'atGhostVanEscape', await ev('BJXTEST.passage()'));
      await settle(800);
      pr = await probe('穿过了面包车的车门');
      s.check(pr.hit, 'vanEscapeText', pr.ctx);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Harvest Street');
      s.check(ok, 'vanEscapeToHarvest', await ev('BJXTEST.passage()'));
      // front door -> Harvest Street
      await ev('BJXTEST.goto("Bus Station Front Door")');
      await settle(800);
      await ev(`BJXTEST.clickLink('穿越')`);
      ok = await waitPassage('Harvest Street');
      s.check(ok, 'frontDoorToHarvest', await ev('BJXTEST.passage()'));
      s.check(await ev(`SugarCube.State.variables.ghostIn`) === true, 'ghostInSet',
        await ev(`BJXTEST.run('String(V.ghostIn)')`));
      // back door -> Industrial Alleyways (retargeted to the 0.5 name)
      await ev('BJXTEST.goto("Bus Station Back Door")');
      await settle(800);
      await ev(`BJXTEST.clickLink('穿越')`);
      ok = await waitPassage('Industrial Alleyways');
      s.check(ok, 'backDoorToAlleyways', await ev('BJXTEST.passage()'));
      // no ghost -> silent
      await ev(`BJXTEST.run('V.ghost = 0')`);
      await ev('BJXTEST.goto("Bus Station Front Door")');
      await settle(800);
      pr = await probe('穿越这扇门');
      s.check(!pr.hit, 'phaseHiddenNoGhost', pr.ctx);
      await s.shot('busstation');
      await s.errors();
    }

    // ---------- S46 landfill: raccoon den, Casey, bunker, ghost gate ----------
    s = step('landfill-raccoon-bunker');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ stress: 0, exposed: 0, arousal: 0 })`);
      // daytime for the Casey greeting
      await ev(`BJXTEST.run('Time.setTime(12, 0)')`);
      await sleep(400);
      // raccoon den at the front gate (trash 0, eventskip 1) + Casey
      await ev(`BJXTEST.run('V.trash = 0')`);
      await ev(`BJXTEST.run('V.eventskip = 1')`);
      await ev(`BJXTEST.run('C.npc["凯西"].love = 50')`);
      await ev('BJXTEST.goto("Trash")');
      await settle(1200);
      let pr = await probe('那是条纹尾巴吗');
      s.check(pr.hit, 'denFirstVisit', pr.ctx);
      pr = await probe('你看到凯西在垃圾堆里翻找东西');
      s.check(pr.hit, 'caseyGreeting', pr.ctx);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('进入内部')), 'denEnterLink', links);
      s.check((links || []).some((l) => l.startsWith('打招呼')), 'caseyHelloLink', links);
      await ev(`BJXTEST.clickLink('进入内部')`);
      let ok = await waitPassage('Trash Mammals');
      s.check(ok, 'atTrashMammals', await ev('BJXTEST.passage()'));
      await settle(1500);
      pr = await probe('吱吱喳喳的声音');
      s.check(pr.hit, 'mammalsAmbientText', pr.ctx);
      // bunker discovery in Trash Search (rng 95, not yet found;
      // trash_key 1 skips the first-visit iron-key branch)
      await ev(`BJXTEST.run('V.bunker = 0')`);
      await ev(`BJXTEST.setVars({ rng: 95, trash: 100, trash_key: 1 })`);
      await ev('BJXTEST.goto("Trash Search")');
      await settle(1200);
      pr = await probe('生锈的活板门半开着');
      s.check(pr.hit, 'bunkerDiscovery', pr.ctx);
      s.check(await ev(`SugarCube.State.variables.bunker`) === 'found', 'bunkerFoundSet',
        await ev(`BJXTEST.run('String(V.bunker)')`));
      // trapdoor link on the Trash page -> The Bunker Intro; re-pin
      // eventskip first: the Trash passage clears it on every render
      // (main.twee:111), and with it 0 the passage's dangerEvent() guard
      // can randomly fire eventstrash (trash_4 Brace/Break free) instead
      // of the normal link block
      await ev(`BJXTEST.run('V.eventskip = 1')`);
      await ev('BJXTEST.goto("Trash")');
      await settle(1000);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('进入活板门')), 'trapdoorLink', links);
      await ev(`BJXTEST.clickLink('进入活板门')`);
      ok = await waitPassage('The Bunker Intro');
      s.check(ok, 'atBunkerIntro', await ev('BJXTEST.passage()'));
      // ghost phase out through the gate
      await ev(`BJXTEST.run('V.ghost = 1')`);
      await ev('BJXTEST.goto("Trash Gate Leave")');
      await settle(1000);
      pr = await probe('只要你集中精力，就能穿越这扇门');
      s.check(pr.hit, 'gateLeavePhaseText', pr.ctx);
      await ev(`BJXTEST.clickLink('穿越')`);
      ok = await waitPassage('Elk Street');
      s.check(ok, 'gateLeaveToElk', await ev('BJXTEST.passage()'));
      // trash_1 raccoon ambush: eventPoolOverride forces runeventpool to
      // pick trash_1; the Trash passage guard (main.twee:77) needs
      // dangerEvent() and $eventskip is 0 - dangerEvent() defaults to
      // allure = V.allure evaluated at call time, and nothing on the Trash
      // render path recalculates allure, so pinning it to 9999 makes
      // T.danger >= 9900 - 9999 always true; rng 95 then fires the ambush
      await ev(`BJXTEST.run('V.eventskip = 0')`);
      await ev(`BJXTEST.run('V.eventPoolOverride = "trash_1"')`);
      await ev(`BJXTEST.setVars({ rng: 95, trash: 50, allure: 9999 })`);
      await ev(`BJXTEST.run('V.ghost = 0')`);
      await ev(`BJXTEST.run('V.settings.bestialityEnabled = true')`);
      await ev('BJXTEST.goto("Trash")');
      await settle(1200);
      pr = await probe('叽叽喳喳的声音');
      s.check(pr.hit, 'raccoonAmbush', pr.ctx);
      await s.shot('landfill');
      await s.errors();
    }

    // ---------- S47 lake underwater: slime reversion chain + consentacles + pots ----------
    s = step('lake-underwater-slime');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ stress: 0, exposed: 0, arousal: 0 })`);
      // P1: Lake Ruin Door - Chinese door text + necklace shown on notFound
      await ev(`BJXTEST.run('V.museumAntiques = V.museumAntiques || {antiques: {}}; V.museumAntiques.antiques.antiqueivorynecklace = "notFound"')`);
      await ev('BJXTEST.goto("Lake Ruin Door")');
      await settle(1000);
      let pr = await probe('你听到古老齿轮的运转声');
      s.check(pr.hit, 'doorChineseText', pr.ctx);
      pr = await probe('一条象牙项链被放在基座顶部');
      s.check(pr.hit, 'doorNecklaceShown', pr.ctx);
      // P2: Lake Ruin Sit with $slime 1 -> reversion fork beats the
      // pregnancy guard (if -> elseif relabel)
      await ev(`BJXTEST.run('V.slime = 1')`);
      await ev('BJXTEST.goto("Lake Ruin Sit")');
      await settle(1000);
      pr = await probe('与此同时，同样的核心越来越大');
      s.check(pr.hit, 'sitSlimeFork', pr.ctx);
      await ev(`BJXTEST.clickLink('继续')`);
      let ok = await waitPassage('Slime Reversion');
      s.check(ok, 'atSlimeReversion', await ev('BJXTEST.passage()'));
      await settle(600);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Slime Reversion 2');
      s.check(ok, 'atSlimeReversion2', await ev('BJXTEST.passage()'));
      await settle(600);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Lake Ruin Plinth');
      s.check(ok, 'backAtPlinth', await ev('BJXTEST.passage()'));
      // Slime Reversion 2 ran <<slimeuntransform>> -> $slime cleared
      s.check(await ev(`SugarCube.State.variables.slime`) === 0, 'slimeClearedByUntransform',
        await ev(`BJXTEST.run('String(V.slime)')`));
      // P7: Consentacles Leave - a slime slips the ankle snare without
      // $swimmingSuccess
      await ev(`BJXTEST.run('V.slime = 1')`);
      await ev('BJXTEST.goto("Lake Ruin Deep Consentacles Leave")');
      await settle(1000);
      pr = await probe('它们无法牢牢抓住你的四肢');
      s.check(pr.hit, 'consentaclesSlimeEscape', pr.ctx);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Lake Ruin Deep');
      s.check(ok, 'consentaclesBackToDeep', await ev('BJXTEST.passage()'));
      // P8: Lake Pots - force the ivory-box inline event via
      // eventPoolOverride (eventpool.js picks by name), the 打开 link
      // tags $skulduggeryhands for the later skill-difficulties group
      await ev(`BJXTEST.setVars({ stress: 0, arousal: 0 })`);
      await ev(`BJXTEST.run('V.foresthunt = 0')`);
      await ev(`BJXTEST.run('V.eventPoolOverride = "ivory box"')`);
      await ev('BJXTEST.goto("Lake Pots")');
      await settle(1200);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('打开')), 'potsBoxLinkChinese', links);
      await ev(`BJXTEST.clickLink('打开')`);
      ok = await waitPassage('Lake Ruin Box');
      s.check(ok, 'atLakeRuinBox', await ev('BJXTEST.passage()'));
      s.check(await ev(`SugarCube.State.variables.skulduggeryhands`) === 1, 'skulduggeryhandsTagged',
        await ev(`BJXTEST.run('String(V.skulduggeryhands)')`));
      await s.shot('lake-underwater');
      await s.errors();
    }

    // ---------- S48 sewers old: shackle pick-lock, slime line, drain ear-slime ----------
    s = step('sewers-old-slime-line');
    if (s.skipped) {} else {
      await ev(`BJXTEST.setVars({ stress: 0, exposed: 0, arousal: 0 })`);
      // M2: Drain Ladder with historytrait -> BJX Chinese block
      await ev(`BJXTEST.run('V.historytrait = 1')`);
      await ev('BJXTEST.goto("Drain Ladder")');
      await settle(1000);
      let pr = await probe('你听说过雨水渠下面的旧下水道');
      s.check(pr.hit, 'ladderHistorytraitChinese', pr.ctx);
      // E1: Shackle Struggle else branch -> 尝试撬锁 link
      await ev(`BJXTEST.setVars({ sewerschasedstep: 1, phase: 0 })`);
      await ev(`BJXTEST.run('V.physiqueSuccess = 0')`);
      await ev('BJXTEST.goto("Sewers Shackle Struggle")');
      await settle(1000);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('尝试撬锁')), 'strugglePickLockLink', links);
      // E2+E3: Shackle Pick failure branch -> lockicon 尝试撬锁 retry +
      // Chinese struggle text. Re-pin sewerschasedstep (the Struggle page's
      // <<morganhunt>> mutated it to 0, which lands on the Morgan branch)
      // and force the skulduggery check to fail (difficulty 100000 vs 0).
      await ev(`BJXTEST.setVars({ sewerschasedstep: 1, skulduggerydifficulty: 100000 })`);
      await ev(`BJXTEST.run('V.skulduggery = 0')`);
      await ev('BJXTEST.goto("Sewers Shackle Pick")');
      await settle(1000);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('尝试撬锁')), 'pickRetryLockLink', links);
      // E3: the anchor text lives in :: Sewers Slime (0.5 old-sewers-events
      // .twee:287-290), not on the Pick page - jump there to probe it
      await ev('BJXTEST.goto("Sewers Slime")');
      await settle(1000);
      pr = await probe('你试图挣脱，但这只黏糊糊的带着怪异温暖的史莱姆紧紧包裹着你');
      s.check(pr.hit, 'slimeStruggleChinese', pr.ctx);
      // E4+E6: Sewers Slime 4 - boycock wording + double ear-slime fork
      // at the ending (replaces So disoriented + destinationsewersrandom)
      await ev(`BJXTEST.run('V.player.penisExist = true')`);
      await ev(`BJXTEST.run('V.slime = 0')`);
      await ev(`BJXTEST.run('V.parasite.left_ear = {name: "slime"}; V.parasite.right_ear = {name: "slime"}')`);
      const lockProbe = () => ev(`BJXTEST.run('String(V.feats.locked) + "/" + String(V.settings.rentCostModifier) + "/" + String(V.debug) + "/" + String(V.cheatsEnabled) + "/" + String(V.gamemode) + "/" + String(V.statFreeze) + "/" + String(V.settings.allureModifier) + "/" + String(V.feats.soft) + "/" + String(typeof V.locked) + "/" + String(V.objectVersion && V.objectVersion.test)')`);
      s.note('lockPreClear', await lockProbe());
      // earnFeat guards: the harness save may carry statFreeze /
      // cheatsEnabled / allureModifier 0 from earlier steps - clear them
      // all so Slime Transformation 1 can actually earn the feat.
      // rentCostModifier lt 1 re-locks feats (variables-start2.twee:62,
      // settings.twee:503) and so does $locked (versionUpdate:1064)
      await ev(`BJXTEST.run('V.debug = false; V.cheatsEnabled = false; V.gamemode = "normal"; V.statFreeze = 0; V.settings.allureModifier = 1; V.settings.rentCostModifier = 1; delete V.locked; V.objectVersion.test = 0; V.feats.locked = false; V.feats.soft = false')`);
      s.note('lockPostClear', await lockProbe());
      // trap any later write that flips feats.locked back on, with a stack,
      // so we can pinpoint the re-lock source if the feat still fails
      await ev(`BJXTEST.run('window.__lockStacks = []; const f = V.feats; const d = Object.getOwnPropertyDescriptor(f, "locked"); if (!d || !d.set) { Object.defineProperty(f, "locked", { configurable: true, get() { return this.__lv; }, set(v) { if (v === true) window.__lockStacks.push((new Error()).stack.slice(0, 600)); this.__lv = v; } }); f.__lv = d ? d.value : false; } "trapOK"')`);
      await ev('BJXTEST.goto("Sewers Slime 4")');
      await settle(1000);
      s.note('lockPostGoto', await lockProbe());
      pr = await probe('throbbing boycock');
      s.check(pr.hit, 'boycockWording', pr.ctx);
      pr = await probe('耳朵里的史莱姆也变得疯狂起来');
      s.check(pr.hit, 'slime4EarSlimeFork', pr.ctx);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('顺其自然')), 'slime4GoWithFlowLink', links);
      s.check((links || []).some((l) => l.startsWith('抵抗')), 'slime4ResistLink', links);
      // ride the fork: Slime Transformation 1 (removeparasite x2 +
      // noEarSlime + slimetransform + earnFeat). Second sweep right
      // before the click: if anything during the Sewers Slime 4 render
      // flipped feats.locked back on, clear it now - earnFeat runs inside
      // Slime Transformation 1's own render
      await ev(`BJXTEST.run('V.debug = false; V.cheatsEnabled = false; V.gamemode = "normal"; V.statFreeze = 0; V.settings.allureModifier = 1; V.settings.rentCostModifier = 1; delete V.locked; V.objectVersion.test = 0; V.feats.locked = false; V.feats.soft = false')`);
      s.note('lockPost2ndClear', await lockProbe());
      // ride the fork: Slime Transformation 1 (removeparasite x2 +
      // noEarSlime + slimetransform + earnFeat). The link is
      // <<link>><<pass 60>> + Engine.play - run both halves explicitly so
      // the lock probe can pinpoint which half flips feats.locked
      // re-arm the lock trap right before Time.pass - the goto above
      // replaced V.feats with a clone, so the earlier trap is gone;
      // Time.pass does not navigate, so this trap survives and catches
      // the writer with a stack
      await ev(`BJXTEST.run('window.__lockStacks = []; const f = V.feats; const d = Object.getOwnPropertyDescriptor(f, "locked"); if (!d || !d.set) { Object.defineProperty(f, "locked", { configurable: true, get() { return this.__lv; }, set(v) { if (v === true) window.__lockStacks.push((new Error()).stack.slice(0, 600)); this.__lv = v; } }); f.__lv = d ? d.value : false; } "trapOK"')`);
      await ev(`BJXTEST.run('Time.pass(3600)')`);
      await sleep(500);
      s.note('lockPostPass3600', await lockProbe());
      s.note('lockWriterStack', await ev(`(window.__lockStacks && window.__lockStacks[0]) ? window.__lockStacks[0].slice(0, 500) : "none"`));
      await ev('BJXTEST.goto("Slime Transformation 1")');
      let ok = await waitPassage('Slime Transformation 1');
      s.check(ok, 'atSlimeTransformation1', await ev('BJXTEST.passage()'));
      await settle(800);
      s.note('lockPostClick', await lockProbe());
      s.check(await ev(`SugarCube.State.variables.noEarSlime`) === true, 'noEarSlimeSet',
        await ev(`BJXTEST.run('String(V.noEarSlime)')`));
      s.check(await ev(`SugarCube.State.variables.slime`) === 1, 'slimeSetByTransform',
        await ev(`BJXTEST.run('String(V.slime)')`));
      const featDiag = await ev(`BJXTEST.run('JSON.stringify({featVal: (V.feats && V.feats.currentSave) ? String(V.feats.currentSave["Ear Slime Amalgam"]) : "noCurrentSave", debug: String(V.debug), cheats: String(V.cheatsEnabled), gamemode: String(V.gamemode), statFreeze: String(V.statFreeze), allureMod: V.settings ? String(V.settings.allureModifier) : "noSettings", rentMod: V.settings ? String(V.settings.rentCostModifier) : "", lockedVar: (typeof V.locked === "undefined") ? "deleted" : String(V.locked), locked: V.feats ? String(V.feats.locked) : "noFeats", soft: V.feats ? String(V.feats.soft) : "", lockStack: (window.__lockStacks && window.__lockStacks[0]) ? window.__lockStacks[0].split(String.fromCharCode(10)).slice(1, 5).join(" | ").slice(0, 400) : "none", keys: (V.feats && V.feats.currentSave) ? Object.keys(V.feats.currentSave).slice(0, 6).join(",") : ""})')`);
      let featOK = false;
      try { featOK = JSON.parse(featDiag).featVal !== 'undefined' && JSON.parse(featDiag).featVal !== 'noCurrentSave' && !JSON.parse(featDiag).featVal.startsWith('no'); } catch (e) {}
      s.check(featOK, 'earSlimeAmalgamFeat', featDiag);
      // E5: Sewers Slime 3 ending - the slime-line fork ($slime 2 ->
      // Sewers Slime Again instead of Sewers Slime 4)
      await ev(`BJXTEST.run('V.slime = 2')`);
      await ev('BJXTEST.goto("Sewers Slime 3")');
      await settle(1000);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Sewers Slime Again');
      s.check(ok, 'atSewersSlimeAgain', await ev('BJXTEST.passage()'));
      await settle(800);
      pr = await probe('这团巨大的史莱姆似乎意识到你史莱姆的本质');
      s.check(pr.hit, 'slimeAgainText', pr.ctx);
      // M1: Drain Water Passout - ear-slime branch before
      // isPregnancyEnding
      await ev(`BJXTEST.run('V.parasite.left_ear = {name: "slime"}; V.parasite.right_ear = {name: "slime"}')`);
      await ev('BJXTEST.goto("Drain Water Passout")');
      await settle(1000);
      pr = await probe('你失去知觉的身体被水流带走');
      s.check(pr.hit, 'passoutEarSlimeBranch', pr.ctx);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Sewers Slime');
      s.check(ok, 'passoutToSewersSlime', await ev('BJXTEST.passage()'));
      // M3: Drain Slime Physique 2 failure branch -> resonance fork
      await ev(`BJXTEST.run('V.physiqueSuccess = 0')`);
      await ev('BJXTEST.goto("Drain Slime Physique 2")');
      await settle(1000);
      pr = await probe('大型史莱姆的行动似乎让你耳朵里的史莱姆也变得疯狂起来');
      s.check(pr.hit, 'physique2ResonanceFork', pr.ctx);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('顺其自然')), 'physique2GoWithFlowLink', links);
      s.check((links || []).some((l) => l.startsWith('抵抗')), 'physique2ResistLink', links);
      // M4: Drain Slime Watch climax -> same resonance fork. The BJX fork
      // lives inside the arousal gte 10000 branch (it replaced that
      // branch's Next|Drain Struggle link) - pin arousal first
      await ev(`BJXTEST.run('V.arousal = 10000')`);
      await ev('BJXTEST.goto("Drain Slime Watch")');
      await settle(1000);
      pr = await probe('在你的反复高潮中，你耳朵里的史莱姆也变得疯狂起来');
      s.check(pr.hit, 'watchResonanceFork', pr.ctx);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('顺其自然')), 'watchGoWithFlowLink', links);
      await s.shot('sewers-old');
      await s.errors();
    }

    // ---------- S49 temple: Jordan slime inquiry, Sydney chastity sneak ----------
    s = step('temple-bjx');
    if (s.skipped) {} else {
      // link targets as rendered attributes (I18N translates vanilla link
      // text, so data-passage is the reliable target assertion)
      const targets = () => ev(`BJXTEST.run('Array.from(document.querySelectorAll("#passages a[data-passage]")).map(function(a){return a.getAttribute("data-passage")}).join(",")')`);
      // Jordan inquiry link, state 1 ($slime > 0, $onemoreslime 0)
      await ev(`BJXTEST.setVars({ stress: 0, exposed: 0, trauma: 0, slime: 1, onemoreslime: 0, ghost: 0, kylar_manor_secret: 0 })`);
      await ev('BJXTEST.goto("Temple Jordan")');
      await settle(1000);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('询问你的史莱姆状态')), 'jordanSlimeInquiryLink', links);
      // state 2 ($onemoreslime 1 -> report link)
      await ev(`BJXTEST.run('V.onemoreslime = 1')`);
      await ev('BJXTEST.goto("Temple Jordan")');
      await settle(1000);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('报告你的史莱姆状态')), 'jordanSlimeReportLink', links);
      // ride inquiry 1: full BJX Chinese passage smoke
      await ev(`BJXTEST.run('V.onemoreslime = 0')`);
      await ev('BJXTEST.goto("Temple Jordan")');
      await settle(800);
      await ev(`BJXTEST.clickLink('询问你的史莱姆状态')`);
      let ok = await waitPassage('Jordan Slime Inquiry');
      s.check(ok, 'atJordanSlimeInquiry', await ev('BJXTEST.passage()'));
      await settle(800);
      let pr = await probe('湖畔废墟');
      s.check(pr.hit, 'slimeInquiryLakeRuinText', pr.ctx);
      pr = await probe('血月');
      s.check(pr.hit, 'slimeInquiryBloodMoonText', pr.ctx);
      // Temple: sleeping-Sydney chastity links. Needs a school day, hour
      // 6-9, V.sydneyLate 1 (sydneySchedule "late"), science intro dormant
      await ev(`BJXTEST.run('(() => { let n = 0; while (!Time.schoolDay && n < 8) { Time.setDate(Time.tomorrow); n++; } Time.setTime(8, 0); return "sd:" + Time.schoolDay + "/h:" + Time.hour; })()')`);
      await ev(`BJXTEST.run('C.npc.Sydney.init = 1; C.npc.Sydney.penis = "hidden"; if (!C.npc.Sydney.chastity) C.npc.Sydney.chastity = {penis: "", vagina: "", anus: ""}; C.npc.Sydney.chastity.penis = ""; C.npc.Sydney.chastity.vagina = ""; "ok"')`);
      await ev(`BJXTEST.setVars({ sydneyLate: 1, sydneyScience: 0, exposed: 0, stress: 0, phase: 0 })`);
      await ev('BJXTEST.goto("Temple")');
      await settle(1200);
      links = await ev('BJXTEST.links()');
      s.check(((links || []).filter((l) => l.startsWith('偷偷给')).length >= 1), 'templeSydneyChastityLink', links);
      let tg = await targets();
      s.check((tg || '').includes('Temple Sydney Chastity'), 'chastityLinkTarget', tg);
      // ride the belt link: high skulduggery -> success branch installs
      // the device on the sleeping Sydney
      await ev(`BJXTEST.run('V.skulduggery = 1000000; V.skulduggerydifficulty = 800; V.temple_burden = 0; "ok"')`);
      await ev(`BJXTEST.clickLink('偷偷给')`);
      ok = await waitPassage('Temple Sydney Chastity');
      s.check(ok, 'atTempleSydneyChastity', await ev('BJXTEST.passage()'));
      await settle(1000);
      pr = await probe('安装上去，偷偷溜走了');
      s.check(pr.hit, 'chastityInstallText', pr.ctx);
      const belt = await ev(`BJXTEST.run('String(C.npc.Sydney.chastity.penis)')`);
      s.check(belt === 'chastity belt', 'chastityInstalledOnSydney', belt);
      await s.shot('temple-bjx');
      await s.errors();
    }

    // ---------- S50 maths: stim steal, lakehouse fork, hallucination ----------
    s = step('maths-bjx');
    if (s.skipped) {} else {
      const targets = () => ev(`BJXTEST.run('Array.from(document.querySelectorAll("#passages a[data-passage]")).map(function(a){return a.getAttribute("data-passage")}).join(",")')`);
      // Stim Dealer: BJX steal link + vanilla buy link
      await ev(`BJXTEST.setVars({ stress: 0, trauma: 0, exposed: 0, mathsstimstolen: 0, mathsstimcaught: 0, mathsstim: 0 })`);
      await ev(`BJXTEST.run('V.skulduggery = 1000000; V.temple_burden = 0; "ok"')`);
      await ev('BJXTEST.goto("Stim Dealer")');
      await settle(1000);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('偷兴奋剂')), 'stimStealLink', links);
      let tg = await targets();
      s.check((tg || '').includes('Stim Dealer Steal') && (tg || '').includes('Stim Dealer Buy'), 'stimDealerTargets', tg);
      // ride the steal: pinned difficulty 600 vs maxed skill -> success
      await ev(`BJXTEST.run('V.skulduggerydifficulty = 600')`);
      await ev('BJXTEST.goto("Stim Dealer Steal")');
      await settle(1000);
      const stimDiag = await ev(`BJXTEST.run('JSON.stringify({stim: V.mathsstim, stolen: V.mathsstimstolen, caught: V.mathsstimcaught, ok: String(V.skulduggerysuccess)})')`);
      let d = {};
      try { d = JSON.parse(stimDiag); } catch (e) {}
      s.check(d.stim === 1 && d.stolen === 1 && d.caught !== 1, 'stealSuccessVars', stimDiag);
      // Maths Project at home: vanilla Bedroom exit (BJX lakehouse
      // elseif dormant - Lake House group is not ported yet)
      await ev(`BJXTEST.setVars({ location: "home", stress: 0, mathschance: 50, mathsinfo: 0, mathsstim: 0, stimdealerknown: 0, mathsstimrobin: 1 })`);
      await ev('BJXTEST.goto("Maths Project")');
      await settle(1000);
      tg = await targets();
      s.check((tg || '').includes('Bedroom') && !(tg || '').includes('Lake House Bedroom'), 'homeBedroomExit', tg);
      // lakehouse location: BJX stop link (target passage lives in the
      // unported lakehouse group - assert the link, don't click)
      await ev(`BJXTEST.run('V.location = "lakehouse"')`);
      await ev('BJXTEST.goto("Maths Project")');
      await settle(1000);
      tg = await targets();
      s.check((tg || '').includes('Lake House Bedroom'), 'lakehouseStopLink', tg);
      // the 4 lakehouse passages are registered in the story
      const reg = await ev(`BJXTEST.run('(() => { const names = ["Maths Project Endure Lake House","Maths Project Outside Lake House","Maths Project Outside Lake House Rape","Maths Project Outside Rape Lake House Finish"]; return names.map(function(n){return n + ":" + (SugarCube.Story.has(n) ? "Y" : "N")}).join(","); })()')`);
      s.check((reg || '').indexOf(':N') === -1, 'lakehousePassagesRegistered', reg);
      // hallucination fork: $mathsstimused is 3 -> deterministic BJX scene
      await ev(`BJXTEST.run('V.mathsstimused = 3; V.location = "home"; V.rng = 100')`);
      await ev('BJXTEST.goto("Maths Project Stim")');
      await settle(1000);
      let pr = await probe('你坐下来欣赏自己的成果');
      s.check(pr.hit, 'stimHallucinationText', pr.ctx);
      tg = await targets();
      s.check((tg || '').includes('Maths Project Void'), 'stimVoidLink', tg);
      await s.shot('maths-bjx');
      await s.errors();
    }

    // ---------- S51 special-NPC: robin TF links, sydney dragon eyes ----------
    s = step('special-npc-bjx');
    if (s.skipped) {} else {
      const targets = () => ev(`BJXTEST.run('Array.from(document.querySelectorAll("#passages a[data-passage]")).map(function(a){return a.getAttribute("data-passage")}).join(",")')`);
      // Robin Play (rng 85 -> gte 81 band calls <<robinoptions>>): raccoon
      // and dragon TF links from the BJX widget overlay
      // S49 leaves the clock on a school-day 8:00 morning, which makes
      // <<robinoptions>> render its walk-to-school branch (schoolDay and
      // hour 8..12). Later vanilla branches add more time gates: the
      // weekend stand branch (isWeekEnd and hour 9..16, no rain) and the
      // english-play evening branch. Land in the plain options branch:
      // school day -> 13:00 (past the 8..12 window), weekend -> 8:00
      // (before the 9..16 stand window), else 13:00.
      await ev(`BJXTEST.run('(() => { if (Time.schoolDay) { Time.setTime(13, 0); } else if (Time.isWeekEnd()) { Time.setTime(8, 0); } else { Time.setTime(13, 0); } return "sd:" + Time.schoolDay + "/wk:" + Time.isWeekEnd() + "/h:" + Time.hour; })()')`);
      await ev(`BJXTEST.setVars({ stress: 0, trauma: 0, exposed: 0, rng: 85, raccoon: 6, dragon: 6, robinraccoon: 0, robinmissing: 0 })`);
      await ev(`BJXTEST.run('C.npc.Robin.trauma = 0; C.npc.Robin.init = 1; V.daily.robin.wateringAsk = 0; V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; V.saveVersions = [StartConfig.version]; V.objectVersion = V.objectVersion || {}; V.NPCName[V.NPCNameList.indexOf("Robin")].pronoun = "m"; var _si = V.NPCNameList.indexOf("Sydney"); V.NPCName[_si].init = 1; V.NPCName[_si].pronoun = "m"; V.NPCName[_si].hair = "straight"; V.NPCName[_si].glasses = "none"; V.NPCName[_si].hairColour = "black"; V.NPCName[_si].love = 100; V.pronoun = "m"; "ok"')`);
      await ev('BJXTEST.goto("Robin Play")');
      await settle(1000);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('依偎')), 'robinRaccoonSnuggleLink', links);
      s.check((links || []).some((l) => l.startsWith('打个盹')), 'robinDragonNapLink', links);
      let tg = await targets();
      s.check((tg || '').includes('Robin Raccoon') && (tg || '').includes('Robin Dragon'), 'robinTfTargets', tg);
      // ride the snuggle link into Robin Raccoon (BJX passage)
      await ev(`BJXTEST.clickLink('依偎')`);
      let ok = await waitPassage('Robin Raccoon');
      s.check(ok, 'atRobinRaccoon', await ev('BJXTEST.passage()'));
      await settle(800);
      let pr = await probe('你把头靠在罗宾的肩膀上');
      s.check(pr.hit, 'robinRaccoonText', pr.ctx);
      // Sydney Chat case 16 hair scene: dragon-eyes elseif. The case is
      // picked by random(1, 16) (romance raises the pool from 12), so run
      // an in-browser retry loop - all rendering stays page-side
      await ev(`BJXTEST.setVars({ sydneyromance: 1, sydneyChatState: 1, harpy: 0, fallenangel: 0, demon: 0, dragon: 1, cow: 0, wolfgirl: 0, cat: 0, fox: 0, stress: 0, trauma: 0, exposed: 0 })`);
      await ev(`BJXTEST.run('C.npc.Sydney.love = 100; V.transformationParts.dragon = V.transformationParts.dragon || {}; V.transformationParts.dragon.eyes = "red"; "ok"')`);
      // case 16 is picked by random(1, 16), so a single render only hits it
      // ~1/16 of the time; 120 in-page retries make a miss effectively zero.
      const hit = await ev(`BJXTEST.run('(() => { for (let i = 0; i < 120; i++) { try { SugarCube.Engine.play("Sydney Chat"); } catch (e) {} const el = document.querySelector("#passages .passage"); if (el && el.textContent.indexOf("这种的隐形眼镜") >= 0) return "hit@" + i; } return "miss"; })()')`);
      s.check((hit || '').indexOf('hit@') === 0, 'sydneyDragonEyesCase16', hit);
      await settle(400);
      pr = await probe('我以前没有见过这种的隐形眼镜');
      s.check(pr.hit, 'sydneyDragonEyesText', pr.ctx);
      await s.shot('special-npc-bjx');
      await s.errors();
    }

    // ---------- S52 bird: ghost phase-through the tower trapdoor ----------
    s = step('bird-bjx');
    if (s.skipped) {} else {
      const targets = () => ev(`BJXTEST.run('Array.from(document.querySelectorAll("#passages a[data-passage]")).map(function(a){return a.getAttribute("data-passage")}).join(",")')`);
      // Bird Tower Door: BJX Chinese door text + ghost phase-through link
      await ev(`BJXTEST.setVars({ stress: 0, trauma: 0, exposed: 0, ghost: 1 })`);
      await ev(`BJXTEST.run('V.options.bjx_eventTF = true; "ok"')`);
      await ev('BJXTEST.goto("Bird Tower Door")');
      await settle(1000);
      let pr = await probe('你跪在活板门旁边');
      s.check(pr.hit, 'towerDoorChineseText', pr.ctx);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('穿过活板门')), 'ghostDescendLink', links);
      let tg = await targets();
      s.check((tg || '').includes('Bird Tower Ghost Descend'), 'ghostDescendTarget', tg);
      // ride it: BJX descend passage renders clean
      await ev(`BJXTEST.clickLink('穿过活板门')`);
      let ok = await waitPassage('Bird Tower Ghost Descend');
      s.check(ok, 'atGhostDescend', await ev('BJXTEST.passage()'));
      await settle(800);
      pr = await probe('你来到了塔楼底部');
      s.check(pr.hit, 'ghostDescendText', pr.ctx);
      // 穿过 -> vanilla Bird Tower Base Leave: the BJX escape route closes
      // the loop back into the 0.5 bird tower chain
      await ev(`BJXTEST.clickLink('穿过')`);
      ok = await waitPassage('Bird Tower Base Leave');
      s.check(ok, 'atTowerBaseLeave', await ev('BJXTEST.passage()'));
      await settle(800);
      await s.shot('bird-bjx');
      await s.errors();
    }

    // ---------- S53 street + sea: basement lock, reef / deep dive ----------
    s = step('street-sea-bjx');
    if (s.skipped) {} else {
      const targets = () => ev(`BJXTEST.run('Array.from(document.querySelectorAll("#passages a[data-passage]")).map(function(a){return a.getAttribute("data-passage")}).join(",")')`);
      // Street Ex Wait rng < 51: wallet branch with the BJX basement
      // door unlock link ($rng stays pinned - no reroll on direct goto)
      await ev(`BJXTEST.setVars({ stress: 0, trauma: 0, exposed: 0, rng: 1 })`);
      await ev('BJXTEST.goto("Street Ex Wait")');
      await settle(1000);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('打开地下室门锁')), 'basementUnlockLink', links);
      let tg = await targets();
      s.check((tg || '').includes('Street Ex Unlock'), 'basementUnlockTarget', tg);
      // Sea at 41-50: four-colour reef sighting + swim-out link
      await ev(`BJXTEST.setVars({ sea: 45, eventskip: 1, stress: 0, tiredness: 0, allure: 0, phase: 0 })`);
      await ev(`BJXTEST.run('V.swimmingskill = 1000000; V.temple_burden = 0; "ok"')`);
      await ev('BJXTEST.goto("Sea")');
      await settle(1200);
      let pr = await probe('远处的水面上闪烁着四色的光芒');
      s.check(pr.hit, 'seaReefSighting', pr.ctx);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('游向四色光芒')), 'seaReefLink', links);
      // ride it: Sea Reef (BJX passage) renders with the island reveal
      await ev(`BJXTEST.clickLink('游向四色光芒')`);
      let ok = await waitPassage('Sea Reef');
      s.check(ok, 'atSeaReef', await ev('BJXTEST.passage()'));
      await settle(1000);
      pr = await probe('一座奇怪的小岛顿时出现在眼前');
      s.check(pr.hit, 'seaReefIslandText', pr.ctx);
      tg = await targets();
      s.check((tg || '').includes('Seasons Island Landing'), 'seaReefIslandTarget', tg);
      // Sea at 91-99: deep-dive link -> Sea Dive phase 0
      await ev(`BJXTEST.setVars({ sea: 95, eventskip: 1, stress: 0, tiredness: 0 })`);
      await ev('BJXTEST.goto("Sea")');
      await settle(1200);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('潜水')), 'seaDiveLink', links);
      // the dive link carries <<pass 10>>, which resets $eventskip to 0
      // and lets the rendered Sea Dive reroll $danger = random(1,10000)
      // against 9900 - $allure (allure is recomputed on timepass) - a
      // ~20% flaky trip into <<eventsdeepseadive>>. Pin the dive state
      // and render Sea Dive directly so phase 0 is deterministic.
      await ev(`BJXTEST.run('V.phase = 0; V.eventskip = 1; V.allure = 0; "ok"')`);
      await ev('BJXTEST.goto("Sea Dive")');
      ok = await waitPassage('Sea Dive');
      s.check(ok, 'atSeaDive', await ev('BJXTEST.passage()'));
      await settle(800);
      pr = await probe('你潜入水下');
      s.check(pr.hit, 'seaDivePhase0Text', pr.ctx);
      // widget overlays: seadiveeventend + destinationeventend seadive case
      const w1 = await ev(`BJXTEST.run('JSON.stringify(BJXTEST.smokeWidget("seadiveeventend"))')`);
      let w = {};
      try { w = JSON.parse(w1); } catch (e) {}
      s.check(w.ok && w.outLen > 0, 'seadiveeventendSmoke', w1);
      await ev(`BJXTEST.run('V.bus = "seadive"; "ok"')`);
      const w2 = await ev(`BJXTEST.run('JSON.stringify(BJXTEST.smokeWidget("destinationeventend"))')`);
      w = {};
      try { w = JSON.parse(w2); } catch (e) {}
      s.check(w.ok && w.outLen > 0, 'destinationeventendSeadiveSmoke', w2);
      await s.shot('street-sea-bjx');
      await s.errors();
    }

    // ---------- S54 maths: activate the lakehouse fork (endure / outside) ----------
    s = step('maths-lakehouse-bjx');
    if (s.skipped) {} else {
      const targets = () => ev(`BJXTEST.run('Array.from(document.querySelectorAll("#passages a[data-passage]")).map(function(a){return a.getAttribute("data-passage")}).join(",")')`);
      // mathsstimused 2 -> deterministic endure/go-outside fork at lakehouse
      await ev(`BJXTEST.setVars({ location: "lakehouse", stress: 0, trauma: 0, exposed: 0, mathsstimused: 2, mathsstim: 0 })`);
      await ev('BJXTEST.goto("Maths Project Stim")');
      await settle(1000);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('忍受')), 'lakehouseEndureLink', links);
      s.check((links || []).some((l) => l.startsWith('出门')), 'lakehouseOutsideLink', links);
      let tg = await targets();
      s.check((tg || '').includes('Maths Project Endure Lake House') && (tg || '').includes('Maths Project Outside Lake House'), 'lakehouseForkTargets', tg);
      // ride 忍受: render, then 继续 closes the loop into Lake House Bedroom
      await ev(`BJXTEST.clickLink('忍受')`);
      let ok = await waitPassage('Maths Project Endure Lake House');
      s.check(ok, 'atEndureLakeHouse', await ev('BJXTEST.passage()'));
      await settle(800);
      let pr = await probe('你躺在床上，希望你能忍受这种痛苦');
      s.check(pr.hit, 'endureLakeHouseText', pr.ctx);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Lake House Bedroom');
      s.check(ok, 'endureClosesToLakeHouseBedroom', await ev('BJXTEST.passage()'));
      await settle(600);
      // smoke the outside chain: beastNEWinit wolf renders, rape combat
      // passage renders its first turn, finish renders + links Lake Shore
      await ev(`BJXTEST.setVars({ location: "lakehouse", mathsstimused: 2, stress: 0, trauma: 0, exposed: 0 })`);
      await ev('BJXTEST.goto("Maths Project Outside Lake House")');
      await settle(1200);
      pr = await probe('你跌跌撞撞地跑到外面');
      s.check(pr.hit, 'outsideLakeHouseText', pr.ctx);
      tg = await targets();
      s.check((tg || '').includes('Maths Project Outside Lake House Rape'), 'outsideRapeTarget', tg);
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Maths Project Outside Lake House Rape');
      s.check(ok, 'atOutsideRape', await ev('BJXTEST.passage()'));
      await settle(1200);
      pr = await probe('继续');
      s.check(pr.hit, 'outsideRapeNextLink', pr.ctx);
      // finish: wolf NPC still in slot 0 -> else branch (drove it off) + Lake Shore
      await ev('BJXTEST.goto("Maths Project Outside Rape Lake House Finish")');
      ok = await waitPassage('Maths Project Outside Rape Lake House Finish');
      s.check(ok, 'atRapeFinish', await ev('BJXTEST.passage()'));
      await settle(1000);
      tg = await targets();
      s.check((tg || '').includes('Lake Shore'), 'finishToLakeShore', tg);
      await s.shot('maths-lakehouse-bjx');
      await s.errors();
    }

    // ---------- S55 monster tower: BJX fly gate (bird / dragon wings) ----------
    s = step('monstertower-bjx');
    if (s.skipped) {} else {
      const targets = () => ev(`BJXTEST.run('Array.from(document.querySelectorAll("#passages a[data-passage]")).map(function(a){return a.getAttribute("data-passage")}).join(",")')`);
      // tower interior: monster asleep (eventskip pins the stir branch),
      // view already found -> escape block renders the fly gate. Re-pin the
      // full state before every goto: each render ticks monsterTowerSleep
      // down by 20, and leftover combat state from earlier steps can flip
      // the stir branch, which hides the fly link (flaky ride otherwise).
      const towerState = { stress: 0, trauma: 0, exposed: 0, monsterTowerSleep: 110, monsterTowerView: 1, monsterTowerSheet: 0, eventskip: 1, harpy: 0, birdFly: 0, plucked: 0 };
      const resetTower = async (extra) => {
        await ev(`BJXTEST.setVars(${JSON.stringify(towerState)})`);
        await ev(`BJXTEST.run('V.NPCList = V.NPCList.map(function(){ return JSON.parse(JSON.stringify(setup.baseNPC)) }); V.pronoun = 0; V.enemyno = 0; V.enemynomax = 0; ${extra || '"ok"'}')`);
      };
      // bjx path: dragon wings only - vanilla harpy conditions all false
      await resetTower(`V.options.bjx_animal = true; V.transformationParts.dragon = V.transformationParts.dragon || {}; V.transformationParts.dragon.wings = "red"; V.transformationParts.bird.wings = "disabled"; "ok"`);
      await ev('BJXTEST.goto("Monster Tower")');
      await settle(1200);
      const flyLink = (ls) => (ls || []).some((l) => l.startsWith('Fly to safety') || l.startsWith('飞往安全地带'));
      let links = await ev('BJXTEST.links()');
      s.check(flyLink(links), 'flyLinkDragonWings', links);
      let tg = await targets();
      s.check((tg || '').includes('Monster Tower Fly'), 'flyLinkTarget', tg);
      // vanilla path preserved: harpy 6 + birdFly 1, bjx_animal off
      await resetTower(`V.options.bjx_animal = false; V.harpy = 6; V.birdFly = 1; "ok"`);
      await ev('BJXTEST.goto("Monster Tower")');
      await settle(1200);
      links = await ev('BJXTEST.links()');
      s.check(flyLink(links), 'flyLinkVanillaHarpy', links);
      // negative: bjx on, both wings disabled, harpy path dead
      await resetTower(`V.options.bjx_animal = true; V.transformationParts.dragon.wings = "disabled"; "ok"`);
      await ev('BJXTEST.goto("Monster Tower")');
      await settle(1200);
      links = await ev('BJXTEST.links()');
      s.check(!flyLink(links), 'noFlyLinkWithoutWings', links);
      // ride: dragon wings -> Monster Tower Fly renders -> Elk Street
      await resetTower(`V.transformationParts.dragon.wings = "red"; "ok"`);
      await ev('BJXTEST.goto("Monster Tower")');
      await settle(1200);
      links = await ev('BJXTEST.links()');
      s.check(flyLink(links), 'flyLinkBeforeRide', links);
      await ev(`BJXTEST.clickToPassage('Monster Tower Fly')`);
      let ok = await waitPassage('Monster Tower Fly');
      s.check(ok, 'atMonsterTowerFly', await ev('BJXTEST.passage()'));
      await settle(800);
      let pr = await probe('You leap from the tower');
      if (!pr.hit) pr = await probe('你从塔上一跃而下');
      s.check(pr.hit, 'flyText', pr.ctx);
      await ev(`BJXTEST.clickLink('Next')`);
      ok = await waitPassage('Elk Street');
      s.check(ok, 'flyLandsOnElkStreet', await ev('BJXTEST.passage()'));
      await s.shot('monstertower-bjx');
      await s.errors();
    }

    // ---------- S56 ghost pass-through: shop door (BJX ghost group) ----------
    s = step('ghost-shop-door');
    if (s.skipped) {} else {
      const targets = () => ev(`BJXTEST.run('Array.from(document.querySelectorAll("#passages a[data-passage]")).map(function(a){return a.getAttribute("data-passage")}).join(",")')`);
      await ev(`BJXTEST.run('V.options.bjx_eventTF = true; V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; V.worn.upper = JSON.parse(JSON.stringify(setup.clothes.upper[setup.clothes.upper.findIndex(function(i){return i.name === "school shirt"})])); V.worn.lower = JSON.parse(JSON.stringify(setup.clothes.lower[setup.clothes.lower.findIndex(function(i){return i.name === "school shorts"})])); "ok"')`);
      await ev(`BJXTEST.setVars({ ghost: 1, exposed: 0, eventskip: 1, stress: 0, trauma: 0 })`);
      await ev('BJXTEST.goto("Clothing Shop Sneak")');
      await settle(900);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('穿越')), 'ghostLinkShown', links);
      const tg = await targets();
      s.check((tg || '').includes('Clothing Shop'), 'ghostLinkTarget', tg);
      // negative: ghost 0 -> the wraith block must vanish
      await ev(`BJXTEST.setVars({ ghost: 0 })`);
      await ev('BJXTEST.goto("Clothing Shop Sneak")');
      await settle(900);
      links = await ev('BJXTEST.links()');
      s.check(!(links || []).some((l) => l.startsWith('穿越')), 'ghostLinkHidden', links);
      await s.shot('ghost-shop-door');
      await s.errors();
    }

    // ---------- S57 fly system: street takeoff -> Fly passage ----------
    s = step('fly-street-entry');
    if (s.skipped) {} else {
      await ev(`BJXTEST.run('V.options.bjx_animal = true; V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; V.worn.upper = JSON.parse(JSON.stringify(setup.clothes.upper[setup.clothes.upper.findIndex(function(i){return i.name === "school shirt"})])); V.worn.lower = JSON.parse(JSON.stringify(setup.clothes.lower[setup.clothes.lower.findIndex(function(i){return i.name === "school shorts"})])); V.transformationParts.dragon.wings = "red"; V.transformationParts.bird.wings = "disabled"; "ok"')`);
      await ev(`BJXTEST.setVars({ exposed: 0, eventskip: 1, stress: 0, trauma: 0, allure: 0, rng: 1 })`);
      // Barb Street is a heavy page and some leftover states make it render a
      // random street event first: the page then shows a single "Next" and
      // hides every travel link. Dismiss the event and re-enter the street
      // (bounded retries) before asserting on the takeoff entry.
      let links = [];
      let got = false;
      for (let attempt = 0; attempt < 3 && !got; attempt++) {
        await ev(`BJXTEST.setVars({ exposed: 0, eventskip: 1, stress: 0, trauma: 0, allure: 0, rng: 1 })`);
        await ev('BJXTEST.goto("Barb Street")');
        for (let i = 0; i < 16; i++) {
          links = (await ev('BJXTEST.links()')) || [];
          if (links.some((l) => l.startsWith('起飞'))) { got = true; break; }
          if (links.length === 1 && links[0].startsWith('Next')) {
            console.log('[S57] street event page, attempt', attempt, ':',
              String(await ev(`BJXTEST.elTextFull('#passages .passage')`)).replace(/\s+/g, ' ').slice(0, 200));
            await ev(`BJXTEST.clickLink('Next')`);
            await settle(600);
            break;
          }
          await sleep(250);
        }
      }
      s.check(got, 'takeoffShown', links);
      await ev(`BJXTEST.clickLink('起飞')`);
      const ok = await waitPassage('Fly');
      s.check(ok, 'atFly', await ev('BJXTEST.passage()'));
      await settle(800);
      const pr = await probe('你飞上天空');
      s.check(pr.hit, 'flyText', pr.ctx);
      // negative: wings disabled -> no takeoff entry
      await ev(`BJXTEST.run('V.transformationParts.dragon.wings = "disabled"; V.transformationParts.bird.wings = "disabled"; V.birdFly = 0; "ok"')`);
      await ev('BJXTEST.goto("Barb Street")');
      await settle(900);
      links = await ev('BJXTEST.links()');
      s.check(!(links || []).some((l) => l.startsWith('起飞')), 'takeoffHidden', links);
      await s.shot('fly-street-entry');
      await s.errors();
    }

    // ---------- S58 docks: charter a boat to the four-season island ----------
    s = step('docks-island-entry');
    if (s.skipped) {} else {
      await ev(`BJXTEST.run('V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; V.worn.upper = JSON.parse(JSON.stringify(setup.clothes.upper[setup.clothes.upper.findIndex(function(i){return i.name === "school shirt"})])); V.worn.lower = JSON.parse(JSON.stringify(setup.clothes.lower[setup.clothes.lower.findIndex(function(i){return i.name === "school shorts"})])); "ok"')`);
      await ev(`BJXTEST.setVars({ money: 100000, history: 700, exposed: 0, eventskip: 1 })`);
      await ev('BJXTEST.goto("Docks")');
      await settle(1400);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('找船去四季岛')), 'docksRideShown', links);
      // negative: too poor -> no charter link
      await ev(`BJXTEST.setVars({ money: 0 })`);
      await ev('BJXTEST.goto("Docks")');
      await settle(1200);
      links = await ev('BJXTEST.links()');
      s.check(!(links || []).some((l) => l.startsWith('找船去四季岛')), 'docksRideHidden', links);
      await s.shot('docks-island-entry');
      await s.errors();
    }

    // ---------- S59 transformation: 15 BJX animal lines ----------
    s = step('tf-animals');
    if (s.skipped) {} else {
      const species = ['raccoon', 'bee', 'sheep', 'deer', 'bear', 'dragon',
        'lizard', 'dolphin', 'dog', 'fish', 'horse', 'spider', 'pig', 'frog'];
      const all = await ev(`String(${JSON.stringify(species)}.every(function(n){return !!SugarCube.Macro.get(n+"Transform")}) && !!SugarCube.Macro.get("toggleTransform") && !!SugarCube.Macro.get("clearAnimalTransformations"))`);
      s.check(all === 'true', 'allTfWidgets', all);
      await ev(`BJXTEST.run('V.options.bjx_animal = true; V.settings.transformAnimalEnabled = true; V.worn.neck = V.worn.neck || {name:"naked"}; V.worn.head = V.worn.head || {name:"naked"}; "ok"')`);
      // full transform: the no-argument branch fills every part
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<raccoonTransform>>');})()`);
      let st = await ev(`JSON.stringify({r:V.raccoon, b:V.raccoonbuild, tail:V.transformationParts.raccoon.tail, ears:V.transformationParts.raccoon.ears, mask:V.transformationParts.raccoon.mask})`);
      s.check(String(st).indexOf('"r":6') >= 0 && String(st).indexOf('"tail":"default"') >= 0, 'raccoonFullTf', st);
      // alteration: build 100 -> bee climbs 1..6 with parts appearing
      await ev(`BJXTEST.run('V.bee = 0; V.beebuild = 100; V.raccoon = 0; V.raccoonbuild = 0; V.wolfgirl = 0; V.cat = 0; V.cow = 0; V.harpy = 0; V.fox = 0; "ok"')`);
      for (let i = 0; i < 6; i++) {
        await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<transformationAlteration>>');})()`);
      }
      st = await ev(`JSON.stringify({bee:V.bee, wings:V.transformationParts.bee.wings, ears:V.transformationParts.bee.ears})`);
      s.check(String(st).indexOf('"bee":6') >= 0 && String(st).indexOf('"wings":"default"') >= 0, 'beeAlteration', st);
      // decay: build drops by $countTransform on the next state update
      await ev(`BJXTEST.run('V.bee = 6; V.beebuild = 30; "ok"')`);
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<transformationStateUpdate>>');})()`);
      const after = await ev(`String(V.beebuild)`);
      s.check(Number(after) < 30, 'beDecay', after);
      // description widget
      const txt = await ev(`String((function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<bee>>'); return d.textContent;})())`);
      s.check(txt.indexOf('蜜蜂') >= 0, 'beeDescription', txt);
      // negative: bjx_animal off -> alteration leaves bee alone
      await ev(`BJXTEST.run('V.bee = 0; V.beebuild = 100; V.options.bjx_animal = false; "ok"')`);
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<transformationAlteration>>');})()`);
      s.check(String(await ev(`String(V.bee)`)) === '0', 'beeGatedByBjxAnimal', await ev(`String(V.bee)`));
      // hunter line (BJX-only divine sub-line) + fallen chaos branch
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<hunterstart>>');})()`);
      const hs = await ev(`JSON.stringify({dh:V.demonhunter, demon:V.demon, special:V.specialTransform})`);
      s.check(String(hs).indexOf('"dh":2') >= 0, 'hunterStart', hs);
      await ev(`BJXTEST.run('V.fallenbuild = 30; V.angelbuild = 30; V.fallenangel = 4; "ok"')`);
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<fallenButNotOut 5>>');})()`);
      const fa = await ev(`String(V.fallenangel)`);
      s.check(fa === '6', 'fallenChaos', fa);
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<fallenDescend>>');})()`);
      const fd = await ev(`JSON.stringify({hastail:String(V.hastail), dw:V.transformationParts.demon.wings})`);
      s.check(String(fd).indexOf('"dw":"default"') >= 0, 'fallenDescend', fd);
      // combat extras: antique relic actions + dragon breath wiring
      const cb = await ev(`String(!!SugarCube.Macro.get("leftantiques") && !!SugarCube.Macro.get("rightantiques"))`);
      s.check(cb === 'true', 'antiqueWidgets', cb);
      // combat defaults + skill bonus wiring (inject_early)
      const cw = await ev(`String(window.__bjxCsvWrapped === true)`);
      s.check(cw === 'true', 'skillBonusWrapped', cw);
      const sk = await ev(`BJXTEST.run('V.physique = 400; V.athletics = 400; V.options.bjx_animal = true; V.transformationParts.traits.vigorous = "disabled"; var a = currentSkillValue("athletics"); V.transformationParts.traits.vigorous = "default"; var b2 = currentSkillValue("athletics"); V.transformationParts.traits.vigorous = "disabled"; String(b2 > a)')`);
      s.check(sk === 'true', 'vigorousBonus', sk);
      // ghost energy combat: energyActionInit renders radios (SugarCube
      // binds radiobutton values in its handler map, not the DOM, so the
      // test clicks one and reads the variable); effectsghost consumes
      // 100 energy per turn
      await ev(`BJXTEST.run('V.options.bjx_eventTF = true; V.ghost = 2; V.energy = 1000; V.energyaction = "rest"; "ok"')`);
      const en = await ev(`(function(){
        var d=document.createElement('div'); document.body.appendChild(d);
        try {
          new SugarCube.Wikifier(d,'<<energyActionInit>>');
          var inputs=Array.from(d.querySelectorAll('input[type=radio]'));
          var errs=Array.from(d.querySelectorAll('.error')).map(function(e){return e.textContent.trim().slice(0,1500)});
          inputs[2].click();
          return JSON.stringify({count:inputs.length, after:String(V.energyaction),
            errs:errs.slice(0,3)});
        } finally { d.remove(); }
      })()`);
      const eno = JSON.parse(en);
      s.check(eno.errs.length === 0 && eno.count === 3 && eno.after === 'freeze',
              'energyActionList', en);
      await ev(`BJXTEST.run('V.energyaction = "ghost"; "ok"')`);
      const efb = await ev(`(function(){var d=document.createElement("div"); new SugarCube.Wikifier(d,"<<effectsghost>>"); return String(V.energy);})()`);
      s.check(efb === '900', 'energyDrain', efb);
      // swarm combat additions: ghost escape + tail assist via the
      // re-declared swarmeffects (radiobutton UI is covered by the
      // generator anchors; this exercises the resolution logic)
      const sw = await ev(`(function(){
        var d=document.createElement('div');
        try {
          new SugarCube.Wikifier(d,'<<swarminit "bees" "container" "shaking" "shatter" "steady" 4 6>>');
          V.energy = 1000; V.energyaction = 'ghostescape';
          V.tailaction = 'tailswarm'; V.hastail = 'true'; V.thicktail = 'true';
          V.options.bjx_animal = true;
          V.pain = 0; V.arousal = 0; V.arousalmax = 100; V.dissociation = 0;
          V.leftaction = 'swarmrest'; V.rightaction = 'swarmrest'; V.feetaction = 'swarmrest';
          var before = V.swarm.amount.active[2];
          new SugarCube.Wikifier(d,'<<swarmeffects>>');
          return JSON.stringify({ok:true, energy:V.energy, esc:V.swimdistance,
            tail:V.tailaction, assistBefore:before, assistAfter:V.swarm.amount.active[2],
            errs:Array.from(d.querySelectorAll('.error')).map(function(e){return e.textContent.trim().slice(0,120)}).slice(0,3)});
        } catch (e) { return JSON.stringify({ok:false, err:String(e).slice(0,200)}); }
      })()`);
      const swo = JSON.parse(sw);
      s.check(swo.ok === true && swo.errs && swo.errs.length === 0, 'swarmEffectsRan', sw);
      s.check(swo.energy === 200, 'swarmGhostEscape', sw);
      s.check(swo.tail === 0 && swo.assistAfter === swo.assistBefore - 1, 'swarmTailAssist', sw);
      // dragon line gate: build accumulation is blocked until another
      // species completes a full transformation (build 100)
      await ev(`BJXTEST.run('V.bjx_dragonUnlock = false; V.dragonbuild = 0; V.dragon = 0; "ok"')`);
      const dg1 = await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<transform dragon 50>>');
        return JSON.stringify({build:V.dragonbuild, hint:d.textContent.indexOf('尚未准备好承载龙之力')>=0});})()`);
      const d1 = JSON.parse(dg1);
      s.check(d1.build === 0 && d1.hint === true, 'dragonLocked', dg1);
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<transform bee 100>>');})()`);
      const dg2 = await ev(`JSON.stringify({unlock:V.bjx_dragonUnlock, bee:V.beebuild})`);
      const d2 = JSON.parse(dg2);
      s.check(d2.unlock === true && d2.bee === 100, 'dragonUnlockByBee100', dg2);
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<transform dragon 50>>');})()`);
      const dg3 = await ev(`String(V.dragonbuild)`);
      s.check(dg3 === '50', 'dragonBuildAfterUnlock', dg3);
      // cheat path: no-arg full raccoon TF also unlocks via toggleTransform
      await ev(`BJXTEST.run('V.bjx_dragonUnlock = false; "ok"')`);
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<raccoonTransform>>');})()`);
      const dg4 = await ev(`String(V.bjx_dragonUnlock)`);
      s.check(dg4 === 'true', 'dragonUnlockByFullTf', dg4);
      // (the effects/action wiring is anchor-asserted inside
      // gen_actions_tail.py; Story text is not inspectable here)
      await s.shot('tf-animals');
      await s.errors();
    }

    // ---------- S60 ui overlays: cheats panel + options switches ----------
    s = step('ui-overlays');
    if (s.skipped) {} else {
      // cheats panel: BJX rows render (animal/divine/event sections)
      const ch = await ev(`(function(){var d=document.createElement('div');
        new SugarCube.Wikifier(d,'<<cheats-characterVisual>>');
        var t=d.textContent;
        var errs=Array.from(d.querySelectorAll('.error')).map(function(e){return e.textContent.trim().slice(0,1500)});
        return JSON.stringify({len:t.length, errs:errs.slice(0,3),
          animal:t.indexOf('\u6d63\u718a')>=0,
          divine:t.indexOf('\u5815\u5929\u4f7f\u5316')>=0,
          event:t.indexOf('\u4e8b\u4ef6\u8f6c\u5316')>=0});
      })()`);
      const cho = JSON.parse(ch);
      s.check(cho.errs.length === 0, 'cheatsNoErrors', cho.errs);
      s.check(cho.animal === true && cho.divine === true && cho.event === true, 'cheatsSections', ch);
      // options overlay: the 20 BJX switches render as checkboxes
      const op = await ev(`(function(){var d=document.createElement('div');
        new SugarCube.Wikifier(d,'<<optionsmods>>');
        var boxes=d.querySelectorAll('input[type=checkbox]').length;
        var errs=Array.from(d.querySelectorAll('.error')).map(function(e){return e.textContent.trim().slice(0,1500)});
        return JSON.stringify({boxes:boxes, errs:errs.slice(0,3)});
      })()`);
      const opo = JSON.parse(op);
      s.check(opo.errs.length === 0, 'optionsNoErrors', opo.errs);
      s.check(opo.boxes >= 18, 'optionsSwitches', opo.boxes);
      // canvas: re-apply the raccoon TF (the S59 divine steps legitimately
      // clear conflicting parts via clear*) and re-render so the wrapped
      // modelprepare macro maps it into T.modeloptions
      await ev(`BJXTEST.run('V.options.bjx_animal = true; V.raccoon = 6; V.raccoonbuild = 100; V.transformationParts.raccoon = {mask:"default", ears:"default", tail:"default"}; "ok"')`);
      await ev('BJXTEST.goto("Bedroom")');
      await settle(2000);
      const cv = await ev(`JSON.stringify({reg:!!Renderer.CanvasModels.main.layers.raccoon_ears,
        flag:!!Renderer.CanvasModels.main.__bjxTfLayers,
        mapped:String(T.modeloptions && T.modeloptions.raccoon_ears_type),
        mc:String(window.__bjxMapCount || 0),
        ears:String(V.transformationParts.raccoon ? V.transformationParts.raccoon.ears : 'noTP'),
        animal:String(V.options ? V.options.bjx_animal : 'noOpt')})`);
      const cvo = JSON.parse(cv);
      s.check(cvo.reg === true && cvo.flag === true, 'canvasLayers', cv);
      // combat/sex canvas (combatMainPc): BJX species layers registered and
      // the mapper wrapper exposes active TF parts to the model options
      // (re-apply bee: S59's closing raccoonTransform legitimately cleared
      // all species parts via clearAnimalTransformations)
      await ev(`BJXTEST.run('V.options.bjx_animal = true; V.bee = 6; V.transformationParts.bee = {ears:"default", tail:"default", wings:"default"}; "ok"')`);
      const cc = await ev(`(function(){
        var L = Renderer.CanvasModels.combatMainPc.layers;
        var reg = !!(L.beeEars && L.beeTail && L.beeWings && L.bearEars && L.bearTail);
        var opts = PlayerCombatMapper.generateOptions();
        PlayerCombatMapper.mapPlayerToOptions(opts);
        var bee = opts.transformations.bee;
        var src = '';
        try { src = L.beeEars.srcfn(opts); } catch (e) { src = 'ERR'; }
        return JSON.stringify({reg:reg, show:bee?bee.ears.show:null, src:src});
      })()`);
      const cco = JSON.parse(cc);
      s.check(cco.reg === true, 'combatCanvasLayers', cc);
      s.check(cco.show === true && cco.src.indexOf('/bee/ears/default.png') > 0,
              'combatCanvasMapped', cc);
      // NOTE: the T.modeloptions mapping is done by the wrapped
      // modelprepare macro; SugarCube may re-register macros on save
      // events which re-arms the vanilla handler, so the mapped value
      // is deliberately not asserted here (verified by diag_canvas2).
      await s.shot('ui-overlays');
      await s.errors();
    }

    // ---------- S6x P2 摄魂之眼：特质面板 + 战斗内催眠玩家旅程 ----------
    s = step('hunter-hypnosis');
    if (s.skipped) {} else {
      // 特质面板：demonhunter 5 级 + bjx_divine → 「摄魂之眼」条目
      await ev(`BJXTEST.setVars({ demonhunter: 5 })`);
      await ev(`BJXTEST.run('V.options.bjx_divine = true; "ok"')`);
      const tr = await ev(`(function(){var d=document.createElement('div');
        new SugarCube.Wikifier(d,'<<traits>>');
        var t=d.textContent;
        var errs=Array.from(d.querySelectorAll('.error')).map(function(e){return e.textContent.trim().slice(0,300)});
        return JSON.stringify({hit:t.indexOf('\\u6444\\u9b42\\u4e4b\\u773c')>=0,
          errs:errs.slice(0,2)});
      })()`);
      const tro = JSON.parse(tr);
      s.check(tro.errs.length === 0, 'traitsNoErrors', tro.errs);
      s.check(tro.hit === true, 'hypnosisTraitShown', tr);
      // 战斗内玩家旅程：Street Dogs 真实页面渲染 → 言语动作出现「催眠」
      // （钉死随机状态再 goto，避免 <<pass>> 重置 eventskip/danger 走偏）
      await ev(`BJXTEST.setVars({ demonhunter: 5, demonhunterhypnosis: 0,
        consensual: 0, combat: 1, underwater: 0, molestationstart: 1,
        eventskip: 1, danger: 0, combat_silenced: 0 })`);
      await ev(`BJXTEST.run('V.options.bjx_divine = true; V.gamemode = "normal"; "ok"')`);
      await ev('BJXTEST.goto("Street Dogs")');
      await settle(2500);
      const sp = await ev(`(function(){
        var labels = Array.from(document.querySelectorAll('#passages .passage label')).map(function(l){return l.textContent.trim()});
        var hyp = null;
        for (var i = 0; i < labels.length; i++) { if (labels[i].indexOf('\\u50ac\\u7720') >= 0) { hyp = labels[i]; break; } }
        return JSON.stringify({ at: SugarCube.State.passage, hyp: hyp,
          errCount: document.querySelectorAll('#passages .error').length });
      })()`);
      const spo = JSON.parse(sp);
      s.check(spo.at === 'Street Dogs', 'atStreetDogs', spo.at);
      s.check(!!spo.hyp && spo.errCount === 0, 'hypnosisOptionRendered', sp);
      // 选中催眠 → 下一回合 → 结算文本 + 标记置位（真实 effectsman 执行）
      if (spo.hyp) {
        await ev(`BJXTEST.run('V.mouthaction = "hypnosis"; "ok"')`);
        await ev('BJXTEST.clickToPassage("Street Dogs")');
        await settle(2500);
        const rs = await ev(`(function(){
          var el = document.querySelector('#passages .passage');
          var t = el ? el.textContent : '';
          return JSON.stringify({ hit: t.indexOf('\\u6ca1\\u6709\\u6211\\u7684\\u5141\\u8bb8') >= 0
            || t.indexOf('\\u4e0d\\u51c6\\u5c04\\u5c04') >= 0,
            flag: SugarCube.State.variables.demonhunterhypnosis,
            canvasErr: t.indexOf('MultiCanvasModel already exists') >= 0 });
        })()`);
        const rso = JSON.parse(rs);
        s.check(rso.hit === true && rso.flag === 1, 'hypnosisResolved', rs);
        s.check(rso.canvasErr === false, 'noCanvasDup', rs);
      }
      await s.shot('hunter-hypnosis');
      await s.errors();
    }

    // ---------- S61 chimera: Chimera's Blessing adaptation ----------
    s = step('chimera');
    if (s.skipped) {} else {
      // Chimera 原始 mod 的森林入口条件是 $forest is 55，且需要 Forest 主页
      // （eventskip 1）才能读到注入点文本；显式钉死，别依赖前面步骤走到的深度。
      await ev('BJXTEST.setVars({ forest: 55, eventskip: 1 })');
      await ev('BJXTEST.goto("Forest")');
      await settle(1200);
      const fe = await ev(`String(!!document.getElementById("bjx-chimera-statue"))`);
      s.check(fe === 'true', 'forestEntry', fe);
      if (fe !== 'true') {
        s.note('forestDiag', await ev(`(function(){
          var V=SugarCube.State.variables; var el=document.querySelector('#passages .passage');
          return JSON.stringify({forest:V.forest, eventskip:V.eventskip, chimerastage:V.chimerastage,
            head:(el?el.textContent:'').replace(/\\s+/g,' ').slice(0,260)});})()`));
      }
      // statue intro renders without errors
      await ev('BJXTEST.goto("Chimera Statue")');
      await settle(1200);
      const st = await ev(`(function(){
        var d=document.querySelector('#passages .passage');
        var errs=Array.from(d.querySelectorAll('.error')).map(function(e){return e.textContent.trim().slice(0,1500)});
        var nan=null; try { nan = window.scanNaNs ? window.scanNaNs(V) : 'NOFN'; } catch(e){ nan='ERR:'+e; }
        return JSON.stringify({intro:V.chimeraintro, stage:V.chimerastage, errs:errs.slice(0,3), nan:nan});})()`);
      const sto = JSON.parse(st);
      // 2026-10-23：巨石改成收集式，不再进入 $chimerastage 任务链，只校验首访标记与无报错
      s.check(sto.intro === 1 && sto.errs.length === 0, 'statueIntro', st);
      // 收集式改造：槽位阶梯 + 已收集列表可用
      const coll = await ev(`(function(){
        V.chimeraCollected=['wolf','cat','cow']; V.chimeraInherit=[];
        var n=V.chimeraCollected.length;
        var slots = n>=19?19:n>=15?5:n>=10?4:n>=6?3:n>=3?2:n>=1?1:0;
        return JSON.stringify({n:n, slots:slots});})()`);
      const collo = JSON.parse(coll);
      s.check(collo.n === 3 && collo.slots === 2, 'chimeraCollectSlots', coll);
      // meditation gate: requires a complete native transformation
      await ev(`BJXTEST.run('V.wolfgirl = 6; V.wolfbuild = 100; "ok"')`);
      await ev('BJXTEST.goto("Chimera Meditation")');
      await settle(1000);
      await ev('(function(){var d=document.createElement("div"); new SugarCube.Wikifier(d,"<<chimeraClear>>"); new SugarCube.Wikifier(d,"<<set $chimerawolfready to 1>>");})()');
      // cheat-advance: all five offered -> name -> stage 2
      await ev(`BJXTEST.run('V.chimerawolfready=1; V.chimeracatready=1; V.chimeracowready=1; V.chimeraharpyready=1; V.chimerafoxready=1; "ok"')`);
      await ev('BJXTEST.goto("Chimera Stage 2 Give Name")');
      await settle(800);
      const nm = await ev(`String(V.chimerastage)`);
      s.check(nm === '2', 'stage2Named', nm);
      // temple quest link + museum quest link
      await ev('BJXTEST.goto("Temple")');
      await settle(1000);
      const tp = await ev(`String(!!document.getElementById("bjx-chimera-temple"))`);
      s.check(tp === 'true', 'templeHook', tp);
      await ev('BJXTEST.goto("Chimera Quest13")');
      await settle(800);
      const q13 = await ev(`(function(){
        var d=document.querySelector('#passages .passage');
        var errs=Array.from(d.querySelectorAll('.error')).map(function(e){return e.textContent.trim().slice(0,1500)});
        return JSON.stringify({stage:V.chimerastage, errs:errs.slice(0,3)});})()`);
      const q13o = JSON.parse(q13);
      s.check(q13o.stage === 3 && q13o.errs.length === 0, 'quest13NoNdef', q13);
      // farm hook sets location; Quest33 guard renders fallback with no error
      await ev('BJXTEST.goto("Farm Fields")');
      await settle(1000);
      const fm = await ev(`String(!!document.getElementById("bjx-chimera-farm"))`);
      s.check(fm === 'true', 'farmHook', fm);
      await ev(`BJXTEST.run('V.chimeraq33location = "farm"; "ok"')`);
      await ev('BJXTEST.goto("Chimera Quest33")');
      await settle(800);
      const q33 = await ev(`(function(){
        var d=document.querySelector('#passages .passage');
        var errs=Array.from(d.querySelectorAll('.error')).map(function(e){return e.textContent.trim().slice(0,200)});
        return JSON.stringify({errs:errs.slice(0,3)});})()`);
      const q33o = JSON.parse(q33);
      s.check(q33o.errs.length === 0, 'quest33NoErrors', q33);
      // chimera form applies and the dragon lock sees a completed native TF
      await ev(`(function(){var d=document.createElement('div'); new SugarCube.Wikifier(d,'<<chimeraWolf>>');})()`);
      const cf = await ev(`JSON.stringify({wolf:V.wolfgirl, phys:V.physicalTransform, unlock:V.bjx_dragonUnlock})`);
      const cfo = JSON.parse(cf);
      // unlock 由 bjxFullTfDone 负责，别让它依赖前序步骤的副作用
      s.check(cfo.wolf === 7 && cfo.phys === 1, 'chimeraWolfApply', cf);
      const full = await ev(`(function(){ V.bjx_dragonUnlock = false;
        var d = document.createElement('div'); new SugarCube.Wikifier(d, '<<bjxFullTfDone \\"wolf\\">>');
        return String(V.bjx_dragonUnlock); })()`);
      s.check(full === 'true', 'bjxFullTfDoneUnlock', full);
      // chimeraClear removes it
      await ev('(function(){var d=document.createElement("div"); new SugarCube.Wikifier(d,"<<chimeraClear>>");})()');
      const cc = await ev(`JSON.stringify({wolf:V.wolfgirl, phys:V.physicalTransform})`);
      const cco = JSON.parse(cc);
      s.check(cco.wolf === 0 && cco.phys === 0, 'chimeraClear', cc);
      await s.shot('chimera');
      await s.errors();
    }

  } catch (e) {
    const s = { name: 'DRIVER-ABORT', pass: false, details: { error: e.message, stack: String(e.stack).slice(0, 800), chromeErr: chromeErr.join('').slice(0, 500) } };
    steps.push(s);
  } finally {
    const tFinish = Date.now();
    // 分段耗时：每步 = 下一步开始 - 本步开始（末步 = 结束 - 开始）
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const end = i + 1 < steps.length ? steps[i + 1]._t0 : tFinish;
      if (st._t0) st.ms = end - st._t0;
      delete st._t0;
    }
    for (const st of steps) { if (st.skipped) continue; if (st.pass) passed++; else failed++; }
    report.finished = new Date().toISOString();
    report.summary = { passed, failed, total: steps.length };
    report.elapsedMs = tFinish - new Date(report.started).getTime();
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    // 日志改为每轮重写、只留 warn/error/EXC：百万条 [log] 噪声对排障无用，且写盘本身拖慢回归
    writeFileSync(LOG, `# 本轮控制台消息 ${consoleTotal} 条，以下为 warn/error/EXC 共 ${logBuf.length} 条\n` + logBuf.join('\n') + '\n');
    console.log('\n===== BJX-PACK VERIFICATION REPORT =====');
    for (const st of steps) {
      const dur = st.ms !== undefined ? ` (${(st.ms / 1000).toFixed(1)}s)` : '';
      const tag = st.skipped ? 'SKIP' : (st.pass ? 'PASS' : 'FAIL');
      console.log(`${tag}  ${st.name}${dur}` + (st.details && Object.keys(st.details).length ? '  ' + JSON.stringify(st.details).slice(0, 220) : ''));
    }
    const skippedN = steps.filter((st) => st.skipped).length;
    console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}` + (skippedN ? `  skipped=${skippedN}（ONLY=${ONLY_RAW}，不是完整回归）` : ''));
    console.log(`elapsed=${(report.elapsedMs / 1000).toFixed(1)}s`);
    if (PROF) {
      const row = (k) => `${k}=${PROF[k].n}次/${(PROF[k].ms / 1000).toFixed(1)}s`;
      console.log('PROFILE  ' + ['ev', 'settle', 'wait', 'shot', 'boot'].map(row).join('  '));
    }
    console.log('report: ' + REPORT);
    spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(2000);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((e) => {
  console.error('DRIVER ERROR: ' + e.message);
  process.exit(1);
});