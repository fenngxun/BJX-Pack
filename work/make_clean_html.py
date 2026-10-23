"""Build a clean HTML (bjx-pack stripped from modDataValueZipList) for Path-A testing."""
import base64
import io
import json
import re
import zipfile

SRC = r'C:\Users\79403\Desktop\dol\game\DoL-ModLoader-0.5.10.12-v2.101.1-polyfill\Degrees of Lewdity.html'
DST = r'C:\Users\79403\Desktop\dol\game\DoL-ModLoader-0.5.10.12-v2.101.1-polyfill\dol-clean.html'

with open(SRC, 'rb') as f:
    html = f.read()

marker = b'window.modDataValueZipList = ['
pos = html.find(marker)
assert pos > 0
end = html.find(b'];', pos)
seg = html[pos:end]

removed = 0
while True:
    m = None
    for m_ in re.finditer(rb',"([A-Za-z0-9+/=]+)"', seg):
        m = m_
    if not m:
        break
    try:
        zf = zipfile.ZipFile(io.BytesIO(base64.b64decode(m.group(1))))
        boot = json.loads(zf.read('boot.json').decode('utf-8'))
        if boot.get('name') in ('bjx-pack', 'bjx-ant-island'):
            html = html[:pos + m.start()] + html[pos + m.end():]
            removed += 1
            seg = html[pos:html.find(b'];', pos)]
            continue
    except Exception:
        pass
    break

with open(DST, 'wb') as f:
    f.write(html)
print('removed entries:', removed)
print('clean html:', DST, len(html), 'bytes')

# verify
with open(DST, 'rb') as f:
    chk = f.read()
names = []
for m in re.finditer(rb'"([A-Za-z0-9+/=]{100,})"', chk[chk.find(marker):chk.find(b'];', chk.find(marker))]):
    try:
        zf = zipfile.ZipFile(io.BytesIO(base64.b64decode(m.group(1))))
        b = json.loads(zf.read('boot.json').decode('utf-8'))
        names.append(b.get('name'))
    except Exception:
        pass
print('remaining mods:', len(names))
print('bjx still present:', any('bjx' in n for n in names))