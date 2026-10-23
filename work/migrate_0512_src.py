# -*- coding: utf-8 -*-
"""从 0.5.12.13 的成品 HTML 还原出一份「genparts 能读」的源码树。

为什么要还原
------------
`work/genparts/*.py` 全部是「读 0.5 源码的某个 .twee 文件 → 抽 passage → 插锚点 →
写到 _verify_*」的范式，路径写死成 `refs/dol-0.5.10.12-target/game/<相对路径>`。
Lyra 包只给了成品 HTML（没有源码树），但 SugarCube 会把每个 passage 的**原始 twee
文本**塞进 `<tw-passagedata>`，所以可以逐 passage 取回来。

还原策略
--------
* 沿用 0.5.10.12 的**文件划分**（92% 的 passage 两版完全相同，文件归属自然继承）。
* 每个 passage 的正文换成 0.5.12.13 的；标签用 HTML 里的 `tags` 属性。
* 0.5.12.13 已删除的 passage 丢弃（12 个）。
* 0.5.12.13 新增、0.5.10.12 没有的 666 个统一写进 `_new/zz-0512-new.twee`
  （genparts 不会读它，但 build_pack 的覆盖度检查与人工查阅需要）。

输出：refs/dol-0.5.12.13-target/game/（镜像 0.5.10.12 的目录结构）
"""

import html
import os
import re
import sys

ROOT = r'C:\Users\79403\Desktop\dol'
SRC_HTML = os.path.join(ROOT, 'work', '_lyra_game.html')
OLD_TREE = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
NEW_TREE = os.path.join(ROOT, 'refs', 'dol-0.5.12.13-target', 'game')


def parse_html(path):
    """name -> (tags, body)"""
    s = open(path, encoding='utf-8', errors='ignore').read()
    out = {}
    for m in re.finditer(r'<tw-passagedata([^>]*)>(.*?)</tw-passagedata>', s, re.S):
        attrs, body = m.group(1), m.group(2)
        nm = re.search(r'name="([^"]*)"', attrs)
        if not nm:
            continue
        tg = re.search(r'tags="([^"]*)"', attrs)
        name = html.unescape(nm.group(1))
        out[name] = (html.unescape(tg.group(1)) if tg else '', html.unescape(body))
    return out


def split_passages(text):
    """[(name, tags, body)]，保留原顺序。"""
    out = []
    parts = re.split(r'(?m)^::\s+', text)
    for p in parts[1:]:
        head, _, body = p.partition('\n')
        name = head.split('[')[0].strip()
        tags = ''
        m = re.search(r'\[(.*)\]', head)
        if m:
            tags = m.group(1).strip()
        out.append((name, tags, body))
    return out


def main():
    new = parse_html(SRC_HTML)
    print('0.5.12.13 passage: %d' % len(new))

    used = set()
    files = 0
    dropped = 0
    total = 0

    for dp, _, fs in os.walk(OLD_TREE):
        for f in sorted(fs):
            if not f.endswith('.twee'):
                continue
            src = os.path.join(dp, f)
            rel = os.path.relpath(src, OLD_TREE)
            passages = split_passages(open(src, encoding='utf-8', errors='ignore').read())
            buf = []
            for name, tags, _body in passages:
                if name not in new:
                    dropped += 1
                    continue
                ntags, nbody = new[name]
                used.add(name)
                head = ':: ' + name + ((' [' + ntags + ']') if ntags else '')
                buf.append(head + '\n' + nbody)
                total += 1
            if not buf:
                continue
            dst = os.path.join(NEW_TREE, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            # 原版文件里 passage 之间是「空行分隔」(`...<</if>>\n\n:: Next`)，
            # 文件末尾也带一个空行。genparts 的大量锚点跨这个空行，必须还原。
            open(dst, 'w', encoding='utf-8', newline='\n').write('\n\n'.join(buf) + '\n\n')
            files += 1

    # 新增 passage
    extra = [(n, t, b) for n, (t, b) in new.items() if n not in used]
    if extra:
        dst = os.path.join(NEW_TREE, '_new', 'zz-0512-new.twee')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        buf = []
        for n, t, b in extra:
            buf.append(':: ' + n + ((' [' + t + ']') if t else '') + '\n' + b)
        open(dst, 'w', encoding='utf-8', newline='\n').write('\n\n'.join(buf) + '\n\n')

    print('写出 %d 个 twee 文件，passage %d 条' % (files, total))
    print('0.5.12.13 已删除而丢弃: %d' % dropped)
    print('0.5.12.13 新增: %d -> _new/zz-0512-new.twee' % len(extra))
    # 校验：旧版独有的 12 条不在新版里，不参与等式
    print('校验: %d(继承) + %d(新增) = %d，应等于 %d' % (
        total, len(extra), total + len(extra), len(new)))
    return 0 if total + len(extra) == len(new) else 1


if __name__ == '__main__':
    sys.exit(main())
