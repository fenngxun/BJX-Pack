# -*- coding: utf-8 -*-
"""极简 PNG 读写（仅 8bit / 非隔行 / 颜色类型 2,6），供 i.Candy 图片归一化用。"""
import struct
import zlib


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def read_png(path):
    """返回 (w, h, rows)，rows 为 [(r,g,b,a), ...] 的二维列表。"""
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path
    pos = 8
    w = h = bit = ctype = None
    idat = bytearray()
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + ln]
        if tag == b'IHDR':
            w, h, bit, ctype, _, _, inter = struct.unpack('>IIBBBBB', chunk)
            assert bit == 8 and inter == 0 and ctype in (2, 6), (path, bit, ctype, inter)
        elif tag == b'IDAT':
            idat += chunk
        elif tag == b'IEND':
            break
        pos += 12 + ln

    bpp = 4 if ctype == 6 else 3
    raw = zlib.decompress(bytes(idat))
    stride = w * bpp
    rows = []
    prev = bytearray(stride)
    i = 0
    for _ in range(h):
        ft = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        if ft == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 0xFF
        elif ft == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif ft == 3:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 0xFF
        elif ft == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                c = prev[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + _paeth(a, prev[x], c)) & 0xFF
        elif ft != 0:
            raise ValueError('filter %d' % ft)
        if bpp == 4:
            rows.append([tuple(line[k:k + 4]) for k in range(0, stride, 4)])
        else:
            rows.append([tuple(line[k:k + 3]) + (255,) for k in range(0, stride, 3)])
        prev = line
    return w, h, rows


def write_png(path, pixels, w=None, h=None):
    h = h or len(pixels)
    w = w or len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for px in row:
            raw.extend(px)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)


def alpha_bbox(rows):
    ys = [y for y, r in enumerate(rows) if any(px[3] for px in r)]
    if not ys:
        return None
    xs = [x for r in rows for x, px in enumerate(r) if px[3]]
    return min(xs), min(ys), max(xs), max(ys)


def fit_box(path, size=30):
    """裁掉透明边，再最近邻缩放到 size x size（像素画不糊）。"""
    w, h, rows = read_png(path)
    box = alpha_bbox(rows)
    if box:
        x0, y0, x1, y1 = box
        rows = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]]
        w, h = x1 - x0 + 1, y1 - y0 + 1
    if (w, h) == (size, size):
        write_png(path, rows, w, h)
        return ('crop', w, h)
    scaled = [[rows[min(h - 1, y * h // size)][min(w - 1, x * w // size)] for x in range(size)]
              for y in range(size)]
    write_png(path, scaled, size, size)
    return ('scale', w, h)
