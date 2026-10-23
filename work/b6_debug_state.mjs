// Debug: check game state and navigate properly
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
            let body = '';
            res.on('data', c => body += c);
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

    // Check game state
    console.log('=== Game State Check ===');
    const state = await cdp.evaluate(`
        (function() {
            return {
                hasV: typeof V !== 'undefined',
                hasEngine: typeof Engine !== 'undefined',
                hasSugarCube: typeof SugarCube !== 'undefined',
                passage: typeof V !== 'undefined' ? V.passage : 'N/A',
                location: typeof V !== 'undefined' ? V.location : 'N/A',
                bodyChildren: document.body.children.length,
                passagesEl: !!document.querySelector('#passages'),
                passageEl: !!document.querySelector('#passages .passage'),
                passageTextLen: document.querySelector('#passages .passage')?.textContent?.length || 0,
                url: location.href.substring(0, 80)
            };
        })()
    `);
    console.log(JSON.stringify(state, null, 2));

    // Check if there's a start screen
    const allLinks = await cdp.evaluate(`Array.from(document.querySelectorAll('a')).map(a => a.textContent.trim()).filter(t=>t).slice(0, 20)`);
    console.log('\nAll links on page:', JSON.stringify(allLinks));

    // Check #ui-bar and #story
    const uiState = await cdp.evaluate(`
        (function() {
            return {
                uiBar: !!document.querySelector('#ui-bar'),
                story: !!document.querySelector('#story'),
                passages: !!document.querySelector('#passages'),
                uiBarBody: document.querySelector('#ui-bar-body')?.textContent?.substring(0, 100) || 'none',
                menuLinks: Array.from(document.querySelectorAll('#menu a, #ui-bar a')).map(a=>a.textContent.trim()).slice(0,10)
            };
        })()
    `);
    console.log('\nUI state:', JSON.stringify(uiState, null, 2));

    // Try clicking start if on title screen
    if (allLinks.some(t => t.includes('开始') || t.includes('Start') || t.includes('New Game'))) {
        console.log('\n[ACTION] Clicking start...');
        await cdp.evaluate(`
            (function() {
                const a = Array.from(document.querySelectorAll('a')).find(x => 
                    x.textContent.includes('开始') || x.textContent.includes('Start') || x.textContent.includes('New Game'));
                if (a) { a.click(); return 'clicked: ' + a.textContent; }
                return 'not found';
            })()
        `);
        await sleep(8000);
        console.log('After click, passage:', await cdp.evaluate(`V.passage`));
    }

    // Now try to navigate to Forest using SugarCube API
    console.log('\n[NAV] Trying SugarCube.Engine.play...');
    try {
        await cdp.evaluate(`SugarCube.Engine.play("Forest")`);
        await sleep(2000);
    } catch(e) { console.log('SugarCube.Engine.play failed:', e.message); }

    const afterNav = await cdp.evaluate(`
        (function() {
            return {
                passage: V.passage,
                passageTextLen: document.querySelector('#passages .passage')?.textContent?.length || 0,
                links: Array.from(document.querySelectorAll('#passages .passage a')).map(a=>a.textContent.trim()).slice(0,15)
            };
        })()
    `);
    console.log('After nav:', JSON.stringify(afterNav, null, 2));

    cdp.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
