// Diagnostic for S56-S58 failures: why is the PC naked, and why no fly/docks link.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9231;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-diag-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const src = readFileSync('C:/Users/79403/Desktop/dol/work/cdp_pack.mjs', 'utf8');

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

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  await sleep(3000);
  const ws = connect(await getPageWs());
  await ws.ready;
  const ev = async (expr) => {
    const r = await Promise.race([
      ws.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false }),
      sleep(25000).then(() => { throw new Error('evaluate timeout'); }),
    ]);
    if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || '').slice(0, 500));
    return r.result.value;
  };

  let t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`).catch(() => false);
    if (ok) break;
    await sleep(2000);
  }
  console.log('booted');
  const bsrc = src.match(/const BJXTEST_SRC = `([\s\S]*?)`\s*;/)[1];
  await ev(bsrc);
  await sleep(800);
  if (await ev('BJXTEST.dialogOpen()')) {
    await ev('BJXTEST.ageGateCheck()'); await sleep(400);
    await ev('BJXTEST.ageGateEnter()'); await sleep(800);
  }
  console.log('passage:', await ev('BJXTEST.passage()'));

  // --- A. the dress expression used by S56-S58 ---
  console.log('\n[A] clothes tables');
  console.log(await ev(`JSON.stringify({ hasSetupClothes: !!(window.setup && setup.clothes), upperIsArray: Array.isArray(setup.clothes && setup.clothes.upper), upperLen: setup.clothes && setup.clothes.upper ? setup.clothes.upper.length : -1, idx: (typeof clothesIndex === "function" ? clothesIndex("upper","school shirt") : "noFn"), idxLower: (typeof clothesIndex === "function" ? clothesIndex("lower","school shorts") : "noFn"), cloneType: typeof clone })`));
  console.log('\n[A] run dress expr');
  console.log(await ev(`BJXTEST.run('V.worn.upper = clone(setup.clothes.upper[clothesIndex("upper","school shirt")]); V.worn.lower = clone(setup.clothes.lower[clothesIndex("lower","school shorts")]); "dressed"')`));
  console.log(await ev(`JSON.stringify({ upper: V.worn && V.worn.upper && V.worn.upper.name, lower: V.worn && V.worn.lower && V.worn.lower.name, exposed: V.exposed })`));

  // --- B. docks ---
  console.log('\n[B] docks');
  await ev(`BJXTEST.setVars({ money: 100000, history: 700, exposed: 0, eventskip: 1 })`);
  console.log('before goto:', await ev(`JSON.stringify({money:V.money, history:V.history, exposed:V.exposed, upper:V.worn.upper&&V.worn.upper.name})`));
  await ev('BJXTEST.goto("Docks")');
  await sleep(1500);
  console.log('after goto:', await ev(`JSON.stringify({passage:BJXTEST.passage(), exposed:V.exposed, money:V.money, history:V.history, naked:!(V.worn.upper&&V.worn.upper.name)})`));
  console.log('links:', await ev(`JSON.stringify(BJXTEST.links())`));
  console.log('injector sees:', await ev(`JSON.stringify({hasEl: !!document.querySelector("#bjx-docks-ride-entry")})`));

  // --- C. barb street fly ---
  console.log('\n[C] barb street');
  await ev(`BJXTEST.run('V.options.bjx_animal = true; V.transformationParts.dragon.wings = "red"; V.transformationParts.bird.wings = "disabled"; "ok"')`);
  await ev(`BJXTEST.setVars({ exposed: 0, eventskip: 1, stress: 0, trauma: 0 })`);
  await ev('BJXTEST.goto("Barb Street")');
  await sleep(1500);
  console.log('after goto:', await ev(`JSON.stringify({passage:BJXTEST.passage(), exposed:V.exposed, bjx_animal:V.options.bjx_animal, dw:V.transformationParts.dragon.wings, bw:V.transformationParts.bird.wings, birdFly:V.birdFly, naked:!(V.worn.upper&&V.worn.upper.name)})`));
  console.log('links:', await ev(`JSON.stringify(BJXTEST.links())`));
  console.log('story has flywait:', await ev(`String((SugarCube.Story.get("Barb Street").text||"").indexOf("flywait"))`));
  console.log('story has 起飞:', await ev(`String((SugarCube.Story.get("Barb Street").text||"").indexOf("起飞"))`));

  // --- D. robin raccoon pronouns ---
  console.log('\n[D] robin raccoon');
  console.log('story head:', await ev(`String((SugarCube.Story.get("Robin Raccoon").text||"").slice(0,260))`));
  console.log('pronoun now:', await ev(`String(V.pronoun)`));

  // --- E. sydney chat error ---
  console.log('\n[E] sydney chat');
  console.log('farm.beasts:', await ev(`JSON.stringify(V.farm && V.farm.beasts)`));
  await ev(`BJXTEST.run('V.farm = V.farm || {}; V.farm.beasts = V.farm.beasts || {horses:0,cattle:0,dogs:0,pigs:0}; "ok"')`);
  await ev(`BJXTEST.setVars({ sydneyromance: 1, sydneyChatState: 1, harpy: 0, fallenangel: 0, demon: 0, dragon: 1, cow: 0, wolfgirl: 0, cat: 0, fox: 0, stress: 0, trauma: 0, exposed: 0 })`);
  await ev(`BJXTEST.run('C.npc.Sydney.love = 100; V.transformationParts.dragon = V.transformationParts.dragon || {}; V.transformationParts.dragon.eyes = "red"; "ok"')`);
  const hit = await ev(`BJXTEST.run('(() => { for (let i = 0; i < 40; i++) { try { SugarCube.Engine.play("Sydney Chat"); } catch (e) {} const el = document.querySelector("#passages .passage"); if (el && el.textContent.indexOf("隐形眼镜") >= 0) return "hit@" + i; } return "miss:" + (document.querySelector("#passages .passage")||{}).textContent.slice(0,120); })()')`);
  console.log('sydney retry:', String(hit).slice(0, 300));

  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
