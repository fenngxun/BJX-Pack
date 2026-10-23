// Capture boot console to find the pack load error.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';
const PORT = 9241;
const PROFILE = mkdtempSync(join(tmpdir(), 'bjx-diag-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tail = [];
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
      tail.push('[' + m.params.type + '] ' + txt.slice(0, 300));
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      tail.push('[EXC] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 400));
    }
  });
  return ws;
}
async function main() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1280,900', URL], { stdio: ['ignore', 'ignore', 'pipe'] });
  await sleep(3000);
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  const page = (await res.json()).find((t) => t.type === 'page' && t.url.includes('Degrees'));
  const ws = connect(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable', params: {} }));
  await sleep(60000);
  console.log(tail.slice(-30).join('\n'));
  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
