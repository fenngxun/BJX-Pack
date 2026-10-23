import io
import re

BJX = r'C:/Users/79403/Desktop/dol/Dol-BJX-Ex-main/源码/overworld-town/loc-hospital/parasite-removal-bjx.twee'
HOOK = 'bjx-pack/tweeFileList/bjx-hospital-parasite-hooks.twee'
EVENTS = 'bjx-pack/tweeFileList/bjx-hospital-events.twee'
TEST = 'cdp_pack.mjs'

src = io.open(BJX, encoding='utf-8').read()
print('--- BJX source: 哈?收下了你的付款 ---')
for m in re.finditer('哈.收下了你的付款', src):
    seg = m.group(0)
    print(repr(seg), [hex(ord(c)) for c in seg], 'at', m.start())

print('--- BJX source: 电脉冲强度 ---')
for m in re.finditer('电脉冲强度.{0,4}增加', src):
    seg = m.group(0)
    print(repr(seg), [hex(ord(c)) for c in seg[:6]], 'at', m.start())

print('--- hook file: 顺便说一句 ---')
h = io.open(HOOK, encoding='utf-8').read()
for m in re.finditer('顺便说一句', h):
    seg = m.group(0)
    print(repr(seg), [hex(ord(c)) for c in seg], 'at', m.start())

print('--- events file: 顺便说一句 ---')
e = io.open(EVENTS, encoding='utf-8').read()
for m in re.finditer('顺便说一句', e):
    print('found in events at', m.start())

print('--- cdp_pack.mjs search strings ---')
t = io.open(TEST, encoding='utf-8').read()
for m in re.finditer(r"includes\('(电脉冲强度增加|哈珀收下了你的付款|顺便说一句|腐蚀性|和以前一样|哈珀收下了你的付款)'\)", t):
    seg = m.group(1)
    print('TEST:', repr(seg), [hex(ord(c)) for c in seg[:6]])