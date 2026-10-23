import json
import zipfile

d = json.load(open('passages-dump.json', encoding='utf-8'))
ca = d['Cabin Actions']['text']
print('=== Cabin Actions head ===')
print(repr(ca[:400]))
print()

# mod twee version of Cabin Actions
zf = zipfile.ZipFile('../mod/InTheEdenAfterSunset.adapted.mod.zip')
boot = json.loads(zf.read('boot.json').decode())
twee = boot.get('tweeFileList') or []
print('sunset twee files:', len(twee))
for n in twee:
    if 'cabin' in n.lower() or 'action' in n.lower():
        content = zf.read(n).decode('utf-8')
        print('--- %s (%d bytes) ---' % (n, len(content)))
        print(repr(content[:600]))
        print('... tail:')
        print(repr(content[-400:]))
        print()

# Lake Ruin Plinth second occurrence + plinth tail via refs source
src = open('../refs/dol-0.5.10.12-target/game/overworld-lake/loc-lake-ruin/main.twee', encoding='utf-8').read() if __import__('os').path.exists('../refs/dol-0.5.10.12-target/game/overworld-lake/loc-lake-ruin/main.twee') else None
if src is None:
    import glob
    hits = [f for f in glob.glob('../refs/dol-0.5.10.12-target/game/**/*.twee', recursive=True) if 'Lake Ruin Plinth' in open(f, encoding='utf-8', errors='ignore').read()]
    print('plinth source files:', hits)
    if hits:
        src = open(hits[0], encoding='utf-8').read()
if src:
    i = src.find(':: Lake Ruin Plinth')
    seg = src[i:i + 3000]
    print('=== Lake Ruin Plinth source ===')
    print(repr(seg[:1600]))