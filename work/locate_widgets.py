import re

t = open(r'..\Dol-BJX-Ex-main\源码\overworld-forest\loc-forest\widgets.twee', encoding='utf-8').read()
targets = ['Forest Dragon Molestation', 'Forest Raccoon', 'Bog Frog', 'Bog Mosquito', 'Mushroom Grove']
for tgt in targets:
    for m in re.finditer(re.escape(tgt), t):
        start = t.rfind('<<widget "', 0, m.start())
        wn = t[start + 10:t.find('"', start + 10)]
        line = t.count('\n', 0, m.start()) + 1
        print(f'{tgt} -> widget "{wn}" (line {line})')
        break