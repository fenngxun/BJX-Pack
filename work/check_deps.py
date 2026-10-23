# -*- coding: utf-8 -*-
"""Static dependency check for all BJX new-content files.

For every -bjx file (new passages only):
  1. Widgets invoked but defined nowhere (vanilla 0.5.10.12 + BJX new files).
  2. Story variables referenced ($foo) that need seeding.
Outputs per-module missing lists.
"""
import os
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BJX = r'C:\Users\79403\Desktop\dol\Dol-BJX-Ex-main\源码'
VAN = r'C:\Users\79403\Desktop\dol\refs\dol-0.5.10.12-target\game'

# ---- collect vanilla widget definitions ----
van_widgets = set()
van_var_init = set()
for root, dirs, files in os.walk(VAN):
    for f in files:
        p = os.path.join(root, f)
        if f.endswith('.twee'):
            try:
                txt = open(p, encoding='utf-8', errors='replace').read()
            except OSError:
                continue
            van_widgets |= set(re.findall(r'<<widget\s+["\']([^"\']+)["\']', txt))
        elif f.endswith('.js'):
            try:
                txt = open(p, encoding='utf-8', errors='replace').read()
            except OSError:
                continue
            van_widgets |= set(re.findall(r'Macro\.add\(\s*["\']([^"\']+)["\']', txt))
            van_widgets |= set(re.findall(r'DefineMacro\(\s*["\']([^"\']+)["\']', txt))
            van_widgets |= set(re.findall(r'statDisplay\.create\(\s*["\']([^"\']+)["\']', txt))
print('vanilla widgets/macros:', len(van_widgets))

# ---- BJX new files (A layer): all files with bjx in path/name ----
bjx_files = []
for root, dirs, files in os.walk(BJX):
    for f in files:
        rel = os.path.relpath(os.path.join(root, f), BJX).replace('\\', '/')
        if 'bjx' in rel.lower() and f.endswith('.twee'):
            bjx_files.append((os.path.join(root, f), rel))
bjx_files.sort(key=lambda x: x[1])

bjx_new_widgets = set()
bjx_new_vars = set()   # vars the new files themselves define/set
calls_per_file = {}
vars_per_file = {}

MACRO_CALL = re.compile(r'<<\s*([A-Za-z][\w-]*)')
VAR_REF = re.compile(r'\$(\w+)')

for p, rel in bjx_files:
    txt = open(p, encoding='utf-8', errors='replace').read()
    bjx_new_widgets |= set(re.findall(r'<<widget\s+"([^"]+)"', txt))
    bjx_new_vars |= set(re.findall(r'\$(\w+)\s+to\s', txt))

VAN_MACROS = set(van_widgets) | {
    'if','else','elseif','endif','set','unset','run','script','link','replace','append','prepend',
    'button','for','break','continue','switch','case','default','endswitch','print','nobr','silently',
    'widget','capture','addclass','removeclass','toggleclass','include','textbox','radiobutton',
    'checkbox','listbox','option','optionsfrom','actions','return','goto','timed','nextt','repeat',
    'stopbacktrack','back','forget','remember','comment','/comment','numberbox','textarea','progress',
}

for p, rel in bjx_files:
    txt = open(p, encoding='utf-8', errors='replace').read()
    # strip widget definitions before finding calls? keep simple: collect macro names invoked
    calls = set(MACRO_CALL.findall(txt)) - set(re.findall(r'<<widget\s+"([^"]+)"', txt))
    missing = sorted(c for c in calls
                     if c not in VAN_MACROS and c not in bjx_new_widgets
                     and not c.startswith('/'))
    if missing:
        calls_per_file[rel] = missing
    # vars referenced but never initialized anywhere obvious
    refs = set(VAR_REF.findall(txt))
    undefined = sorted(v for v in refs
                       if v not in van_var_init and v not in bjx_new_vars
                       and v not in {'PC','NPCList'} )
    if undefined:
        vars_per_file[rel] = undefined

print('\n===== MISSING WIDGET/MACRO (not in vanilla 0.5.10.12 nor in BJX new files) =====')
for rel, m in calls_per_file.items():
    print(f'  {rel}:')
    print(f'    {", ".join(m)}')

print('\n===== VARS REFERENCED WITHOUT OBVIOUS INIT (check manually) =====')
for rel, m in vars_per_file.items():
    print(f'  {rel}:')
    print(f'    {", ".join(m)}')