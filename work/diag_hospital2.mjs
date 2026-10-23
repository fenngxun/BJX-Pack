// diag2: replay S41 (mushroom cure -> patient gown) then probe S43 pages,
// to find which accumulated state blanks the passage textContent.
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';
import { writeFileSync } from 'fs';

const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9782;
const PROFILE = join(process.cwd(), '.diag-profile-' + Date.now());
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BJXTEST_SRC = `
(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const SC = window.SugarCube;
  window.BJXTEST = {
    passage: () => SC.State.passage,
    var: (n) => SC.State.variables[n],
    setVars: (o) => { Object.assign(SC.State.variables, o); return true; },
    run: (code) => { try { return String(eval(code)); } catch (e) { return 'EXC:' + String(e).slice(0, 300); } },
    goto: (n) => { SC.Engine.play(n); return true; },
    links: () => qa('#passages a.link-internal, #passages a.macro-link').map(a => a.textContent.trim()),
    elTextFull: (s) => { const el = q(s); return el ? el.textContent : null; },
    clickLink: (prefix) => {
      const el = qa('#passages a.link-internal, #passages a.macro-link').find((a) => a.textContent.trim().startsWith(prefix));
      if (el) { el.click(); return true; }
      return false;
    },
  };
  return true;
})()
`;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--window-size=1280,900', URL,
], { stdio: ['ignore', 'ignore', 'ignore'] });

async function waitCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('Degrees'));
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(500);
  }
  throw new Error('no cdp');
}


async function main() {
  const wsUrl = await waitCdp();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++mid;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return 'PAGE-EXC: ' + JSON.stringify(r.exceptionDetails).slice(0, 300);
    return r.result && r.result.result && r.result.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  const dump = (tag) => ev(`(() => {
    const els = document.querySelectorAll('#passages .passage');
    return {
      tag: ${JSON.stringify(tag)},
      passage: SugarCube.State.passage,
      els: els.length,
      first: els.length ? { cls: els[0].className.slice(0, 80), len: els[0].textContent.length, head: els[0].textContent.replace(/\\s+/g, ' ').slice(0, 80) } : null,
    };
  })()`);
  const t0 = Date.now();
  let booted = false;
  while (Date.now() - t0 < 240000) {
    const ok = await ev(`(() => { const d = document.getElementById('story'); return !!(d && window.SugarCube && window.SugarCube.State && window.SugarCube.State.passage); })()`);
    if (ok === true) { booted = true; break; }
    await sleep(2000);
  }
  if (!booted) throw new Error('game did not boot');
  await ev(BJXTEST_SRC);
  await ev(`(() => { const cb = document.querySelector('#ui-dialog input[type="checkbox"]'); if (cb) cb.click(); const b = Array.from(document.querySelectorAll('#ui-dialog button')).find(x => x.textContent.trim() === 'Enter'); if (b) b.click(); return true; })()`);
  await sleep(2000);
  await ev(`BJXTEST.goto('Start2')`);
  await sleep(800);

  const out = [];
  const log = (k, v) => { console.log('[' + k + '] ' + JSON.stringify(v)); out.push([k, v]); };

  // === replay S40-S42 variable state ===
  await ev(`BJXTEST.setVars({ slime: 1, mushroom: 1, demonhunter: 4, money: 5000000, stress: 0, exposed: 0, arousal: 0 })`);

  // === replay S41: mushroom cure chain ===
  await ev(`BJXTEST.goto('Hospital Mushroom')`);
  await sleep(1000);
  log('s41-mushroom-page', await dump('mushroom'));
  await ev(`BJXTEST.clickLink('付款')`);
  await sleep(1200);
  log('s41-private-mushrooms', await dump('privateMushrooms'));
  await ev(`BJXTEST.clickLink('清除蘑菇感染')`);
  await sleep(1500);
  log('s41-private2-mushrooms', await dump('private2Mushrooms'));
  await ev(`BJXTEST.clickLink('继续')`);
  await sleep(1500);
  log('s41-after-cure', {
    passage: await ev(`SugarCube.State.passage`),
    mushroom: await ev(`String(V.mushroom)`),
    upper: await ev(`V.worn.upper && V.worn.upper.name`),
    txt: await ev(`document.querySelector('#passages .passage') ? document.querySelector('#passages .passage').textContent.replace(/\\s+/g, ' ').slice(0, 120) : 'NO EL'`),
  });

  // === now probe S43: Hospital Parasite with ear slime ===
  await ev(`V.parasite.clit.name = 'urchin'`);
  await ev(`V.parasite.left_ear.name = 'slime'`);
  await ev(`BJXTEST.goto('Hospital Parasite')`);
  await sleep(1000);
  log('s43-parasite-1s', await dump('parasite1s'));
  await sleep(2500);
  const probe = await ev(`(() => {
    const el = document.querySelector('#passages .passage');
    return {
      els: document.querySelectorAll('#passages .passage').length,
      len: el ? el.textContent.length : -1,
      hasRumour: el ? el.textContent.includes('顺便说一句') : 'NO EL',
      hasEnglish: el ? el.textContent.includes('Firstly, the slime') : 'NO EL',
      head: el ? el.textContent.replace(/\\s+/g, ' ').slice(0, 150) : 'NO EL',
      errors: Array.from(document.querySelectorAll('.error')).map(e => e.textContent.trim().slice(0, 120)),
    };
  })()`);
  log('s43-parasite-probe', probe);

  // === control: goto Hospital Parasite AGAIN (second render) ===
  await ev(`BJXTEST.goto('Hospital Foyer')`);
  await sleep(800);
  await ev(`BJXTEST.goto('Hospital Parasite')`);
  await sleep(1500);
  log('s43-parasite-second-goto', await ev(`(() => {
    const el = document.querySelector('#passages .passage');
    return {
      passage: SugarCube.State.passage,
      els: document.querySelectorAll('#passages .passage').length,
      hasRumour: el ? el.textContent.includes('顺便说一句') : 'NO EL',
      len: el ? el.textContent.length : -1,
    };
  })()`));

  writeFileSync('diag-hospital2.json', JSON.stringify(out, null, 2));
  console.log('saved diag-hospital2.json');

  spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
  await sleep(1500);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(0);
}

main().catch((e) => {
  console.error('DIAG ERROR: ' + e.message);
  spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
  process.exit(1);
});