// 诊断探针：胚胎吸收 / 再来一发 / 自行车 三项功能是否真在运行时存在
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8790/Degrees%20of%20Lewdity.html';
const PORT = 9240;
const PROFILE = mkdtempSync(join(tmpdir(), 'probe3-'));
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
chrome.stderr.on('data', (d) => {
  const s = String(d).trim();
  if (s && /error|fail|denied|crash/i.test(s)) console.log('[chrome]', s.slice(0, 200));
});

const cdp = connect(await getPageWs());
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

async function ev(expr, timeout = 60000) {
  return Promise.race([
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
      .then((r) => {
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval error');
        return r.result.value;
      }),
    sleep(timeout).then(() => { throw new Error('eval timeout: ' + expr.slice(0, 50)); }),
  ]);
}

console.log('等待 boot ...');
for (let i = 0; i < 180; i++) {
  const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage && window.V)').catch(() => false);
  if (ok) { console.log('boot ok @', i, 's'); break; }
  await sleep(1000);
}
await sleep(4000);

const base = JSON.parse(await ev(`JSON.stringify({
  pleaseAgain: typeof window.bjxInjectPleaseAgain,
  embryo: typeof window.bjxInjectEmbryoLink,
  awareWin: typeof window.playerAwareTheyArePregnant,
  isPregWin: typeof window.playerIsPregnant,
  physiqueMacro: !!SugarCube.Macro.get("physique"),
  tiredMacro: !!SugarCube.Macro.get("tiredness"),
  restartCycle: !!SugarCube.Macro.get("restartMenstruationCycle"),
  pleasePassage: !!(SugarCube.Story && SugarCube.Story.get("BJX Please Again")),
  pleaseGoPassage: !!(SugarCube.Story && SugarCube.Story.get("BJX Please Again Go")),
  embryoPassage: !!(SugarCube.Story && SugarCube.Story.get("BJX Embryo Absorb")),
  pregKeys: Object.keys((V.sexStats && V.sexStats.vagina && V.sexStats.vagina.pregnancy) || {}),
  pregType: V.sexStats && V.sexStats.vagina && V.sexStats.vagina.pregnancy ? V.sexStats.vagina.pregnancy.type : "<no sexStats>",
  sexStatsKeys: V.sexStats ? Object.keys(V.sexStats) : null,
  vSexKeys: Object.keys(V).filter(k => /sex|preg|stat/i.test(k)).slice(0, 30),
  passageNow: SugarCube.State.passage,
  setupPreg: Object.keys(window.setup || {}).filter(k => /preg|menstru/i.test(k)).slice(0, 25),
  winPreg: Object.keys(window).filter(k => /^(player|is).*[Pp]reg/.test(k)).slice(0, 25)
})`));
console.log('=== 基础探针 ===');
writeFileSync('C:/Users/79403/Desktop/dol/work/_probe3.json', JSON.stringify(base, null, 2)); console.log('BASE:', JSON.stringify(base));

// 自行车：用 Story.get 读 passage 源码
const bike = JSON.parse(await ev(`(() => {
  const out = { api: typeof SugarCube.Story };
  const all = [];
  const story = SugarCube.Story;
  const walk = (obj) => {};
  out.passageCount = (story && story.passages) ? story.passages.length : -1;
  const names = (story && story.passages) ? story.passages.map(p => p.title) : [];
  out.namesWithBike = names.filter(n => /bike|bicycle|sims/i.test(n)).slice(0, 25);
  const bikeNames = names.filter(n => /^Bicycle Sims \\d+$/.test(n));
  out.n = bikeNames.length;
  out.sample = bikeNames.slice(0, 3).map(n => {
    const p = story.get(n);
    const b = (p && (p.text || p.source)) || "";
    return { name: n, physique: (b.match(/<<physique \\d+>>/g) || []).length, pass: (b.match(/<<pass \\d+>>/g) || []).length };
  });
  const farm = names.filter(n => /BikeSims Farm/i.test(n));
  out.farm = farm.map(n => {
    const p = story.get(n);
    const b = (p && (p.text || p.source)) || "";
    return { name: n, physique: (b.match(/<<physique/g) || []).length };
  });
  return JSON.stringify(out);
})()`));
console.log('=== 自行车 passage ===');
console.log(JSON.stringify(bike, null, 2));

process.exit(0);
