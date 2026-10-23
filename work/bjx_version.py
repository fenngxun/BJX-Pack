# -*- coding: utf-8 -*-
"""单一版本号真相源。

改版本只改这里，或临时 `set BJX_VERSION=1.5.0`。
所有脚本（build_pack / update_mod_inject / make_dist / make_zip）的
产物路径与 boot.json 版本号都从这里派生，避免「默认路径停在旧版本、
直接跑脚本就打出旧包」的历史问题（2026-10-23 代码审查 P0-2）。
"""
import os

VERSION = os.environ.get('BJX_VERSION', '1.4.0')

# 发布目录名：bjx-整合包-<版本>-开箱即玩
DIST_DIR_NAME = 'bjx-整合包-%s-开箱即玩' % VERSION
