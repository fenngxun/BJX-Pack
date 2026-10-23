// Scenario B: page fully ready, then MANUAL slot load (user's SAVES -> Load path).
// Focus: backComp fetus error after Save.slots.load().
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
                if (/pregnancy|fetus|backComp|doVersionCheck|npcPregnancy|reading 'vaginal'|0\.5\.10\.12 (Error|出错)/.test(args)) {
                    this.errs.push(args.substring(0, 160));
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

    // ensure fully ready & in-game
    console.log('waiting for fully-ready in-game state...');
    await sleep(3000);
    const pre = await cdp.evaluate(`({passage: V.passage, ready: !!(window.SugarCube && SugarCube.Save && SugarCube.State)})`);
    console.log('pre:', JSON.stringify(pre));

    // save slot 0 to guarantee a fresh save exists
    const sv = await cdp.evaluate(`(function(){ try { SugarCube.Save.slots.save(0); return 'saved slot0'; } catch(e){ return 'save err: '+e.message; } })()`);
    console.log(sv);
    await sleep(2000);

    // reset diagnostic baselines so we only see errors from the manual load
    await cdp.evaluate(`window.__bjxErrLog = []; window.__bjxNpcEvtLog = [];`);
    cdp.errs = [];

    // MANUAL load slot 0 (same API the SAVES screen uses)
    console.log('=== MANUAL Save.slots.load(0) ===');
    const ld = await cdp.evaluate(`(function(){ try { SugarCube.Save.slots.load(0); return 'load initiated'; } catch(e){ return 'load err: '+e.message; } })()`);
    console.log(ld);
    await sleep(12000);

    // error view
    const ev = await cdp.evaluate(`(function(){
        const e = document.querySelector('.error-view, #error-view, .sc-message');
        return e ? e.textContent.substring(0, 600) : null;
    })()`);
    console.log('\n=== Error view ===');
    console.log(ev ? ('FAIL: ' + ev) : 'PASS: no error view');

    // console errors after baseline
    const uniq = [...new Set(cdp.errs)];
    console.log('\n=== Console errors after manual load (' + uniq.length + ') ===');
    if (uniq.length === 0) console.log('PASS: no pregnancy/backComp/fetus console errors');
    else uniq.slice(0, 15).forEach(e => console.log(' -', e));

    // in-page at-throw log
    const errLog = await cdp.evaluate(`window.__bjxErrLog || []`);
    console.log('\n=== At-throw errors (' + errLog.length + ') ===');
    if (errLog.length === 0) console.log('PASS: no at-throw errors');
    else {
        const seen = new Set();
        errLog.forEach(e => {
            const k = e.t + '|' + e.npc + '|' + e.robert;
            if (seen.has(k)) return; seen.add(k);
            console.log(`  t=${e.t}ms npc=${e.npc} robert=${e.robert} listLen=${e.listLen} :: ${e.msg}`);
        });
    }

    // event log
    const evtLog = await cdp.evaluate(`window.__bjxNpcEvtLog || []`);
    console.log('\n=== Event log (' + evtLog.length + ') ===');
    evtLog.slice(0, 20).forEach(l => console.log('  ' + l));

    // final state
    const post = await cdp.evaluate(`({passage: V.passage, isProxy: !!(C && C.npc && C.npc.__bjxNpcProxy), listLen: V.NPCNameList.length, fetusSafe: (function(){
        let bad = 0;
        for (const n of V.NPCName) { if (n && n.pregnancy && n.pregnancy.fetus) { /* has fetus, must be array */ if (!Array.isArray(n.pregnancy.fetus)) bad++; } }
        return bad === 0 ? 'all-ok' : ('bad:'+bad);
    })()})`);
    console.log('\n=== Post-load state ===');
    console.log(JSON.stringify(post, null, 2));

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
