import re

html = open(r'C:/Users/79403/Desktop/dol/game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/dol-clean.html', encoding='utf-8', errors='ignore').read()
print('html len:', len(html))

for pat in ['ImageLoaderHook', 'createElement', 'new MutationObserver', 'HTMLImageElement', 'img-orig', 'onerror', 'createObjectURL']:
    hits = [m.start() for m in re.finditer(re.escape(pat), html)]
    print(pat, len(hits), hits[:6])