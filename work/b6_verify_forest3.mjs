// Quick verify after reload
import http from 'http';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class CDPClient {
    constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.ws = null; }
    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
        this.ws.onmessage = (evt) => {
            const msg = JSON.parse(evt.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(JSON.stringify(msg.error)));
                else resolve(msg.result);
            }
        };
    }
    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async evaluate(expr) {
        const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
        return res.result.value;
    }
    close() { if (this.ws) this.ws.close(); }
}
async function getPageWsUrl() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json', (res) => {
            let body = ''; res.on('data', c => body += c);
            res.on('end', () => {
                const tabs = JSON.parse(body);
                const page = tabs.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8766'));
                if (!page) reject(new Error('no tab')); else resolve(page.webSocketDebuggerUrl);
            });
        }).on('error', reject);
    });
}
async function main() {
    const wsUrl = await getPageWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();

    // Reload page to pick up new HTML
    console.log('[RELOAD] Refreshing page...');
    await cdp.send('Page.reload');
    await sleep(15000);

    // Click start if needed
    const startLink = await cdp.evaluate(`
        (function() {
            const a = Array.from(document.querySelectorAll('a')).find(x => 
                x.textContent.includes('开始') || x.textContent.includes('Start') || x.textContent.includes('New Game'));
            return a ? a.textContent : null;
        })()
    `);
    if (startLink) {
        console.log('[START] Clicking:', startLink);
        await cdp.evaluate(`Array.from(document.querySelectorAll('a')).find(x => x.textContent.includes('开始') || x.textContent.includes('Start')).click()`);
        await sleep(8000);
    }

    async function test(label, forest, eventskip, hiveIntro) {
        await cdp.evaluate(`V.forest = ${forest}; V.eventskip = ${eventskip}; V.hive_intro = ${hiveIntro}; V.location = 'forest';`);
        await cdp.evaluate(`SugarCube.Engine.play("Forest")`);
        await sleep(1500);
        const r = await cdp.evaluate(`
            (function() {
                const p = document.querySelector('#passages .passage');
                return {
                    statue: !!document.querySelector('#bjx-chimera-statue'),
                    hive: !!document.querySelector('#bjx-hive-forest-entry'),
                    hasDeeper: p ? (p.textContent.includes('深入森林') || p.textContent.includes('Go deeper')) : false,
                    links: Array.from(p.querySelectorAll('a')).map(a=>a.textContent.trim()).slice(0,10)
                };
            })()
        `);
        console.log(`\n[${label}] forest=${forest}, eventskip=${eventskip}, hive_intro=${hiveIntro}`);
        console.log(`  林间巨石: ${r.statue ? '显示' : '隐藏'}`);
        console.log(`  蜂巢入口: ${r.hive ? '显示' : '隐藏'}`);
        console.log(`  主页面(有深入森林): ${r.hasDeeper}`);
        console.log(`  链接: ${JSON.stringify(r.links)}`);
        return r;
    }

    console.log('\n=== 验证结果 ===');
    await test('主页面+深度0', 0, 1, 1);
    await test('主页面+深度55', 55, 1, 1);
    await test('主页面+深度55+未发现蜂巢', 55, 1, 0);
    await test('随机事件页+深度55', 55, 0, 1);

    cdp.close();
    console.log('\n=== 完成 ===');
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
