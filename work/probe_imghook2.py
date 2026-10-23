html = open(r'C:/Users/79403/Desktop/dol/game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/dol-clean.html', encoding='utf-8', errors='ignore').read()

for pos in [14691504, 14695163, 15289235]:
    print('=' * 30, pos)
    print(html[pos - 400:pos + 600].replace('\n', ' '))
    print()