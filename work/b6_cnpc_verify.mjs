// Verify C.npc alias state after load + test manual fix + trace hook timing
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

    // 1. Current C.npc state
    const cur = await cdp.evaluate(`
        (function() {
            const cNpcKeys = C && C.npc ? Object.keys(C.npc) : [];
            const miss = V.NPCNameList.filter(n => C.npc && !(n in C.npc));
            // Check C.npc descriptor - is it the initCNPC one?
            const d = Object.getOwnPropertyDescriptor(C, 'npc');
            return {
                passage: V.passage,
                listLen: V.NPCNameList.length,
                cNpcCount: cNpcKeys.length,
                cNpcKeys: cNpcKeys,
                missing: miss,
                cNpcDescriptor: d ? { writable: d.writable, configurable: d.configurable, hasValue: 'value' in d, hasGetter: !!d.get } : null,
                initWrapped: window.initCNPC && window.initCNPC.toString().indexOf('_origInitCNPC') !== -1
            };
        })()
    `);
    console.log('=== Current C.npc state ===');
    console.log(JSON.stringify(cur, null, 2));

    // 2. Manually add the missing aliases and verify npcPregnancyUpdater works
    const fix = await cdp.evaluate(`
        (function() {
            function addAlias(name) {
                if (!C.npc) Object.defineProperty(C, 'npc', { value: {}, writable: true, configurable: true });
                if (Object.prototype.hasOwnProperty.call(C.npc, name)) return;
                Object.defineProperty(C.npc, name, {
                    get() { return V.NPCName[V.NPCNameList.indexOf(name)]; },
                    set(v) { V.NPCName[V.NPCNameList.indexOf(name)] = v; },
                    configurable: true
                });
            }
            V.NPCNameList.forEach(addAlias);
            const after = V.NPCNameList.filter(n => !(n in C.npc));
            // Now manually wikify npcPregnancyUpdater
            let err = null;
            try { SugarCube.Wikifier.wikifyEval('<<npcPregnancyUpdater>>'); }
            catch(e) { err = e.message; }
            return { stillMissing: after, npcPregUpdaterErr: err };
        })()
    `);
    console.log('\n=== After manual alias fix ===');
    console.log(JSON.stringify(fix, null, 2));

    // 3. Now reload again and trace hook timing via a fresh page-evaluate recorder
    // First, navigate back to title via a reload, install a persistent recorder
    // that hooks the events BEFORE save load.
    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
