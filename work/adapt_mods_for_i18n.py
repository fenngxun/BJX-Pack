# -*- coding: utf-8 -*-
"""为「全汉语发布包」生成一套 **中文锚点** 版第三方 mod zip。

背景（0.5.12.13 Lyra 宿主）：
  宿主内置 ModI18N / I18nTweeReplacer，运行期把原版 passage 翻成中文（pack 里
  照抄原版英文的段落也随之被翻）。但第三方 mod 的 TweeReplacer findString 仍是
  英文，翻译先于补丁应用 → findString 失配、规则静默失效（发布包冒烟 22→17）。

做法：用宿主 ModI18N 的 i18n.json[typeB][TypeBInputStoryScript]（f=英文，t=中文，
pN=passage）当词典，把每个 mod 的 TweeReplacer findString 换成中文再写回 zip。

输出到 `mod_i18n/`（**不动 dev 用的 `mod/`**；dev 丢 i18n，仍需英文锚点）。
`update_mod_inject.py` 通过 `DOL_MODDIR` 切换。

幂等：每次从 `mod/` 原始 adapted zip 重新生成。
"""
import io
import json
import os
import re
import shutil
import sys
import zipfile

ROOT = r'C:\Users\79403\Desktop\dol'
MODDIR = os.path.join(ROOT, 'mod')
OUTDIR = os.path.join(ROOT, 'mod_i18n')
I18N_ZIP = os.path.join(MODDIR, '_hosti18n', 'ModI18N.zip')
MIN_FROM = 12

LINK_RX = re.compile(r'\[\[([^\]|]+)\|([^\]]+)\]\]')

# 词典覆盖不到的「半句 + 宏」锚点：显式重锚表（与 make_dist 同源）。
DIST_RULE_REANCHOR = {

    ("Wraith'sReflection", 'Start'): [
        ('This game and works relating to it should not be shared on any platform '
         'that lacks age verification.',
         '本游戏及相关作品不得在任何缺乏年龄验证机制的平台上传播。'),
    ],
    ("Wraith'sReflection", 'Lake Ruin Plinth'): [
        ('in a small room with a plinth.\n'
         '<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound">>',
         '你深入了湖泊废墟，身处一个小房间里，有一个基座。\n'
         '<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound">>'),
        ('besides the plinth<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound">>',
         '除了基座<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound">>'),
    ],
}


def load_dict():
    z = zipfile.ZipFile(I18N_ZIP)
    arr = json.loads(z.read('i18n.json').decode('utf-8-sig'))['typeB']['TypeBInputStoryScript']
    by = {}
    for e in arr:
        f, t, pn = e.get('f'), e.get('t'), e.get('pN')
        if not f or not t or not pn or len(f) < MIN_FROM:
            continue
        by.setdefault(pn, []).append((f, t))
    for pn in by:
        by[pn].sort(key=lambda x: -len(x[0]))
    return by


def build_label_map(by):
    per, glob = {}, {}
    for pn, ents in by.items():
        m = per.setdefault(pn, {})
        for f, t in ents:
            fl = {tgt: lab for lab, tgt in LINK_RX.findall(f)}
            tl = {tgt: lab for lab, tgt in LINK_RX.findall(t)}
            for tgt, lab in fl.items():
                if tgt in tl:
                    m.setdefault(lab.strip(), tl[tgt].strip())
                    glob.setdefault(lab.strip(), tl[tgt].strip())
    per['__global__'] = glob
    return per


def translate_links(fs, labels):
    def rep(m):
        lab, tgt = m.group(1), m.group(2)
        new = labels.get(lab.strip())
        return '[[%s|%s]]' % (new if new else lab, tgt)
    return LINK_RX.sub(rep, fs)


def translate_rules(raw, by, labels, mod_name=''):
    try:
        src = zipfile.ZipFile(io.BytesIO(raw))
    except Exception:
        return raw, 0
    names = src.namelist()
    bn = 'boot.json' if 'boot.json' in names else None
    if not bn:
        return raw, 0
    try:
        boot = json.loads(src.read(bn).decode('utf-8-sig'))
    except Exception:
        return raw, 0
    bname = boot.get('name') or mod_name

    hits = 0
    for a in boot.get('addonPlugin') or []:
        if 'TweeReplacer' not in (a.get('addonName') or ''):
            continue
        params = a.get('params')
        rules = params if isinstance(params, list) else (
            (params or {}).get('replace') or (params or {}).get('rules') or [])
        if not isinstance(rules, list):
            continue
        for r in rules:
            if not isinstance(r, dict):
                continue
            fs, pn = r.get('findString'), r.get('passage')
            if not isinstance(fs, str) or not isinstance(pn, str):
                continue
            new = fs
            for old, dst in DIST_RULE_REANCHOR.get((bname, pn), []):
                if new == old:
                    new = dst
                    break
            if new == fs:
                for f, t in by.get(pn) or []:
                    if f in new:
                        new = new.replace(f, t)
            lab_map = labels.get(pn) or labels.get('__global__') or {}
            if lab_map:
                new = translate_links(new, lab_map)
            if new == fs:
                continue
            r['findString'] = new
            rp = r.get('replace')
            if isinstance(rp, str) and fs in rp:
                r['replace'] = rp.replace(fs, new)
            hits += 1

    if not hits:
        return raw, 0
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as dst:
        for n in names:
            if n.endswith('/'):
                continue
            data = json.dumps(boot, ensure_ascii=False).encode('utf-8') if n == bn else src.read(n)
            dst.writestr(n, data)
    return buf.getvalue(), hits


def main():
    by = load_dict()
    labels = build_label_map(by)
    os.makedirs(OUTDIR, exist_ok=True)
    patterns = ('TweeReplacer-1.2.0.mod.zip',)
    srcs = [f for f in sorted(os.listdir(MODDIR))
            if f.endswith('.adapted.mod.zip') or f in patterns]
    total_hits, total_mods = 0, []
    for f in srcs:
        raw = open(os.path.join(MODDIR, f), 'rb').read()
        new, n = translate_rules(raw, by, labels, f)
        open(os.path.join(OUTDIR, f), 'wb').write(new)
        if n:
            total_hits += n
            total_mods.append('%s(%d)' % (f, n))
    print('生成 %d 个 mod 到 %s' % (len(srcs), OUTDIR))
    print('规则锚点汉化: %d 条' % total_hits)
    for m in total_mods:
        print('   ' + m)
    return 0


if __name__ == '__main__':
    sys.exit(main())