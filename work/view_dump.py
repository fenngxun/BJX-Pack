import json
import re

d = json.load(open('passages-dump.json', encoding='utf-8'))
ob = d['Ocean Breeze']['text']
print('=== Ocean Breeze (900-2100) ===')
print(repr(ob[900:2100]))
print()
ds = d['Dance Studio']['text']
print('=== Dance Studio job/intro/charly hits ===')
for m in re.finditer('job|intro|charly|Charlie', ds):
    i = m.start()
    print(repr(ds[max(0, i - 70):i + 110]))
    print('---')
print()
ec = d['Eden Clearing']['text']
print('=== Eden Clearing edenfreedom/edendays hits ===')
for m in re.finditer('edenfreedom|edendays|edenprep', ec):
    i = m.start()
    print(repr(ec[max(0, i - 80):i + 150]))
    print('---')
print()
th = d['Town Hall']['text']
print('=== Town Hall full ===')
print(repr(th))
print()
ca = d['Cabin Actions']['text']
print('=== Cabin Actions tail ===')
print(repr(ca[-500:]))