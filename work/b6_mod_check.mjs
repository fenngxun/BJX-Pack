// 全面 mod 生效性检查：mod列表、passage存在性、NPC注册、入口链接
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9277;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6modcheck-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 120 && !wsUrl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const l = await r.json();
      const p = l.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(500);
  }
  if (!wsUrl) { console.error('NO PAGE'); chrome.kill(); process.exit(2); }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, (x) => (x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result))); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.enable');
  const ev = async (e, tmo = 30000) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(tmo).then(() => null)]);
    if (!r) return 'TIMEOUT';
    if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0].slice(0, 500);
    return r.result.value;
  };

  // 等待加载
  const t0 = Date.now();
  while (Date.now() - t0 < 280000) {
    const r = await ev(`(function(){try{return window.SugarCube && window.SugarCube.State.passage ? window.SugarCube.State.passage : '';}catch(e){return '';}})()`, 15000);
    if (r && String(r).startsWith('Start')) { console.log('START-READY', ((Date.now() - t0) / 1000).toFixed(1) + 's'); break; }
    await sleep(2000);
  }
  await sleep(5000);

  // 进入 Start2 初始化所有变量
  await ev(`window.SugarCube.Engine.play('Start2')`, 15000);
  await sleep(8000);

  console.log('\n========== 1. ModLoader 加载的 mod 列表 ==========');
  const modList = await ev(`(function(){
    try {
      var mods = [];
      // ModLoader 可能在 window.modLoader 或其他位置
      if (window.modLoader && window.modLoader.mods) {
        mods = Object.keys(window.modLoader.mods);
      } else if (window.ModLoader) {
        var ml = window.ModLoader;
        if (ml.mods) mods = Object.keys(ml.mods);
        else if (ml.loadedMods) mods = ml.loadedMods.map(function(m){return m.name || m;});
      }
      // 也检查 modUtils
      if (window.modUtils && window.modUtils.mods) {
        mods = mods.concat(Object.keys(window.modUtils.mods));
      }
      return JSON.stringify({count: mods.length, mods: mods.sort()});
    } catch(e) { return 'EXC:' + e.message; }
  })()`, 15000);
  console.log(modList);

  console.log('\n========== 2. 关键 passage 存在性检查 ==========');
  // 检查各个 mod 的标志性 passage 是否存在于 Story 中
  const passageCheck = await ev(`(function(){
    try {
      var Story = window.SugarCube.Story;
      var passages = {
        // iCandy
        'iCandy Robot Intro': Story.has('iCandy Robot Intro'),
        'iCandy Init': Story.has('iCandy Init'),
        // Chimera
        'Chimera Statue': Story.has('Chimera Statue'),
        'Chimera Quest1': Story.has('Chimera Quest1'),
        // BJX - ant island
        'Ant Island': Story.has('Ant Island'),
        'The Bunker Intro': Story.has('The Bunker Intro'),
        // BJX - hive
        'Hive Cell Outside': Story.has('Hive Cell Outside'),
        'Hive Taylor Introduction': Story.has('Hive Taylor Introduction'),
        // BJX - taylor/casey
        'Missing Poster': Story.has('Missing Poster'),
        'Casey Introduction': Story.has('Casey Introduction'),
        // BJX - ghost
        'Ghost Intro': Story.has('Ghost Intro'),
        // BJX - churchyard
        'Churchyard Catacombs Sneak': Story.has('Churchyard Catacombs Sneak'),
        // BJX - landfill
        'Trash Gate Enter': Story.has('Trash Gate Enter'),
        // BJX - fly
        'Fly Intro': Story.has('Fly Intro'),
        // BJX - temple
        'Temple Science': Story.has('Temple Science'),
        // BJX - moor
        'Moor Dragon': Story.has('Moor Dragon'),
        // BJX - tf animals
        'TF Bee': Story.has('TF Bee'),
        // DoLSims
        'DoLSims Init': Story.has('DoLSims Init'),
        // DomRobin
        'DomRobin Init': Story.has('DomRobin Init'),
        // BabyHawk
        'BabyHawk Init': Story.has('BabyHawk Init'),
        // Avery Orphanage Note
        'Avery Orphanage Note': Story.has('Avery Orphanage Note'),
      };
      var found = Object.keys(passages).filter(function(k){return passages[k];});
      var missing = Object.keys(passages).filter(function(k){return !passages[k];});
      return JSON.stringify({total: Object.keys(passages).length, found: found.length, missing: missing, foundList: found});
    } catch(e) { return 'EXC:' + e.message; }
  })()`, 15000);
  console.log(passageCheck);

  console.log('\n========== 3. NPC 注册检查 ==========');
  const npcCheck = await ev(`(function(){
    try {
      var V = window.SugarCube.State.variables;
      var C = window.C;
      var npcs = V.NPCName || [];
      var list = V.NPCNameList || [];
      // iCandy NPC
      var icandyNames = ['Robert','Hadley','Qing','Lam','Wei','Xinyu','Cheng','Yue','Keith'];
      var icandyResult = [];
      for (var i = 0; i < icandyNames.length; i++) {
        var name = icandyNames[i];
        var inList = list.indexOf(name) >= 0;
        var inCnpc = false;
        try { inCnpc = C.npc[name] !== undefined; } catch(e) {}
        icandyResult.push({name: name, inList: inList, inCnpc: inCnpc});
      }
      // BJX NPC
      var bjxNames = ['泰勒', '凯西'];
      var bjxResult = [];
      for (var j = 0; j < bjxNames.length; j++) {
        var bname = bjxNames[j];
        var binList = list.indexOf(bname) >= 0;
        var binCnpc = false;
        try { binCnpc = C.npc[bname] !== undefined; } catch(e) {}
        bjxResult.push({name: bname, inList: binList, inCnpc: binCnpc});
      }
      return JSON.stringify({
        totalNpcs: npcs.length,
        totalNames: list.length,
        icandy: icandyResult,
        bjx: bjxResult
      });
    } catch(e) { return 'EXC:' + e.message; }
  })()`, 15000);
  console.log(npcCheck);

  console.log('\n========== 4. 关键变量/设置检查 ==========');
  const varCheck = await ev(`(function(){
    try {
      var V = window.SugarCube.State.variables;
      var setup = window.setup;
      return JSON.stringify({
        // iCandy
        iCandy_version: window.iCandy ? window.iCandy.version : (window.iCandyRobot ? 'exists' : 'NOT FOUND'),
        // Chimera
        chimerastage: V.chimerastage !== undefined ? V.chimerastage : 'undefined',
        // BJX options
        bjx_eventTF: V.options ? V.options.bjx_eventTF : 'no options',
        // BJX variables
        TaylorMissing: V.TaylorMissing !== undefined ? V.TaylorMissing : 'undefined',
        caseymet: V.caseymet !== undefined ? V.caseymet : 'undefined',
        hive_intro: V.hive_intro !== undefined ? V.hive_intro : 'undefined',
        ghost: V.ghost !== undefined ? V.ghost : 'undefined',
        slime: V.slime !== undefined ? V.slime : 'undefined',
        bunker: V.bunker !== undefined ? V.bunker : 'undefined',
        // setup.pregnancy
        pregnancy_typesEnabled: setup.pregnancy ? setup.pregnancy.typesEnabled.length : 'no setup.pregnancy',
        // BeastList
        BeastList: V.BeastList ? V.BeastList.join(',') : 'undefined',
      });
    } catch(e) { return 'EXC:' + e.message; }
  })()`, 15000);
  console.log(varCheck);

  console.log('\n========== 5. 入口链接可见性检查（导航到各区域） ==========');
  // 导航到 Forest 检查林间巨石
  await ev(`window.SugarCube.Engine.play('Forest')`, 10000);
  await sleep(5000);
  const forestLinks = await ev(`(function(){
    var links = document.querySelectorAll('#passages .passage a');
    var texts = [];
    for (var i = 0; i < links.length; i++) {
      var t = links[i].textContent.trim();
      if (t && t.length < 30) texts.push(t);
    }
    return JSON.stringify({linkCount: links.length, hasChimeraStatue: texts.indexOf('林间巨石') >= 0, links: texts.slice(0, 20)});
  })()`, 10000);
  console.log('Forest:', forestLinks);

  // 导航到 Danube Street 检查泰勒的家
  await ev(`window.SugarCube.Engine.play('Danube Street')`, 10000);
  await sleep(5000);
  const danubeLinks = await ev(`(function(){
    var links = document.querySelectorAll('#passages .passage a');
    var texts = [];
    for (var i = 0; i < links.length; i++) {
      var t = links[i].textContent.trim();
      if (t && t.length < 40) texts.push(t);
    }
    return JSON.stringify({linkCount: links.length, links: texts.slice(0, 20)});
  })()`, 10000);
  console.log('Danube Street:', danubeLinks);

  // 导航到 Connudatus Street 检查凯西
  await ev(`window.SugarCube.Engine.play('Connudatus Street')`, 10000);
  await sleep(5000);
  const connudatusLinks = await ev(`(function(){
    var links = document.querySelectorAll('#passages .passage a');
    var texts = [];
    for (var i = 0; i < links.length; i++) {
      var t = links[i].textContent.trim();
      if (t && t.length < 40) texts.push(t);
    }
    return JSON.stringify({linkCount: links.length, links: texts.slice(0, 20)});
  })()`, 10000);
  console.log('Connudatus Street:', connudatusLinks);

  console.log('\n========== 汇总 ==========');
  console.log('测试完成，请查看上方各模块结果');

  chrome.kill();
  process.exit(0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
