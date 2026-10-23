// Capture BJX-TIMING boot logs across a reload (autosave restore)
import http from 'http';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class CDPClient {
    constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.ws = null; this.timing = []; }
    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
        this.ws.onmessage = (evt) => {
            const m = JSON.parse(evt.data);
            if (m.id && this.pending.has(m.id)) {
                const { resolve, reject } = this.pending.get(m.id);
                this.pending.delete(m.id);
                if (m.error) reject(new Error(JSON.stringify(m.error)));
                else resolve(m.result);
            }
            if (m.method === 'Runtime.consoleAPICalled') {
                const args = (m.params.args||[]).map(a => a.value !== undefined ? a.value : (a.description||'')).join(' ');
                if (args.includes('BJX-TIMING') || args.includes('0.5.10.12 Error') || args.includes('inject_early loaded')) {
                    this.timing.push(args.substring(0, 400));
                }
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
        if (res.exceptionDetails) return { __error: res.exceptionDetails.exception?.description || JSON.stringify(res.exceptionDetails) };
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
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    console.log('reloading...');
    await cdp.send('Page.reload');
    await sleep(70000);

    // console-captured timing
    console.log('\n=== Console BJX-TIMING (' + cdp.timing.length + ') ===');
    for (const t of cdp.timing) console.log(t);

    // in-page timing array (may be more complete)
    const arr = await cdp.evaluate('window.__bjxTiming');
    console.log('\n=== window.__bjxTiming (' + (Array.isArray(arr)?arr.length:0) + ') ===');
    if (Array.isArray(arr)) for (const e of arr) console.log(JSON.stringify(e));

    const scErr = await cdp.evaluate(`document.querySelector('.error-view, #error-view, .sc-message')?.textContent?.substring(0,200) || 'no sc error'`);
    console.log('\nSC error:', scErr);

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
