# -*- coding: utf-8 -*-
"""把 BJX 自建服饰（蘑菇帽 / 触手套装）的立绘从星扩原版图片包补齐到 img/。

bjx-pack 的 inject_early.js 会往 setup.clothes 里注册 6 件 0.5.10.12 没有的
衣服（mushroom cap + 5 件 tentacle），但发布包的 img/ 里没有它们的图，进游戏
就会刷 `Failed to load image img/clothes/over-head/mushroom/full.png`。

星扩原版图片包（0.4.3.3 时代）里目录用下划线（over_head / under_lower /
under_upper），0.5.10.12 改成了连字符，所以复制时要改名。只补缺失文件，不覆盖。

用法：python sync_bjx_clothes_img.py
"""
import os
import shutil
import sys
import zipfile

ROOT = r'C:\Users\79403\Desktop\dol'
SRC = os.path.join(ROOT, 'Dol-BJX-Ex-main', '星扩官方指定模组包', '星扩原版图片包.zip')
TARGETS = [
    os.path.join(ROOT, 'game', 'DoL-ModLoader-0.5.10.12-v2.101.1-polyfill', 'img'),
    os.path.join(ROOT, 'bjx-整合包-1.3.0-开箱即玩', 'img'),
    os.path.join(ROOT, 'game', 'DoL-ModLoader-0.5.12.13-lyra', 'img'),
    os.path.join(ROOT, 'bjx-整合包-1.4.0-开箱即玩', 'img'),
]

# 只补 bjx-pack 真的注册了的衣服，别把 0.4.3.3 的整套图都灌进来
PREFIXES = [
    'img/clothes/over_head/mushroom/',
    'img/clothes/under_upper/tentacle/',
    'img/clothes/under_lower/tentacle/',
    'img/clothes/legs/tentacle/',
    'img/clothes/feet/tentacle/',
    'img/clothes/hands/tentacle/',
]

RENAME = {
    'over_head': 'over-head',
    'over_lower': 'over-lower',
    'over_upper': 'over-upper',
    'under_lower': 'under-lower',
    'under_upper': 'under-upper',
}


def map_path(name):
    parts = name.split('/')
    # img/clothes/<layer>/<item>/<file>
    if len(parts) >= 3 and parts[1] == 'clothes':
        parts[2] = RENAME.get(parts[2], parts[2])
    return '/'.join(parts)


def main():
    z = zipfile.ZipFile(SRC)
    entries = [n for n in z.namelist()
               if any(n.startswith(p) for p in PREFIXES) and not n.endswith('/')]
    print('候选图片:', len(entries))

    for img_root in TARGETS:
        copied = 0
        for name in entries:
            rel = map_path(name)
            if rel.startswith('img/'):
                rel = rel[4:]
            dst = os.path.join(img_root, rel.replace('/', os.sep))
            if os.path.exists(dst):
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(name) as f, open(dst, 'wb') as g:
                shutil.copyfileobj(f, g)
            copied += 1
        print('%s: 补了 %d 个文件' % (img_root, copied))

    # 校验
    for img_root in TARGETS:
        miss = [map_path(n) for n in entries
                if not os.path.exists(os.path.join(img_root, map_path(n)[4:].replace('/', os.sep)))]
        print('%s: 仍缺 %d %s' % (img_root, len(miss), miss[:3]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
