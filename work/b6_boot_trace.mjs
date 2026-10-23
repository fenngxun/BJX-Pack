// Boot-time trace: inject recorder BEFORE page scripts, reload, let autosave restore
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

const RECORDER = `
window.__boot = [];
window.__bootErr = [];
function snap(tag) {
    try {
        var hasV = (typeof V !== 'undefined') && V;
        var hasC = (typeof C !== 'undefined') && C;
        var listLen = hasV && Array.isArray(V.NPCNameList) ? V.NPCNameList.length : -1;
        var nameLen = hasV && Array.isArray(V.NPCName) ? V.NPCName.length : -1;
        var cCount = (hasC && C.npc) ? Object.getOwnPropertyNames(C.npc).length : -1;
        var robertInC = (hasC && C.npc) ? ('Robert' in C.npc) : false;
        var robertGet = false;
        if (hasC && C.npc && 'Robert' in C.npc) { try { robertGet = !!C.npc.Robert; } catch(e){ robertGet = 'ERR:'+e.message; } }
        window.__boot.push({t: Date.now(), tag: tag, passage: hasV ? V.passage : null, listLen: listLen, nameLen: nameLen, cCount: cCount, robertInC: robertInC, robertGet: robertGet});
    } catch(e) { window.__boot.push({tag: tag, err: e.message}); }
}
// poll until SugarCube + jQuery ready, then hook
var iv = setInterval(function() {
    try {
        if (typeof jQuery !== 'undefined' && typeof SugarCube !== 'undefined' && SugarCube.State) {
            clearInterval(iv);
            jQuery(document).on(':stateinit', function(){ snap('stateinit'); });
            jQuery(document).on(':passageinit', function(){ snap('passageinit'); });
            jQuery(document).on(':passageend', function(){ snap('passageend'); });
            // hook initCNPC
            function hookInit() {
                if (typeof window.initCNPC === 'function' && !window.__initHooked) {
                    window.__initHooked = true;
                    var orig = window.initCNPC;
                    window.initCNPC = function(){ snap('initCNPC-before'); orig.apply(this, arguments); snap('initCNPC-after'); };
                    snap('initCNPC-hook-installed');
                } else setTimeout(hookInit, 10);
            }
            hookInit();
            snap('recorder-ready');
        }
    } catch(e) { window.__boot.push({tag:'recorder-err', err:e.message}); }
}, 5);
// capture errors
window.addEventListener('error', function(e){ window.__bootErr.push(String(e.message).substring(0,120)); });
`;

async function main() {
    let wsUrl = await getPageWsUrl();
    let cdp = new CDPClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Inject recorder before any page script on next load
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
    console.log('recorder injected, reloading...');

    await cdp.send('Page.reload');
    // Let the boot/autosave restore run fully
    await sleep(60000);

    const boot = await cdp.evaluate(`window.__boot`);
    console.log('\n=== Boot trace ===');
    if (Array.isArray(boot)) {
        const t0 = boot.length ? boot[0].t : 0;
        for (const e of boot) {
            const dt = e.t ? '+' + (e.t - t0) + 'ms' : '';
            console.log(dt, JSON.stringify(e));
        }
    } else console.log(JSON.stringify(boot));

    const errs = await cdp.evaluate(`window.__bootErr`);
    console.log('\n=== Page errors (' + (Array.isArray(errs)?errs.length:0) + ') ===');
    if (Array.isArray(errs)) {
        const uniq = [...new Set(errs)];
        for (const e of uniq.slice(0,15)) console.log(' ', e);
    }

    // Check for SugarCube error view
    const scErr = await cdp.evaluate(`
        (function(){
            var t = document.querySelector('.error-view, #error-view, .sc-message')?.textContent?.substring(0,400);
            return { passage: (typeof V!=='undefined'&&V)?V.passage:null, scErr: t };
        })()
    `);
    console.log('\nSC error view:', JSON.stringify(scErr, null, 2));

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
