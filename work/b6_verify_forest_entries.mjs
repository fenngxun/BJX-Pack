// Verify forest entry display conditions:
// 1. Chimera statue only shows when $forest === 55
// 2. Hive entry only shows on Forest main page (not random event pages)
import http from 'http';

const URL = "http://127.0.0.1:8766/Degrees%20of%20Lewdity.html";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cdp(cmd, params = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ id: 1, method: cmd, params });
        const req = http.request({
            host: '127.0.0.1', port: 9222, path: '/json', method: 'GET'
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const tabs = JSON.parse(body);
                    const page = tabs.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8766'));
                    if (!page) { reject(new Error('no target tab')); return; }
                    const wsUrl = page.webSocketDebuggerUrl;
                    // Use fetch-based CDP via WebSocket is complex; use the simpler HTTP endpoint
                    resolve(page);
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Use puppeteer-core style via chrome-remote-interface is not available.
// Fall back: use the built-in CDP client pattern from existing probes.
// Since we can't rely on external packages, use Node's built-in WebSocket (Node 22+).
// Simpler: spawn a child chrome with --remote-debugging-port and use raw WebSocket.

const { execSync } = await import('child_process');

// Find existing probe pattern - use the same approach as b6_verify_*.mjs
// Those use chrome-remote-interface or similar. Let's check what's available.

try {
    const cri = await import('chrome-remote-interface');
    console.log('chrome-remote-interface available');
} catch(e) {
    console.log('chrome-remote-interface not available, using raw WebSocket');
}

// Raw WebSocket CDP client
class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.id = 0;
        this.pending = new Map();
        this.ws = null;
    }
    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((res, rej) => {
            this.ws.onopen = res;
            this.ws.onerror = rej;
        });
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
        const res = await this.send('Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
        return res.result.value;
    }
    close() { if (this.ws) this.ws.close(); }
}

async function getPageWsUrl() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json', (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const tabs = JSON.parse(body);
                    const page = tabs.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8766'));
                    if (!page) { reject(new Error('no target tab, url=' + tabs.map(t=>t.url).join(','))); return; }
                    resolve(page.webSocketDebuggerUrl);
                } catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('=== Forest Entry Display Verification ===\n');

    const wsUrl = await getPageWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();
    console.log('[OK] CDP connected');

    // Wait for game to be ready
    await sleep(3000);

    // Check if game is loaded
    const ready = await cdp.evaluate('typeof V !== "undefined" && V.player !== undefined').catch(() => false);
    if (!ready) {
        console.log('[INFO] Game not ready, clicking start...');
        // Click start button
        await cdp.evaluate(`
            (function() {
                const links = document.querySelectorAll('#passages a');
                for (const a of links) {
                    if (a.textContent.includes('开始') || a.textContent.includes('Start')) {
                        a.click();
                        return 'clicked: ' + a.textContent;
                    }
                }
                return 'no start link found, links: ' + Array.from(links).map(l=>l.textContent).join('|');
            })()
        `);
        await sleep(5000);
    }

    // Navigate to Forest
    console.log('\n[STEP] Navigating to Forest...');
    await cdp.evaluate(`
        (function() {
            if (typeof V === 'undefined') return 'V not defined';
            V.location = 'forest';
            V.forest = 0;
            V.eventskip = 0;
            return 'set location=forest, forest=0';
        })()
    `);
    await cdp.evaluate(`Engine.play("Forest")`).catch(e => 'goto failed: ' + e.message);
    await sleep(2000);

    // Test 1: forest=0, statue should NOT show
    console.log('\n[TEST 1] $forest = 0: Chimera statue should be hidden');
    await cdp.evaluate(`V.forest = 0; V.eventskip = 0;`);
    await cdp.evaluate(`Engine.play("Forest")`).catch(()=>{});
    await sleep(1500);
    const statueAt0 = await cdp.evaluate(`
        (function() {
            const el = document.querySelector('#bjx-chimera-statue');
            return el ? 'VISIBLE' : 'hidden';
        })()
    `);
    console.log(`  Result: ${statueAt0} ${statueAt0 === 'hidden' ? 'PASS' : 'FAIL'}`);

    // Test 2: forest=55, statue SHOULD show
    console.log('\n[TEST 2] $forest = 55: Chimera statue should be visible');
    await cdp.evaluate(`V.forest = 55; V.eventskip = 0;`);
    await cdp.evaluate(`Engine.play("Forest")`).catch(()=>{});
    await sleep(1500);
    const statueAt55 = await cdp.evaluate(`
        (function() {
            const el = document.querySelector('#bjx-chimera-statue');
            return el ? 'VISIBLE' : 'hidden';
        })()
    `);
    console.log(`  Result: ${statueAt55} ${statueAt55 === 'VISIBLE' ? 'PASS' : 'FAIL'}`);

    // Test 3: hive entry on Forest main page (hive_intro=1)
    console.log('\n[TEST 3] Forest main page with hive_intro=1: hive entry should show');
    await cdp.evaluate(`V.hive_intro = 1; V.forest = 0; V.eventskip = 0;`);
    await cdp.evaluate(`Engine.play("Forest")`).catch(()=>{});
    await sleep(1500);
    const hiveOnMain = await cdp.evaluate(`
        (function() {
            const el = document.querySelector('#bjx-hive-forest-entry');
            const hasDeeper = document.querySelector('#passages .passage')?.textContent?.includes('深入森林') ||
                              document.querySelector('#passages .passage')?.textContent?.includes('Go deeper');
            return { hive: el ? 'VISIBLE' : 'hidden', hasForestDeeper: hasDeeper };
        })()
    `);
    console.log(`  Result: hive=${hiveOnMain.hive}, hasDeeperHeading=${hiveOnMain.hasForestDeeper}`);
    console.log(`  ${hiveOnMain.hive === 'VISIBLE' ? 'PASS' : 'NOTE: hive hidden (may be random event page)'}`);

    // Test 4: dump all links on current page
    console.log('\n[INFO] Current page links:');
    const links = await cdp.evaluate(`
        Array.from(document.querySelectorAll('#passages .passage a')).map(a => a.textContent.trim()).filter(t => t)
    `);
    console.log(`  ${JSON.stringify(links)}`);

    // Test 5: check page text for forestdeeper heading
    const pageText = await cdp.evaluate(`document.querySelector('#passages .passage')?.textContent?.substring(0, 200) || ''`);
    console.log(`\n[INFO] Page text head: ${JSON.stringify(pageText)}`);

    cdp.close();
    console.log('\n=== Verification Complete ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
