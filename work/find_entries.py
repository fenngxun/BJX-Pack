# -*- coding: utf-8 -*-
"""Find entry links: which BJX-modified vanilla files link INTO the new modules.

For each new module's target passages, grep all BJX source files for links
([[...|Target]] or <<goto "Target">> / <<link ...>>) referencing them.
"""
import os
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BJX = r'C:\Users\79403\Desktop\dol\Dol-BJX-Ex-main\源码'

# module -> list of entry target passage names (first/main passages)
TARGETS = {
    'bunker':    ['Bunker', 'Bunker Entrance'],
    'taylor':    ['Taylor Intro', 'Taylor'],
    'casey':     ['Casey Intro', 'Casey'],
    'mansion':   ['Mansion', 'Mansion Entrance'],
    'hive':      ['Hive', 'Hive Entrance'],
    'lakehouse': ['Lakehouse', 'Lake House', 'Lakehouse Entrance'],
}

# collect all bjx source files
all_files = []
for root, dirs, files in os.walk(BJX):
    for f in files:
        if f.endswith(('.twee', '.js')):
            all_files.append(os.path.join(root, f))

# gather candidate passage names per module by reading module dirs first
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

MOD_DIRS = {
    'bunker': 'overworld-town/loc-bunker-bjx',
    'taylor': 'overworld-town/special-taylor-bjx',
    'casey': 'overworld-town/special-casey-bjx',
    'mansion': 'overworld-forest/loc-mansion-bjx',
    'hive': 'overworld-forest/loc-hive-bjx',
    'lakehouse': 'overworld-forest/loc-lakehouse-bjx',
    'island': 'overworld-island-bjx',
    'forest-ev': 'overworld-forest/loc-forest/events-bjx.twee',
    'tentacle': 'overworld-forest/loc-tentacle-world/main-bjx.twee',
    'moor': 'overworld-plains/loc-moor',
    'home': 'overworld-town/loc-home/main-bjx.twee',
    'landfill': 'overworld-town/loc-landfill/main-bjx.twee',
    'sewers-old': 'overworld-underground/loc-sewers/old-sewers-events-bjx.twee',
    'museum2': 'overworld-town/loc-museum/main-bjx.twee',
    'sydney': 'overworld-town/special-sydney',
    'docks2': 'overworld-town/loc-docks/main-bjx.twee',
    'sea2': 'overworld-town/loc-sea',
    'farm': 'overworld-plains/loc-farm',
    'bus': 'overworld-town/loc-bus-station/main-bjx.twee',
    'hospital': 'overworld-town/loc-hospital',
    'temple': 'overworld-town/loc-temple',
    'townhall': 'overworld-town/loc-town-hall/main-bjx.twee',
    'street': 'overworld-town/loc-street/events-bjx.twee',
    'robin': 'overworld-town/special-robin/main-bjx.twee',
    'whitney': 'overworld-town/special-whitney/main-bjx.twee',
    'bird': 'overworld-plains/loc-bird/main-bjx.twee',
    'petshop': 'overworld-town/loc-shop/petShop-bjx.twee',
    'churchyard': 'overworld-forest/loc-churchyard/widgets-bjx.twee',
    'maths': 'overworld-town/loc-school/maths-project-bjx.twee',
    'lake-bottom': 'overworld-forest/loc-lake/underwater-bjx.twee',
}

mod_passages = {}
for mod, rel in MOD_DIRS.items():
    full = os.path.join(BJX, rel.replace('/', os.sep))
    ps = []
    if os.path.isdir(full):
        for f in sorted(os.listdir(full)):
            if f.endswith('.twee'):
                ps += passages_of(os.path.join(full, f))
    else:
        ps = passages_of(full)
    mod_passages[mod] = set(ps)

# which files are "modified vanilla" (not inside bjx dirs, no bjx in name)
mod_vanilla_files = []
for p in all_files:
    rel = os.path.relpath(p, BJX).replace('\\', '/')
    if 'bjx' in rel.lower():
        continue
    mod_vanilla_files.append((p, rel))

print('BJX-modified vanilla files:', len(mod_vanilla_files))
print()

# for each module, find links from modified-vanilla files into module passages
for mod, ps in mod_passages.items():
    if not ps:
        continue
    hits = {}
    pat = re.compile('|'.join(re.escape(x) for x in sorted(ps, key=len, reverse=True)))
    for p, rel in mod_vanilla_files:
        try:
            txt = open(p, encoding='utf-8', errors='replace').read()
        except OSError:
            continue
        if pat.search(txt):
            # find the actual lines
            lines = []
            for i, line in enumerate(txt.splitlines(), 1):
                if pat.search(line) and ('[[' in line or 'goto' in line or 'link' in line.lower() or '<<' in line):
                    names = sorted(set(pat.findall(line)))
                    lines.append((i, line.strip()[:150], names))
            if lines:
                hits[rel] = lines
    if hits:
        print(f'===== {mod}: entry points in modified vanilla files =====')
        for rel, lines in hits.items():
            print(f'  {rel}:')
            for (i, line, names) in lines[:6]:
                print(f'    L{i}: {line}')
        print()