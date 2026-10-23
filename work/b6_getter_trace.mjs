// Instrument C.npc getters for the 11 mod NPCs, then reload+load, log access timing
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

async function waitLoad(cdp, label) {
    for (let i = 0; i < 120; i++) {
        const r = await cdp.evaluate(`(typeof SugarCube!=='undefined' && SugarCube.State && V && Array.isArray(V.NPCName)) ? 'ready' : 'wait'`);
        if (r === 'ready') return true;
        await sleep(1000);
    }
    console.log(label, 'timeout');
    return false;
}

async function main() {
    let wsUrl = await getPageWsUrl();
    let cdp = new CDPClient(wsUrl);
    await cdp.connect();

    // Reload to get a clean title screen
    console.log('=== Reload to title ===');
    await cdp.send('Page.reload');
    await sleep(3000);
    await waitLoad(cdp, 'title load');
    await sleep(3000);

    const titlePassage = await cdp.evaluate(`V && V.passage`);
    console.log('title passage:', titlePassage);

    // Install logging getters on C.npc for mod names
    const install = await cdp.evaluate(`
        (function() {
            window.__getterLog = [];
            const modNames = ['Robert','Hadley','Qing','Lam','Wei','Xinyu','Cheng','Yue','Keith','泰勒','凯西'];
            if (!C.npc) return 'no C.npc';
            for (const name of modNames) {
                Object.defineProperty(C.npc, name, {
                    get() {
                        const idx = V.NPCNameList.indexOf(name);
                        const obj = idx === -1 ? undefined : V.NPCName[idx];
                        window.__getterLog.push({
                            name,
                            listLen: V.NPCNameList.length,
                            idx: idx,
                            listHasName: idx !== -1,
                            objExists: !!obj,
                            hasPreg: obj && !!obj.pregnancy,
                            stack: new Error().stack.split('\\n')[2] ? new Error().stack.split('\\n')[2].trim().substring(0,60) : ''
                        });
                        return obj;
                    },
                    set(v) { V.NPCName[V.NPCNameList.indexOf(name)] = v; },
                    configurable: true,
                    enumerable: true
                });
            }
            // snapshot at install
            window.__getterLog.push({tag:'install', listLen: V.NPCNameList.length, list: V.NPCNameList.slice()});
            return 'instrumented ' + modNames.length + ' getters; C.npc list len ' + V.NPCNameList.length;
        })()
    `);
    console.log('install:', install);

    // Load the save
    console.log('\n=== Load save ===');
    const ld = await cdp.evaluate(`(function(){ try { SugarCube.Save.slots.load(0); return 'load started'; } catch(e){ return 'err: '+e.message; } })()`);
    console.log(ld);
    await sleep(10000);

    const log = await cdp.evaluate(`window.__getterLog`);
    console.log('\n=== Getter access log (first 40) ===');
    if (Array.isArray(log)) {
        for (const e of log.slice(0, 40)) console.log(JSON.stringify(e));
        console.log('... total entries:', log.length);
    } else {
        console.log(JSON.stringify(log));
    }

    // Final state
    const final = await cdp.evaluate(`
        (function(){
            return {
                passage: V.passage,
                listLen: V.NPCNameList.length,
                robertIdx: V.NPCNameList.indexOf('Robert'),
                robertObj: (function(){var i=V.NPCNameList.indexOf('Robert'); return i===-1?null:!!V.NPCName[i];})(),
                npcNameLen: V.NPCName.length,
                lastNames: V.NPCNameList.slice(-12)
            };
        })()
    `);
    console.log('\nFinal:', JSON.stringify(final, null, 2));

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
