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

    const info = await cdp.evaluate(`
        (function() {
            return {
                hasV: typeof V !== 'undefined',
                passage: typeof V !== 'undefined' ? V.passage : 'N/A',
                hasEngine: typeof Engine !== 'undefined',
                hasSugarCube: typeof SugarCube !== 'undefined',
                engineKeys: typeof Engine !== 'undefined' ? Object.keys(Engine).slice(0,10) : [],
                sugarCubeKeys: typeof SugarCube !== 'undefined' ? Object.keys(SugarCube).slice(0,10) : [],
                sugarCubeEngine: typeof SugarCube !== 'undefined' && SugarCube.Engine ? Object.keys(SugarCube.Engine).slice(0,10) : 'no Engine',
                links: Array.from(document.querySelectorAll('#passages .passage a')).map(a=>a.textContent.trim()).slice(0,10)
            };
        })()
    `);
    console.log(JSON.stringify(info, null, 2));

    // Try Engine.play directly
    if (info.hasEngine && Engine.play) {
        console.log('\nTrying Engine.play("Forest")...');
        try {
            await cdp.evaluate(`V.forest = 55; V.eventskip = 1; V.hive_intro = 1; Engine.play("Forest")`);
            await sleep(2000);
            const r = await cdp.evaluate(`
                (function() {
                    const p = document.querySelector('#passages .passage');
                    return {
                        passage: V.passage,
                        statue: !!document.querySelector('#bjx-chimera-statue'),
                        hive: !!document.querySelector('#bjx-hive-forest-entry'),
                        hasDeeper: p ? (p.textContent.includes('深入森林') || p.textContent.includes('Go deeper')) : false,
                        links: Array.from(p.querySelectorAll('a')).map(a=>a.textContent.trim()).slice(0,10)
                    };
                })()
            `);
            console.log('Result:', JSON.stringify(r, null, 2));
        } catch(e) { console.log('Engine.play failed:', e.message); }
    }

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
