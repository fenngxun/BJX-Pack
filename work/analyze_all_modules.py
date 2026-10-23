# -*- coding: utf-8 -*-
"""Full dependency analysis for remaining BJX modules.

1. Passage names defined by each BJX new module dir / -bjx.twee file.
2. Which of those collide with vanilla 0.5.10.12 passages (replacement risk).
3. Widgets/macros they invoke (heuristic) that must exist somewhere.
"""
import os
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BJX = r'C:\Users\79403\Desktop\dol\Dol-BJX-Ex-main\源码'
VAN = r'C:\Users\79403\Desktop\dol\refs\dol-0.5.10.12-target\game'

# vanilla passage names
van_passages = set()
for root, dirs, files in os.walk(VAN):
    for f in files:
        if f.endswith('.twee'):
            try:
                for line in open(os.path.join(root, f), encoding='utf-8', errors='replace'):
                    if line.startswith('::'):
                        name = line[2:].strip()
                        # strip tags & position
                        name = re.split(r'\s+(?:\[|\{)', name)[0].strip()
                        van_passages.add(name)
            except OSError:
                pass
print('vanilla 0.5.10.12 passages:', len(van_passages))

def passages_of(path):
    out = []
    try:
        for line in open(path, encoding='utf-8', errors='replace'):
            if line.startswith('::'):
                name = line[2:].strip()
                name = re.split(r'\s+(?:\[|\{)', name)[0].strip()
                out.append(name)
    except OSError:
        pass
    return out

def widgets_of(path):
    """widget names defined in file."""
    try:
        txt = open(path, encoding='utf-8', errors='replace').read()
    except OSError:
        return []
    return re.findall(r'<<widget\s+"([^"]+)"', txt)

# module groups to analyze
GROUPS = {
    'bunker':   ['overworld-town/loc-bunker-bjx'],
    'taylor':   ['overworld-town/special-taylor-bjx'],
    'casey':    ['overworld-town/special-casey-bjx'],
    'mansion':  ['overworld-forest/loc-mansion-bjx'],
    'hive':     ['overworld-forest/loc-hive-bjx'],
    'lakehouse':['overworld-forest/loc-lakehouse-bjx'],
    'island':   ['overworld-island-bjx'],  # already ported; for reference
}

# also all other -bjx.twee files (modification-type)
other_bjx = []
for root, dirs, files in os.walk(BJX):
    if 'island-bjx' in root or 'loc-bunker-bjx' in root or 'lakehouse-bjx' in root or 'mansion-bjx' in root or 'hive-bjx' in root or 'taylor-bjx' in root or 'casey-bjx' in root:
        continue
    for f in files:
        if ('bjx' in f.lower()) and (f.endswith('.twee') or f.endswith('.js')):
            rel = os.path.relpath(os.path.join(root, f), BJX).replace('\\', '/')
            other_bjx.append(rel)
other_bjx.sort()

print('\n================ MODULE GROUPS ================')
for g, dirs in GROUPS.items():
    print(f'\n--- {g} ---')
    for d in dirs:
        full = os.path.join(BJX, d.replace('/', os.sep))
        for f in sorted(os.listdir(full)):
            p = os.path.join(full, f)
            ps = passages_of(p)
            ws = widgets_of(p)
            new = [x for x in ps if x not in van_passages]
            clash = [x for x in ps if x in van_passages]
            lines = sum(1 for _ in open(p, encoding='utf-8', errors='replace'))
            print(f'  {f}: {lines}L, passages={len(ps)} (new={len(new)}, clash={len(clash)}), widgets={len(ws)}')
            for c in clash:
                print(f'    !! CLASH: "{c}" replaces a vanilla passage')

print('\n================ OTHER -bjx FILES (modification-type) ================')
for rel in other_bjx:
    p = os.path.join(BJX, rel.replace('/', os.sep))
    if rel.endswith('.twee'):
        ps = passages_of(p)
        ws = widgets_of(p)
        clash = [x for x in ps if x in van_passages]
        lines = sum(1 for _ in open(p, encoding='utf-8', errors='replace'))
        flag = 'CLASH' if clash else 'new'
        print(f'  [{flag}] {rel}: {lines}L passages={len(ps)} clash={clash[:8]} widgets={len(ws)}')
    else:
        lines = sum(1 for _ in open(p, encoding='utf-8', errors='replace'))
        print(f'  [js] {rel}: {lines}L')