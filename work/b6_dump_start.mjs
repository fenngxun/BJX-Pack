// Dump Start passage structure + screenshot
import http from 'http';
import fs from 'fs';
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

    // Dump the passages container structure
    const dump = await cdp.evaluate(`
        (function() {
            const p = document.querySelector('#passages .passage') || document.querySelector('#passages');
            if (!p) return { noPassage: true, bodyStart: document.body.textContent.substring(0,500) };
            const all = p.querySelectorAll('*');
            const clickable = [];
            all.forEach(el => {
                const tag = el.tagName.toLowerCase();
                if (tag === 'a' || tag === 'button' || el.getAttribute('role')==='button' || el.onclick) {
                    clickable.push({ tag, text: el.textContent.trim().substring(0,40), cls: el.className && el.className.toString().substring(0,50), dataPassage: el.getAttribute('data-passage') });
                }
            });
            return {
                passage: V.passage,
                title: document.title,
                textStart: p.textContent.substring(0, 400),
                clickableCount: clickable.length,
                clickable: clickable.slice(0,25),
                htmlLen: p.innerHTML.length,
                htmlStart: p.innerHTML.substring(0, 800)
            };
        })()
    `);
    console.log(JSON.stringify(dump, null, 2));

    // Screenshot
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:/Users/79403/Desktop/dol/work/b6_start_screen.png', Buffer.from(shot.data, 'base64'));
    console.log('screenshot saved');

    // Check for errors / mod loading state
    const state = await cdp.evaluate(`
        (function() {
            return {
                sugarCubeReady: !!SugarCube,
                engineReady: !!(SugarCube && SugarCube.Engine),
                modLoader: typeof modLoader !== 'undefined' ? Object.keys(modLoader).slice(0,10) : 'none',
                loadingText: document.querySelector('#splash, #loading, .loading')?.textContent?.substring(0,200) || null,
                hasStartLink: !!document.querySelector('[data-passage="Start2"], a[data-passage*="Start"]')
            };
        })()
    `);
    console.log('state:', JSON.stringify(state, null, 2));

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
