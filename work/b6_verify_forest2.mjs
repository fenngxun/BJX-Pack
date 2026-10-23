// Verify forest entry display with eventskip=1 to see Forest main page
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

async function gotoForest(cdp, forestVal, hiveIntro) {
    await cdp.evaluate(`V.forest = ${forestVal}; V.eventskip = 1; V.hive_intro = ${hiveIntro}; V.location = 'forest';`);
    await cdp.evaluate(`SugarCube.Engine.play("Forest")`);
    await sleep(1500);
    return cdp.evaluate(`
        (function() {
            const p = document.querySelector('#passages .passage');
            return {
                statue: !!document.querySelector('#bjx-chimera-statue'),
                hive: !!document.querySelector('#bjx-hive-forest-entry'),
                hasDeeper: p ? (p.textContent.includes('深入森林') || p.textContent.includes('Go deeper')) : false,
                links: Array.from(p.querySelectorAll('a')).map(a=>a.textContent.trim()).slice(0,12),
                textHead: p.textContent.substring(0, 150).replace(/\s+/g,' ')
            };
        })()
    `);
}

async function main() {
    const wsUrl = await getPageWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();
    console.log('=== Forest Entry Verification (eventskip=1) ===\n');

    // TEST 1: forest=0, statue should be hidden
    console.log('[TEST 1] $forest=0, hive_intro=1');
    let r = await gotoForest(cdp, 0, 1);
    console.log(`  statue: ${r.statue ? 'VISIBLE' : 'hidden'} ${!r.statue ? 'PASS' : 'FAIL'}`);
    console.log(`  hive:   ${r.hive ? 'VISIBLE' : 'hidden'} ${r.hive ? 'PASS' : 'FAIL'}`);
    console.log(`  hasDeeper: ${r.hasDeeper}`);
    console.log(`  links: ${JSON.stringify(r.links)}`);

    // TEST 2: forest=55, statue should be visible
    console.log('\n[TEST 2] $forest=55, hive_intro=1');
    r = await gotoForest(cdp, 55, 1);
    console.log(`  statue: ${r.statue ? 'VISIBLE' : 'hidden'} ${r.statue ? 'PASS' : 'FAIL'}`);
    console.log(`  hive:   ${r.hive ? 'VISIBLE' : 'hidden'} ${r.hive ? 'PASS' : 'FAIL'}`);
    console.log(`  hasDeeper: ${r.hasDeeper}`);
    console.log(`  links: ${JSON.stringify(r.links)}`);

    // TEST 3: forest=55, hive_intro=0 (hive not discovered)
    console.log('\n[TEST 3] $forest=55, hive_intro=0 (hive not discovered)');
    r = await gotoForest(cdp, 55, 0);
    console.log(`  statue: ${r.statue ? 'VISIBLE' : 'hidden'}`);
    console.log(`  hive:   ${r.hive ? 'VISIBLE' : 'hidden'} ${!r.hive ? 'PASS' : 'FAIL'}`);

    // TEST 4: random event page (eventskip=0) - neither should show
    console.log('\n[TEST 4] Random event page (eventskip=0, forest=55, hive_intro=1)');
    await cdp.evaluate(`V.forest = 55; V.eventskip = 0; V.hive_intro = 1;`);
    await cdp.evaluate(`SugarCube.Engine.play("Forest")`);
    await sleep(1500);
    r = await cdp.evaluate(`
        (function() {
            const p = document.querySelector('#passages .passage');
            return {
                statue: !!document.querySelector('#bjx-chimera-statue'),
                hive: !!document.querySelector('#bjx-hive-forest-entry'),
                hasDeeper: p ? (p.textContent.includes('深入森林') || p.textContent.includes('Go deeper')) : false,
                links: Array.from(p.querySelectorAll('a')).map(a=>a.textContent.trim()).slice(0,12)
            };
        })()
    `);
    console.log(`  statue: ${r.statue ? 'VISIBLE' : 'hidden'}`);
    console.log(`  hive:   ${r.hive ? 'VISIBLE' : 'hidden'}`);
    console.log(`  hasDeeper: ${r.hasDeeper}`);
    console.log(`  links: ${JSON.stringify(r.links)}`);
    console.log(`  NOTE: On random event pages, hive should be hidden (no deeper heading). Statue behavior depends on original mod design.`);

    cdp.close();
    console.log('\n=== Done ===');
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
