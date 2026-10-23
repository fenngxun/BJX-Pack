"""把「开箱即玩」目录打成发布 zip（幂等，覆盖旧的同名 zip）。

目录结构：Degrees of Lewdity.html + 使用说明.txt + img/ + modList.json
zip 内保持同样的根层级（解压即得一个文件夹内容）。
"""
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bjx_version import VERSION, DIST_DIR_NAME  # noqa: E402  单一版本号真相源

ROOT = r'C:\Users\79403\Desktop\dol'
SRC = os.environ.get('DOL_DIST_SRC', os.path.join(ROOT, DIST_DIR_NAME))
OUT = SRC + '.zip'


def main():
    # 2026-10-23 代码审查 P0-2：默认路径曾停在 1.3.0，直接跑会静默重打旧目录。
    assert os.path.isdir(SRC), '发布目录不存在：%s（版本 %s，可用 DOL_DIST_SRC 指定）' % (SRC, VERSION)
    assert os.path.exists(os.path.join(SRC, 'Degrees of Lewdity.html')), \
        '发布目录里没有 Degrees of Lewdity.html：%s' % SRC
    if DIST_DIR_NAME not in os.path.basename(SRC.rstrip('/\\')):
        print('!! 警告：目录名与版本号 %s 不匹配：%s' % (VERSION, os.path.basename(SRC)))
    files = []
    for base, _dirs, names in os.walk(SRC):
        for n in names:
            if n.endswith('.bak') or n.endswith('.tmp'):
                continue
            full = os.path.join(base, n)
            files.append((full, os.path.relpath(full, SRC).replace(os.sep, '/')))
    files.sort(key=lambda x: (x[1] != 'Degrees of Lewdity.html', x[1]))
    total = sum(os.path.getsize(f) for f, _ in files)
    print('打包 %d 个文件，原始 %.1f MB' % (len(files), total / 1048576))

    tmp = OUT + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for i, (full, rel) in enumerate(files, 1):
            z.write(full, rel)
            if i % 2000 == 0:
                print('  ... %d/%d' % (i, len(files)))
    os.replace(tmp, OUT)
    print('写出 %s（%.1f MB）' % (OUT, os.path.getsize(OUT) / 1048576))


if __name__ == '__main__':
    main()
