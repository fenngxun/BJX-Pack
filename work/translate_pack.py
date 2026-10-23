"""
把 ModI18N 官方汉化词典（TypeBInputStoryScript，按 passage 分组）烘焙进
bjx-pack 的 twee 源文件。

背景：bjx-pack 有一半 passage 是照着 0.4.3.3 英文原版逐字抄下来的（Moor Bird /
Bird Capture / Shopping Centre / ghost shop 等），这些 passage 在运行时被
ModI18N 跳过（汉化补丁只作用于原版数据，mod 覆盖后的同名 passage 仍显示英文），
所以玩家看到"只翻了一半"。

做法：按 passage 名取词典条目，长的先替换，逐字命中才替换（等价于官方补丁在
原版 passage 上做的事），只处理命中数 >= 阈值的条目，避免误伤代码。

用法：
    python translate_pack.py --report     # 只统计，不改文件
    python translate_pack.py              # 就地改写 tweeFileList/*.twee
"""
import json
import os
import re
import sys
import zipfile

ROOT = r'C:\Users\79403\Desktop\dol\work'
PACK = os.path.join(ROOT, 'bjx-pack', 'tweeFileList')
I18N = r'C:\Users\79403\Desktop\dol\game\DoL-ModLoader-0.5.10.12-v2.101.1-polyfill\ModI18N-0.5.10.12-chs-1.0.8a.mod.zip'
MIN_FROM = 12          # 太短的 from 容易误伤代码，跳过
MIN_PASSAGE_GAIN = 20  # 一个 passage 至少命中 20 条才认为值得处理


def load_dict():
    z = zipfile.ZipFile(I18N)
    arr = json.loads(z.read('i18n.json').decode('utf-8'))['typeB']['TypeBInputStoryScript']
    by_p = {}
    for e in arr:
        f, t, pn = e.get('f'), e.get('t'), e.get('pN')
        if not f or not t or not pn:
            continue
        if len(f) < MIN_FROM:
            continue
        by_p.setdefault(pn, []).append((f, t))
    for pn in by_p:
        by_p[pn].sort(key=lambda x: -len(x[0]))
    return by_p


def parse_twee(path):
    """返回 [(passage_name, header_rest, body)]，保持原文件顺序。"""
    s = open(path, encoding='utf-8').read()
    parts = re.split(r'(?m)^:: ', s)
    out = []
    for part in parts[1:]:
        nl = part.find('\n')
        if nl < 0:
            out.append((part.strip(), '', ''))
            continue
        header = part[:nl]
        body = part[nl + 1:]
        name = header.split(' [')[0].strip()
        out.append((name, header[len(name):], body))
    return s, out


def main():
    report_only = '--report' in sys.argv
    d = load_dict()
    cjk_re = re.compile(r'[\u4e00-\u9fff]')

    files = [f for f in sorted(os.listdir(PACK)) if f.endswith('.twee')]
    stat = {'passages': 0, 'english_passages': 0, 'touched_passages': 0,
            'replacements': 0, 'bytes_before': 0, 'bytes_after': 0}
    per_file = []

    for fn in files:
        path = os.path.join(PACK, fn)
        src, passages = parse_twee(path)
        changed = src
        new_parts = []
        head = src[:src.find(':: ')] if ':: ' in src else ''
        file_gain = 0
        for name, hdr_rest, body in passages:
            stat['passages'] += 1
            latin = len(re.findall(r'[A-Za-z]', body))
            if not cjk_re.search(body) and latin > 400:
                stat['english_passages'] += 1
            entries = d.get(name)
            newbody, hits = body, 0
            if entries:
                for f, t in entries:
                    if f in newbody:
                        newbody = newbody.replace(f, t)
                        hits += 1
            if hits >= MIN_PASSAGE_GAIN and newbody != body:
                stat['touched_passages'] += 1
                stat['replacements'] += hits
                file_gain += hits
            new_parts.append(':: ' + name + hdr_rest + '\n' + newbody)
        stat['bytes_before'] += len(src)
        if file_gain:
            out = head + ''.join(new_parts)
            stat['bytes_after'] += len(out)
            if not report_only:
                open(path, 'w', encoding='utf-8', newline='').write(out)
            per_file.append((fn, file_gain))

    per_file.sort(key=lambda x: -x[1])
    print(json.dumps(stat, ensure_ascii=False, indent=1))
    print('命中文件 top20:')
    for fn, g in per_file[:20]:
        print('  %-46s %d' % (fn, g))
    if report_only:
        print('（--report 模式，未写盘）')


if __name__ == '__main__':
    main()
