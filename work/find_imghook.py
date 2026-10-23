import re

data = open(r'C:/Users/79403/Desktop/dol/game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/Degrees of Lewdity.html', 'rb').read().decode('utf-8', 'ignore')

for pat in ['imgFileList']:
    ms = [m.start() for m in re.finditer(re.escape(pat), data)]
    print(pat, '->', len(ms), 'hits', ms[:6])

for m in list(re.finditer('imgFileList', data))[:8]:
    s = max(0, m.start() - 300)
    print('---CTX @', m.start(), '---')
    print(data[s:m.end() + 300].replace('\n', ' ')[:600])
    print()