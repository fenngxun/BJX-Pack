# -*- coding: utf-8 -*-
"""把 i.Candy 官方图包同步到 dev / 发布包的 img/，替换掉早期的占位图。

来源
----
1. `refs/icandy-imagepack/`：emicoto/DOLMods 仓库 `i Candy and Robot ImagePack` v1.6.0
   （物品图标 30x30、货架横幅 180x30，是 mod 作者发布的正式素材）
2. `work/icandy_extra_icons/`：`gen_icandy_missing_icons.py` 补的 7 张官方缺图

为什么需要别名层
----------------
mod 与图包的命名有出入，运行时要的是 mod 的路径：
  * 收藏品 type 是 `collection`，图包放在 `gacha/`                 -> 复制一份
  * 物品 id 是 `cigarettes`，图包叫 `cigarette`                     -> 前缀改名
  * `mayonaise`(mod, 拼写错) / `mayonnaise`(图包)
  * `sandwichbread` / `sandwichBread`
  * 书包是 `schoolbag.jpg` 但内容其实是 PNG                         -> 改扩展名即可

幂等：每次全量覆盖目标文件，并清掉旧清单里多出来的占位图。
"""
import json
import os
import re
import shutil
import struct
import sys

import pngutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, 'refs', 'icandy-imagepack')
EXTRA = os.path.join(ROOT, 'work', 'icandy_extra_icons')
NORM = os.path.join(ROOT, 'work', 'icandy_norm')
OLD_MANIFEST = os.path.join(ROOT, 'work', 'icandy_placeholder_manifest.json')
NEW_MANIFEST = os.path.join(ROOT, 'work', 'icandy_image_manifest.json')
RUNTIME_PATHS = os.path.join(ROOT, 'work', 'icandy_item_paths.json')
TARGETS = [
    os.path.join(ROOT, 'game', 'DoL-ModLoader-0.5.10.12-v2.101.1-polyfill'),
    os.path.join(ROOT, 'game', 'DoL-ModLoader-0.5.12.13-lyra'),
    os.path.join(ROOT, 'bjx-整合包-1.3.0-开箱即玩'),
]
ICON = (30, 30)
BANNER = (180, 30)


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(33)
    if head[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    return struct.unpack('>II', head[16:24])


def walk(base, sub='img'):
    out = []
    root = os.path.join(base, sub.replace('/', os.sep))
    for dirpath, _, files in os.walk(root):
        for f in files:
            p = os.path.join(dirpath, f)
            out.append(os.path.relpath(p, base).replace('\\', '/'))
    return out


def build_plan():
    """返回 {相对路径: 源文件绝对路径}。"""
    plan = {}
    for rel in walk(PACK):
        plan[rel] = os.path.join(PACK, rel.replace('/', os.sep))

    # 别名层
    alias = {}

    for rel in list(plan):
        name = os.path.basename(rel)

        # 收藏品：gacha/ -> collection/
        if rel.startswith('img/items/gacha/'):
            alias['img/items/collection/' + name] = rel

        # 香烟：cigarette[_n] -> cigarettes[_n]
        if rel.startswith('img/items/consumable/'):
            m = re.match(r'^cigarette(_\d+)?\.png$', name)
            if m:
                alias['img/items/consumable/cigarettes%s.png' % (m.group(1) or '')] = rel

        # 拼写差异
        if rel == 'img/items/ingredients/mayonnaise.png':
            alias['img/items/ingredients/mayonaise.png'] = rel
        if rel == 'img/items/foods/sandwichBread.png':
            alias['img/items/foods/sandwichbread.png'] = rel

        # 书包：.jpg 其实是 PNG
        if rel.startswith('img/items/container/schoolbag') and rel.endswith('.jpg'):
            alias['img/items/container/%s.png' % name[:-4]] = rel

    for dst, src in alias.items():
        plan[dst] = plan[src]

    # 生成的补充图覆盖官方（官方没有这些路径）
    for rel in walk(EXTRA, 'img'):
        plan[rel] = os.path.join(EXTRA, rel.replace('/', os.sep))

    # 尺寸归一化：物品图必须 30x30、货架横幅 180x30
    for rel in list(plan):
        if not rel.endswith('.png'):
            continue
        target = BANNER if rel.endswith('_banner.png') else (ICON if rel.startswith('img/items/') else None)
        if not target:
            continue
        src = plan[rel]
        size = png_size(src)
        if size == target:
            continue
        dst = os.path.join(NORM, rel.replace('/', os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        _normalize(src, dst, target)
        plan[rel] = dst

    return plan


def _normalize(src, dst, target):
    """按左上角裁切 / 最近邻缩放，保持像素画锐利。"""
    tw, th = target
    w, h, rows = pngutil.read_png(src)
    if w >= tw and h >= th:
        rows = [r[:tw] for r in rows[:th]]
    else:
        rows = [[rows[min(h - 1, y * h // th)][min(w - 1, x * w // tw)] for x in range(tw)]
                for y in range(th)]
    pngutil.write_png(dst, rows, tw, th)


def main():
    plan = build_plan()
    print('源文件 %d 个' % len(plan))

    old = set()
    if os.path.exists(OLD_MANIFEST):
        old = set(json.load(open(OLD_MANIFEST, encoding='utf-8')))

    written, removed = 0, 0
    for base in TARGETS:
        if not os.path.isdir(base):
            print('  [skip] 目标不存在:', base)
            continue
        for rel, src in plan.items():
            dst = os.path.join(base, rel.replace('/', os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
            written += 1

        # 清掉旧占位图里多出来的文件（只动自己生成的，别碰宿主素材）
        for rel in sorted(old - set(plan)):
            dst = os.path.join(base, rel.replace('/', os.sep))
            if os.path.exists(dst):
                os.remove(dst)
                removed += 1
        for d in ('img/items/collection', 'img/items/consumable', 'img/items/drugs',
                  'img/items/foods', 'img/items/ingredients', 'img/items/container'):
            p = os.path.join(base, d.replace('/', os.sep))
            if os.path.isdir(p) and not os.listdir(p):
                os.rmdir(p)

    json.dump(sorted(plan), open(NEW_MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('写入 %d / 删除旧占位 %d' % (written, removed))

    # ---- 校验 ----
    ok = True
    bad_size = []
    for base in TARGETS[:1]:
        for rel in plan:
            p = os.path.join(base, rel.replace('/', os.sep))
            if not os.path.exists(p):
                print('  [MISS]', rel)
                ok = False
                continue
            if rel.startswith('img/items/') and rel.endswith('.png'):
                if png_size(p) != (30, 30):
                    bad_size.append((rel, png_size(p)))
        for rel in plan:
            if rel.endswith('_banner.png') and png_size(os.path.join(base, rel.replace('/', os.sep))) != (180, 30):
                bad_size.append((rel, png_size(os.path.join(base, rel.replace('/', os.sep)))))
    if bad_size:
        ok = False
        print('  尺寸异常 %d 个：' % len(bad_size))
        for r, s in bad_size[:10]:
            print('   ', r, s)

    # 运行时真正会请求的 169 条路径
    if os.path.exists(RUNTIME_PATHS):
        data = json.load(open(RUNTIME_PATHS, encoding='utf-8'))
        wanted = set()
        for it in data['list']:
            wanted.add(it['img'])
            for nd in it.get('stacksprites') or []:
                wanted.add('img/items/%s/%s_%d.png' % (it['type'], it['id'], nd))
            for dv in it.get('diff') or []:
                wanted.add('img/items/%s/%s_%s.png' % (it['type'], it['id'], dv))
        for pocket in data.get('pockets') or []:
            wanted.add('img/items/%s_none.png' % pocket)
        for shelf in data.get('shelves') or []:
            wanted.add('img/misc/%s_banner.png' % shelf)
        missing = sorted(wanted - set(plan))
        print('运行时路径 %d 条，覆盖 %d 条，缺 %d 条' % (len(wanted), len(wanted & set(plan)), len(missing)))
        for m in missing:
            print('  [RUNTIME MISS]', m)
        ok = ok and not missing

    print('结果:', 'OK' if ok else 'FAIL')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
