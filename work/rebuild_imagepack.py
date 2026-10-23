"""Rebuild a standard GameOriginalImagePack mod zip from the vanilla 0.5.10.12 img/ tree."""
import json
import os
import zipfile

IMG_ROOT = r'C:\Users\79403\Desktop\dol\refs\dol-0.5.10.12-target\img'
OUT = r'C:\Users\79403\Desktop\dol\work\GameOriginalImagePack-rebuilt.mod.zip'

entries = []
for base, dirs, files in os.walk(IMG_ROOT):
    for f in files:
        full = os.path.join(base, f)
        rel = 'img/' + os.path.relpath(full, IMG_ROOT).replace('\\', '/')
        entries.append(rel)
entries.sort()
print('img files:', len(entries))

boot = {
    'name': 'GameOriginalImagePack',
    'version': '0.5.10.12',
    'styleFileList': [],
    'scriptFileList': [],
    'tweeFileList': [],
    'imgFileList': entries,
}

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('boot.json', json.dumps(boot, ensure_ascii=False))
    for rel in entries:
        full = os.path.join(IMG_ROOT, rel[4:].replace('/', os.sep))
        zf.write(full, rel)

print('zip written:', OUT, os.path.getsize(OUT), 'bytes')

# sanity: reopen
zf = zipfile.ZipFile(OUT)
b = json.loads(zf.read('boot.json').decode('utf-8'))
print('reopen ok, entries:', len(zf.namelist()), 'boot imgFileList:', len(b['imgFileList']))
print('sample:', b['imgFileList'][:3])