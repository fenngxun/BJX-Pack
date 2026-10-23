// 真实游玩测试：模拟玩家点击操作，全程监控错误
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9276;
const PROFILE = mkdtempSync(join(tmpdir(), 'b6playtest-'));
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
  await send('Page.enable');

  const errors = [];
  const alerts = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params && m.params.type === 'error') {
      errors.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 500));
    }
    if (m.method === 'Runtime.exceptionThrown' && m.params && m.params.exceptionDetails) {
      errors.push('EXC: ' + (m.params.exceptionDetails.text || '').slice(0, 500));
    }
    if (m.method === 'Page.javascriptDialogOpening') {
      alerts.push({type: m.params.type, message: (m.params.message || '').slice(0, 500)});
      console.log('!!! DIALOG:', m.params.type, (m.params.message || '').slice(0, 200));
    }
  });

  const ev = async (e, tmo = 30000) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(tmo).then(() => null)]);
    if (!r) return 'TIMEOUT';
    if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0].slice(0, 500);
    return r.result.value;
  };

  // 点击 passage 内第一个匹配文本的链接
  const clickLink = async (textMatch) => {
    const r = await ev(`(function(){
      var links = document.querySelectorAll('#passages .passage a');
      for (var i = 0; i < links.length; i++) {
        if (links[i].textContent && links[i].textContent.indexOf('${textMatch}') >= 0) {
          links[i].click();
          return 'clicked: ' + links[i].textContent.trim();
        }
      }
      return 'not found: ${textMatch}';
    })()`, 10000);
    return r;
  };

  const passage = () => ev(`window.SugarCube.State.passage`, 5000);
  const checkErrors = (label) => {
    const bad = errors.filter(e =>
      e.indexOf('npcPregnancy') >= 0 || e.indexOf('pregnancy') >= 0 ||
      e.indexOf('settingsExitFunction') >= 0 || e.indexOf('backComp') >= 0 ||
      e.indexOf('doVersionCheck') >= 0 || e.indexOf('fetus') >= 0 ||
      e.indexOf('virginity') >= 0 || e.indexOf('vaginal') >= 0);
    console.log(`[${label}] passage=${currentPassage} errors=${errors.length} bad=${bad.length}`);
    if (bad.length > 0) console.log('  BAD:', bad.slice(0, 3));
    return bad.length;
  };

  let currentPassage = '';

  // 1. 等待 Start 页面
  console.log('=== 等待游戏加载 ===');
  const t0 = Date.now();
  while (Date.now() - t0 < 280000) {
    const r = await ev(`(function(){try{return window.SugarCube && window.SugarCube.State.passage ? window.SugarCube.State.passage : '';}catch(e){return '';}})()`, 15000);
    if (r && String(r).startsWith('Start')) { currentPassage = r; console.log('START-READY', ((Date.now() - t0) / 1000).toFixed(1) + 's'); break; }
    await sleep(2000);
  }
  await sleep(3000);
  checkErrors('Start页面');

  // 2. 点击"开始游戏"
  console.log('=== 点击开始游戏 ===');
  const clickResult = await clickLink('开始游戏');
  console.log(clickResult);
  await sleep(8000);
  currentPassage = await passage();
  console.log('当前 passage:', currentPassage);
  const bad1 = checkErrors('点击开始游戏后');

  // 3. 导航到不同区域（模拟真实游玩）
  const navSteps = [
    {text: '学校', label: '尝试去学校'},
    {text: '街道', label: '尝试去街道'},
    {text: '森林', label: '尝试去森林'},
    {text: '庄园', label: '尝试去庄园'},
    {text: '海滩', label: '尝试去海滩'},
  ];

  for (const step of navSteps) {
    console.log(`=== ${step.label} ===`);
    const r = await clickLink(step.text);
    console.log(r);
    await sleep(5000);
    currentPassage = await passage();
    console.log('当前 passage:', currentPassage);
    checkErrors(step.label);
    // 如果遇到随机事件，点继续
    const cont = await clickLink('继续');
    if (cont && cont.startsWith('clicked')) {
      console.log(cont);
      await sleep(3000);
    }
  }

  // 4. 直接跳转到之前报错的 passage 做最终确认
  console.log('=== 最终确认：报错高发 passage ===');
  for (const p of ['Domus Street', 'Oxford Street', 'High Street', 'Forest', 'Start2']) {
    await ev(`window.SugarCube.Engine.play('${p}')`, 10000);
    await sleep(4000);
    currentPassage = await passage();
    checkErrors(p);
  }

  // 5. 汇总
  console.log('\n=== 测试汇总 ===');
  console.log('总 console errors:', errors.length);
  console.log('弹窗 alerts:', alerts.length);
  const allBad = errors.filter(e =>
    e.indexOf('npcPregnancy') >= 0 || e.indexOf('pregnancy') >= 0 ||
    e.indexOf('settingsExitFunction') >= 0 || e.indexOf('backComp') >= 0 ||
    e.indexOf('doVersionCheck') >= 0 || e.indexOf('fetus') >= 0 ||
    e.indexOf('virginity') >= 0 || e.indexOf('vaginal') >= 0);
  console.log('相关错误数:', allBad.length);
  if (allBad.length > 0) {
    console.log('相关错误详情:');
    allBad.forEach((e, i) => console.log(`  ${i+1}. ${e.slice(0, 300)}`));
  }
  if (alerts.length > 0) {
    console.log('弹窗详情:');
    alerts.forEach((a, i) => console.log(`  ${i+1}. [${a.type}] ${a.message.slice(0, 300)}`));
  }
  console.log('无关错误（JSON解析等）:', errors.length - allBad.length);

  chrome.kill();
  process.exit(allBad.length > 0 || alerts.length > 0 ? 1 : 0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
