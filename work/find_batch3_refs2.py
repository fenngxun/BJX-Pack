import re, os, json, glob

BJX = r'..\Dol-BJX-Ex-main\源码'

all_twee = glob.glob(os.path.join(BJX, '**', '*.twee'), recursive=True)
texts = {}
for p in all_twee:
    try:
        texts[p] = open(p, encoding='utf-8').read()
    except Exception:
        pass

def link_targets(body):
    out = set()
    for m in re.finditer(r'\[\[([^\[\]]+)\]\]', body):
        inner = m.group(1)
        if '->' in inner:
            out.add(inner.split('->')[-1].strip())
        elif '<-' in inner:
            out.add(inner.split('<-')[0].strip())
        elif '|' in inner:
            out.add(inner.split('|')[-1].strip())
        else:
            out.add(inner.strip())
    for m in re.finditer(r'goto\s+(?:"([^"]+)"|\[\[([^\]]+)\]\])', body):
        t = m.group(1) or m.group(2)
        if t:
            if '->' in t:
                t = t.split('->')[-1]
            elif '|' in t:
                t = t.split('|')[-1]
            out.add(t.strip())
    return out

rev = {}
for p, t in texts.items():
    for tgt in link_targets(t):
        rev.setdefault(tgt, []).append(os.path.relpath(p, BJX))

def passages(txt):
    return re.findall(r'^:: (.+?)(?: \[.*)?$', txt, re.M)

batch3 = [
    r'overworld-forest\loc-forest\events-bjx.twee',
    r'overworld-town\loc-sea\events-bjx.twee',
    r'overworld-town\loc-sea\main-bjx.twee',
    r'overworld-plains\loc-moor\events-bjx.twee',
    r'overworld-plains\loc-moor\main-bjx.twee',
    r'overworld-plains\loc-farm\main-bjx.twee',
    r'overworld-plains\loc-farm\meadow-bjx.twee',
    r'overworld-plains\loc-farm\upgrades-bjx.twee',
    r'overworld-forest\loc-tentacle-world\main-bjx.twee',
    r'overworld-town\loc-bus-station\main-bjx.twee',
    r'overworld-town\loc-docks\main-bjx.twee',
    r'overworld-town\loc-home\code-bjx.twee',
    r'overworld-town\loc-home\main-bjx.twee',
    r'overworld-town\loc-hospital\main-bjx.twee',
    r'overworld-town\loc-hospital\parasite-removal-bjx.twee',
    r'overworld-town\loc-landfill\main-bjx.twee',
    r'overworld-town\loc-museum\main-bjx.twee',
    r'overworld-town\loc-school\maths-project-bjx.twee',
    r'overworld-town\loc-street\events-bjx.twee',
    r'overworld-town\loc-temple\main-bjx.twee',
    r'overworld-town\loc-temple\science-project-bjx.twee',
    r'overworld-town\loc-shop\petShop-bjx.twee',
    r'overworld-town\special-robin\main-bjx.twee',
    r'overworld-town\special-sydney\main-bjx.twee',
    r'overworld-town\special-sydney\temple-bjx.twee',
    r'overworld-town\special-whitney\main-bjx.twee',
    r'overworld-underground\loc-sewers\old-sewers-events-bjx.twee',
    r'overworld-forest\loc-lake\underwater-bjx.twee',
    r'overworld-forest\loc-churchyard\widgets-bjx.twee',
    r'overworld-plains\loc-bird\main-bjx.twee',
    r'base-combat\actions-tail-bjx.twee',
]

result = {}
for f in batch3:
    fp = os.path.join(BJX, f)
    if not os.path.exists(fp):
        result[f] = {'error': 'missing'}
        continue
    txt = open(fp, encoding='utf-8').read()
    own = set(passages(txt))
    info = {}
    for name in own:
        ref_files = rev.get(name, [])
        external = [r for r in ref_files if os.path.normpath(r) != os.path.normpath(f)]
        info[name] = sorted(set(external))
    result[f] = info

with open('batch3_refs2.json', 'w', encoding='utf-8') as fh:
    json.dump(result, fh, ensure_ascii=False, indent=1)

for f, info in result.items():
    if 'error' in info:
        print(f, 'MISSING'); continue
    orphan = [n for n, refs in info.items() if not refs and n not in own]
    orphan = [n for n, refs in info.items() if not refs]
    print(f'{f}: {len(info)}p, ORPHAN={len(orphan)}')
    if orphan:
        print('   ', orphan)