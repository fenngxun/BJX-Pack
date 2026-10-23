import re

data = open(r'C:/Users/79403/Desktop/dol/game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/Degrees of Lewdity.html', 'rb').read().decode('utf-8', 'ignore')

# AngularJS GUI 按钮：ng-click 含 import/addZip/upload
hits = list(re.finditer(r'ng-click="[^"]*(import|add|upload|zip)[^"]*"', data, re.I))
print('ng-click hits:', len(hits))
for m in hits[:12]:
    s = max(0, m.start() - 150)
    print('---', data[s:m.end() + 100].replace('\n', ' ')[-350:])

# 按钮文案 Import
hits2 = list(re.finditer(r'>\s*(Import|导入)\s*<', data))
print('button text hits:', len(hits2))
for m in hits2[:6]:
    s = max(0, m.start() - 250)
    print('---', data[s:m.end() + 60].replace('\n', ' ')[-360:])