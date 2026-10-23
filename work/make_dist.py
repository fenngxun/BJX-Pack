"""
生成「开箱即玩」成品 HTML。

做三件事（全部幂等）：
 1. 取 dev polyfill HTML（37 个 mod：loader + bjx-pack + 13 个适配过的第三方 mod）；
 2. 把 bjx-pack 换成「烘焙过官方汉化词典」的版本 —— bjx-pack 里有一半 passage
    是照 0.4.3.3 英文原版逐字抄的（Moor Bird / Bird Capture / Shopping Centre /
    ghost shop…），运行时 ModI18N 补不到（它只作用于原版数据），所以玩家看到
    "只翻了一半"；
 3. 末尾追加 ModI18N（管原版 passage），输出到发布目录。

用法：
    python make_dist.py --report     # 只统计，不写文件
    python make_dist.py              # 写发布目录的 HTML
"""
import base64
import io
import json
import os
import re
import sys
import zipfile

ROOT = r'C:\Users\79403\Desktop\dol'
WORK = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, WORK)
from bjx_version import VERSION, DIST_DIR_NAME  # noqa: E402  单一版本号真相源

# 可用环境变量覆盖：
#   DOL_DEV   = 已注入 mod 的 dev HTML（发布基座）
#   DOL_I18N  = ModI18N zip（0.5.12.13 用 mod/_hosti18n/ModI18N.zip）
#   DOL_OUT   = 输出 HTML
# 默认值已对齐 0.5.12.13 Lyra 宿主（2026-10-23 代码审查 P0-2：旧默认停在 1.3.0）。
_DIST_BASE = os.path.join(WORK, 'dist_base_0512.html')
DEV_HTML = os.environ.get(
    'DOL_DEV',
    _DIST_BASE if os.path.exists(_DIST_BASE) else
    os.path.join(ROOT, 'game', 'DoL-ModLoader-0.5.12.13-lyra', 'Degrees of Lewdity.html'))
PACK_ZIP = os.environ.get(
    'DOL_PACK_ZIP',
    os.path.join(WORK, 'bjx-pack-%s.mod.zip' % VERSION))
I18N_ZIP = os.environ.get(
    'DOL_I18N',
    os.path.join(ROOT, 'mod', '_hosti18n', 'ModI18N.zip'))
OUT_HTML = os.environ.get(
    'DOL_OUT',
    os.path.join(ROOT, DIST_DIR_NAME, 'Degrees of Lewdity.html'))

MIN_FROM = 12
MARKER = b'window.modDataValueZipList = ['


def load_dict():
    z = zipfile.ZipFile(I18N_ZIP)
    arr = json.loads(z.read('i18n.json').decode('utf-8'))['typeB']['TypeBInputStoryScript']
    by = {}
    for e in arr:
        f, t, pn = e.get('f'), e.get('t'), e.get('pN')
        if not f or not t or not pn or len(f) < MIN_FROM:
            continue
        by.setdefault(pn, []).append((f, t))
    for pn in by:
        by[pn].sort(key=lambda x: -len(x[0]))
    return by


# bjx-pack 里大量 widget 段落是从 0.4.3.3 原版整段抄来的，passage 名与宿主
# 不同（例如 `BJX Forest Hooks` vs 词典的 `Widgets Forest`），按 passage 名的
# 烘焙根本命中不了。这里再补一层「安全整行」全局烘焙：只处理整行完全匹配、
# 且该英文行在词典里只有唯一译文的叙述行；跳过代码/数据行（<<set/<<if/数组等）。
CODE_LINE_RX = re.compile(
    r'^\s*<<\s*(set|run|if|elseif|else|switch|case|for|script|widget|link|button|'
    r'replace|append|prepend|goto|include|print|npc|generate\d*|silently|setvar|'
    r'checkbox|radiobutton|textarea|textbox|cycle|listbox)\b')


def build_global_map(by):
    m, amb = {}, set()
    for entries in by.values():
        for f, t in entries:
            if f in m:
                if m[f] != t:
                    amb.add(f)
            else:
                m[f] = t
    for f in amb:
        m.pop(f, None)
    return m


def translate_safe_lines(body, gmap):
    hits = 0
    out = []
    for line in body.split('\n'):
        s = line.strip()
        if not s or s[0] in '[{/*' or CODE_LINE_RX.match(s):
            out.append(line)
            continue
        t = gmap.get(s)
        if t is None or t == s:
            out.append(line)
            continue
        indent = line[:len(line) - len(line.lstrip())]
        out.append(indent + t)
        hits += 1
    return '\n'.join(out), hits



# ---------------------------------------------------------------------------
# 宏骨架匹配：生成器往整句里插了开关表达式（例如
# `* ($options.bjx_averymoney ? 2 : 1)`），词典条目的 f 是原版表达式，
# 整句 replace 失配 → 该段落整段英文。这里把 `<<...>>` 全部抽象成占位符
# 比骨架，命中后用「本行的宏」逐个替换译文里的宏（保留开关）。
MACRO_RX = re.compile(r'<<.*?>>')


def skeleton(s):
    return MACRO_RX.sub('\x00', s)


def build_macro_index(entries):
    """只索引「除 <<print>> 外宏序列完全一致」的条目。

    avery 那类是 `<<print (C.npc.Avery.love * 10 + ...)>>` 被生成器加了开关，
    宏的**种类与顺序**不变、只有 print 内容不同。像
    `<</silently>><<print _text_output>><</widget>>` 这种，译文里宏顺序一旦
    被重排就会把 `<</widget>>` 提到 `<</silently>>` 前面（实测炸掉 boot），
    所以非 print 宏必须逐字相等才允许替换。
    """
    idx = {}
    for f, t in entries:
        if '\n' in f or len(f) < MIN_FROM:
            continue
        fm, tm = MACRO_RX.findall(f), MACRO_RX.findall(t)
        if not fm or len(fm) != len(tm):
            continue
        if any(a != b and not a.startswith('<<print') for a, b in zip(fm, tm)):
            continue
        idx.setdefault(skeleton(f), []).append((f, t, fm, tm))
    return idx


def translate_line_macro(line, idx):
    cands = idx.get(skeleton(line))
    if not cands:
        return None
    bm = MACRO_RX.findall(line)
    for _f, t, fm, _tm in cands:
        if len(fm) != len(bm):
            continue
        out = t
        ok = True
        for b, a in zip(bm, fm):
            if a == b:
                continue
            # 只有 print 宏允许内容不同；按出现顺序替换
            if a not in out:
                ok = False
                break
            out = out.replace(a, b, 1)
        if ok:
            return out
    return None


def translate_twee(text, by, gmap=None, stat=None):
    """按 passage 名套用词典；返回 (新文本, 命中条目数)。

    gmap 非空时再做一层全局安全整行烘焙（覆盖 widget 段落的复制文本）。
    """
    parts = re.split(r'(?m)^:: ', text)
    head, hits_total = parts[0], 0
    out = [head]
    for part in parts[1:]:
        nl = part.find('\n')
        if nl < 0:
            out.append(part)
            continue
        header, body = part[:nl], part[nl + 1:]
        name = header.split(' [')[0].strip()
        entries = by.get(name)
        if entries:
            for f, t in entries:
                if f in body:
                    body = body.replace(f, t)
                    hits_total += 1
            # 宏骨架兜底：整句失败但骨架一致（开关表达式插在宏里）
            midx = build_macro_index(entries)
            if midx:
                lines = body.split('\n')
                changed = False
                for _i, _line in enumerate(lines):
                    if not _line.strip() or re.search(r'[\u4e00-\u9fff]', _line):
                        continue
                    got = translate_line_macro(_line, midx)
                    if got and got != _line:
                        lines[_i] = got
                        hits_total += 1
                        changed = True
                        if stat is not None:
                            stat['macro'] = stat.get('macro', 0) + 1
                if changed:
                    body = '\n'.join(lines)
        if gmap:
            body, ghits = translate_safe_lines(body, gmap)
            hits_total += ghits
            if stat is not None:
                stat['global'] = stat.get('global', 0) + ghits
        out.append(header + '\n' + body)
    return ':: '.join(out), hits_total


def translate_pack(by, gmap=None):
    src = zipfile.ZipFile(PACK_ZIP)
    buf = io.BytesIO()
    stat = {'twee': 0, 'touched': 0, 'hits': 0, 'global': 0}
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as dst:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename.startswith('tweeFileList/') and item.filename.endswith('.twee'):
                text = data.decode('utf-8')
                new, hits = translate_twee(text, by, gmap, stat)
                stat['twee'] += 1
                if hits:
                    stat['touched'] += 1
                    stat['hits'] += hits
                    data = new.encode('utf-8')
            dst.writestr(item, data)
    return buf.getvalue(), stat


# 烘焙后仍需人工重锚的规则（词典只覆盖整句，这几条锚点是「半句 + 宏」，
# 换句后拼不上）。new 都取自烘焙后的实际文本。
# 键 = (mod 名, passage)，值 = [(原 findString, 烘焙后的 findString), ...]
DIST_RULE_REANCHOR = {
    ('WhitneyExpansion', 'Whitney Chat'): [
        ('<<else>>\n\t\t\t<<He>> stays silent',
         '<<else>>\n\t\t\t<<He>>保持沉默'),
    ],
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


LINK_RX = re.compile(r'\[\[([^\]|]+)\|([^\]]+)\]\]')


def build_label_map(by):
    """从词典里反推「链接标签」的译法（按 passage 作用域）。

    烘焙/ModI18N 会把链接标签一起翻掉（[[Next|X]] → [[继续|X]]），而标签通常
    太短、不在按句切的词典里。这里用「同一目标 passage 的英文/中文标签成对
    出现」建表；**必须按 passage 分组**——同一个 Next 在不同段落可能译成
    「继续 / 下一步 / 留堂…」，用全局表会挑错。
    """
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


def link_wildcard_match(fs, content):
    """把 [[标签|目标]] 的标签部分换成通配再找。

    烘焙会把链接标签一起翻掉（[[Next|X]] → [[继续|X]]），而标签通常太短、
    不在词典里。目标（| 右边）是 passage 名，不会被翻译，可以当锚。
    """
    parts = re.split(r'(\[\[[^\]|]*\|)', fs)
    rx = ''.join(r'\[\[[^\]|]*\|' if (p.startswith('[[') and p.endswith('|')) else re.escape(p)
                 for p in parts)
    m = re.search(rx, content)
    return m.group(0) if m else None


def translate_rules(raw, by, pmap=None, mod_name='', labels=None):
    """把 mod 里 TweeReplacer 规则的 findString 一起汉化。

    背景：烘焙把 bjx-pack 的英文段落换成了中文，但第三方 mod 的规则锚点是
    英文原文 —— 烘焙后锚点消失，规则静默失效（发布包冒烟 7 步红）。
    三步：① 显式重锚表 → ② 按 passage 套同一份词典 → ③ 链接标签通配兜底。
    `replace` 里出现的原 findString 也同步替换，否则会把那行英文贴回去。
    返回 (新 zip 字节, 翻译条数)；没有命中就原样返回。
    """
    try:
        src = zipfile.ZipFile(io.BytesIO(raw))
    except Exception:
        return raw, 0
    names = src.namelist()
    bn = 'boot.json' if 'boot.json' in names else next(
        (n for n in names if n.endswith('/boot.json')), None)
    if not bn:
        return raw, 0
    try:
        boot = json.loads(src.read(bn).decode('utf-8-sig'))
    except Exception:
        return raw, 0

    hits = 0
    for a in boot.get('addonPlugin') or []:
        if 'TweeReplacer' not in (a.get('addonName') or ''):
            continue
        params = a.get('params')
        if isinstance(params, list):
            rules = params
        elif isinstance(params, dict):
            rules = params.get('replace') or params.get('rules') or []
        else:
            continue
        if not isinstance(rules, list):
            continue
        for r in rules:
            if not isinstance(r, dict):
                continue
            fs, pn = r.get('findString'), r.get('passage')
            if not isinstance(fs, str) or not isinstance(pn, str):
                continue

            new = fs
            # ① 显式重锚
            for old, dst in DIST_RULE_REANCHOR.get((mod_name, pn), []):
                if new == old:
                    new = dst
                    break
            # ② 词典
            if new == fs:
                for f, t in by.get(pn) or []:
                    if f in new:
                        new = new.replace(f, t)
            # ②b 链接标签（[[Next|X]] 这类短标签不在按句切的词典里）
            lab_map = (labels or {}).get(pn) or (labels or {}).get('__global__') or {}
            if lab_map:
                new = translate_links(new, lab_map)
            # ③ 链接标签通配兜底
            content = (pmap or {}).get(pn)
            if new == fs and content is not None and new not in content:
                got = link_wildcard_match(new, content)
                if got:
                    new = got

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


def build_passage_map(pack_bytes):
    """烘焙后的 pack → {passage: body}，用来校验规则锚点是否还找得到。"""
    z = zipfile.ZipFile(io.BytesIO(pack_bytes))
    boot = json.loads(z.read('boot.json').decode('utf-8'))
    pmap = {}
    for t in boot.get('tweeFileList') or []:
        try:
            s = z.read(t).decode('utf-8', 'replace')
        except Exception:
            continue
        for part in re.split(r'(?m)^:: ', s)[1:]:
            nl = part.find('\n')
            if nl < 0:
                continue
            pmap[part[:nl].split(' [')[0].strip()] = part[nl + 1:]
    return pmap


def main():
    report_only = '--report' in sys.argv
    by = load_dict()
    gmap = build_global_map(by)
    pack_bytes, stat = translate_pack(by, gmap)
    print('汉化烘焙:', json.dumps(stat, ensure_ascii=False))
    pmap = build_passage_map(pack_bytes)
    labels = build_label_map(by)

    html = open(DEV_HTML, 'rb').read()
    pos = html.find(MARKER)
    assert pos > 0, 'marker not found'
    end = html.find(b'];', pos)
    seg = html[pos:end]

    entries = []  # [(filename->name, b64)]
    for m in re.finditer(rb'"([A-Za-z0-9+/=]{200,})"', seg):
        b64 = m.group(1).decode('ascii')
        try:
            z = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64)))
            name = json.loads(z.read('boot.json').decode('utf-8')).get('name')
        except Exception:
            name = None
        entries.append((name, b64))

    names = [n for n, _ in entries]
    assert 'bjx-pack' in names, 'bjx-pack missing from dev HTML'

    out = []
    replaced = appended = rule_hits = 0
    rule_mods = []
    for name, b64 in entries:
        if name == 'ModI18N':
            continue  # 稍后统一追加到末尾
        if name == 'bjx-pack':
            out.append(base64.b64encode(pack_bytes).decode('ascii'))
            replaced += 1
        else:
            raw, n = translate_rules(base64.b64decode(b64), by, pmap, name or '', labels)
            if n:
                rule_hits += n
                rule_mods.append('%s(%d)' % (name, n))
                out.append(base64.b64encode(raw).decode('ascii'))
            else:
                out.append(b64)
    out.append(base64.b64encode(open(I18N_ZIP, 'rb').read()).decode('ascii'))
    appended = 1
    print('规则锚点汉化:', rule_hits, '条', rule_mods)

    new_arr = MARKER + b','.join(b'"' + s.encode('ascii') + b'"' for s in out) + b'];'
    new_html = html[:pos] + new_arr + html[end + 2:]
    print('替换 bjx-pack:', replaced, '追加 ModI18N:', appended,
          '| 条目数', len(out), '| HTML', round(len(new_html) / 1048576, 1), 'MB')
    if report_only:
        print('（--report 模式，未写盘）')
        return
    open(OUT_HTML, 'wb').write(new_html)
    print('写出', OUT_HTML)

    # BJX 自建服饰（蘑菇帽 / 触手套装）的立绘不在 GameOriginalImagePack 里，
    # 每次出包顺手补齐（幂等，只补缺失文件）。
    try:
        import sync_bjx_clothes_img
        sync_bjx_clothes_img.main()
    except Exception as e:
        print('!! 服饰立绘补全失败（不影响 HTML）:', e)


if __name__ == '__main__':
    main()
