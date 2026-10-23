// CDP smoke test for third-party mod injection (TweeReplacer + NoAutoReBuyTrash
// + Eden Fence Rescue Fixed) alongside bjx-pack via modDataValueZipList.
import { spawn } from 'node:child_process';
import { writeFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9224;
const PROFILE = mkdtempSync(join(tmpdir(), 'mods-smoke-'));
const LOG = 'C:/Users/79403/Desktop/dol/work/cdp-mods-smoke-console.log';
const REPORT = 'C:/Users/79403/Desktop/dol/work/cdp-mods-smoke-report.json';
// 每次运行清空控制台日志：appendFileSync 会跨运行累积，导致「警告总数」统计失真
// （曾误判 replaceMerge 补丁无效，其实读到的是上一轮的行）。
writeFileSync(LOG, '');

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

const BENIGN = /drawImage|could not be loaded|modList\.json|Failed to load resource|Failed to load mask|net::ERR|LoaderKeyConfig|ModZipReader|favicon|404|Error during effect|randomInt called with invalid parameters|createRadialGradient|Unexpected token|is not of type|broken' state|Failed to execute|\[EXC\] Event|\{optionalBefore\} not satisfies version|DependenceChecker|AddonPluginManager\.registerMod|ReplacePatcher\] patchInReplaceParamsItem|ModOrderContainer|optionalBefore not satisfies order/i;

// in-page passage text probe: counts needle inside a Story passage and returns
// a small JSON object (never pull large non-ASCII strings across CDP)
// widget-tag passages are compiled away from Story at runtime (0.5 behavior),
// so authoritative checks go through modUtils.getPassageData (SC2 patch data)
const PASSAGE_PROBE = `(() => {
  window.MODPROBE = {
    storyText(name) {
      const SC = window.SugarCube;
      const S = (SC && SC.Story) || window.Story;
      if (!S || !S.get) return 'NO_STORY_API';
      try { return S.get(name) ? 1 : 0; } catch (e) { return 'EXC'; }
    },
    count(name, needle) {
      const mu = window.modUtils;
      let d;
      try { d = mu.getPassageData(name); } catch (e) { return JSON.stringify({ err: 'EXC:' + String(e).slice(0, 120) }); }
      if (!d) return JSON.stringify({ err: 'NO_SC2_DATA' });
      const t = d.text || d.content || String(d);
      let count = 0, i = 0, firstCtx = null;
      while ((i = t.indexOf(needle, i)) >= 0) {
        if (firstCtx === null) firstCtx = t.slice(Math.max(0, i - 40), i + 40);
        count++; i += needle.length;
      }
      return JSON.stringify({ count, len: t.length, firstCtx });
    },
  };
  return true;
})()`;

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
      sleep(30000).then(() => { throw new Error('evaluate timeout'); }),
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
    };
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

    // ---------- boot ----------
    let s = step('boot');
    {
      const t0 = Date.now();
      let booted = false;
      while (Date.now() - t0 < 240000) {
        const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
        if (ok) { booted = true; break; }
        await sleep(2000);
      }
      s.check(booted, 'booted');
      if (!booted) throw new Error('game did not boot');
      await ev(PASSAGE_PROBE);
      // close third-party welcome popups (DomRobin introduction.js etc.)
      await ev(`(function(){
        try { localStorage.setItem('robinModDontShowAgain', 'true'); } catch (e) {}
        try { if (window.modSweetAlert2Mod && window.modSweetAlert2Mod.close) window.modSweetAlert2Mod.close(); } catch (e) {}
        try { if (window.Swal && window.Swal.close) window.Swal.close(); } catch (e) {}
        try { document.querySelectorAll('.swal2-container').forEach(function (n) { n.remove(); }); } catch (e) {}
        return true;
      })()`);
      const modList = await ev('window.modUtils ? window.modUtils.getModListName() : null');
      s.check(Array.isArray(modList), 'modListIsArray', modList);
      for (const want of ['bjx-pack', 'TweeReplacer', 'NoAutoReBuyTrash', 'Eden Fence Rescue Fixed', 'DefrockMod', 'More Love Interests Mod', 'TimeHourglass', '钓鱼人生', 'cummilk', 'Sydney Bare Study Mod', '日落伊甸园', 'WhitneyExpansion', "Wraith'sReflection", 'ReOverfits', 'Terraria Expand Mod', 'DomRobin', 'BabyHawk', 'DoLSims', '猫咖出租屋', 'Sydney Dialogue Expansion', 'Remy Love Mod', '露出拓展-请别露出惊讶的表情好吗', 'i, Candy + Robot']) {
        s.check(Array.isArray(modList) && modList.includes(want), 'has:' + want, null);
      }
      s.note('modList', modList);
      const cerr = newConsoleErrors();
      const trErrs = cerr.filter((l) => /TweeReplacer|ReplacePatcher/i.test(l));
      s.check(trErrs.length === 0, 'noTweeReplacerErrors', trErrs);
    }

    // ---------- More Love Interests patch ----------
    s = step('morelove-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Widgets Attitudes", "<<moreLoveInterest>>")'));
      s.check(r.count >= 1, 'attitudesWidgetInjected', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Widgets", "Object.values(V.loveInterest).includes(T.npcData.nam)")'));
      s.check(r2.count >= 1, 'widgetsJudgeRewritten', r2);
    }

    // ---------- TimeHourglass patch ----------
    s = step('timehourglass-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Dance Studio", "charlyafterconcert")'));
      s.check(r.count >= 1, 'danceStudioHooked', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Ocean Breeze", "caferandompassive")'));
      s.check(r2.count >= 1, 'oceanBreezeHooked', r2);
      const r3 = JSON.parse(await ev('MODPROBE.count("Traits", "月之气息")'));
      s.check(r3.count >= 1, 'traitInjected', r3);
    }

    // ---------- 钓鱼人生 patch ----------
    s = step('fishing-patch');
    {
      for (const pg of ['Coast Path Farmland', 'Flats', 'Lake Fishing Rock']) {
        const r = JSON.parse(await ev(`MODPROBE.count(${JSON.stringify(pg)}, "initFishModel()")`));
        s.check(r.count >= 1, 'fishingLink:' + pg, r);
      }
      const t = await ev('MODPROBE.storyText("Go Fishing Coast Path")');
      s.check(t === 1, 'goFishingPassage', t);
    }

    // ---------- 日落伊甸园 patch ----------
    s = step('edensunset-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Cabin House Actions", "edenradiointro")'));
      s.check(r.count >= 1, 'cabinRadioHooked', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Widgets Cabin", "transformationParts")'));
      s.check(r2.count >= 1, 'widgetsCabinHooked', r2);
    }

    // ---------- WhitneyExpansion patch ----------
    s = step('whitneyexp-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Park", "SecretBase Entrance")'));
      s.check(r.count >= 1, 'parkSecretBaseLink', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Widgets Whitney", "Whitney Flirt mod")'));
      s.check(r2.count >= 1, 'flirtModLink', r2);
      const r3 = JSON.parse(await ev('MODPROBE.count("Whitney Chat", "WhitneyTeachMasturbation")'));
      s.check(r3.count >= 1, 'teachMasturbationBranch', r3);
      const t = await ev('MODPROBE.storyText("SecretBase Entrance")');
      s.check(t === 1, 'secretBasePassage', t);
    }

    // ---------- Wraith'sReflection patch ----------
    s = step('wraith-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Start", "你看到我了")'));
      s.check(r.count >= 1, 'startMarkInjected', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Town Hall", "米奇已经为你提供了帮助")'));
      s.check(r2.count >= 1, 'townHallHintInjected', r2);
      const r3 = JSON.parse(await ev('MODPROBE.count("Lake Ruin Plinth", \'necklaceThief is "return"\')'));
      s.check(r3.count >= 2, 'plinthThiefBranch', r3);
      const t = await ev('MODPROBE.storyText("ReturnNecklace")');
      s.check(t === 1, 'returnNecklacePassage', t);
    }

    // ---------- ReOverfits / Sydney Bare Study / DefrockMod ----------
    s = step('reoverfits-sydney-defrock-patch');
    {
      // TweeReplacer 1.2.0 honours `all`: all 3 occurrences removed (1.0.0 left one)
      const r = JSON.parse(await ev('MODPROBE.count("Widgets Wardrobe", ", disabled: !$debug")'));
      s.check(r.count === 0, 'wardrobeDebugAllRemoved', r);
      // cheatPort.txt re-emits "/* Bed */" tail, so assert the SBS insertion positively
      const r2 = JSON.parse(await ev('MODPROBE.count("Bedroom", "/* SBS */")'));
      s.check(r2.count >= 1, 'bedroomSbsInjected', r2);
      const r3 = JSON.parse(await ev('MODPROBE.count("Bedroom", "一键开启双人学习")'));
      s.check(r3.count >= 1, 'bedroomSbsLinkInjected', r3);
      const t = await ev('MODPROBE.storyText("Temple Defrock")');
      s.check(t === 1, 'templeDefrockPassage', t);
    }

    // ---------- cummilk patch ----------
    s = step('cummilk-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Widgets Masturbation", "cummilk")'));
      s.check(r.count >= 1, 'masturbationHooked', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Widgets Kitchen", "cummilkamount")'));
      s.check(r2.count >= 1, 'kitchenHooked', r2);
    }

    // ---------- NoAutoReBuyTrash patch ----------
    s = step('noautorebuytrash-patch');
    {
      // SC2 passage data (widget passages leave Story after compile in 0.5)
      const r = JSON.parse(await ev('MODPROBE.count("Widgets Clothing", "rag top")'));
      s.note('ragTopCount', r);
      s.check(r.count >= 1, 'ragTopPatched', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Widgets Clothing", "rag skirt")'));
      s.check(r2.count >= 1, 'ragSkirtPatched', r2);
      const r3 = JSON.parse(await ev('MODPROBE.count("Widgets Clothing", "Do nothing")'));
      s.check(r3.count >= 1, 'doNothingBranchPatched', r3);
    }

    // ---------- Eden Fence Rescue patch ----------
    s = step('edenfence-patch');
    {
      // baseline: 1 occurrence (inside comment); patched: >= 2 (active branch)
      const r = JSON.parse(await ev('MODPROBE.count("Livestock Field", "Eden Fence Rescue")'));
      s.note('fenceRescueCount', r);
      s.check(r.count >= 2, 'fenceRescueActive', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Livestock Field", "farmRescue")'));
      s.note('farmRescueCount', r2);
      s.check(r2.count >= 4, 'farmRescueBranchActive', r2);
      // patch targets exist and render
      const t1 = await ev('MODPROBE.storyText("Eden Fence Rescue")');
      const t2 = await ev('MODPROBE.storyText("Eden Fence Ignore")');
      s.check(t1 === 1, 'edenFenceRescuePassage', t1);
      s.check(t2 === 1, 'edenFenceIgnorePassage', t2);
    }

    // ---------- B2: Terraria Expand Mod ----------
    s = step('terraria-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Bedroom", "<<terraDebugLink>>")'));
      s.check(r.count >= 1, 'bedroomTerraDebugLink', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Robin Forest", "<<pylon_bedroom_ask>>")'));
      s.check(r2.count >= 1, 'robinForestPylonAsk', r2);
      const r3 = JSON.parse(await ev('MODPROBE.count("Farm Bedroom", "<<terraDebugLink>>")'));
      s.check(r3.count >= 1, 'farmBedroomTerraDebugLink', r3);
      const t = await ev('MODPROBE.storyText("Bird Hunt Blood")');
      s.check(t === 1, 'birdHuntBloodPassage', t);
    }

    // ---------- B2: DomRobin ----------
    s = step('domrobin-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Widgets NPC Damage", "<<trauma -18>>")'));
      s.check(r.count >= 1, 'npcDamageTraumaPatch', r);
      const t = await ev('MODPROBE.storyText("Robin\'s Lemonade")');
      s.check(t === 1, 'robinLemonadePassage', t);
      const r2 = JSON.parse(await ev(`MODPROBE.count("Robin's Lemonade", "robin")`));
      s.check(r2.count >= 5, 'lemonadeContentLoaded', r2);
    }

    // ---------- B2: BabyHawk（TimeEvent 兼容层）----------
    s = step('babyhawk-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Childrens Home", "<<BabyHawkInit>>")'));
      s.check(r.count >= 1, 'childrensHomeInit', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Widgets children", "hawkChildActivity")'));
      s.check(r2.count >= 1, 'childrenWidgetHawk', r2);
      const r3 = JSON.parse(await ev('MODPROBE.count("Widgets Bird", "otherNest")'));
      s.check(r3.count >= 1, 'birdWidgetOtherNest', r3);
      // TimeEvent shim must be installed, else the old API throws at load
      const shim = await ev('!!window.__b2TimeEventShim && typeof window.TimeEvent === "function"');
      s.check(shim === true, 'timeEventShimInstalled', shim);
    }

    // ---------- B2: DoLSims ----------
    s = step('dolsims-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("Widgets Actions Generation", "mouthActionInit")'));
      s.check(r.count >= 1, 'actionsGenerationMouthInit', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Containers", "creatureVaginaSims")'));
      s.check(r2.count >= 1, 'containersCreatureSims', r2);
      const t = await ev('MODPROBE.storyText("Science Slap Sims")');
      s.check(t === 1, 'scienceSlapPassage', t);
      const r3 = JSON.parse(await ev('MODPROBE.count("Science Slap Sims", "_phaseSims1")'));
      s.check(r3.count >= 1, 'scienceSlapContent', r3);
    }

    // ---------- B2: Cattery（Simple Frameworks 兼容层）----------
    s = step('cattery-patch');
    {
      const r = JSON.parse(await ev('MODPROBE.count("High Street", "Office Lobby")'));
      s.check(r.count >= 1, 'highStreetOfficeLobby', r);
      const t = await ev('MODPROBE.storyText("Cafe Coffee")');
      s.check(t === 1, 'cafeCoffeePassage', t);
      const r2 = JSON.parse(await ev('MODPROBE.count("Science Project", "Lichen")'));
      s.check(r2.count >= 1, 'scienceProjectLichen', r2);
      const sf = await ev('!!window.__b2SFShim && typeof window.simpleFrameworks.addto === "function"');
      s.check(sf === true, 'sfShimInstalled', sf);
    }

    // ---------- B3: Sydney.Dialogue.Expansion v1.7 ----------
    s = step('sydney-dialogue-expansion-patch');
    {
      // SSDEEModWarning is this mod's own marker macro, injected into 8 passages
      const r = JSON.parse(await ev('MODPROBE.count("Bedroom", "<<SSDEEModWarning>>")'));
      s.check(r.count >= 1, 'bedroomSsdeeMarker', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Widgets Sydney", "<<SSDEEModWarning>>")'));
      s.check(r2.count >= 1, 'widgetsSydneySsdeeMarker', r2);
      // cascade-adapted rule: Hallways Slap link is re-pointed at the SSDEE event
      const r3 = JSON.parse(await ev('MODPROBE.count("Widgets School Events", "Hallways Slap SSDEE")'));
      s.check(r3.count >= 1, 'schoolEventsCascadeRule', r3);
      // new passages shipped by the mod
      const t1 = await ev('MODPROBE.storyText("Show Off Ring")');
      s.check(t1 === 1, 'showOffRingPassage', t1);
      const t2 = await ev('MODPROBE.storyText("Sydney Cafe")');
      s.check(t2 === 1, 'sydneyCafePassage', t2);
      // Sydney Chat branch expanded (16 -> 17 chats)
      const r4 = JSON.parse(await ev('MODPROBE.count("Sydney Chat", "_sydneyChats")'));
      s.check(r4.count >= 3, 'sydneyChatExpanded', r4);
    }

    // ---------- B4: Remy Love Mod ----------
    s = step('remy-love-mod-patch');
    {
      // new passages shipped by the mod
      const t1 = await ev('MODPROBE.storyText("Pregnancy Birth Hospital Remy")');
      s.check(t1 === 1, 'remyPregnancyHospitalPassage', t1);
      const t2 = await ev('MODPROBE.storyText("remymod_gift obey")');
      s.check(t2 === 1, 'remyGiftPassage', t2);
      // patch points that survived surgery
      const r = JSON.parse(await ev('MODPROBE.count("Livestock Field", "livestock_obey_description")'));
      s.check(r.count >= 1, 'livestockFieldObeyHook', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("Widgets Stalk", "rainWraith")'));
      s.check(r2.count >= 1, 'stalkWidgetRainWraith', r2);
      const r3 = JSON.parse(await ev('MODPROBE.count("Social", "importantNpcOrder")'));
      s.check(r3.count >= 1, 'socialNpcOrderPatched', r3);
      // cascade/re-anchor sanity: Riding School Lesson link kept working
      // 发布包（汉化烘焙）里链接标签是「继续」，dev（英文）是 Next —— 两种都算过
      const r4a = JSON.parse(await ev('MODPROBE.count("Riding School Lesson", "[[Next|Riding School Lesson]]")'));
      const r4b = JSON.parse(await ev('MODPROBE.count("Riding School Lesson", "[[继续|Riding School Lesson]]")'));
      const r4 = { count: Math.max(r4a.count, r4b.count), en: r4a.count, zh: r4b.count };
      s.check(r4.count >= 1, 'ridingSchoolReanchored', r4);
    }

    // ---------- B5: MEE (My Exhibitionism Expansion) ----------
    s = step('mee-exhibitionism-patch');
    {
      // StoryCaption hooks: mod tab + clothing caption button
      const r = JSON.parse(await ev('MODPROBE.count("StoryCaption", "meecaptions")'));
      s.check(r.count >= 1, 'storyCaptionMeeCaptions', r);
      const r2 = JSON.parse(await ev('MODPROBE.count("StoryCaption", "clothingCaptionButton")'));
      s.check(r2.count >= 1, 'clothingCaptionButton', r2);
      // `all:true` rules — only work with the self-built TweeReplacer 1.2.0
      const r3 = JSON.parse(await ev('MODPROBE.count("Widgets", "calmStatModifier")'));
      s.check(r3.count >= 2, 'widgetsCalmModifierAllSites', r3);
      const r4 = JSON.parse(await ev('MODPROBE.count("Shopping Centre", "Shopping Centre Escape Toilets")'));
      s.check(r4.count >= 1, 'shoppingCentreRestroomRewritten', r4);
      // new passages shipped by the mod
      const t1 = await ev('MODPROBE.storyText("Home Toilets")');
      s.check(t1 === 1, 'homeToiletsPassage', t1);
      const t2 = await ev('MODPROBE.storyText("Shopping Centre Mens Toilets")');
      s.check(t2 === 1, 'mensToiletsPassage', t2);
    }

    // ---------- B6: i.Candy + Robot (Simple Frameworks shim) ----------
    s = step('icandy-robot-patch');
    {
      // new scenes / rooms shipped by the mod
      for (const [pg, needle] of [
        ['BaseScene Chinatown', 'Chinatown'],
        ['BaseScene Brothel Basement', 'Brothel'],
        ['BaseScene Orphanage Garage', 'Garage'],
        ['Room Robot', 'Robot'],
      ]) {
        const r = JSON.parse(await ev(`MODPROBE.count(${JSON.stringify(pg)}, ${JSON.stringify(needle)})`));
        s.check(r.count >= 1, pg.replace(/\s+/g, '_'), r);
      }
      // NamedNPC registration through the shim -> host <<newNamedNpc>>
      const npcs = JSON.parse(await ev(`(function(){
        var V = window.SugarCube.State.variables;
        var want = ['Robert','Hadley','Qing','Lam','Wei','Xinyu','Cheng','Yue','Keith'];
        return JSON.stringify(want.filter(function(n){ return (V.NPCNameList||[]).indexOf(n) >= 0; }));
      })()`));
      s.check(npcs.length >= 9, 'namedNpcsRegistered', npcs);
      // item database bootstrapped
      const items = await ev(`(function(){ try { return String(Object.keys(window.Items.data).length); } catch(e){ return 'ERR:'+e.message; } })()`);
      s.check(Number(items) >= 50, 'itemDatabaseLoaded', items);
      // SF shim exposes lanSwitch / has / NamedNPC
      const shim = await ev(`(function(){ return JSON.stringify({
        lanSwitch: typeof window.lanSwitch,
        has: typeof String.prototype.has,
        namedNPC: typeof window.NamedNPC,
        sf: typeof window.simpleFrameworks,
      }); })()`);
      const sh = JSON.parse(shim);
      s.check(sh.lanSwitch === 'function' && sh.has === 'function'
              && sh.namedNPC === 'function' && sh.sf === 'object', 'sfShimApis', sh);
    }

    // ---------- runtime render smoke: goto Livestock Field ----------
    s = step('livestock-field-render');
    {
      // direct goto skips Start flow: run Start2 once to initialize variables
      // (otherwise doVersionCheck's backComp migration branch fires and errors)
      await ev(`window.SugarCube.Engine.play('Start2')`);
      await sleep(1200);
      await ev(`(() => {
        const V = window.SugarCube.State.variables;
        V.saveVersions = [window.StartConfig.version];
        V.objectVersion = V.objectVersion || {};
        if (!V.livestock) V.livestock = { seen: [] };
        if (!V.daily) V.daily = {};
        if (!V.daily.eden) V.daily.eden = {};
        return true;
      })()`);
      const at = await ev(`(() => { window.SugarCube.Engine.play('Livestock Field'); return window.SugarCube.State.passage; })()`);
      await sleep(1500);
      const passageNow = await ev('window.SugarCube.State.passage');
      s.check(passageNow === 'Livestock Field', 'atLivestockField', { goto: at, now: passageNow });
      const cerr = newConsoleErrors();
      const domErrs = await ev(`(() => Array.from(document.querySelectorAll('.error')).map(e => e.textContent.trim().slice(0, 200)).filter(t => !/broken' state|randomInt/.test(t)))()`).catch(() => []);
      s.note('consoleErrors', cerr.slice(0, 10));
      s.note('domErrors', (domErrs || []).slice(0, 10));
      s.check((cerr.length === 0) && ((domErrs || []).length === 0), 'noRenderErrors', null);
    }

    // ---------- final console sweep ----------
    s = step('console-sweep');
    {
      const cerr = newConsoleErrors();
      s.note('newErrors', cerr.slice(0, 20));
      s.check(cerr.length === 0, 'noNewErrors', null);
    }
  } catch (e) {
    const s = { name: 'FATAL', pass: false, details: { error: String(e).slice(0, 500), chromeErr: chromeErr.join('').slice(0, 500) } };
    steps.push(s);
  } finally {
    for (const st of steps) {
      if (st.pass) passed++; else failed++;
      console.log((st.pass ? 'PASS ' : 'FAIL ') + st.name + ' ' + JSON.stringify(st.details).slice(0, 300));
    }
    console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
    writeFileSync(REPORT, JSON.stringify(report, null, 1));
    try { chrome.kill(); } catch {}
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();