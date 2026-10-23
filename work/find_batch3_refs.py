import re, os, json, glob

BJX = r'..\Dol-BJX-Ex-main\源码'
VAN = set(open('vanilla_passages.txt', encoding='utf-8').read().splitlines())

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

all_twee = glob.glob(os.path.join(BJX, '**', '*.twee'), recursive=True)
texts = {}
for p in all_twee:
    try:
        texts[p] = open(p, encoding='utf-8').read()
    except Exception:
        pass

def passages(txt):
    return re.findall(r'^:: (.+?)(?: \[.*)?$', txt, re.M)

result = {}
for f in batch3:
    fp = os.path.join(BJX, f)
    if not os.path.exists(fp):
        result[f] = {'error': 'missing'}
        continue
    txt = texts.get(fp) or open(fp, encoding='utf-8').read()
    info = {}
    for name in passages(txt):
        refs = []
        for p, t in texts.items():
            if p == fp:
                continue
            pat = re.compile(r'\[\[([^\]|]*\|)?\s*' + re.escape(name) + r'\s*(\]\]|[|\]])')
            n = len(pat.findall(t))
            if n:
                refs.append((os.path.relpath(p, BJX), n))
        info[name] = refs
    result[f] = info

print(json.dumps(result, ensure_ascii=False, indent=1))
with open('batch3_refs.json', 'w', encoding='utf-8') as fh:
    json.dump(result, fh, ensure_ascii=False, indent=1)