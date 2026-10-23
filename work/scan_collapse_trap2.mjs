// Scan all mod twee passages for the SugarCube macro-lookahead trap, v2.
// Real trap = a macro match whose twee-link token ([[...]]) content contains
// '<<' or '>>' (impossible for genuine links, guaranteed for the
// nested-array-swallowing case after widget whitespace collapse).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] || 'C:/Users/79403/Desktop/dol/work/bjx-ant-island/tweeFileList';

const macroName = "[A-Za-z][\\w-]*|[=-]";
const LOOKAHEAD = new RegExp(
  "<<(/?" + macroName + ")(?:\\s*)((?:(?:/\\*[^*]*\\*+(?:[^/*][^*]*\\*+)*/)|(?://.*\\n)|(?:`(?:\\\\.|[^`\\\\])*`)|(?:\"(?:\\\\.|[^\"\\\\])*\")|(?:'(?:\\\\.|[^'\\\\])*')|(?:\\[(?:[<>]?[Ii][Mm][Gg])?\\[[^\\r\\n]*?\\]\\]+)|[^>]|(?:>(?!>)))*)>>",
  "gm"
);

// Tokens that legitimately may contain << or >> inside a macro invocation.
const STRIP = [
  /\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g,      // block comments
  /\/\/[^\n]*/g,                             // line comments
  /`(?:\\.|[^`\\])*`/g,                       // template strings
  /"(?:\\.|[^"\\])*"/g,                       // double-quoted strings
  /'(?:\\.|[^'\\])*'/g,                       // single-quoted strings
];
const LINK = /\[(?:[<>]?[Ii][Mm][Gg])?\[[^\r\n]*?\]\]+/g;

function Twee2Passage(s) {
  var r = s.split(/^(:: +((?:[^:"\/\n\r\[\] ]+ *)+)(?: *\[((?:[^ \]]+ *)* *)\] *|))$/gm);
  var rr = [];
  for (var i = 0; i < r.length; i++) {
    if (r[i].startsWith(':: ')) {
      var t;
      rr.push({ name: r[++i].trim(), tags: ((t = r[++i]) ? t.split(' ') : []) || [], content: r[++i] });
    }
  }
  return rr;
}

function extractWidgetBodies(content) {
  const bodies = [];
  const re = /<<widget\s+["']?([\w-]+)["']?\s*(?:container)?\s*>>/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const end = content.indexOf('<</widget>>', m.index + m[0].length);
    if (end === -1) { bodies.push({ name: m[1], body: null }); continue; }
    bodies.push({ name: m[1], body: content.slice(m.index + m[0].length, end) });
  }
  return bodies;
}

function scanText(text, label, issues) {
  let pos = -1;
  while ((pos = text.indexOf('<<', pos + 1)) !== -1) {
    LOOKAHEAD.lastIndex = pos;
    const m = LOOKAHEAD.exec(text);
    if (!m) continue;
    const full = m[0];
    let stripped = full;
    for (const re of STRIP) stripped = stripped.replace(re, '«S»');
    LINK.lastIndex = 0;
    let lm;
    while ((lm = LINK.exec(stripped)) !== null) {
      if (lm[0].includes('<<') || lm[0].includes('>>')) {
        issues.push({
          where: label,
          at: pos,
          head: full.slice(0, 80),
          linkContent: lm[0].slice(0, 120),
        });
      }
    }
    pos = pos + full.length - 1;
  }
}

const issues = [];
let widgetTotal = 0, passageTotal = 0;

for (const f of readdirSync(DIR).filter((x) => x.endsWith('.twee'))) {
  const raw = readFileSync(join(DIR, f), 'utf-8');
  for (const p of Twee2Passage(raw)) {
    passageTotal++;
    if (p.tags.includes('widget')) {
      for (const b of extractWidgetBodies(p.content)) {
        widgetTotal++;
        if (b.body == null) { issues.push({ where: `${f}::${p.name} widget ${b.name} UNCLOSED`, head: 'missing <</widget>>', linkContent: '' }); continue; }
        const collapsed = b.body.replace(/^\n+|\n+$/g, '').replace(/\s+/g, ' ');
        scanText(collapsed, `${f} :: ${p.name} / widget "${b.name}" (collapsed)`, issues);
      }
    } else {
      scanText(p.content, `${f} :: ${p.name} (raw)`, issues);
    }
  }
}

console.log(`passages: ${passageTotal}, widgets: ${widgetTotal}, REAL issues: ${issues.length}`);
for (const i of issues) {
  console.log('\n--- TRAP ---');
  console.log('  where:', i.where, 'at', i.at);
  console.log('  macro head:', JSON.stringify(i.head));
  console.log('  swallowed link content:', JSON.stringify(i.linkContent));
}