// Diagnose orphan NPCs: V.NPCName objects missing from V.NPCNameList
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
        if (res.exceptionDetails) {
            const desc = res.exceptionDetails.exception?.description || JSON.stringify(res.exceptionDetails);
            return { __error: desc };
        }
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

async function diagnose(cdp, label) {
    const r = await cdp.evaluate(`
        (function() {
            const out = { label: arguments[0], V_NPCNameLen: 0, V_NPCNameListLen: 0, orphans: [], noPreg: [], cNpcMissing: [], cNpcExists: !!C && !!C.npc };
            if (!Array.isArray(V.NPCName) || !Array.isArray(V.NPCNameList)) return out;
            out.V_NPCNameLen = V.NPCName.length;
            out.V_NPCNameListLen = V.NPCNameList.length;
            const list = V.NPCNameList;
            for (let i = 0; i < V.NPCName.length; i++) {
                const n = V.NPCName[i];
                if (!n) continue;
                const name = n.nam || ('#' + i);
                const inList = list.indexOf(name) !== -1;
                if (!inList) out.orphans.push({ idx: i, nam: name, type: n.type, hasPreg: !!n.pregnancy });
                if (!n.pregnancy) out.noPreg.push({ idx: i, nam: name, inList: inList });
            }
            if (C.npc) {
                for (const name of list) {
                    if (!(name in C.npc)) out.cNpcMissing.push(name);
                }
            }
            return out;
        })(` + JSON.stringify(label) + `)
    `);
    return r;
}

async function main() {
    const wsUrl = await getPageWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();

    // Click start / new game
    console.log('=== Starting new game ===');
    for (let step = 0; step < 40; step++) {
        const state = await cdp.evaluate(`({ hasV: typeof V !== 'undefined', passage: typeof V !== 'undefined' ? V.passage : null, links: Array.from(document.querySelectorAll('#passages .passage a, #ui-bar a')).map(a=>a.textContent.trim()).slice(0,12) })`);
        if (typeof state === 'object' && state.__error) { await sleep(1000); continue; }
        if (state.hasV && state.passage && !['Start','Start2','Start3'].includes(state.passage)) {
            console.log('In game at passage:', state.passage);
            break;
        }
        // click a suitable link
        const click = await cdp.evaluate(`
            (function() {
                const a = Array.from(document.querySelectorAll('#passages .passage a')).find(x =>
                    /开始|Start|新游戏|New Game|继续|Continue|下一步|Next|确认|Confirm|跳过|Skip/i.test(x.textContent));
                if (a) { const t = a.textContent.trim(); a.click(); return 'clicked: ' + t; }
                return 'no link: ' + Array.from(document.querySelectorAll('#passages .passage a')).map(x=>x.textContent.trim()).slice(0,15).join('|');
            })()
        `);
        console.log('step', step, ':', typeof click === 'string' ? click : JSON.stringify(click));
        await sleep(2500);
    }

    await sleep(3000);
    console.log('\n=== Diagnose after new game ===');
    const d1 = await diagnose(cdp, 'new game');
    console.log(JSON.stringify(d1, null, 2));

    // Manually run backComp to see if it errors
    console.log('\n=== Manually running backComp ===');
    const bc = await cdp.evaluate(`
        (function() {
            try {
                // backComp needs _version; set it to a high value so it runs the late blocks
                SugarCube.State.temporary._version = 999999;
                SugarCube.Wikifier.wikifyEval('<<backComp>>');
                return 'backComp ran OK';
            } catch(e) { return 'backComp ERROR: ' + e.message; }
        })()
    `);
    console.log(typeof bc === 'string' ? bc : JSON.stringify(bc));

    // Now simulate save/load: save then reload
    console.log('\n=== Save then load ===');
    await cdp.evaluate(`SugarCube.Save.slots.save(0)`);
    await sleep(1000);
    // reload page to simulate StoryInit
    console.log('Reloading page...');
    await cdp.send('Page.reload');
    await sleep(15000);

    // Load the save
    console.log('Loading save slot 0...');
    const loadRes = await cdp.evaluate(`
        (function() {
            try { SugarCube.Save.slots.load(0); return 'load initiated'; }
            catch(e) { return 'load ERROR: ' + e.message; }
        })()
    `);
    console.log(typeof loadRes === 'string' ? loadRes : JSON.stringify(loadRes));
    await sleep(6000);

    console.log('\n=== Diagnose after load ===');
    const d2 = await diagnose(cdp, 'after load');
    console.log(JSON.stringify(d2, null, 2));

    // check current passage / errors
    const after = await cdp.evaluate(`({ passage: V.passage, errorView: !!document.querySelector('.error-view, #error-view'), bodyText: document.body.textContent.substring(0, 300) })`);
    console.log('\nAfter load state:', JSON.stringify(after, null, 2));

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
