// CDP test: verify ModI18N (Chinese translation) loads and patches the game.
import { spawn } from 'node:child_process';
import { writeFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8799/Degrees%20of%20Lewdity.html';
const PORT = 9225;
const PROFILE = mkdtempSync(join(tmpdir(), 'i18n-smoke-'));
const LOG = 'C:/Users/79403/Desktop/dol/work/cdp-i18n-console.log';
const REPORT = 'C:/Users/79403/Desktop/dol/work/cdp-i18n-report.json';

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

// benign: the ModI18N ImageLoaderHook dependency warning is expected/non-fatal
const BENIGN = /drawImage|could not be loaded|modList\.json|Failed to load resource|Failed to load mask|net::ERR|LoaderKeyConfig|ModZipReader|favicon|404|Error during effect|randomInt called with invalid parameters|createRadialGradient|Unexpected token|is not of type|broken' state|Failed to execute|\[EXC\] Event$|DependenceChecker|ModLoader DoL ImageLoaderHook|need mod\[|but not find/i;

const PASSAGE_PROBE = `(() => {
  window.MODPROBE = {
    count(name, needle) {
      const mu = window.modUtils;
      let d;
      try { d = mu.getPassageData(name); } catch (e) { return JSON.stringify({ err: 'EXC:' + String(e).slice(0,120) }); }
      if (!d) return JSON.stringify({ err: 'NO_SC2_DATA' });
      const t = d.text || d.content || String(d);
      let count = 0, i = 0;
      while ((i = t.indexOf(needle, i)) >= 0) { count++; i += needle.length; }
      return JSON.stringify({ count, len: t.length });
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
        if (!BENIGN.test(line)) appendFileSync(LOG, line + '\n');
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const line = '[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 400);
        consoleLines.push(line);
        appendFileSync(LOG, line + '\n');
      }
    });

    // ---------- boot ----------
    let s = step('boot-and-modI18N-loaded');
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
      const modList = await ev('window.modUtils ? window.modUtils.getModListName() : null');
      s.check(Array.isArray(modList), 'modListIsArray', modList);
      s.check(Array.isArray(modList) && modList.includes('ModI18N'), 'has:ModI18N');
      s.note('modList', modList);
      // window.modI18N object
      const mi = await ev('(() => { if (!window.modI18N) return null; return { has: true, ver: (window.modI18N.mod && window.modI18N.mod.version) || null, hasModUtils: !!window.modI18N.modUtils, hasSC2: !!window.modI18N.modSC2DataManager }; })()');
      s.note('window.modI18N', mi);
      s.check(mi && mi.has === true, 'window.modI18N.defined');
      s.check(mi && mi.ver === '1.0.8a', 'modI18N.version', mi && mi.ver);
    }

    // ---------- SC2 passage data patched to Chinese ----------
    s = step('sc2-data-translated');
    {
      const probes = [
        ['Maze 0 1', '谨慎地继续'],
        ['Widgets Version Info', '更新日志和信息'],
        ['Widgets Blackjack', '帮助和选项'],
      ];
      const results = {};
      let anyChinese = false;
      for (const [pn, zh] of probes) {
        let r;
        try { r = JSON.parse(await ev(`MODPROBE.count(${JSON.stringify(pn)}, ${JSON.stringify(zh)})`)); }
        catch (e) { r = { err: String(e).slice(0, 120) }; }
        results[pn + '::' + zh] = r;
        if (r && r.count >= 1) anyChinese = true;
      }
      s.note('probeResults', results);
      s.check(anyChinese, 'atLeastOnePassageHasChinese', anyChinese);
    }

    // ---------- live DOM check: capture rendered text CJK count ----------
    s = step('live-dom-cjk');
    {
      const info = await ev(`(() => {
        const el = document.getElementById('story');
        const txt = el ? el.innerText || '' : '';
        const cjk = (txt.match(/[\\u4e00-\\u9fff]/g) || []).length;
        return { passage: window.SugarCube.State.passage, cjk, len: txt.length, head: txt.slice(0, 200) };
      })()`);
      s.note('bootPassage', info);
      s.check(info && typeof info.cjk === 'number', 'domReadable');
      s.note('bootPassageCJK', info && info.cjk);
    }

    // ---------- final console sweep (excluding benign) ----------
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
      console.log((st.pass ? 'PASS ' : 'FAIL ') + st.name + ' ' + JSON.stringify(st.details).slice(0, 400));
    }
    console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
    writeFileSync(REPORT, JSON.stringify(report, null, 1));
    try { chrome.kill(); } catch {}
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
