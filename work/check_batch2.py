# -*- coding: utf-8 -*-
"""Batch-2 dependency check: mansion + lakehouse + tf + wardrobes + town-hall.
Lists macro calls that exist neither in vanilla 0.5.10.12 nor in the batch
itself / already-ported bjx-pack twee files."""
import os
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BJX = r'C:\Users\79403\Desktop\dol\Dol-BJX-Ex-main\源码'
VAN = r'C:\Users\79403\Desktop\dol\refs\dol-0.5.10.12-target\game'
PACK = r'C:\Users\79403\Desktop\dol\work\bjx-ant-island\tweeFileList'

BATCH = [
    'overworld-forest/loc-mansion-bjx/main.twee',
    'overworld-forest/loc-mansion-bjx/events.twee',
    'overworld-forest/loc-mansion-bjx/widgets.twee',
    'overworld-forest/loc-lakehouse-bjx/lakehouse.twee',
    'overworld-forest/loc-lakehouse-bjx/widgets.twee',
    'overworld-forest/loc-lakehouse-bjx/upgrades.twee',
    'overworld-forest/loc-lakehouse-bjx/assault.twee',
    'base-combat/actions-tf-bjx.twee',
    'overworld-town/loc-home/mushroomevolve.twee',
    'base-clothing/wardrobes-bjx.twee',
    'overworld-town/loc-town-hall/main-bjx.twee',
]

van_widgets = set()
for root, dirs, files in os.walk(VAN):
    for f in files:
        p = os.path.join(root, f)
        if f.endswith('.twee'):
            txt = open(p, encoding='utf-8', errors='replace').read()
            van_widgets |= set(re.findall(r'<<widget\s+["\']([^"\']+)["\']', txt))
        elif f.endswith('.js'):
            txt = open(p, encoding='utf-8', errors='replace').read()
            van_widgets |= set(re.findall(r'Macro\.add\(\s*["\']([^"\']+)["\']', txt))
            van_widgets |= set(re.findall(r'DefineMacro\(\s*["\']([^"\']+)["\']', txt))

pack_widgets = set()
for f in os.listdir(PACK):
    if f.endswith('.twee'):
        txt = open(os.path.join(PACK, f), encoding='utf-8', errors='replace').read()
        pack_widgets |= set(re.findall(r'<<widget\s+"([^"]+)"', txt))

BUILTIN = {'if','else','elseif','endif','set','unset','run','script','link','replace','append','prepend',
    'button','for','break','continue','switch','case','default','endswitch','print','nobr','silently',
    'widget','capture','addclass','removeclass','toggleclass','include','textbox','radiobutton',
    'checkbox','listbox','option','optionsfrom','actions','return','goto','timed','nextt','repeat',
    'stopbacktrack','back','forget','remember','comment','/comment','numberbox','textarea','progress',
    'endwidget','endfor','endif','endnobr','endsilently'}

batch_widgets = set()
for rel in BATCH:
    txt = open(os.path.join(BJX, rel.replace('/', os.sep)), encoding='utf-8', errors='replace').read()
    batch_widgets |= set(re.findall(r'<<widget\s+"([^"]+)"', txt))

MACRO_CALL = re.compile(r'<<\s*/?([A-Za-z][\w-]*)')

for rel in BATCH:
    path = os.path.join(BJX, rel.replace('/', os.sep))
    txt = open(path, encoding='utf-8', errors='replace').read()
    own = set(re.findall(r'<<widget\s+"([^"]+)"', txt))
    calls = set(MACRO_CALL.findall(txt))
    missing = sorted(c for c in calls
                     if c not in BUILTIN and c not in van_widgets
                     and c not in batch_widgets and c not in pack_widgets
                     and not c.startswith('/'))
    print(f'{rel}:')
    print('  ' + (', '.join(missing) if missing else '(none)'))