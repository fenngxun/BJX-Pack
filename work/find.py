# -*- coding: utf-8 -*-
"""定位工具：一条命令从「我记得有个…」到「改这个文件的这一行」。

用法（在项目根或 work/ 下都行）：
    python work/find.py "Robin Raccoon"       # passage -> 产物 twee -> 生成器:行
    python work/find.py 依偎                  # 同上（中文 passage / 文本都可）
    python work/find.py --text 依偎            # 在源码里搜文本（跳过产物）
    python work/find.py --js bjxHunterGain     # inject_early.js 里的函数与调用点
    python work/find.py --file bjx-hunter      # 产物文件 -> 生产者
    python work/find.py --list                 # 列出全部生成器与产物
    python work/find.py --stat                 # 索引规模

索引来自 work/code-map.json（由 gen_code_map.py 生成）。找不到时自动降级为源码文本搜索。
"""
import json
import os
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

WORK = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(WORK)
MAP_PATH = os.path.join(WORK, 'code-map.json')

# 源码搜索时跳过的目录（产物 / 备份 / 工具链）
SKIP_DIRS = {'bjx-pack', '_verify_lake', 'lyra_backup', 'tools', '__pycache__',
             '_probe', '_tmp_icandy', 'shots', 'icandy_norm', 'icandy_extra_icons'}
SKIP_SUFFIX = ('.twee', '.log', '.png', '.zip', '.html', '.json')


def load_map():
    if not os.path.exists(MAP_PATH):
        # 索引是生成物（不入库）：首次使用自动补建，避免「工具在但索引没有」
        print('索引不存在，正在生成 work/code-map.json ...')
        import subprocess
        subprocess.run([sys.executable, os.path.join(WORK, 'gen_code_map.py')],
                       check=True, cwd=WORK)
    with open(MAP_PATH, encoding='utf-8') as f:
        return json.load(f)


def producers_of(m, twee):
    info = m['twee'].get(twee) or {}
    return info.get('producers') or []


def fmt_producer(p):
    loc = p['file'] if p.get('line', 0) <= 1 else '%s:%d' % (p['file'], p['line'])
    # genparts 的 name 就是文件名，别重复显示
    if p.get('kind') in ('build_pack', 'merge'):
        loc += ' `%s`' % p['name']
    return '%s  %s' % (loc, p['desc'])


def cmd_passage(m, kw):
    kw_l = kw.lower()
    hits = [(name, twees) for name, twees in m['passage_to_twee'].items()
            if kw_l in name.lower()]
    if not hits:
        # 自动降级：多半是搜的正文而不是 passage 名
        print('没有 passage 名命中 %r，改搜源码文本：\n' % kw)
        return cmd_text(kw)
    # 完全相等的排前面，其余按名字长度
    hits.sort(key=lambda x: (x[0].lower() != kw_l, len(x[0])))
    print('== passage 命中 %d 条（显示前 15）==' % len(hits))
    for name, twees in hits[:15]:
        print('\n:: %s' % name)
        for t in twees:
            print('   产物: work/bjx-pack/tweeFileList/%s' % t)
            ps = producers_of(m, t)
            if ps:
                for p in ps:
                    print('   改这里: %s' % fmt_producer(p))
            else:
                print('   改这里: **未解析到生产者**，用 --text 搜产物里的特征文本')
    if len(hits) > 15:
        print('\n...还有 %d 条，加更长的关键词缩小范围' % (len(hits) - 15))
    return 0


def iter_sources():
    for base, dirs, files in os.walk(WORK):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if fn.endswith(SKIP_SUFFIX) or fn.startswith('.'):
                continue
            if not fn.endswith(('.py', '.mjs', '.js', '.md')):
                continue
            yield os.path.join(base, fn)


def cmd_text(kw):
    print('== 源码文本命中 %r（已跳过产物目录）==' % kw)
    n = 0
    for path in iter_sources():
        try:
            text = open(path, encoding='utf-8', errors='ignore').read()
        except OSError:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if kw in line:
                n += 1
                if n <= 40:
                    rel = os.path.relpath(path, ROOT).replace('\\', '/')
                    print('  %s:%d  %s' % (rel, i, line.strip()[:110]))
    if n == 0:
        print('  无命中。若确信在产物里，用：rg --no-ignore "%s" work/bjx-pack/' % kw)
        return 1
    if n > 40:
        print('  ...共 %d 处，只显示前 40' % n)
    return 0


def cmd_js(kw):
    js_path = os.path.join(WORK, 'bjx-pack', 'scriptFileList_inject_early', 'inject_early.js')
    if not os.path.exists(js_path):
        print('inject_early.js 不存在')
        return 1
    text = open(js_path, encoding='utf-8', errors='ignore').read()
    lines = text.splitlines()
    print('== inject_early.js 命中 %r ==' % kw)
    n = 0
    for i, line in enumerate(lines, 1):
        if kw in line:
            n += 1
            if n <= 30:
                print('  %d: %s' % (i, line.strip()[:110]))
    if n == 0:
        print('  无命中')
        return 1
    print('  （%d 处；函数索引见 CODE-MAP.md §4）' % n)
    return 0


def cmd_file(kw):
    kw_l = kw.lower()
    hits = [fn for fn in m['twee'] if kw_l in fn.lower()]
    if not hits:
        print('没有产物文件名命中 %r' % kw)
        return 1
    print('== 产物文件命中 %d 个 ==' % len(hits))
    for fn in hits:
        info = m['twee'][fn]
        print('\nwork/bjx-pack/tweeFileList/%s  (%d passage)' % (fn, info['count']))
        ps = info['producers']
        if ps:
            for p in ps:
                print('   生产者: %s' % fmt_producer(p))
        else:
            print('   生产者: **未解析**')
        print('   passages: %s%s' % (', '.join(info['passages'][:6]),
                                     ' ...' if info['count'] > 6 else ''))
    return 0


def cmd_list():
    print('== 生成器 %d 个 ==' % len(m['generators']))
    for g in m['generators']:
        print('  genparts/%-26s -> %-30s %s'
              % (g['file'], ', '.join(g['outputs']) or '—', g['desc']))
    return 0


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 0
    if args[0] == '--stat':
        t = m['totals']
        print('twee=%d passage=%d generators=%d js_functions=%d  (索引时间 %s)'
              % (t['twee'], t['passages'], t['generators'], t['js_functions'], m['generated']))
        return 0
    if args[0] == '--list':
        return cmd_list()
    if args[0] == '--text':
        return cmd_text(' '.join(args[1:]))
    if args[0] == '--js':
        return cmd_js(' '.join(args[1:]))
    if args[0] == '--file':
        return cmd_file(' '.join(args[1:]))
    return cmd_passage(m, ' '.join(args))


if __name__ == '__main__':
    m = load_map()
    sys.exit(main())
