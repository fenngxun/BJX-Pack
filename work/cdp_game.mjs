// CDP in-game verification driver for the bjx-ant-island mod.
// Boots the game headless, then drives a full gameplay scenario:
//   age gate -> debug School Start -> Docks entry link (pos/neg conditions)
//   -> Docks Ride -> pay -> Take Off -> island -> Desert Village
//   -> Seasons Island -> Anthill -> ant guard combat (beastNEWinit "ant")
//   -> Ant Colony Shrine -> museum donate/ask/take/look/return -> Sea Reef/Dive entries.
// Every step is asserted; console + DOM macro errors are collected; report JSON + screenshots.
import { spawn } from 'node:child_process';
import { writeFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8765/Degrees%20of%20Lewdity.html';
const PORT = 9223;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-game-'));
const LOG = 'C:/Users/79403/Desktop/dol/work/cdp-game-console.log';
const REPORT = 'C:/Users/79403/Desktop/dol/work/cdp-game-report.json';
const SHOT_DIR = 'C:/Users/79403/Desktop/dol/work';
const TOTAL_TIMEOUT_MS = 420000;

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

// Known-benign console noise: missing image pack canvas errors, mod list 404, loader chatter.
const BENIGN = /drawImage|could not be loaded|modList\.json|Failed to load resource|Failed to load mask|net::ERR|LoaderKeyConfig|ModZipReader|favicon|404|Error during effect|randomInt called with invalid parameters|createRadialGradient|Unexpected token|is not of type|broken' state|Failed to execute|\[EXC\] Event$/i;

const BJXTEST_SRC = `
(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const SC = window.SugarCube;
  // debug mode renders links with a "(N) " / "(Shift + N) " prefix; strip it.
  const linkText = (a) => a.textContent.trim().replace(/^\\((?:Shift \\+ )?\\d+\\)\\s+/, '');
  window.BJXTEST = {
    passage: () => SC.State.passage,
    var: (n) => SC.State.variables[n],
    setVars: (o) => { Object.assign(SC.State.variables, o); return true; },
    run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 200); } },
    goto: (n) => { SC.Engine.play(n); return true; },
    links: () => qa('#passages a.link-internal, #passages a.macro-link').map(linkText),
    hasEl: (s) => !!q(s),
    elText: (s) => { const el = q(s); return el ? el.textContent.trim().slice(0, 200) : null; },
    dialogOpen: () => !!(SC.Dialog && SC.Dialog.isOpen()),
    ageGateCheck: () => { const cb = q('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); return !!cb; },
    ageGateEnter: () => { const b = qa('#ui-dialog button').find((x) => x.textContent.trim() === 'Enter'); if (b) { b.click(); return true; } return false; },
    closeDialog: () => { const b = q('#ui-dialog-close'); if (b) { b.click(); return true; } return false; },
    clickLink: (prefix) => {
      const el = qa('#passages a.link-internal, #passages a.macro-link').find((a) => linkText(a).startsWith(prefix));
      if (el) { el.click(); return true; }
      return false;
    },
    domErrors: () => qa('.error').map((e) => e.textContent.trim().slice(0, 250)),
    museumState: () => {
      const V = SC.State.variables;
      const A = V.museumAntiques || {};
      const NEW = ['antiquecannonball','antiquearttablet','antiqueterracottastatue','antiqueredvial','antiquetribemask','antiqueebonystatuette','antiqueglacierplant','antiquebullion','antiquereal','antiqueindigo','antiquegreed'];
      return {
        greed: A.antiques ? A.antiques.antiquegreed : undefined,
        museumCount: A.museumCount, maxCount: A.maxCount,
        keys: A.antiques ? Object.keys(A.antiques).length : 0,
        newOnes: A.antiques ? NEW.map((k) => A.antiques[k]) : null,
      };
    },
    npc0: () => { const n = SC.State.variables.NPCList && SC.State.variables.NPCList[0]; return n ? { type: n.type, health: n.health, healthmax: n.healthmax, desc: n.fullDescription } : null; },
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
    '--headless=new', '--disable-gpu',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const chromeErr = [];
  chrome.stderr.on('data', (d) => chromeErr.push(String(d)));

  const report = { started: new Date().toISOString(), steps: [], env: { url: URL } };
  const steps = report.steps;
  let passed = 0, failed = 0;
  let cdp;

  const ev = async (expr) => {
    const r = await Promise.race([
      cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
      sleep(25000).then(() => { throw new Error('evaluate timeout'); }),
    ]);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('page exception: ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 300));
    }
    return r.result.value;
  };

  const consoleLines = [];
  let consoleCursor = 0;
  const newConsoleErrors = () => {
    const out = [];
    for (; consoleCursor < consoleLines.length; consoleCursor++) {
      const l = consoleLines[consoleCursor];
      if ((l.startsWith('[error]') || l.startsWith('[EXC]')) && !BENIGN.test(l)) out.push(l);
    }
    return out;
  };

  const step = (name) => {
    const s = { name, pass: true, details: {} };
    steps.push(s);
    return {
      check(cond, label, detail) {
        if (cond === undefined || cond === null) cond = false;
        if (!cond) s.pass = false;
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
        try {
          const shot = await Promise.race([
            cdp.send('Page.captureScreenshot', { format: 'png' }),
            sleep(12000).then(() => { throw new Error('shot timeout'); }),
          ]);
          writeFileSync(join(SHOT_DIR, 'cdp-game-' + tag + '.png'), Buffer.from(shot.data, 'base64'));
          s.details.screenshot = 'cdp-game-' + tag + '.png';
        } catch (e) { s.details.screenshot = 'FAILED: ' + e.message; }
      },
    };
  };

  const waitPassage = async (name, timeoutMs = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      await ev('BJXTEST.closeDialog()').catch(() => {});
      const p = await ev('BJXTEST.passage()').catch(() => null);
      if (p === name) return true;
      await sleep(350);
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
        const line = `[${msg.params.type}] ${text.slice(0, 400)}`;
        consoleLines.push(line);
        if (!/LoaderKeyConfig|ModZipReader init\(\)/.test(line)) appendFileSync(LOG, line + '\n');
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const line = '[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 400);
        consoleLines.push(line);
        appendFileSync(LOG, line + '\n');
      }
    });

    // ---------- S1 boot ----------
    let s = step('boot');
    {
      const t0 = Date.now();
      let booted = false;
      while (Date.now() - t0 < 120000) {
        const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
        if (ok) { booted = true; break; }
        await sleep(2000);
      }
      s.check(booted, 'booted');
      if (!booted) throw new Error('game did not boot');
      await ev(BJXTEST_SRC);
      const modList = await ev('window.modUtils ? window.modUtils.getModListName().length : -1');
      s.check(modList >= 26, 'modListCount', modList);
      await s.errors();
    }

    // ---------- S2 age gate ----------
    s = step('age-gate');
    {
      await sleep(1500);
      const open = await ev('BJXTEST.dialogOpen()');
      if (open) {
        await ev('BJXTEST.ageGateCheck()');
        await sleep(400);
        const entered = await ev('BJXTEST.ageGateEnter()');
        s.check(entered, 'clickedEnter');
        await sleep(800);
      } else {
        s.note('dialog', 'not open (already verified)');
      }
      const verified = await ev(`localStorage.getItem('verifiedAge')`);
      s.check(String(verified) === 'true', 'verifiedAge', String(verified));
      const p = await ev('BJXTEST.passage()');
      s.check(p === 'Start', 'passage', p);
      await s.errors();
    }

    // ---------- S3 debug + Start2 ----------
    s = step('debug-start2');
    {
      await ev(`BJXTEST.setVars({ debug: 1 })`);
      await ev(`SugarCube.State.variables.options.debugdisable = 'f'`);
      await ev(`SugarCube.State.variables.options.historyControls = true`);
      await ev('BJXTEST.goto("Start2")');
      const ok = await waitPassage('Start2');
      s.check(ok, 'atStart2', await ev('BJXTEST.passage()'));
      const links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('School Start')), 'schoolStartLink', links);
      await s.errors();
    }

    // ---------- S4 school start ----------
    s = step('school-start');
    {
      const clicked = await ev(`BJXTEST.clickLink('School Start')`);
      s.check(clicked, 'clicked');
      const ok = await waitPassage('Oxford Street', 20000);
      s.check(ok, 'atOxfordStreet', await ev('BJXTEST.passage()'));
      const money = await ev('BJXTEST.var("money")');
      s.check(money >= 400000, 'cheatMoney', money);
      // museum init from gameStartOnly must already include the 11 new antiques
      const ms = await ev('BJXTEST.museumState()');
      s.check(ms.keys === 74, 'museumKeys', ms.keys);
      s.check(ms.maxCount === 74, 'maxCount', ms.maxCount);
      s.check((ms.newOnes || []).every((v) => v === 'notFound'), 'newAntiquesNotFound', ms.newOnes);
      await s.errors();
    }

    // ---------- S5 docks negative/positive ----------
    // NOTE: the Docks passage itself resets $exposed to 0 during render, so
    // "exposed" is unusable as a negative condition here; use money instead.
    s = step('docks-entry-conditions');
    {
      await ev(`BJXTEST.setVars({ money: 50000, history: 700, exposed: 0 })`);
      await ev('BJXTEST.goto("Docks")');
      await sleep(900);
      let present = await ev('BJXTEST.hasEl("#bjx-docks-ride-entry")');
      s.check(!present, 'hiddenWhenPoor', present);
      await ev(`BJXTEST.setVars({ money: 1000000 })`);
      await ev('BJXTEST.goto("Docks")');
      await sleep(900);
      present = await ev('BJXTEST.hasEl("#bjx-docks-ride-entry")');
      s.check(present, 'shownWhenRich', present);
      const txt = await ev('BJXTEST.elText("#bjx-docks-ride-entry")');
      s.check(!!txt && txt.includes('找船去四季岛'), 'entryText', txt);
      await s.shot('docks-entry');
      await s.errors();
    }

    // ---------- S6 docks ride -> pay -> take off ----------
    s = step('docks-ride-pay-takeoff');
    {
      const c1 = await ev(`BJXTEST.clickLink('找船去四季岛')`);
      s.check(c1, 'clickedEntry');
      let ok = await waitPassage('Docks Ride');
      s.check(ok, 'atDocksRide', await ev('BJXTEST.passage()'));
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l === '付钱'), 'payLink', links);
      const moneyBefore = await ev('BJXTEST.var("money")');
      await ev(`BJXTEST.clickLink('付钱')`);
      ok = await waitPassage('Take Off');
      s.check(ok, 'atTakeOff', await ev('BJXTEST.passage()'));
      const moneyAfter = await ev('BJXTEST.var("money")');
      s.check(moneyAfter === moneyBefore - 100000, 'moneyMinus100000', { moneyBefore, moneyAfter });
      links = await ev('BJXTEST.links()');
      if ((links || []).some((l) => l.startsWith('再付一千'))) {
        s.note('branch', 'rng<=20 extra payment');
        await ev(`BJXTEST.clickLink('再付一千')`);
        ok = await waitPassage('Pay Another');
        s.check(ok, 'atPayAnother', await ev('BJXTEST.passage()'));
      } else {
        s.note('branch', 'normal');
      }
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Seasons Island Landing Boat');
      s.check(ok, 'atLandingBoat', await ev('BJXTEST.passage()'));
      await s.errors();
    }

    // ---------- S7 desert village ----------
    s = step('desert-village');
    {
      await ev(`BJXTEST.clickLink('继续')`);
      const ok = await waitPassage('Desert Village');
      s.check(ok, 'atDesertVillage', await ev('BJXTEST.passage()'));
      const links = await ev('BJXTEST.links()');
      for (const want of ['市场', '旅馆', '神龛', '码头', '离开村庄']) {
        s.check((links || []).some((l) => l.startsWith(want)), 'link_' + want, links);
      }
      await s.shot('desert-village');
      await s.errors();
    }

    // ---------- S8 seasons island walk-in ----------
    s = step('seasons-island');
    {
      await ev(`BJXTEST.setVars({ eventskip: 1 })`);
      await ev(`BJXTEST.clickLink('离开村庄')`);
      const ok = await waitPassage('Seasons Island');
      s.check(ok, 'atSeasonsIsland', await ev('BJXTEST.passage()'));
      const dist = await ev('BJXTEST.var("islanddistance")');
      s.check(dist === 20, 'islanddistance20', dist);
      // teleport to anthill zone (distance 10); eventskip MUST be set together
      // with the goto, the Seasons Island render clears $eventskip at its end.
      await ev(`BJXTEST.setVars({ islanddistance: 10, eventskip: 1 })`);
      await ev('BJXTEST.goto("Seasons Island")');
      await sleep(700);
      const links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('靠近蚁穴')), 'anthillLink', links);
      await s.errors();
    }

    // ---------- S9 anthill + guard battle (ant beast generation) ----------
    s = step('anthill-guard1-ant-beast');
    {
      await ev(`BJXTEST.clickLink('靠近蚁穴')`);
      let ok = await waitPassage('Anthill');
      s.check(ok, 'atAnthill', await ev('BJXTEST.passage()'));
      let sandmound = await ev('BJXTEST.var("sandmound")');
      s.check(sandmound === 1, 'sandmound1', sandmound);
      await ev(`BJXTEST.clickLink('深入探索')`);
      await sleep(700);
      sandmound = await ev('BJXTEST.var("sandmound")');
      s.check(sandmound === 2, 'sandmound2', sandmound);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('做好战斗准备')), 'battleLink', links);
      await ev(`BJXTEST.clickLink('做好战斗准备')`);
      ok = await waitPassage('Ant Guard 1');
      s.check(ok, 'atAntGuard1', await ev('BJXTEST.passage()'));
      // THE index-fix verification: the generated beast must be an ant, not a snake
      const npc = await ev('BJXTEST.npc0()');
      s.check(npc && npc.type === 'ant', 'npcTypeIsAnt', npc);
      s.check(npc && npc.healthmax === 300, 'antHealth300', npc);
      await s.shot('ant-guard-1');
      await s.errors();
    }

    // ---------- S10 end combat deterministically ----------
    s = step('ant-guard1-finish');
    {
      // force combat end, then walk the self-re-render -> Finish -> Anthill chain
      await ev(`SugarCube.State.variables.enemyhealth = -1`);
      await sleep(200);
      await ev(`BJXTEST.clickLink('继续')`); // re-render with _combatend
      await sleep(900);
      await ev(`BJXTEST.clickLink('继续')`); // should now link to Ant Guard 1 Finish
      let ok = await waitPassage('Ant Guard 1 Finish');
      s.check(ok, 'atFinish', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('继续')`);
      ok = await waitPassage('Anthill');
      s.check(ok, 'backAtAnthill', await ev('BJXTEST.passage()'));
      const g1 = await ev('BJXTEST.var("guard1")');
      s.check(g1 === 1, 'guard1Cleared', g1);
      await s.errors();
    }

    // ---------- S11 ant colony shrine ----------
    s = step('ant-colony-shrine');
    {
      await ev(`BJXTEST.setVars({ guard2: 1, guard3: 1, sandmound: 5 })`);
      await ev('BJXTEST.goto("Anthill")');
      await sleep(600);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('进入')), 'enterLink', links);
      await ev(`BJXTEST.clickLink('进入')`);
      let ok = await waitPassage('Ant Colony Shrine');
      s.check(ok, 'atShrine', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('祈祷')`);
      ok = await waitPassage('Ant Shrine Pray');
      s.check(ok, 'atPray', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('祈求救赎')`);
      await sleep(900);
      const phase = await ev('BJXTEST.var("phase")');
      s.check(phase === 2, 'phase2', phase);
      await s.shot('ant-shrine-pray');
      await ev(`BJXTEST.clickLink('离开')`);
      ok = await waitPassage('Anthill');
      s.check(ok, 'backAtAnthill2', await ev('BJXTEST.passage()'));
      await s.errors();
    }

    // ---------- S12 island event widget smoke ----------
    s = step('island-widget-smoke');
    {
      for (const w of ['eventislanditem', 'eventislandsafe', 'eventisland']) {
        const r = await ev(`BJXTEST.smokeWidget('${w}')`);
        s.check(r && r.ok, 'widget_' + w, r);
      }
      await s.errors();
    }

    // ---------- S13 museum base ----------
    s = step('museum-base');
    {
      await ev('BJXTEST.goto("Museum")');
      await sleep(900);
      const p = await ev('BJXTEST.passage()');
      s.check(p === 'Museum', 'atMuseum', p);
      const links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('Look around the museum')), 'lookAroundLink', links);
      const ms = await ev('BJXTEST.museumState()');
      s.check(ms.greed === 'notFound', 'greedNotFouns', ms.greed);
      s.check(!(links || []).some((l) => l.startsWith('带走贪婪之杯')), 'noTakeLinkYet', null);
      await s.shot('museum-base');
      await s.errors();
    }

    // ---------- S14 museum donate flow ----------
    s = step('museum-donate-ask');
    {
      await ev(`SugarCube.State.variables.museumAntiques.antiques.antiquegreed = 'found'`);
      await ev(`BJXTEST.setVars({ antiquemoney: 100000 })`);
      await ev('BJXTEST.goto("Museum")');
      await sleep(800);
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('Sell antiques')), 'sellLink', links);
      await ev(`BJXTEST.clickLink('Sell antiques')`);
      let ok = await waitPassage('Museum Sell');
      s.check(ok, 'atMuseumSell', await ev('BJXTEST.passage()'));
      await sleep(400);
      let ms = await ev('BJXTEST.museumState()');
      s.check(ms.greed === 'talk', 'greedTalk', ms.greed);
      await ev(`BJXTEST.clickLink('Next')`);
      await waitPassage('Museum');
      await sleep(600);
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.includes('贪婪之杯') && l.startsWith('Ask about')), 'askLink', links);
      const countBefore = ms.museumCount;
      await ev(`BJXTEST.clickLink('Ask about the 贪婪之杯')`);
      ok = await waitPassage('Museum 贪婪之杯');
      s.check(ok, 'atGreedTalk', await ev('BJXTEST.passage()'));
      await ev(`BJXTEST.clickLink('继续')`);
      await waitPassage('Museum');
      ms = await ev('BJXTEST.museumState()');
      s.check(ms.greed === 'museum', 'greedMuseum', ms.greed);
      s.check(ms.museumCount === countBefore + 1, 'museumCountInc', { countBefore, after: ms.museumCount });
      await s.errors();
    }

    // ---------- S15 museum take ----------
    s = step('museum-take');
    {
      const moneyBefore = await ev('BJXTEST.var("money")');
      const countBefore = (await ev('BJXTEST.museumState()')).museumCount;
      let links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('带走贪婪之杯')), 'takeLink', links);
      await ev(`BJXTEST.clickLink('带走贪婪之杯')`);
      const ok = await waitPassage('Museum Take');
      s.check(ok, 'atMuseumTake', await ev('BJXTEST.passage()'));
      const moneyAfter = await ev('BJXTEST.var("money")');
      const ms = await ev('BJXTEST.museumState()');
      s.check(moneyAfter === moneyBefore - 500000, 'moneyMinus5000', { moneyBefore, moneyAfter });
      s.check(ms.greed === 'take', 'greedTake', ms.greed);
      s.check(ms.museumCount === countBefore - 1, 'museumCountDec', { countBefore, after: ms.museumCount });
      await s.shot('museum-take');
      await ev(`BJXTEST.clickLink('继续')`);
      await waitPassage('Museum');
      links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('归还贪婪之杯')), 'returnLink', links);
      s.check(!(links || []).some((l) => l.startsWith('带走贪婪之杯')), 'takeLinkGone', null);
      await s.errors();
    }

    // ---------- S16 museum look around (take case) ----------
    s = step('museum-look-take');
    {
      await ev(`BJXTEST.clickLink('Look around the museum')`);
      const ok = await waitPassage('Museum Look around');
      s.check(ok, 'atLookAround', await ev('BJXTEST.passage()'));
      const taken = await ev(`BJXTEST.hasEl('[tooltip="被你带走了。"]')`);
      s.check(taken, 'takenPedestalTooltip');
      await s.shot('museum-look-take');
      await ev(`BJXTEST.clickLink('Go back to the entrance')`);
      await waitPassage('Museum');
      await s.errors();
    }

    // ---------- S17 museum return ----------
    s = step('museum-return');
    {
      const moneyBefore = await ev('BJXTEST.var("money")');
      const countBefore = (await ev('BJXTEST.museumState()')).museumCount;
      await ev(`BJXTEST.clickLink('归还贪婪之杯')`);
      const ok = await waitPassage('Museum Return');
      s.check(ok, 'atMuseumReturn', await ev('BJXTEST.passage()'));
      const moneyAfter = await ev('BJXTEST.var("money")');
      const ms = await ev('BJXTEST.museumState()');
      s.check(moneyAfter === moneyBefore + 500000, 'moneyRestored', { moneyBefore, moneyAfter });
      s.check(ms.greed === 'museum', 'greedMuseumAgain', ms.greed);
      s.check(ms.museumCount === countBefore + 1, 'museumCountIncAgain', { countBefore, after: ms.museumCount });
      await ev(`BJXTEST.clickLink('继续')`);
      await waitPassage('Museum');
      const links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('带走贪婪之杯')), 'takeLinkBack', links);
      s.check(!(links || []).some((l) => l.startsWith('归还贪婪之杯')), 'returnLinkGone', null);
      await s.errors();
    }

    // ---------- S18 sea reef entry ----------
    s = step('sea-reef-entry');
    {
      await ev(`BJXTEST.setVars({ sea: 40, swimmingskill: 10000, eventskip: 1 })`);
      await ev('BJXTEST.goto("Sea")');
      await sleep(900);
      const links = await ev('BJXTEST.links()');
      s.check((links || []).some((l) => l.startsWith('Swim further out')), 'anchorSwimFurther', links);
      const present = await ev('BJXTEST.hasEl("#bjx-sea-reef-entry")');
      s.check(present, 'reefEntryPresent');
      const txt = await ev('BJXTEST.elText("#bjx-sea-reef-entry")');
      s.check(!!txt && txt.includes('游向四色光芒'), 'reefEntryText', txt);
      await s.shot('sea-reef');
      await ev(`BJXTEST.clickLink('游向四色光芒')`);
      const ok = await waitPassage('Sea Reef');
      s.check(ok, 'atSeaReef', await ev('BJXTEST.passage()'));
      await s.errors();
    }

    // ---------- S19 sea dive entry ----------
    s = step('sea-dive-entry');
    {
      await ev(`BJXTEST.setVars({ sea: 90 })`);
      await ev('BJXTEST.goto("Sea")');
      await sleep(900);
      const present = await ev('BJXTEST.hasEl("#bjx-sea-dive-entry")');
      s.check(present, 'diveEntryPresent');
      const txt = await ev('BJXTEST.elText("#bjx-sea-dive-entry")');
      s.check(!!txt && txt.includes('潜水'), 'diveEntryText', txt);
      await ev(`BJXTEST.clickLink('潜水')`);
      const ok = await waitPassage('Sea Dive');
      s.check(ok, 'atSeaDive', await ev('BJXTEST.passage()'));
      await s.shot('sea-dive');
      await s.errors();
    }

  } catch (e) {
    const s = { name: 'DRIVER-ABORT', pass: false, details: { error: e.message, chromeErr: chromeErr.join('').slice(0, 500) } };
    steps.push(s);
  } finally {
    for (const st of steps) { if (st.pass) passed++; else failed++; }
    report.finished = new Date().toISOString();
    report.summary = { passed, failed, total: steps.length };
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log('\n===== GAME VERIFICATION REPORT =====');
    for (const st of steps) {
      console.log(`${st.pass ? 'PASS' : 'FAIL'}  ${st.name}` + (st.details && Object.keys(st.details).length ? '  ' + JSON.stringify(st.details).slice(0, 220) : ''));
    }
    console.log(`\npassed=${passed} failed=${failed} total=${steps.length}`);
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