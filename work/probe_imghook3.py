import re

html = open(r'C:/Users/79403/Desktop/dol/game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/dol-clean.html', encoding='utf-8', errors='ignore').read()

for pat in ['ML-src', 'getHtmlTagSrcHook', 'fastWrapHtmlImageElement']:
    hits = [m.start() for m in re.finditer(re.escape(pat), html)]
    print(pat, len(hits), hits[:10])

# check which occurrences are inside comments: print short context
for m in re.finditer(re.escape('getHtmlTagSrcHook'), html):
    pos = m.start()
    seg = html[max(0, pos-150):pos+250].replace('\n', ' ')
    commented = '// *' in seg[:160] or 'console.log(`[' in seg
    print('----', pos, 'COMMENTED' if commented else 'LIVE?', '|', seg[:220])