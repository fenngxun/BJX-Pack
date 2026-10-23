# -*- coding: utf-8 -*-
"""把 Lyra 美化图包（DoL 0.5.12.13 Lyra 1.0.1a）的 img/ 合并进本整合包。

背景
----
`DoL-0.5.12.13-Lyra-1.0.1a-besc-hikari-ucb-1004.1.zip` 是**整游戏**不是 mod，
美化本质就是 `img/` 整树替换。本包宿主是 0.5.10.12，所以只取 `img/`，其余
（HTML/README/存档等）一律不要。

合并策略
--------
* 只覆盖「目标里已存在同名路径」的文件（不区分大小写，Windows 文件系统特性）。
  → 宿主独有的 714 个文件（i.Candy 图标、猫咖 CG、mod 图）**原样保留**。
* Lyra 独有、宿主没有的 15,037 个文件**不复制**：那是 0.5.12.13 新内容的素材，
  0.5.10.12 不会引用，白占 60MB+。
* 备份是**写一次**的：`work/lyra_backup/` 里已存在的文件不会被 Lyra 覆盖，
  所以反复跑这个脚本也不会把原始图弄丢。回退 = 把 backup 里的 img/ 拷回去。

尺寸校验
--------
PNG/GIF/JPEG 都读真实尺寸并记录。与宿主比例不是 1×1 或 2×2 的会被**跳过**
（0.5.12.13 改过画布尺寸的那批，直接套进来会错位），清单见 report。

幂等：内容 sha256 相同就跳过写入。
"""

import hashlib
import json
import os
import shutil
import struct
import sys
import zipfile

ROOT = r'C:\Users\79403\Desktop\dol'
ZIP = os.path.join(ROOT, 'DoL-0.5.12.13-Lyra-1.0.1a-besc-hikari-ucb-1004.1.zip')
BACKUP = os.path.join(ROOT, 'work', 'lyra_backup')
MANIFEST = os.path.join(ROOT, 'work', 'lyra_manifest.json')
REPORT = os.path.join(ROOT, 'work', 'lyra_report.json')
TARGETS = [
    os.path.join(ROOT, 'game', 'DoL-ModLoader-0.5.10.12-v2.101.1-polyfill'),
    os.path.join(ROOT, 'bjx-整合包-1.3.0-开箱即玩'),
]
ALLOW_RATIOS = {(1.0, 1.0), (2.0, 2.0)}
# 只合并这些前缀（逗号分隔，环境变量 LYRA_DIRS 覆盖）。
# 默认只收 DOM 用的 1x 素材：img/misc（地点图/图标/横幅）、img/ui（界面元素）。
# 角色画布（img/body|hair|face|clothes|sex|bodywriting|transformations）**不能整树替换**：
# 0.5.12.13 把精灵图从「2 格/张」改成了「4 格/张」（每格 = 正常 + 特写），
# 0.5.10.12 的 renderer 按 image.width/2 取格，直接套 2x 素材会把特写头/手机框
# 一起画到角色右边。详见 HANDOFF §8.12。
DIRS = tuple(d.strip() for d in os.environ.get('LYRA_DIRS', 'img/misc,img/ui').split(',') if d.strip())


def dims(b):
    """(w, h) 或 None。支持 PNG / GIF / JPEG。"""
    if b[:8] == b'\x89PNG\r\n\x1a\n' and len(b) >= 24:
        return struct.unpack('>II', b[16:24])
    if b[:6] in (b'GIF87a', b'GIF89a') and len(b) >= 10:
        return struct.unpack('<HH', b[6:10])
    if b[:2] == b'\xff\xd8':
        i = 2
        while i < len(b) - 9:
            if b[i] != 0xFF:
                i += 1
                continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2, 0xC3):
                return struct.unpack('>HH', b[i + 5:i + 9])[::-1]
            seg = struct.unpack('>H', b[i + 2:i + 4])[0]
            i += 2 + seg
    return None


def sha(b):
    return hashlib.sha256(b).hexdigest()


def index_target(base):
    """小写相对路径 -> 实际相对路径"""
    out = {}
    for dp, _, fs in os.walk(os.path.join(base, 'img')):
        for f in fs:
            p = os.path.join(dp, f)
            rel = os.path.relpath(p, base).replace('\\', '/')
            out[rel.lower()] = rel
    return out


def main():
    if not os.path.exists(ZIP):
        print('缺少图包: ' + ZIP)
        return 1

    dev_idx = index_target(TARGETS[0])
    print('宿主 img 文件: %d' % len(dev_idx))

    replaced, same, skipped_dim, backup_kept = 0, 0, [], 0
    manifest = {}
    bytes_written = 0

    with zipfile.ZipFile(ZIP) as z:
        for name in z.namelist():
            if not name.startswith('img/') or name.endswith('/'):
                continue
            key = name.lower()
            if key not in dev_idx:
                continue                      # Lyra 独有：不复制
            if not name.startswith(DIRS):
                continue                      # 不在允许的目录里（角色画布默认排除）
            rel = dev_idx[key]
            data = z.read(name)
            ld = dims(data)
            host_path = os.path.join(TARGETS[0], rel.replace('/', os.sep))
            hb = open(host_path, 'rb').read()
            hd = dims(hb)
            if ld and hd:
                rx, ry = round(ld[0] / hd[0], 2), round(ld[1] / hd[1], 2)
                if (rx, ry) not in ALLOW_RATIOS:
                    skipped_dim.append({'path': rel, 'host': list(hd),
                                        'lyra': list(ld), 'ratio': [rx, ry]})
                    continue
            # 备份（写一次）
            bpath = os.path.join(BACKUP, rel.replace('/', os.sep))
            if not os.path.exists(bpath):
                os.makedirs(os.path.dirname(bpath), exist_ok=True)
                shutil.copyfile(host_path, bpath)
            else:
                backup_kept += 1
            manifest[rel] = {'host': sha(hb), 'host_dims': list(hd) if hd else None,
                             'lyra': sha(data), 'lyra_dims': list(ld) if ld else None}
            if sha(hb) == manifest[rel]['lyra']:
                same += 1
                continue
            for t in TARGETS:
                dst = os.path.join(t, rel.replace('/', os.sep))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                open(dst, 'wb').write(data)
            replaced += 1
            bytes_written += len(data)

    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    json.dump(manifest, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump({'replaced': replaced, 'already_same': same,
               'skipped_dim_mismatch': skipped_dim,
               'backup_existing': backup_kept},
              open(REPORT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print('覆盖 %d 个 / 内容相同跳过 %d 个 / 尺寸不符跳过 %d 个'
          % (replaced, same, len(skipped_dim)))
    print('写入 %.1f MB（dev + 发布包各一份）' % (bytes_written / 1048576))
    print('备份: ' + BACKUP)
    print('清单: ' + MANIFEST)
    if skipped_dim:
        print('尺寸不符样例:')
        for s in skipped_dim[:5]:
            print('  %-52s 宿主%s -> Lyra%s' % (
                s['path'][:52], 'x'.join(map(str, s['host'])),
                'x'.join(map(str, s['lyra']))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
