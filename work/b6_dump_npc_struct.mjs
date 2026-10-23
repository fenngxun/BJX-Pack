import CDP from 'chrome-remote-interface';

const PORT = 9262;
const URL = 'http://127.0.0.1:8766/Degrees%20of%20Lewdity.html';

const client = await CDP({ port: PORT });
const { Page, Runtime, Log } = client;

await Log.enable();
await Runtime.enable();
await Page.enable();
await Page.navigate({ url: URL });

// wait for Start
await new Promise(r => setTimeout(r, 25000));

// dump baseNNPC keys + a vanilla NPC full structure for comparison
const dump = await Runtime.evaluate({
  expression: `(() => {
    const V = window.V;
    const setup = window.setup;
    const result = { baseNNPC_keys: [], vanillaNpc: {}, icandyNpc: {}, bjxNpc: {} };
    if (setup && setup.baseNNPC) {
      result.baseNNPC_keys = Object.keys(setup.baseNNPC).sort();
    }
    // vanilla NPC (first one, e.g. Robin)
    if (V && V.NPCName && V.NPCName.length > 0) {
      for (let i = 0; i < V.NPCName.length; i++) {
        const n = V.NPCName[i];
        if (n && n.nam && !['Robert','Hadley','Qing','Lam','Wei','Xinyu','Cheng','Yue','Keith','泰勒','凯西'].includes(n.nam)) {
          result.vanillaNpc = { nam: n.nam, keys: Object.keys(n).sort(), hasVirginity: !!n.virginity, virginityKeys: n.virginity ? Object.keys(n.virginity) : null, hasPregnancy: n.pregnancy !== undefined };
          break;
        }
      }
    }
    // iCandy NPC
    if (V && V.NPCName) {
      for (let i = 0; i < V.NPCName.length; i++) {
        const n = V.NPCName[i];
        if (n && n.nam === 'Robert') {
          result.icandyNpc = { nam: n.nam, keys: Object.keys(n).sort(), hasVirginity: !!n.virginity, virginityKeys: n.virginity ? Object.keys(n.virginity) : null, hasPregnancy: n.pregnancy !== undefined };
          break;
        }
      }
    }
    // BJX NPC
    if (V && V.NPCName) {
      for (let i = 0; i < V.NPCName.length; i++) {
        const n = V.NPCName[i];
        if (n && n.nam === '泰勒') {
          result.bjxNpc = { nam: n.nam, keys: Object.keys(n).sort(), hasVirginity: !!n.virginity, virginityKeys: n.virginity ? Object.keys(n.virginity) : null, hasPregnancy: n.pregnancy !== undefined };
          break;
        }
      }
    }
    return JSON.stringify(result);
  })()`,
  returnByValue: true
});
console.log(dump.result.value);

await client.close();
