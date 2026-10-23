# -*- coding: utf-8 -*-
"""把 PC 整合包 zip 和安卓 APK 伪装成普通 PNG 图片。

原理：PNG 解码器只读到 IEND chunk 就停止，IEND 之后追加的字节会被静默忽略。
所以「真实 PNG + 压缩包」拼起来的文件既是合法图片（双击能正常打开看内容），
尾部又藏着完整 payload。伪装文件名不带任何暗示。

用法：
    cd work && python disguise_pack.py            # 用默认载体与输入
    cd work && python disguise_pack.py --cover <png> --out <目录>

解包（任选其一）：
  1. 跑 work/disguise_pack.py --extract <伪装.png> <输出.zip>
  2. PowerShell:  $f=[IO.File]::OpenRead('x.png'); $f.Position=<offset>; ...
  3. 任何 16 进制编辑器，删掉文件前 <offset> 字节
"""
import argparse
import io
import os
import shutil
import struct
import sys
import time
import zipfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

WORK = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(WORK)

sys.path.insert(0, WORK)
from bjx_version import VERSION, DIST_DIR_NAME  # noqa: E402

DEFAULT_COVER = r'D:\Pictures\Camera Roll\6af4b6f367c3d2f3e3a3d904ed7de8aa705bea3e_PhotoGrid.png'
# 分发用文件名：手机 = 安卓 APK（zip 内嵌），电脑 = PC 整合包
# 安卓版 payload 是「zip(内含 apk + 安装说明)」——先打包再伪装，
# 这样两端都是 zip，改后缀后任何解压软件都能直接开。
PC_ZIP = os.path.join(ROOT, 'bjx-整合包-%s-开箱即玩.zip' % VERSION)
ANDROID_ZIP = os.path.join(ROOT, 'bjx-整合包-%s-安卓.zip' % VERSION)
ANDROID_APK = os.path.join(ROOT, 'bjx-整合包-%s-安卓.apk' % VERSION)
ANDROID_README = os.path.join(ROOT, 'bjx-整合包-%s-安卓-安装说明.txt' % VERSION)
TARGETS = [
    ('电脑.png', PC_ZIP),
    ('手机.png', ANDROID_ZIP),
]
CHUNK = 1 << 20


def make_android_zip():
    """把 apk + 安装说明打成 zip（APK 本身已压缩，用 STORED 避免二次压缩耗时）。"""
    if not os.path.exists(ANDROID_APK):
        raise SystemExit('缺 APK: %s（先跑 build_apk.py）' % ANDROID_APK)
    extras = [ANDROID_README] if os.path.exists(ANDROID_README) else []
    t0 = time.time()
    with zipfile.ZipFile(ANDROID_ZIP, 'w', zipfile.ZIP_STORED) as z:
        z.write(ANDROID_APK, os.path.basename(ANDROID_APK))
        for f in extras:
            z.write(f, os.path.basename(f))
    print('安卓 zip: %s (%.1f MB, %.1fs)'
          % (os.path.basename(ANDROID_ZIP), os.path.getsize(ANDROID_ZIP) / 1048576,
             time.time() - t0))


def png_payload_offset(path):
    """遍历 PNG chunk，返回 IEND 结束位置 = payload 起始偏移。"""
    with open(path, 'rb') as f:
        sig = f.read(8)
        if sig != b'\x89PNG\r\n\x1a\n':
            raise SystemExit('不是合法 PNG: %s' % path)
        pos = 8
        while True:
            head = f.read(8)
            if len(head) < 8:
                raise SystemExit('PNG 结构不完整（没读到 IEND）')
            length = struct.unpack('>I', head[:4])[0]
            ctype = head[4:8]
            pos += 8 + length + 4  # length + type + data + crc
            if ctype == b'IEND':
                return pos
            f.seek(pos)


def make(cover, out_name, payload):
    if not os.path.exists(cover):
        raise SystemExit('载体图不存在: %s' % cover)
    if not os.path.exists(payload):
        raise SystemExit('payload 不存在: %s' % payload)
    out = os.path.join(ROOT, out_name)
    offset = png_payload_offset(cover)

    t0 = time.time()
    with open(cover, 'rb') as f1, open(payload, 'rb') as f2, open(out, 'wb') as o:
        shutil.copyfileobj(f1, o, CHUNK)
        shutil.copyfileobj(f2, o, CHUNK)
    size = os.path.getsize(out)

    # 自校验：图头完好 + offset 处是 zip(PK) 或 apk(也是 PK) 头
    with open(out, 'rb') as f:
        head = f.read(8)
        f.seek(offset)
        magic = f.read(4)
    ok_png = head == b'\x89PNG\r\n\x1a\n'
    ok_magic = magic[:2] == b'PK'
    print('%-26s %8.1f MB  载体偏移 %d  图头%s  payload头%s  (%.1fs)'
          % (out_name, size / 1048576, offset, 'OK' if ok_png else 'BAD',
             'OK' if ok_magic else 'BAD', time.time() - t0))
    if not (ok_png and ok_magic):
        raise SystemExit('自校验失败: %s' % out_name)
    return out, offset


def extract(src, dst):
    offset = png_payload_offset(src)
    with open(src, 'rb') as f:
        f.seek(offset)
        with open(dst, 'wb') as o:
            shutil.copyfileobj(f, o, CHUNK)
    print('已解包: %s (%.1f MB, 跳过前 %d 字节)'
          % (dst, os.path.getsize(dst) / 1048576, offset))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cover', default=DEFAULT_COVER)
    ap.add_argument('--out', default=None, help='输出目录（默认项目根）')
    ap.add_argument('--extract', nargs=2, metavar=('SRC', 'DST'))
    a = ap.parse_args()

    if a.extract:
        extract(a.extract[0], a.extract[1])
        return

    print('载体: %s (%.1f MB)' % (a.cover, os.path.getsize(a.cover) / 1048576))
    if not os.path.exists(ANDROID_ZIP):
        make_android_zip()
    for name, payload in TARGETS:
        make(a.cover, name, payload)
    print('\n解包：把 .png 后缀改成 .zip，用 7-Zip / WinRAR / 360压缩 直接解开')
    print('      （Windows 资源管理器自带的解压不行，它要求 zip 头在文件开头）')


if __name__ == '__main__':
    main()
