"""
Adapt third-party patch mods for the 0.5.10.12-v2.101.1 polyfill host:
rewrite dependenceInfo to reference only mods that actually exist there.
Outputs <name>.adapted.mod.zip next to the originals in mod/.
"""
import io
import json
import os
import zipfile

MODDIR = r'C:\Users\79403\Desktop\dol\mod'

# original zip -> adapted name; dependenceInfo replacement
ADAPTATIONS = {
    'NoAutoReBuyTrash.mod.zip': {
        'out': 'NoAutoReBuyTrash.adapted.mod.zip',
        'dependenceInfo': [
            {'modName': 'TweeReplacer', 'version': '>=1.0.0'},
        ],
    },
    'Eden.Fence.Rescue.Fixed.mod.zip': {
        'out': 'Eden.Fence.Rescue.adapted.mod.zip',
        'dependenceInfo': [
            {'modName': 'TweeReplacer', 'version': '>=1.0.0'},
        ],
    },
}


def adapt(src, out, dep_info):
    with zipfile.ZipFile(src) as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}
    boot = json.loads(data['boot.json'].decode('utf-8'))
    old = json.dumps(boot.get('dependenceInfo'), ensure_ascii=False)
    boot['dependenceInfo'] = dep_info
    data['boot.json'] = json.dumps(boot, ensure_ascii=False, indent=1).encode('utf-8')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, data[n])
    blob = buf.getvalue()
    with open(out, 'wb') as f:
        f.write(blob)
    print('%s -> %s (%d bytes)' % (os.path.basename(src), os.path.basename(out), len(blob)))
    print('  dependenceInfo: %s' % old)
    print('               -> %s' % json.dumps(dep_info))


def main():
    for rel, cfg in ADAPTATIONS.items():
        src = os.path.join(MODDIR, rel)
        out = os.path.join(MODDIR, cfg['out'])
        adapt(src, out, cfg['dependenceInfo'])


if __name__ == '__main__':
    main()