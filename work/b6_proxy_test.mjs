// Verify Proxy-based C.npc resolves mod NPCs and npcPregnancyUpdater works
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

    // Install the Proxy design and test
    const r = await cdp.evaluate(`
        (function() {
            const results = [];
            // Build proxy: target keeps whatever initCNPC/static defines; get/has
            // dynamically resolve any name in V.NPCNameList.
            function buildNpcProxy() {
                const target = {};
                return new Proxy(target, {
                    get(t, prop, receiver) {
                        if (prop in t) return Reflect.get(t, prop, receiver);
                        if (typeof prop === 'string' && Array.isArray(V.NPCNameList)) {
                            const i = V.NPCNameList.indexOf(prop);
                            if (i !== -1) return V.NPCName[i];
                        }
                        return undefined;
                    },
                    has(t, prop) {
                        if (prop in t) return true;
                        if (typeof prop === 'string' && Array.isArray(V.NPCNameList)) {
                            return V.NPCNameList.indexOf(prop) !== -1;
                        }
                        return false;
                    },
                    set(t, prop, value, receiver) {
                        if (typeof prop === 'string' && Array.isArray(V.NPCNameList)) {
                            const i = V.NPCNameList.indexOf(prop);
                            if (i !== -1) { V.NPCName[i] = value; return true; }
                        }
                        return Reflect.set(t, prop, value, receiver);
                    }
                });
            }
            C.npc = buildNpcProxy();
            results.push('proxy installed; C.npc.Robert = ' + (C.npc.Robert ? C.npc.Robert.nam : 'UNDEFINED'));
            results.push('C.npc.Robin = ' + (C.npc.Robin ? C.npc.Robin.nam : 'UNDEFINED'));
            results.push('Robert in C.npc: ' + ('Robert' in C.npc));
            results.push('C.npc.Robert.pregnancy type: ' + typeof C.npc.Robert.pregnancy);
            // simulate npcPregnancyUpdater accesses for all mod names
            const modNames = ['Robert','Hadley','Qing','Lam','Wei','Xinyu','Cheng','Yue','Keith','泰勒','凯西'];
            let allOk = true;
            for (const n of modNames) {
                const o = C.npc[n];
                if (!o || typeof o.pregnancy === 'undefined' || typeof o.type === 'undefined') {
                    allOk = false;
                    results.push('PROBLEM ' + n + ': obj=' + !!o + ' preg=' + (o?typeof o.pregnancy:'?') + ' type=' + (o?o.type:'?'));
                }
            }
            results.push('all mod names resolve with pregnancy/type: ' + allOk);
            // Now run npcPregnancyUpdater
            let err = null;
            try { SugarCube.Wikifier.wikifyEval('<<npcPregnancyUpdater>>'); }
            catch(e) { err = e.message; }
            results.push('npcPregnancyUpdater: ' + (err ? ('ERROR ' + err.substring(0,200)) : 'OK'));
            // Now run full backComp
            let err2 = null;
            try { SugarCube.Wikifier.wikifyEval('<<backComp>>'); }
            catch(e) { err2 = e.message; }
            results.push('backComp: ' + (err2 ? ('ERROR ' + err2.substring(0,200)) : 'OK'));
            return results;
        })()
    `);
    console.log('=== Proxy test ===');
    if (Array.isArray(r)) r.forEach(x => console.log(' ', x));
    else console.log(JSON.stringify(r, null, 2));

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
