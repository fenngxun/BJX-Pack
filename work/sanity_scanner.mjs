// Sanity check: the v2 scanner logic must flag the PRE-FIX multi-line _d text.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'C:/Users/79403/Desktop/dol/work/bjx-ant-island/tweeFileList';

const macroName = "[A-Za-z][\\w-]*|[=-]";
const LOOKAHEAD = new RegExp(
  "<<(/?" + macroName + ")(?:\\s*)((?:(?:/\\*[^*]*\\*+(?:[^/*][^*]*\\*+)*/)|(?://.*\\n)|(?:`(?:\\\\.|[^`\\\\])*`)|(?:\"(?:\\\\.|[^\"\\\\])*\")|(?:'(?:\\\\.|[^'\\\\])*')|(?:\\[(?:[<>]?[Ii][Mm][Gg])?\\[[^\\r\\n]*?\\]\\]+)|[^>]|(?:>(?!>)))*)>>",
  "gm"
);
const STRIP = [
  /\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g,
  /\/\/[^\n]*/g,
  /`(?:\\.|[^`\\])*`/g,
  /"(?:\\.|[^"\\])*"/g,
  /'(?:\\.|[^'\\])*'/g,
];
const LINK = /\[(?:[<>]?[Ii][Mm][Gg])?\[[^\r\n]*?\]\]+/g;

function scanText(text, label) {
  const issues = [];
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
        issues.push({ where: label, link: lm[0].slice(0, 120) });
      }
    }
    pos = pos + full.length - 1;
  }
  return issues;
}

// PRE-FIX text (multi-line _d + later ]] from a concat) must be flagged.
const PREFIX = [
  '<<set _h to [200,150]>>',
  '<<set _d to [["large"],',
  '\t\t["large"],',
  '\t\t["scaly"]',
  '\t\t]>>',
  '<<set _pd to ["knotted penis"]>>',
  '<<set _h2 to _h.concat([300])>>',
  '<<set _d2 to _d.concat([["weird"]])>>',
].join('\n');
const collapsed = PREFIX.replace(/^\n+|\n+$/g, '').replace(/\s+/g, ' ');
const issues = scanText(collapsed, 'PREFIX sample');
console.log('sanity issues on pre-fix sample:', issues.length);
for (const i of issues) console.log('  ->', JSON.stringify(i.link));

// And the POST-FIX single-line _d must be clean.
const POSTFIX = '<<set _d to [["large"],["large"],["scaly"]]>> <!-- ok --> <<set _pd to ["knotted penis"]>>';
const issues2 = scanText(POSTFIX, 'POSTFIX sample');
console.log('sanity issues on post-fix sample:', issues2.length);