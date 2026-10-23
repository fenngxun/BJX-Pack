# -*- coding: utf-8 -*-
"""[已废弃] 早期占位图标生成器。

历史
----
i.Candy 原始 mod 包不带 img 资源，本项目先做了一套 128x128 的字母占位图应急。
后来确认作者在 GitHub 上单独发布过官方图包（`i Candy and Robot ImagePack`，
物品图 30x30、货架横幅 180x30），占位图因尺寸与内容都不对已被整体替换。

现在的正确做法
--------------
    python work/gen_icandy_missing_icons.py     # 仅补官方包缺的 7 张 30x30
    python work/sync_icandy_images.py           # 官方图包 + 补充图 -> dev / 发布包

本文件保留只是为了不打断旧文档里的命令，运行它会直接跳到上面两步。
"""
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    print('gen_icandy_item_icons.py 已废弃：占位图（128x128）不再使用。')
    print('改用官方图包（30x30 / 横幅 180x30），现在执行：')
    for script in ('gen_icandy_missing_icons.py', 'sync_icandy_images.py'):
        print('  ->', script)
        subprocess.check_call([sys.executable, os.path.join(HERE, script)])
    return 0


if __name__ == '__main__':
    sys.exit(main())
