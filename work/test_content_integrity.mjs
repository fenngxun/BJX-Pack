// Compare ModLoader-parsed passage content with raw disk source for
// bjx-beast-generation.twee, and dump the critical lines 100-133 region.
import { readFileSync } from 'node:fs';

const FILE = 'C:/Users/79403/Desktop/dol/work/bjx-ant-island/tweeFileList/bjx-beast-generation.twee';
const raw = readFileSync(FILE, 'utf-8');

function Twee2Passage(s) {
  var r = s.split(/^(:: +((?:[^:"\/\n\r\[\] ]+ *)+)(?: *\[((?:[^ \]]+ *)* *)\] *|))$/gm);
  var rr = [];
  for (var i = 0; i < r.length; i++) {
    if (r[i].startsWith(':: ')) {
      var _r$i;
      rr.push({
        name: r[++i].trim(),
        tags: ((_r$i = r[++i]) === null || _r$i === void 0 ? void 0 : _r$i.split(' ')) || [],
        content: r[++i],
      });
    }
  }
  return rr;
}

const passages = Twee2Passage(raw);
console.log('parsed passages:', passages.length);
const p = passages[0];
console.log('name:', JSON.stringify(p.name), 'tags:', JSON.stringify(p.tags), 'contentLen:', p.content.length);

// Expected content: everything after the first header line.
const nl = raw.indexOf('\n');
const expected = raw.slice(nl + 1);
console.log('expectedLen:', expected.length);

if (p.content === expected) {
  console.log('CONTENT === expected: IDENTICAL');
} else {
  console.log('CONTENT DIFFERS from expected!');
  const n = Math.min(p.content.length, expected.length);
  let i = 0;
  while (i < n && p.content[i] === expected[i]) i++;
  console.log('first diff at char', i);
  console.log('  parsed  :', JSON.stringify(p.content.slice(Math.max(0, i - 40), i + 80)));
  console.log('  expected:', JSON.stringify(expected.slice(Math.max(0, i - 40), i + 80)));
}

// Critical region checks (the attribute arrays + ant concat lines).
const marks = [
  '<<set _h to [200,150,200,300,200,250,500,300,200,500,225,150,400,300,350]>>',
  '<<set _t to ["dog","cat","pig","wolf","dolphin","lizard","bear","boar","creature","horse","fox","hawk","cow","spider","snake"]>>',
  '<<set _d to [["large"],',
  '<<set _pd to ["knotted penis","spiked penis","penis","knotted penis","strange penis","penis","penis","penis","penis","equine cock","knotted penis","avian cock","bovine cock","arachnid penis","serpent penis"]>>',
  '<<set _ps to [2,2,2,3,2,2,3,3,2,5,2,2,4,2,2]>>',
  '<<set _h to _h.concat([300])>>',
  '<<set _i to $BeastList.indexOf(_type)>>',
  '<<if _type is "ant">><<set _i to _t.indexOf("ant")>><</if>>',
  '<<widget "beastattribute">>',
  '<</widget>>',
];
for (const m of marks) {
  const idx = p.content.indexOf(m);
  console.log((idx >= 0 ? 'OK  @' + idx : 'MISSING     ') + '  ' + m.slice(0, 70));
}

// Dump the exact region around the attribute arrays (source lines ~96-135).
const start = p.content.indexOf('<<set _h to [200');
const end = p.content.indexOf('healthmax to _h[_i]');
console.log('\n--- region dump ---');
console.log(p.content.slice(start, end + 40));