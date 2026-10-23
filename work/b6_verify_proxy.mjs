// Verify fix: reload autosave restore, capture errors + C.npc proxy state
import http from 'http';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class CDPClient {
    constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.ws = null; this.errs = []; }
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
                if (/pregnancy|pregnancyAvoidance|backComp|doVersionCheck|npcPregnancy|reading 'fetus'|reading 'vaginal'|0\.5\.10\.12 (Error|出错)/.test(args)) {
                    this.errs.push(args.substring(0, 200));
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
    console.log('reloading (autosave restore)...');
    await cdp.send('Page.reload');
    await sleep(45000);

    // C.npc proxy state
    const st = await cdp.evaluate(`
        (function() {
            const modNames = ['Robert','Hadley','Qing','Lam','Wei','Xinyu','Cheng','Yue','Keith','泰勒','凯西'];
            const proxy = !!(C && C.npc && C.npc.__bjxNpcProxy);
            const accessor = !!(C && C.__bjxNpcAccessor);
            const resolve = {};
            for (const n of modNames) {
                const o = C.npc ? C.npc[n] : undefined;
                resolve[n] = o ? { nam: o.nam, preg: !!o.pregnancy, type: o.type } : 'UNRESOLVED';
            }
            return {
                passage: V.passage,
                isProxy: proxy,
                accessorInstalled: accessor,
                listLen: V.NPCNameList.length,
                npcNameLen: V.NPCName.length,
                modResolution: resolve
            };
        })()
    `);
    console.log('\n=== C.npc proxy state ===');
    console.log(JSON.stringify(st, null, 2));

    // error view
    const ev = await cdp.evaluate(`
        (function(){
            const e = document.querySelector('.error-view, #error-view, .sc-message');
            return e ? e.textContent.substring(0, 500) : null;
        })()
    `);
    console.log('\n=== Error view ===');
    console.log(ev ? ('FAIL: ' + ev) : 'PASS: no error view');

    // console errors
    const uniq = [...new Set(cdp.errs)];
    console.log('\n=== Console pregnancy/backComp errors (' + uniq.length + ' unique) ===');
    if (uniq.length === 0) console.log('PASS: no pregnancy/backComp console errors');
    else uniq.slice(0, 12).forEach(e => console.log(' -', e));

    // in-page error-at-throw-time log
    const errLog = await cdp.evaluate(`window.__bjxErrLog || []`);
    console.log('\n=== Errors captured at throw time (' + errLog.length + ') ===');
    if (errLog.length === 0) console.log('PASS: no errors crossed hooked console.error');
    else {
        const seen = new Set();
        errLog.forEach(e => {
            const key = e.t + '|' + e.npc + '|' + e.robert;
            if (seen.has(key)) return;
            seen.add(key);
            console.log(`  t=${e.t}ms npc=${e.npc} robert=${e.robert} listLen=${e.listLen} :: ${e.msg}`);
        });
    }

    // event handler log
    const evtLog = await cdp.evaluate(`window.__bjxNpcEvtLog || []`);
    console.log('\n=== NPC event handler log (' + evtLog.length + ') ===');
    evtLog.forEach(l => console.log('  ' + l));

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
