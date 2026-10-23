"""
Inject ModI18N (Chinese translation) into a ModLoader HTML's
window.modDataValueZipList, appended as the LAST entry (so translation is
applied after bjx-pack and every other mod).

Usage:
    python inject_i18n.py                       # dev polyfill HTML (default)
    python inject_i18n.py <path to html>        # e.g. the 开箱即玩 dist HTML

Idempotent: skips if the exact ModI18N zip is already present.
NOTE: injecting into the dev polyfill HTML makes the English-text regression
(cdp_pack.mjs) assertions meaningless - use it on the dist copy.
"""
import base64
import io
import os
import sys
import zipfile

GAME = r'C:\Users\79403\Desktop\dol\game\DoL-ModLoader-0.5.10.12-v2.101.1-polyfill'
I18N = os.path.join(GAME, 'ModI18N-0.5.10.12-chs-1.0.8a.mod.zip')
HTML = os.path.join(GAME, 'Degrees of Lewdity.html')


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else HTML
    raw = open(I18N, 'rb').read()
    # sanity: it really is ModI18N
    zf = zipfile.ZipFile(io.BytesIO(raw))
    boot = zf.read('boot.json').decode('utf-8')
    assert '"name": "ModI18N"' in boot or '"name":"ModI18N"' in boot, 'not ModI18N zip'
    b64 = base64.b64encode(raw).decode('ascii')

    html = open(target, 'rb').read()
    marker = b'window.modDataValueZipList = ['
    pos = html.find(marker)
    assert pos > 0, 'marker not found in %s' % target
    end = html.find(b'];', pos)

    # idempotency: already injected?
    if ('"' + b64 + '"').encode('ascii') in html:
        print('ModI18N already injected in %s - nothing to do' % target)
        return 0

    inject = b',"' + b64.encode('ascii') + b'"'
    html = html[:end] + inject + html[end:]
    open(target, 'wb').write(html)
    print('injected ModI18N (%d bytes base64) -> %s now %d bytes' % (len(b64), target, len(html)))
    return 0


if __name__ == '__main__':
    main()
