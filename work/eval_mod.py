"""第三方 mod 适配性评估器（通用工具）。

对一个或多个 mod zip 做静态体检，输出适配难度分级:
  - boot 元数据（名称/版本/描述）
  - 规模（twee 数 / 行数 / passage 数 / widget 数）
  - 0.4 残留语法（<<ndef>>、$args[]、$statdisable、$pbdisable 语义）
  - 与本整合包 3717 passage 及 0.5 vanilla 的命名冲突（重声明会互相覆盖）
  - imgFileList 与星扩图片包的路径重叠（重叠会触发启动卡死）

用法:
  python eval_mod.py path/to/mod.zip [more.zip ...]
  python eval_mod.py ../mod            # 整个目录
"""

import zipfile
import json
import os
import re
import sys
import collections

ROOT = os.path.dirname(os.path.abspath(__file__))
OUR_TWEES = os.path.join(ROOT, 'bjx-pack', 'tweeFileList')
VAN_GAME = os.path.join(ROOT, '..', 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
STAREXPAND = os.path.join(ROOT, '..', 'Dol-BJX-Ex-main', '星扩官方指定模组包',
                          '星扩原版图片包.zip')

FLAG_PATTERNS = [
    (r'<<ndef', 'ndef宏(0.5无)'),
    (r'\$args\[', '0.4参数写法$args'),
    (r'\$statdisable', '0.4变量statdisable'),
    (r'\$pbdisable', 'pbdisable(0.5兼容别名,通常没事)'),
    (r'window\.determineCatEyeStages', '猫眼阶段JS(0.5原生有)'),
    (r'Renderer\.CanvasModels', '直接操作画布(需检查与bjx图层共存)'),
]

_IMG_CACHE = None


def star_paths():
    global _IMG_CACHE
    if _IMG_CACHE is None:
        try:
            z = zipfile.ZipFile(STAREXPAND)
            bn = [n for n in z.namelist() if n.rsplit('/', 1)[-1] == 'boot.json'][0]
            _IMG_CACHE = set(re.findall(r'"(img/[^"]+)"',
                                        z.read(bn).decode('utf-8', errors='ignore')))
        except Exception:
            _IMG_CACHE = set()
    return _IMG_CACHE


def loose_json(b):
    t = b.decode('utf-8', errors='ignore')
    for _ in range(3):
        try:
            return json.loads(t)
        except Exception:
            pass
        t = re.sub(r'^\s*//.*$', '', t, flags=re.M)
        t = re.sub(r',\s*([}\]])', r'\1', t)
    try:
        return json.loads(t)
    except Exception:
        return {}


def ours_and_vanilla():
    ours, van = set(), set()
    if os.path.isdir(OUR_TWEES):
        for f in os.listdir(OUR_TWEES):
            if f.endswith('.twee'):
                t = open(os.path.join(OUR_TWEES, f), encoding='utf-8').read()
                ours.update(m.group(1) for m in re.finditer(
                    r'^:: (.+?)(?:\s*\[.*\])?\s*$', t, re.M))
    for root, _d, fs in os.walk(VAN_GAME):
        for fn in fs:
            if fn.endswith('.twee'):
                t = open(os.path.join(root, fn), encoding='utf-8').read()
                van.update(m.group(1) for m in re.finditer(
                    r'^:: (.+?)(?:\s*\[.*\])?\s*$', t, re.M))
    return ours, van


def eval_zip(path, ours, van):
    name = os.path.basename(path)
    try:
        z = zipfile.ZipFile(path)
    except Exception as e:
        return {'file': name, 'verdict': 'SKIP', 'reason': str(e)[:80]}
    names = z.namelist()
    boot = None
    for n in names:
        if os.path.basename(n) == 'boot.json':
            boot = loose_json(z.read(n))
            break
    twees = [n for n in names if n.endswith('.twee')]
    passages, widgets, flags = set(), set(), collections.Counter()
    lines = 0
    img_list = boot.get('imgFileList', []) if boot else []
    for n in twees:
        try:
            t = z.read(n).decode('utf-8', errors='ignore')
        except Exception:
            continue
        lines += len(t.splitlines())
        passages.update(m.group(1) for m in re.finditer(
            r'^:: (.+?)(?:\s*\[.*\])?\s*$', t, re.M))
        widgets.update(m.group(1) for m in re.finditer(r'<<widget "([^"]+)"', t))
        for pat, label in FLAG_PATTERNS:
            c = len(re.findall(pat, t))
            if c:
                flags[label] += c
    overlap = len(set(img_list) & star_paths()) if img_list else 0
    out = {
        'file': name,
        'boot_name': boot.get('name') if boot else None,
        'version': boot.get('version') if boot else None,
        'desc': (boot.get('description') or '')[:100] if boot else '',
        'twee': len(twees), 'lines': lines, 'passages': len(passages),
        'widgets': len(widgets),
        'flags': dict(flags),
        'collide_ours': len(passages & ours),
        'collide_vanilla': len(passages & van),
        'img_overlap_star': overlap,
        'addon_plugins': [p.get('modName') for p in (boot.get('addonPlugin') or [])] if boot else [],
    }
    # verdict heuristics
    if not boot and not twees:
        out['verdict'] = 'SKIP'
        out['reason'] = '无 boot 且无 twee'
    elif out['collide_ours'] > 50 or out['collide_vanilla'] > 300:
        out['verdict'] = '整包型(不可直接附加)'
    elif overlap > 50:
        out['verdict'] = '与星扩路径重叠(需去重)'
    elif flags.get('ndef宏(0.5无)') or flags.get('0.4参数写法$args'):
        out['verdict'] = '需语法适配'
    elif out['collide_ours'] or out['collide_vanilla'] or flags:
        out['verdict'] = '轻度检查'
    else:
        out['verdict'] = '直接可用候选'
    return out


def main():
    ours, van = ours_and_vanilla()
    paths = []
    for a in sys.argv[1:]:
        if os.path.isdir(a):
            paths += [os.path.join(a, f) for f in sorted(os.listdir(a))
                      if f.lower().endswith('.zip')]
        else:
            paths.append(a)
    for p in paths:
        r = eval_zip(p, ours, van)
        print('=====', r.pop('file'))
        for k, v in r.items():
            if v not in ('', None, [], {}):
                print('  %-14s %s' % (k, str(v)[:160]))


if __name__ == '__main__':
    main()
