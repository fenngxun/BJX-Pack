import re, os, glob, warnings
warnings.filterwarnings('ignore')

pack_passages = set()
for f in glob.glob(r'bjx-pack/tweeFileList/*.twee'):
    t = open(f, encoding='utf-8').read()
    pack_passages.update(re.findall(r'^:: (.+?)(?: \[.*)?$', t, re.M))

BJX = r'..\Dol-BJX-Ex-main\源码'
batch3 = [
    r'overworld-forest\loc-forest\events-bjx.twee',
    r'overworld-town\loc-sea\events-bjx.twee',
    r'overworld-town\loc-sea\main-bjx.twee',
    r'overworld-plains\loc-moor\events-bjx.twee',
    r'overworld-plains\loc-moor\main-bjx.twee',
    r'overworld-plains\loc-farm\main-bjx.twee',
    r'overworld-plains\loc-farm\meadow-bjx.twee',
    r'overworld-plains\loc-farm\upgrades-bjx.twee',
    r'overworld-forest\loc-tentacle-world\main-bjx.twee',
    r'overworld-town\loc-bus-station\main-bjx.twee',
    r'overworld-town\loc-docks\main-bjx.twee',
    r'overworld-town\loc-home\code-bjx.twee',
    r'overworld-town\loc-home\main-bjx.twee',
    r'overworld-town\loc-hospital\main-bjx.twee',
    r'overworld-town\loc-hospital\parasite-removal-bjx.twee',
    r'overworld-town\loc-landfill\main-bjx.twee',
    r'overworld-town\loc-museum\main-bjx.twee',
    r'overworld-town\loc-school\maths-project-bjx.twee',
    r'overworld-town\loc-street\events-bjx.twee',
    r'overworld-town\loc-temple\main-bjx.twee',
    r'overworld-town\loc-temple\science-project-bjx.twee',
    r'overworld-town\loc-shop\petShop-bjx.twee',
    r'overworld-town\special-robin\main-bjx.twee',
    r'overworld-town\special-sydney\main-bjx.twee',
    r'overworld-town\special-sydney\temple-bjx.twee',
    r'overworld-town\special-whitney\main-bjx.twee',
    r'overworld-underground\loc-sewers\old-sewers-events-bjx.twee',
    r'overworld-forest\loc-lake\underwater-bjx.twee',
    r'overworld-forest\loc-churchyard\widgets-bjx.twee',
    r'overworld-plains\loc-bird\main-bjx.twee',
    r'base-combat\actions-tail-bjx.twee',
]

total_todo = 0
for f in batch3:
    p = os.path.join(BJX, f)
    if not os.path.exists(p):
        print('MISS', f)
        continue
    t = open(p, encoding='utf-8').read()
    names = re.findall(r'^:: (.+?)(?: \[.*)?$', t, re.M)
    done = [n for n in names if n in pack_passages]
    todo = [n for n in names if n not in pack_passages]
    total_todo += len(todo)
    status = 'DONE' if not todo else ('PARTIAL' if done else 'TODO')
    print(f'{status:8} {f}: {len(done)}done/{len(todo)}todo')
    if status == 'PARTIAL':
        print('    todo:', todo)
print('TOTAL TODO passages:', total_todo)