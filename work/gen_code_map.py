# -*- coding: utf-8 -*-
"""生成代码地图：把「产物 twee -> 生产者（脚本:行）-> passage」串起来。

背景（2026-10-23）：改代码时大量时间花在「找东西」上。根因三条：
  1. 产物（work/bjx-pack/tweeFileList/*.twee、genparts/_verify_*）和源码同树，
     grep 一半命中是产物，噪音比约 3:1；
  2. 没有 passage -> 生成器的反查表，改一个 passage 要先 grep 产物再猜生成器；
  3. build_pack.py 2782 行内联了 20 个 gen_* 函数，函数名不总等于产物名。

本脚本解析 build_pack.py 的 AST + genparts 脚本的 OUT_NAME 常量，
生成：
  work/CODE-MAP.md     人读速查（模块表 / 任务表 / JS 函数索引）
  work/code-map.json   机器读全量索引（passage -> file -> producer）

幂等、只读源码、约 1 秒。构建后重跑一次即可：
    cd work && python gen_code_map.py
"""
import ast
import json
import os
import re
import sys
import io
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

WORK = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(WORK)
TWE = os.path.join(WORK, 'bjx-pack', 'tweeFileList')
BUILD = os.path.join(WORK, 'build_pack.py')
GEN = os.path.join(WORK, 'genparts')
INJECT = os.path.join(WORK, 'bjx-pack', 'scriptFileList_inject_early', 'inject_early.js')

TWE_RE = re.compile(r"['\"]([\w\-\.]+\.twee)['\"]")


def docline(text):
    """模块/函数 docstring 首行，压成一行。"""
    return ' '.join((text or '').strip().split('\n')[0].split())[:90]


def read(path):
    return open(path, encoding='utf-8', errors='ignore').read()


# ---------------------------------------------------------------- 产物 passage
# 先解析产物，后面解析生产者时用它校验「候选名 / bjx- 前缀别名」是否真存在。
passages = {}
if os.path.isdir(TWE):
    for fn in sorted(os.listdir(TWE)):
        if not fn.endswith('.twee'):
            continue
        names = []
        for m in re.finditer(r'^::\s*(.+?)\s*(?:\[.*\])?\s*$', read(os.path.join(TWE, fn)), re.M):
            n = m.group(1).strip()
            if n and not n.startswith('/*'):
                names.append(n)
        passages[fn] = names


# ---------------------------------------------------------------- 生产者解析

producers = {}  # twee 文件名 -> [{kind, name, file, line, desc}]


def add_producer(twee, kind, name, path, line, desc):
    entry = {
        'kind': kind, 'name': name,
        'file': os.path.relpath(path, ROOT).replace('\\', '/'),
        'line': line, 'desc': desc,
    }
    bucket = producers.setdefault(twee, [])
    key = (entry['kind'], entry['file'], entry['name'])
    if any((e['kind'], e['file'], e['name']) == key for e in bucket):
        return  # 别名机制（裸名 / bjx- 前缀）会命中同一个生产者，去重
    bucket.append(entry)


# 1. build_pack.py：内联 gen_* 函数 + main 里的 merge 调用
src = read(BUILD)
tree = ast.parse(src)
lines = src.splitlines()

for node in tree.body:
    if not isinstance(node, ast.FunctionDef):
        continue
    seg = ast.get_source_segment(src, node) or ''
    desc = docline(ast.get_docstring(node))
    # write(os.path.join(TWE, 'x.twee'), ...)
    for m in re.finditer(
            r"write\(\s*os\.path\.join\(\s*TWE\s*,\s*['\"]([\w\-\.]+\.twee)['\"]", seg):
        add_producer(m.group(1), 'build_pack', node.name, BUILD,
                     node.lineno + seg[:m.start()].count('\n'), desc)
    # merge([...], 'x.twee') —— main 里的 merge 是「合并 BJX 源码」，
    # gen_* 函数内部的 merge 只是它自己写产物的一种手段，职责仍用函数 docstring。
    for m in re.finditer(r"\bmerge\(\s*\[.*?\]\s*,\s*['\"]([\w\-\.]+\.twee)['\"]",
                         seg, re.S):
        add_producer(m.group(1), 'merge', node.name, BUILD,
                     node.lineno + seg[:m.start()].count('\n'),
                     desc or 'merge BJX 源码文件（变量翻译后）')

# 2. genparts/gen_*.py：OUT_NAME 常量（+ 脚本内出现的其它 .twee 字面量作候选）
gen_scripts = []
for fn in sorted(os.listdir(GEN)):
    if not (fn.startswith('gen_') and fn.endswith('.py')):
        continue
    path = os.path.join(GEN, fn)
    text = read(path)
    try:
        gtree = ast.parse(text)
        desc = docline(ast.get_docstring(gtree))
    except SyntaxError:
        desc = ''
    m = re.search(r"OUT_NAME\s*=\s*['\"]([\w\-\.]+\.twee)['\"]", text)
    names = [m.group(1)] if m else []
    if not names:
        # 无 OUT_NAME：退化为脚本里所有 .twee 字面量（可能是多产物脚本）
        names = sorted(set(TWE_RE.findall(text)))
    gen_scripts.append({'file': fn, 'desc': desc, 'outputs': names})
    for n in names:
        # 有些脚本（如 gen_chimera 的 FILES 列表）写裸名、产物带 bjx- 前缀，
        # 两个都注册，只保留真正存在的那个。
        for cand in (n, 'bjx-' + n):
            if cand in passages:
                add_producer(cand, 'genparts', fn, path, 1, desc)

# 3. ant-island 直接拷贝（历史已移植，没有生成脚本 —— 这是「找不到来源」的典型，
#    必须显式标注，否则会被误判成「无主产物」）
ANT = os.path.join(WORK, 'bjx-ant-island', 'tweeFileList')
if os.path.isdir(ANT):
    for fn in sorted(os.listdir(ANT)):
        if fn.endswith('.twee'):
            add_producer(fn, 'ant-island', 'copyfile', ANT, 0,
                         '从 bjx-ant-island 直接拷贝（历史已移植，改它改这里）')

# 4. make_museum_mod.py（build_pack 第 1b 步 subprocess 调用）
MUSEUM = os.path.join(WORK, 'make_museum_mod.py')
if os.path.exists(MUSEUM):
    for fn in ('bjx-museum-antiques.twee', 'bjx-museum-widgets.twee', 'bjx-museum-talk.twee'):
        add_producer(fn, 'subprocess', 'make_museum_mod.py', MUSEUM, 1,
                     '19 件古董（含 bunker/bog/scroll/mushroom）')

# ---------------------------------------------------------------- inject_early.js

js_funcs = []
if os.path.exists(INJECT):
    js = read(INJECT)
    js_lines = js.splitlines()
    for m in re.finditer(r'^\s*(?:async\s+)?function\s+(\w+)\s*\(', js, re.M):
        ln = js[:m.start()].count('\n')
        # 往上找最多 3 行注释
        comment = ''
        for k in range(ln - 1, max(ln - 4, -1), -1):
            s = js_lines[k].strip()
            if s.startswith('//'):
                comment = s.lstrip('/ ').strip() + ' ' + comment
            elif s:
                break
        js_funcs.append({'name': m.group(1), 'line': ln + 1,
                         'comment': comment.strip()[:100]})

# ---------------------------------------------------------------- 写 JSON

twee_index = {}
# 构建执行顺序：ant-island 拷贝(1) -> museum(1b) -> build_pack 内联/merge(2x) -> genparts(2k)。
# 同一产物有多个生产者时，最后执行的那个才是生效者（覆盖前面的）。
ORDER = {'ant-island': 0, 'subprocess': 1, 'build_pack': 2, 'merge': 3, 'genparts': 4}
for fn, names in passages.items():
    ps = sorted(producers.get(fn, []), key=lambda p: ORDER.get(p['kind'], 9))
    twee_index[fn] = {
        'passages': names,
        'count': len(names),
        'producers': ps,
    }

passage_index = {}
for fn, names in passages.items():
    for n in names:
        passage_index.setdefault(n, []).append(fn)

out = {
    'generated': time.strftime('%Y-%m-%d %H:%M:%S'),
    'totals': {
        'twee': len(passages),
        'passages': sum(len(v) for v in passages.values()),
        'generators': len(gen_scripts),
        'js_functions': len(js_funcs),
    },
    'twee': twee_index,
    'passage_to_twee': passage_index,
    'generators': gen_scripts,
    'js_functions': js_funcs,
}
json_path = os.path.join(WORK, 'code-map.json')
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- 写 Markdown

# 未映射产物：有 passage 但没有解析到生产者（需人工确认）
unmapped = [fn for fn in passages if fn not in producers]

rows = []
for fn, info in sorted(twee_index.items()):
    ps = info['producers']
    if ps:
        def _fmt(p):
            loc = p['file'] if p['line'] <= 1 else '%s:%d' % (p['file'], p['line'])
            # genparts 的 name 就是文件名，别重复显示
            if p['kind'] in ('build_pack', 'merge'):
                loc += ' `%s`' % p['name']
            return loc
        where = '<br>'.join(_fmt(p) for p in ps)
        desc = ps[-1]['desc']
    else:
        where = '**未解析到生产者**'
        desc = ''
    rows.append('| `%s` | %d | %s | %s |' % (fn, info['count'], where, desc.replace('|', '/')))

md = []
md.append('# 代码地图（自动生成，勿手改）\n')
md.append('> 由 `work/gen_code_map.py` 生成于 **%s**。构建后重跑一次：`cd work && python gen_code_map.py`。\n'
          '> 全量索引在 `work/code-map.json`；查具体 passage 用 `python work/find.py "<名字>"`。\n'
          % out['generated'])
md.append('规模：**%d 个 twee / %d 个 passage / %d 个生成器 / %d 个 JS 补偿函数**\n'
          % (out['totals']['twee'], out['totals']['passages'],
             out['totals']['generators'], out['totals']['js_functions']))

md.append('## 1. 我要改什么，去哪\n')
md.append('''| 任务 | 去哪 | 注意 |
|---|---|---|
| 改某个 passage 的文本/逻辑 | `python work/find.py "<passage 名>"` 拿到生成器:行 | 别改 `bjx-pack/tweeFileList/` 里的产物 |
| 改某个功能的数值（猎手点数等） | `genparts/gen_hunter.py` 等，见 §2 | 改完 `build_pack.py` -> `update_mod_inject.py` |
| 改游戏 UI / DOM / 运行时补偿 | `bjx-pack/scriptFileList_inject_early/inject_early.js`，见 §4 | 2209 行，先查 §4 索引 |
| 加一个新区块 | 新建 `genparts/gen_xxx.py`（照 `gen_hunter.py` 范式）+ 加进 `build_pack.py` 2k 列表 | 生成器必须 `assert` 锚点唯一 |
| 改翻译 | `make_dist.py` 的烘焙词典，**别改产物 twee** | 见 HANDOFF §8.4 三层兜底 |
| 改图片 | `sync_*_images.py` | 图片不进 mod zip，不用重注入 |
| 改版本号 | `work/bjx_version.py` **唯一** | boot.json/zip 名/发布目录都派生自它 |
''')

md.append('## 2. 产物 twee -> 生产者\n')
md.append('| 产物 twee | passage 数 | 生产者 | 职责 |')
md.append('|---|---|---|---|')
md.extend(rows)
md.append('')

md.append('## 3. 生成器清单\n')
md.append('| 脚本 | 产物 | 职责 |')
md.append('|---|---|---|')
for g in gen_scripts:
    md.append('| `genparts/%s` | %s | %s |'
              % (g['file'], ', '.join('`%s`' % o for o in g['outputs']) or '—',
                 g['desc'].replace('|', '/')))
md.append('')

md.append('## 4. inject_early.js 函数索引（%d 个）\n' % len(js_funcs))
md.append('| 行 | 函数 | 注释 |')
md.append('|---|---|---|')
for f in js_funcs:
    md.append('| %d | `%s` | %s |' % (f['line'], f['name'], f['comment'].replace('|', '/')))
md.append('')

if unmapped:
    md.append('## 5. 未解析到生产者的产物（需人工确认）\n')
    for fn in unmapped:
        md.append('- `%s`（%d passage）' % (fn, len(passages[fn])))
    md.append('')

md.append('## 6. 搜索噪音隔离\n')
md.append('''项目根的 `.ignore` 让 ripgrep / Grep 工具默认跳过产物目录，所以搜到的都是源码。
要搜产物（比如确认 pack 里的最终文本），显式指定路径或加 `--no-ignore`：

```bash
rg --no-ignore "关键词" work/bjx-pack/tweeFileList/
```
''')

md_path = os.path.join(WORK, 'CODE-MAP.md')
with open(md_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(md) + '\n')

print('CODE-MAP.md  : %d 个 twee, %d 个 passage, %d 个生成器, %d 个 JS 函数'
      % (len(passages), out['totals']['passages'], len(gen_scripts), len(js_funcs)))
print('code-map.json: %d 个 passage 可反查' % len(passage_index))
if unmapped:
    print('未解析生产者: %d 个产物 -> %s' % (len(unmapped), unmapped[:8]))
