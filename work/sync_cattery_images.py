# -*- coding: utf-8 -*-
"""把「猫咖出租屋」(Cattery 1.1.8.2) mod 内的 img/ 同步到 dev 与发布包的 img/。

为什么必须同步
--------------
新版 `game/cafeFunction.js` 拼 CG 用的是：

    function loadImage(src) { const img = new Image(); img.src = src; ... }
    const basePath = "img/misc/cafeCG/" + pc_dir + "/";
    loadImage(basePath + "background.png") ...

也就是说走的是**普通 HTTP 相对路径**，不是 `modSC2DataManager.getHtmlTagSrcHook().requestImageBySrc()`
（旧版 `cafeFunction (old).js` 才走那个）。而 mod zip 里的图片在 polyfill 构建里不会落到磁盘，
所以 `img/misc/cafeCG/<场景>/<图层>.png` 全部 404，CG 只剩个空 div。

来源 / 目标
-----------
来源：`mod/Cattery1.1.8.2.for.dol0.5.10.adapted.mod.zip`（b2_adapt.py 的产物，实际进包的那个）
目标：dev `game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/img/`
      发布包 `bjx-整合包-1.3.0-开箱即玩/img/`

幂等：每次全量覆盖；结构断言不过直接报错退出。
改图不需要重注入 HTML（图片是静态文件，不进 mod zip、不进注入链）。
"""
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_ZIP = os.path.join(ROOT, 'mod', 'Cattery1.1.8.2.for.dol0.5.10.adapted.mod.zip')
TARGETS = [
    os.path.join(ROOT, 'game', 'DoL-ModLoader-0.5.10.12-v2.101.1-polyfill'),
    os.path.join(ROOT, 'game', 'DoL-ModLoader-0.5.12.13-lyra'),
    os.path.join(ROOT, 'bjx-整合包-1.3.0-开箱即玩'),
]
CG_ROOT = 'img/misc/cafeCG'
CG_LAYERS = ['background.png', 'body.png', 'left_eye.png', 'right_eye.png',
             'shirt.png', 'middle.png', 'long.png', 'short.png']
# cafeFunction.js 里 hairlength 取这三个之一
CG_SCENES = ['default', 'house', 'houseroom', 'kitchen', 'milkadd']


def main():
    if not os.path.exists(SRC_ZIP):
        print('缺少源包: ' + SRC_ZIP)
        return 1

    with zipfile.ZipFile(SRC_ZIP) as z:
        names = [n for n in z.namelist() if n.startswith('img/') and not n.endswith('/')]
        if not names:
            print('源包里没有 img/')
            return 1

        # 结构断言：5 个场景 × 8 个图层一个都不能少
        have = set(names)
        missing = []
        for scene in CG_SCENES:
            for layer in CG_LAYERS:
                p = CG_ROOT + '/' + scene + '/' + layer
                if p not in have:
                    missing.append(p)
        if missing:
            print('CG 图层缺失 %d 个:' % len(missing))
            for p in missing:
                print('  ' + p)
            return 1

        icons = [n for n in names if n.startswith('img/misc/icon/')]
        print('源包图片 %d 张（CG %d / 图标 %d / 其他 %d）'
              % (len(names), sum(1 for n in names if n.startswith(CG_ROOT)),
                 len(icons), len(names) - sum(1 for n in names if n.startswith('img/misc/'))))

        written = 0
        for target in TARGETS:
            if not os.path.isdir(target):
                print('跳过不存在的目标: ' + target)
                continue
            for name in names:
                dst = os.path.join(target, name.replace('/', os.sep))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with z.open(name) as f, open(dst, 'wb') as out:
                    out.write(f.read())
                written += 1
            print('已写入 %s: %d 个文件' % (os.path.basename(target), len(names)))

    print('总计写入 %d 个文件，幂等完成' % written)
    return 0


if __name__ == '__main__':
    sys.exit(main())
