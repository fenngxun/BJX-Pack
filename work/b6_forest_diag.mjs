// Diagnose forest entry injection: hive + chimera on Forest page
import http from 'http';
import fs from 'fs';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class CDP {
    constructor(u) { this.u = u; this.id = 0; this.p = new Map(); this.ws = null; }
    async connect() {
        this.ws = new WebSocket(this.u);
        await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
        this.ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
        };
    }
    send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.p.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async ev(expr) {
        const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails) };
        return r.result.value;
    }
    close() { this.ws && this.ws.close(); }
}
async function url() {
    return new Promise((res, rej) => {
        http.get('http://127.0.0.1:9222/json', r => {
            let b = ''; r.on('data', c => b += c);
            r.on('end', () => { const t = JSON.parse(b).find(x => x.type === 'page' && x.url.includes('8766')); t ? res(t.webSocketDebuggerUrl) : rej(new Error('no tab')); });
        }).on('error', rej);
    });
}
async function main() {
    const out = {};
    const c = new CDP(await url());
    await c.connect();

    // ---- HIVE: set hive_intro=1, eventskip=0, goto Forest (as cdp_pack does) ----
    out.hive = {};
    try {
        await c.ev(`BJXTEST.setVars({ hive_intro: 1, eventskip: 0 })`);
        await c.ev(`BJXTEST.goto("Forest")`);
        await sleep(1500);
        out.hive = await c.ev(`(function(){
            const p = document.querySelector('#passages .passage');
            const hive = document.getElementById('bjx-hive-forest-entry');
            return {
                passage: V.passage,
                forest: V.forest,
                eventskip: V.eventskip,
                hive_intro: V.hive_intro,
                hasDeeperCN: !!(p && (p.textContent||'').includes('深入森林')),
                hasDeeperEN: !!(p && (p.textContent||'').includes('Go deeper into the forest')),
                hiveElExists: !!hive,
                hiveOuter: hive ? hive.outerHTML.substring(0, 500) : null,
                links: Array.from(p.querySelectorAll('a.macro-link, a.link-internal, a[data-passage], button')).map(x=>x.textContent.trim()).filter(Boolean).slice(0,25),
                pageHead: p ? (p.textContent||'').replace(/\\s+/g,' ').substring(0, 300) : null
            };
        })()`);
    } catch (e) { out.hive = { fatal: e.message }; }

    // ---- CHIMERA WITHOUT forest=55 ----
    try {
        await c.ev(`BJXTEST.goto("Forest")`);
        await sleep(1200);
        out.chimeraNo55 = await c.ev(`({forest: V.forest, statue: !!document.getElementById('bjx-chimera-statue')})`);
    } catch (e) { out.chimeraNo55 = { fatal: e.message }; }

    // ---- CHIMERA WITH forest=55 (set AFTER goto, then re-goto) ----
    try {
        await c.ev(`BJXTEST.setVars({ forest: 55 })`);
        await c.ev(`BJXTEST.goto("Forest")`);
        await sleep(1200);
        out.chimera55 = await c.ev(`(function(){
            const p = document.querySelector('#passages .passage');
            const st = document.getElementById('bjx-chimera-statue');
            return {
                forest: V.forest,
                hasDeeperCN: !!(p && (p.textContent||'').includes('深入森林')),
                hasDeeperEN: !!(p && (p.textContent||'').includes('Go deeper into the forest')),
                statue: !!st,
                statueOuter: st ? st.outerHTML.substring(0, 300) : null,
                pageHead: p ? (p.textContent||'').replace(/\\s+/g,' ').substring(0, 200) : null
            };
        })()`);
    } catch (e) { out.chimera55 = { fatal: e.message }; }

    fs.writeFileSync('C:/Users/79403/Desktop/dol/work/_forest_diag.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('written _forest_diag.json');
    c.close();
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
