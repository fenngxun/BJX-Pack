// Full flow: start new game -> Domus Street -> save -> reload -> load -> diagnose
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
    async enableConsole() {
        await this.send('Runtime.enable');
        await this.send('Log.enable');
        this.ws.addEventListener('message', (evt) => {
            const m = JSON.parse(evt.data);
            if (m.method === 'Runtime.consoleAPICalled') {
                const args = (m.params.args||[]).map(a => a.value !== undefined ? a.value : (a.description||'')).join(' ');
                if (/error|bjx|npc|pregnancy|fetus|backComp|version/i.test(args)) console.log('  [console.' + m.params.type + ']', args.substring(0,300));
            }
            if (m.method === 'Runtime.exceptionThrown') {
                const d = m.params.exceptionDetails;
                console.log('  [EXCEPTION]', (d.exception?.description || d.text || '').substring(0,300));
            }
        });
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
function diag(cdp, label) {
    return cdp.evaluate(`
        (function() {
            const out = { label: arguments[0], passage: V.passage, len: V.NPCName.length, listLen: V.NPCNameList.length, orphans: [], noPreg: [], noVirg: [], cNpcMiss: [] };
            for (let i=0;i<V.NPCName.length;i++){const n=V.NPCName[i]; if(!n)continue;
                const name=n.nam||('#'+i);
                if(V.NPCNameList.indexOf(name)===-1)out.orphans.push(name);
                if(!n.pregnancy)out.noPreg.push(name);
                if(!n.virginity)out.noVirg.push(name);
            }
            if(C&&C.npc) for(const nm of V.NPCNameList){ if(!(nm in C.npc)) out.cNpcMiss.push(nm); }
            return out;
        })(` + JSON.stringify(label) + `)
    `);
}

async function main() {
    const wsUrl = await getPageWsUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();
    await cdp.enableConsole();

    // Click Start Game button (it's a <button>)
    console.log('=== Click Start Game ===');
    let clicked = await cdp.evaluate(`
        (function(){
            const btns = Array.from(document.querySelectorAll('button, a, input[type=button], .macro-link, [role=button]'));
            const b = btns.find(x=>/Start Game|开始游戏/i.test(x.textContent));
            if (b) { b.click(); return 'clicked: '+b.textContent.trim(); }
            return 'no start button; buttons: ' + btns.map(x=>x.textContent.trim()).slice(0,20).join(' | ');
        })()
    `);
    console.log(clicked);
    await sleep(8000);

    // Click through character creation / confirm screens until Domus Street
    for (let step = 0; step < 30; step++) {
        const st = await cdp.evaluate(`
            (function(){
                const els = Array.from(document.querySelectorAll('#passages .passage a, #passages .passage button, #passages .passage .macro-link, #passages .passage [role=button]'));
                return { passage: V.passage, texts: els.map(x=>x.textContent.trim()).filter(Boolean).slice(0,15) };
            })()
        `);
        if (st && st.passage && /Domus Street|Home/i.test(st.passage)) {
            console.log('>>> reached', st.passage, 'at step', step);
            break;
        }
        const click = await cdp.evaluate(`
            (function(){
                const els = Array.from(document.querySelectorAll('#passages .passage a, #passages .passage button, #passages .passage .macro-link, #passages .passage [role=button]'));
                const pref = els.find(x=>/Continue|继续|Next|下一步|Confirm|确认|Okay|OK|Done|完成|Skip|跳过|Proceed|Leave|I am ready|开始|Start/i.test(x.textContent));
                const a = pref || els.find(x=>/Domus Street|Home|卧室|Bedroom/i.test(x.textContent)) || els[0];
                if (a) { a.click(); return 'clicked: '+a.textContent.trim().substring(0,40); }
                return 'no clickable on '+V.passage;
            })()
        `);
        console.log('step', step, 'passage', st && st.passage, ':', click);
        await sleep(3000);
    }

    await sleep(3000);
    console.log('\n=== In-game diagnosis ===');
    const d1 = await diag(cdp, 'in-game');
    console.log(JSON.stringify(d1, null, 2));

    // Save
    console.log('\n=== Save slot 0 ===');
    const sv = await cdp.evaluate(`(function(){ try { SugarCube.Save.slots.save(0); return 'saved'; } catch(e){ return 'save err: '+e.message; } })()`);
    console.log(sv);
    await sleep(1500);

    // Reload page
    console.log('\n=== Page reload ===');
    await cdp.send('Page.reload');
    await sleep(25000);

    // Click through to load (re-enable console after reload)
    await cdp.enableConsole();

    // Load slot 0
    console.log('\n=== Load slot 0 ===');
    const ld = await cdp.evaluate(`
        (function(){
            try {
                if (!SugarCube || !SugarCube.Save) return 'Save API not ready; passage='+V.passage;
                SugarCube.Save.slots.load(0);
                return 'load initiated';
            } catch(e){ return 'load err: '+e.message; }
        })()
    `);
    console.log(ld);
    await sleep(8000);

    console.log('\n=== After load diagnosis ===');
    const d2 = await diag(cdp, 'after load');
    console.log(JSON.stringify(d2, null, 2));

    // error view check
    const err = await cdp.evaluate(`
        (function(){
            const ev = document.querySelector('.error-view, #error-view, .error-view-clear');
            const errs = Array.from(document.querySelectorAll('.error-view, #error-view, .error-view-clear, .sc-message')).map(e=>e.textContent.substring(0,200));
            return { passage: V.passage, hasError: !!ev, errorTexts: errs.slice(0,3) };
        })()
    `);
    console.log('\nError state:', JSON.stringify(err, null, 2));

    // screenshot
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:/Users/79403/Desktop/dol/work/b6_after_load.png', Buffer.from(shot.data, 'base64'));
    console.log('screenshot saved');

    cdp.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
