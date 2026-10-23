// 并行跑「主回归 61 步」+「第三方冒烟 22 步」，合并结论。
// 两个脚本本来就各用各的端口（9223 / 9224）、各自临时 profile、各自日志与 report，
// 互不干扰，所以可以并发——总耗时 = 较慢的那个，而不是两者相加。
//
// 用法：node run_tests.mjs "http://127.0.0.1:8766/Degrees%20of%20Lewdity.html"
// 退出码：两个都绿才 0。
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.argv[2] || 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';

const JOBS = [
  { label: '主回归 61 步', script: 'cdp_pack.mjs' },
  { label: '第三方冒烟 22 步', script: 'cdp_mods_smoke.mjs' },
];

const t0 = Date.now();

function run(job) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(HERE, job.script), URL], {
      cwd: HERE,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { out += String(d); });
    child.on('close', (code) => {
      const lines = out.split('\n');
      const fails = lines.filter((l) => /^FAIL|^FATAL|DRIVER/.test(l.trim()));
      const summary = lines.find((l) => /^passed=/.test(l.trim())) || '(无汇总行)';
      const elapsed = lines.find((l) => /^elapsed=/.test(l.trim())) || '';
      resolve({ ...job, code, fails, summary, elapsed, ms: Date.now() - started, out });
    });
  });
}

const results = await Promise.all(JOBS.map(run));

console.log('\n================ 测试总览 ================');
let bad = 0;
for (const r of results) {
  const ok = r.code === 0 && r.fails.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '绿' : '红'}  ${r.label}  ${r.summary}  ${r.elapsed}  [${(r.ms / 1000).toFixed(1)}s]`);
  for (const f of r.fails.slice(0, 20)) console.log('      ' + f.trim().slice(0, 220));
}
console.log(`合计墙钟 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(bad ? '结论：有红，看上面的 FAIL 行或 work/cdp-*-report.json' : '结论：双绿');
process.exit(bad ? 1 : 0);
