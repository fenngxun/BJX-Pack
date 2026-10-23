import re

data = open(r'C:/Users/79403/Desktop/dol/game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/Degrees of Lewdity.html', 'rb').read().decode('utf-8', 'ignore')

for pat in ['AddMod_I', 'AddMod_b', 'AddMod']:
    ms = [m.start() for m in re.finditer(pat, data)]
    print(pat, '->', len(ms), 'hits', ms[:6])

# dump contexts around AddMod_I occurrences
for m in list(re.finditer('AddMod_I', data))[:6]:
    s = max(0, m.start() - 350)
    print('---CTX @', m.start(), '---')
    print(data[s:m.end() + 350].replace('\n', ' ')[:750])
    print()