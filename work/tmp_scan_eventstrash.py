import re

t = open(r'C:\Users\79403\Desktop\dol\refs\dol-0.5.10.12-target\game\overworld-town\loc-landfill\widgets.twee', encoding='utf-8').read()
i = t.find(':: Widgets Trash')
seg = t[i:]
j = seg.find('\n::', 5)
seg = seg[:j] if j > 0 else seg
print('eventstrash widget len:', len(seg))
for m in re.finditer(r'<<(rng|runeventpool|cleareventpool|addinlineevent)[^>]*>', seg):
    print(' ', m.start(), m.group(0))