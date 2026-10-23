import json
import zipfile

d = json.load(open('passages-dump.json', encoding='utf-8'))

ds = d['Dance Studio']['text']
print('=== Dance Studio: Time.openingHours() occurrences ===')
i = 0
while True:
    i = ds.find('Time.openingHours()', i)
    if i < 0:
        break
    print(repr(ds[max(0, i - 70):i + 90]))
    print('---')
    i += 1

print()
ob = d['Ocean Breeze']['text']
print('=== Ocean Breeze: passoutshop / stress ===')
i = ob.find('<<passoutshop>>')
print(repr(ob[max(0, i - 120):i + 150]))

print()
print('=== Ocean Breeze: caferandompassive already present? ===', 'caferandompassive' in ob)

# TimeHourglass: caferandompassive definition
zf = zipfile.ZipFile('../mod/TimeHourglass.mod.adapted.mod.zip')
boot = json.loads(zf.read('boot.json').decode())
for n in (boot.get('tweeFileList') or []) + (boot.get('scriptFileList') or []):
    content = zf.read(n).decode('utf-8', errors='ignore')
    if 'caferandompassive' in content:
        print('=== %s has caferandompassive ===' % n)
        i = content.find('caferandompassive')
        print(repr(content[max(0, i - 200):i + 600]))

print()
print('=== Widgets Kitchen: tending_give occurrences (runtime) ===')
print('NOTE: Widgets Kitchen not dumped yet - checking cummilk rule context instead')