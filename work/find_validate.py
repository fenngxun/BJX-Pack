import re

data = open(r'C:/Users/79403/Desktop/dol/game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/Degrees of Lewdity.html', 'rb').read().decode('utf-8', 'ignore')

# the definition is likely at 16424870/16424909 area - dump a window around each hit
for pos in [16424870, 16429746, 16447348, 16474697]:
    s = max(0, pos - 100)
    print('--- @', pos, '---')
    print(data[s:pos + 1800].replace('\n', ' ')[:1900])
    print()