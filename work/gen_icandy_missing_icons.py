# -*- coding: utf-8 -*-
"""生成 i.Candy 官方图包缺失的 7 张 30x30 物品图标。

背景
----
`refs/icandy-imagepack/` 是 emicoto/DOLMods 仓库的官方图包
（`i Candy and Robot ImagePack` v1.6.0，物品图统一 30x30、货架横幅 180x30）。
官方包仍缺 7 条本版本 mod 会引用的路径：

    img/items/consumable/spray.png      防狼喷雾
    img/items/drugs/fizzy.png           菲仔（跳跳糖状毒品）
    img/items/drugs/ketamine.png        K粉
    img/items/ingredients/salt.png      盐
    img/items/ingredients/soysauce.png  酱油
    img/items/body_none.png             身体槽空位
    img/items/hole_none.png             洞穴槽空位

本脚本用纯 Python（无 PIL）按 30x30 手绘生成，写入 `work/icandy_extra_icons/`，
再由 `sync_icandy_images.py` 与官方图包合并投放到 dev / 发布包 img/。
风格对齐官方：透明底、深色描边、2~3 阶明暗。
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icandy_extra_icons')
W = H = 30


# ---------------------------------------------------------------- PNG 写入
def write_png(path, pixels, w=W, h=H):
    """pixels: 30x30 的 (r,g,b,a) 二维列表。"""
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0
        for px in row:
            raw.extend(px)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(png)


# ---------------------------------------------------------------- 画布
class Canvas:
    def __init__(self):
        self.p = [[(0, 0, 0, 0)] * W for _ in range(H)]

    def put(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            r, g, b, a = c
            if a >= 255:
                self.p[y][x] = (r, g, b, 255)
                return
            br, bg, bb, ba = self.p[y][x]
            na = a / 255.0
            oa = na + ba / 255.0 * (1 - na)
            if oa <= 0:
                self.p[y][x] = (0, 0, 0, 0)
                return
            self.p[y][x] = (
                int((r * na + br * (ba / 255.0) * (1 - na)) / oa),
                int((g * na + bg * (ba / 255.0) * (1 - na)) / oa),
                int((b * na + bb * (ba / 255.0) * (1 - na)) / oa),
                int(oa * 255),
            )

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def hline(self, x0, x1, y, c):
        for x in range(x0, x1 + 1):
            self.put(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(y0, y1 + 1):
            self.put(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                dx = (x - cx) / max(rx, 0.001)
                dy = (y - cy) / max(ry, 0.001)
                if dx * dx + dy * dy <= 1.0:
                    self.put(x, y, c)

    def ring(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                dx = (x - cx) / max(rx, 0.001)
                dy = (y - cy) / max(ry, 0.001)
                d = dx * dx + dy * dy
                if 0.62 <= d <= 1.0:
                    self.put(x, y, c)

    def erase(self, x, y):
        if 0 <= x < W and 0 <= y < H:
            self.p[y][x] = (0, 0, 0, 0)

    def save(self, rel):
        write_png(os.path.join(OUT, rel.replace('/', os.sep)), self.p)
        return rel, self


# ---------------------------------------------------------------- 调色板
INK = (44, 40, 46, 255)
STEEL = (168, 176, 184, 255)
STEEL_D = (108, 116, 124, 255)
GLASS = (214, 232, 240, 210)
WHITE = (250, 250, 250, 255)
PAPER = (236, 228, 210, 255)
RED = (186, 54, 58, 255)
RED_D = (134, 34, 38, 255)
BROWN = (92, 54, 28, 255)
BROWN_D = (58, 32, 16, 255)
GRAY = (168, 168, 174, 255)


def icon_salt():
    c = Canvas()
    # 罐身（玻璃）
    for y in range(11, 28):
        inset = 0 if y < 24 else 1
        c.rect(8 + inset, y, 21 - inset, y, GLASS)
    c.rect(8, 11, 8, 26, (176, 200, 212, 235))
    c.rect(21, 11, 21, 26, (176, 200, 212, 235))
    # 内部盐粒
    c.rect(10, 15, 19, 26, WHITE)
    c.hline(10, 19, 15, (226, 232, 236, 255))
    # 罐身描边
    c.vline(7, 12, 27, INK)
    c.vline(22, 12, 27, INK)
    c.hline(7, 22, 27, INK)
    c.hline(8, 21, 11, INK)
    # 金属盖
    c.rect(10, 4, 19, 10, STEEL)
    c.hline(10, 19, 4, (206, 212, 218, 255))
    c.hline(10, 19, 10, STEEL_D)
    c.vline(9, 5, 10, INK)
    c.vline(20, 5, 10, INK)
    c.hline(9, 20, 3, INK)
    # 盖孔
    for x in (12, 15, 18):
        c.put(x, 6, INK)
        c.put(x, 7, (70, 70, 76, 255))
    return c.save('img/items/ingredients/salt.png')


def icon_soysauce():
    c = Canvas()
    # 瓶身
    c.rect(8, 12, 21, 27, BROWN)
    c.rect(8, 12, 9, 27, BROWN_D)
    c.rect(19, 12, 21, 27, (120, 74, 40, 255))
    c.vline(18, 13, 26, (140, 90, 50, 255))
    # 肩部
    for i, y in enumerate(range(9, 12)):
        c.rect(10 + i, y, 19 - i, y, BROWN)
    # 瓶颈
    c.rect(12, 6, 17, 8, BROWN_D)
    # 瓶盖
    c.rect(11, 3, 18, 5, RED)
    c.hline(11, 18, 3, (214, 88, 88, 255))
    # 标签
    c.rect(10, 16, 19, 22, PAPER)
    c.rect(11, 18, 18, 19, (150, 40, 40, 255))
    c.put(13, 20, (90, 70, 50, 255))
    c.put(15, 20, (90, 70, 50, 255))
    # 描边
    c.hline(11, 18, 2, INK)
    c.vline(10, 3, 5, INK)
    c.vline(19, 3, 5, INK)
    c.vline(11, 6, 8, INK)
    c.vline(18, 6, 8, INK)
    c.vline(7, 13, 28, INK)
    c.vline(22, 13, 28, INK)
    c.hline(7, 22, 28, INK)
    c.hline(8, 21, 11, INK)
    return c.save('img/items/ingredients/soysauce.png')


def icon_spray():
    c = Canvas()
    # 罐体
    c.rect(9, 12, 19, 27, RED)
    c.rect(9, 12, 10, 27, RED_D)
    c.rect(17, 12, 19, 27, (214, 78, 82, 255))
    # 白色标签环
    c.rect(9, 17, 19, 20, (240, 240, 244, 255))
    # 罐口
    c.rect(11, 9, 17, 12, STEEL)
    c.hline(11, 17, 9, (206, 210, 216, 255))
    # 喷头
    c.rect(13, 6, 18, 8, (226, 230, 234, 255))
    c.rect(18, 6, 20, 7, (196, 200, 206, 255))
    # 喷雾
    c.put(22, 4, (200, 230, 240, 190))
    c.put(23, 6, (200, 230, 240, 170))
    c.put(24, 3, (200, 230, 240, 150))
    c.put(25, 8, (200, 230, 240, 140))
    c.put(22, 8, (200, 230, 240, 150))
    # 描边
    c.hline(13, 19, 5, INK)
    c.vline(12, 6, 8, INK)
    c.vline(11, 9, 11, INK)
    c.vline(17, 9, 11, INK)
    c.hline(11, 17, 9, INK)
    c.vline(8, 12, 27, INK)
    c.vline(20, 12, 27, INK)
    c.hline(8, 20, 27, INK)
    c.hline(9, 19, 12, INK)
    return c.save('img/items/consumable/spray.png')


def icon_ketamine():
    c = Canvas()
    bag = (232, 240, 246, 190)
    # 袋体
    c.rect(7, 9, 22, 26, bag)
    # 封口
    c.rect(7, 6, 22, 9, (244, 248, 252, 220))
    c.hline(7, 22, 7, (170, 184, 196, 255))
    # 白色粉末
    c.rect(8, 20, 21, 25, WHITE)
    for x, y in ((9, 19), (13, 18), (17, 19), (20, 19), (11, 19)):
        c.put(x, y, (250, 250, 252, 255))
    # 折痕高光
    c.vline(10, 9, 18, (255, 255, 255, 120))
    # 描边
    c.rect(7, 6, 22, 6, (140, 152, 164, 255))
    c.vline(6, 6, 27, (120, 132, 144, 255))
    c.vline(23, 6, 27, (120, 132, 144, 255))
    c.hline(6, 23, 27, (120, 132, 144, 255))
    # 封口缺口
    c.hline(13, 16, 5, (168, 182, 194, 255))
    c.vline(13, 5, 6, (168, 182, 194, 255))
    c.vline(16, 5, 6, (168, 182, 194, 255))
    return c.save('img/items/drugs/ketamine.png')


def icon_fizzy():
    c = Canvas()
    # 小袋
    c.rect(7, 8, 22, 26, (238, 240, 244, 255))
    c.rect(7, 8, 22, 11, (206, 212, 220, 255))
    # 彩色糖豆
    c.ellipse(12, 17, 2.6, 2.2, (232, 96, 140, 255))
    c.ellipse(18, 17, 2.6, 2.2, (240, 170, 60, 255))
    c.ellipse(15, 22, 2.6, 2.2, (120, 200, 120, 255))
    c.put(11, 16, (255, 190, 210, 255))
    c.put(17, 16, (255, 220, 160, 255))
    c.put(14, 21, (200, 245, 200, 255))
    # 顶部锯齿封口
    for x in range(7, 23, 2):
        c.put(x, 7, (150, 158, 168, 255))
    # 描边
    c.vline(6, 8, 27, INK)
    c.vline(23, 8, 27, INK)
    c.hline(6, 23, 27, INK)
    c.hline(6, 23, 8, INK)
    return c.save('img/items/drugs/fizzy.png')


def icon_body_none():
    c = Canvas()
    # 身体轮廓（灰线稿，对齐 bag_none 的空位画法）
    c.ellipse(15, 6, 3.4, 3.4, GRAY)
    c.erase(15, 6)
    # 头挖空
    for y in range(4, 9):
        for x in range(12, 19):
            if (x - 15) ** 2 + (y - 6) ** 2 < 5.5:
                c.erase(x, y)
    # 躯干轮廓
    c.vline(11, 11, 21, GRAY)
    c.vline(19, 11, 21, GRAY)
    c.hline(11, 19, 10, GRAY)
    c.hline(11, 19, 21, GRAY)
    # 手臂
    c.vline(8, 12, 20, GRAY)
    c.vline(22, 12, 20, GRAY)
    c.hline(8, 11, 11, GRAY)
    c.hline(19, 22, 11, GRAY)
    # 腿
    c.vline(12, 22, 27, GRAY)
    c.vline(18, 22, 27, GRAY)
    return c.save('img/items/body_none.png')


def icon_hole_none():
    import math
    c = Canvas()
    # 空位：虚线圈 + 内圈
    for i in range(0, 360, 12):
        a = math.radians(i)
        x = int(round(15 + 10.0 * math.cos(a)))
        y = int(round(15 + 10.0 * math.sin(a)))
        c.put(x, y, GRAY)
        c.put(x + (1 if math.cos(a) > 0 else -1), y, GRAY) if i % 24 == 0 else None
    c.ring(15, 15, 6.5, 6.5, (128, 128, 134, 255))
    c.ellipse(15, 15, 3.6, 3.6, (58, 56, 62, 255))
    return c.save('img/items/hole_none.png')


def main():
    import sys
    made = [
        icon_salt(), icon_soysauce(), icon_spray(), icon_ketamine(),
        icon_fizzy(), icon_body_none(), icon_hole_none(),
    ]
    print('generated %d missing icons -> %s' % (len(made), OUT))
    for rel, _ in made:
        print('  ', rel)

    if '--preview' in sys.argv:
        zoom, pad, bg = 6, 6, (26, 26, 30, 255)
        cols = len(made)
        cw = W * zoom + pad
        ch = H * zoom + pad
        Wp, Hp = cols * cw + pad, ch + pad
        sheet = [[bg] * Wp for _ in range(Hp)]
        for i, (_, cv) in enumerate(made):
            ox = pad + i * cw
            for y in range(H * zoom):
                for x in range(W * zoom):
                    px = cv.p[y // zoom][x // zoom]
                    if px[3] == 0:
                        continue
                    r, g, b, a = px
                    na = a / 255.0
                    sr, sg, sb = sheet[pad + y][ox + x][:3]
                    sheet[pad + y][ox + x] = (
                        int(r * na + sr * (1 - na)),
                        int(g * na + sg * (1 - na)),
                        int(b * na + sb * (1 - na)),
                        255,
                    )
        write_png(os.path.join(OUT, '_preview.png'), sheet, Wp, Hp)
        print('preview ->', os.path.join(OUT, '_preview.png'))


if __name__ == '__main__':
    main()
