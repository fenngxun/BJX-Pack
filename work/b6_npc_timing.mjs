// Monitor when NPCs get added to V.NPCName relative to :passageinit hooks
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
            return { __error: res.exceptionDetails.exception?.description || JSON.stringify(res.exceptionDetails) };
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

async function main() {
    const wsUrl = await getPageWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();

    // Install a recorder that logs every passageinit + stateinit snapshot
    const install = await cdp.evaluate(`
        (function() {
            window.__npcLog = [];
            function snap(tag) {
                try {
                    if (!V || !Array.isArray(V.NPCName)) { window.__npcLog.push({tag, noV:1}); return; }
                    const names = V.NPCName.map((n,i)=> n ? {i, nam:n.nam, preg: n.pregnancy?1:0, virg:n.virginity?1:0} : {i, null:1});
                    const list = V.NPCNameList ? V.NPCNameList.slice() : [];
                    const orphans = names.filter(x => x.nam && list.indexOf(x.nam)===-1).map(x=>x.nam);
                    const noPreg = names.filter(x => x.nam && !x.preg).map(x=>x.nam);
                    window.__npcLog.push({tag, passage: V.passage, len: V.NPCName.length, listLen: list.length, orphans, noPreg});
                } catch(e) { window.__npcLog.push({tag, err: e.message}); }
            }
            window.__snap = snap;
            jQuery(document).on(':passageinit', function(){ snap('passageinit'); });
            jQuery(document).on(':passageend', function(){ snap('passageend'); });
            // Wrap Array.prototype.push on V.NPCName to catch late adds
            setTimeout(function() {
                try {
                    snap('install-time');
                    if (V.NPCName && !V.NPCName.__bjxPushWrapped) {
                        const origPush = V.NPCName.push.bind(V.NPCName);
                        V.NPCName.push = function(...items) {
                            const r = origPush(...items);
                            items.forEach(n => { if (n && typeof n === 'object') {
                                if (!n.pregnancy) n.pregnancy = {};
                                if (!n.virginity) n.virginity = {penile:true,vaginal:true,anal:true,oral:true,kiss:true,handholding:true};
                            }});
                            window.__npcLog.push({tag:'push', names: items.map(n=>n&&n.nam)});
                            return r;
                        };
                        V.NPCName.__bjxPushWrapped = true;
                        window.__npcLog.push({tag:'push-wrap-installed'});
                    }
                } catch(e) { window.__npcLog.push({tag:'push-wrap-error', err:e.message}); }
            }, 100);
            return 'recorder installed';
        })()
    `);
    console.log('install:', install);

    // Start a new game: click through
    console.log('\n=== Clicking through to new game ===');
    for (let step = 0; step < 60; step++) {
        const state = await cdp.evaluate(`
            (function() {
                const links = Array.from(document.querySelectorAll('#passages .passage a'));
                const all = links.map(a=>a.textContent.trim()).filter(Boolean);
                return { passage: (typeof V!=='undefined'&&V)?V.passage:null, linkCount: links.length, links: all.slice(0,15), bodyLen: document.querySelector('#passages .passage')?.textContent?.length || 0 };
            })()
        `);
        if (typeof state === 'object' && !state.__error) {
            if (state.passage && !['Start','Start2','Start3','PassageInit','Message Modal'].includes(state.passage) && state.linkCount > 0) {
                console.log('reached game passage:', state.passage, 'links:', state.linkCount);
                break;
            }
        }
        const click = await cdp.evaluate(`
            (function() {
                const links = Array.from(document.querySelectorAll('#passages .passage a'));
                // Prefer "start"/"new game"/"confirm"/"next" buttons
                const pref = links.find(x => /开始游戏|Start Game|New Game|新游戏|开始|继续|Continue|下一步|Next|确认|Confirm|跳过|Skip|Okay|OK|Got it|理解|同意|I agree|Accept|Quick|快速|我已了解|知道了/i.test(x.textContent));
                const a = pref || links[0];
                if (a) { const t = a.textContent.trim(); a.click(); return 'clicked: ' + t + ' (of ' + links.length + ')'; }
                return 'no link';
            })()
        `);
        console.log('step', step, ':', typeof click === 'string' ? click.slice(0,120) : JSON.stringify(click));
        await sleep(2000);
    }

    await sleep(4000);
    console.log('\n=== NPC log ===');
    const log = await cdp.evaluate(`window.__npcLog`);
    if (Array.isArray(log)) {
        for (const e of log) console.log(JSON.stringify(e));
    } else {
        console.log(JSON.stringify(log));
    }

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
