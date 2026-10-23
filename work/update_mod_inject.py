"""
Rebuild bjx-pack mod zip, then NORMALIZE the polyfill HTML's
modDataValueZipList array:
  - parse every entry in the array (b64 zip -> boot.json name)
  - drop every entry whose boot name is in KNOWN_NAMES (ours, incl. stale
    duplicates and excluded mods like SmartPhone)
  - rebuild: [HEAD_MOD, *builtins..., bjx-pack, *EXTRA_MODS...]
This replaces the fragile incremental strip-and-append logic: whatever mess
the array is in (double injections, leftovers from excluded mods), the
result is always the exact expected sequence.
"""
import base64
import io
import json
import os
import re
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bjx_version import VERSION  # noqa: E402  单一版本号真相源

WORK = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(WORK, 'bjx-pack')
ZIP = os.path.join(WORK, 'bjx-pack-%s.mod.zip' % VERSION)
HTML = os.environ.get(
    'DOL_HOST',
    os.path.join(os.path.dirname(WORK), 'game', 'DoL-ModLoader-0.5.12.13-lyra',
                 'Degrees of Lewdity.html'))
MODDIR = os.environ.get('DOL_MODDIR', os.path.join(os.path.dirname(WORK), 'mod'))

# third-party mods injected after bjx-pack, in load order:
# TweeReplacer (addon provider) is injected at the ARRAY HEAD (see below).
# The rest are patch consumers; order among them only matters for passage
# override precedence (later mods override earlier ones on name clash - none).
EXTRA_MODS = [
    r'NoAutoReBuyTrash.adapted.mod.zip',
    r'Eden.Fence.Rescue.adapted.mod.zip',
    r'DefrockMod.mod.adapted.mod.zip',
    r'More.Love.Interests.Mod.mod.adapted.mod.zip',
    r'TimeHourglass.mod.adapted.mod.zip',
    r'V0.1.240302.mod.adapted.mod.zip',
    r'DoL-cummilk-5.5.9.9.adapted.mod.zip',
    # MEE (露出拓展) parked: needs TweeReplacer ^1.2.0 protocol
    # (findRegex/replaceFile/all) + ReplacePatcher js rules; our 1.0.0 build
    # fails 19 do_patch anchors and its boot.json carries 10 empty-string
    # file list entries. Revisit as standalone protocol-upgrade task.
    # r'Degrees-of-Lewdity-MyExhibitionismExpansion-main.adapted.mod.zip',
    r'Sydney.Bare.Study.Mod.mod.adapted.mod.zip',
    r'InTheEdenAfterSunset.adapted.mod.zip',
    r'WhitneyExpansion.adapted.mod.zip',
    r'Wraith.sReflection.mod.adapted.mod.zip',
    r'ReOverfits.4.1.1.mod.adapted.mod.zip',
    # --- B2 batch (adapted by b2_adapt.py), appended below via B2_MODS ---
]
# B2 batch: bisect switch via env B2_ONLY="Terraria,DomRobin" (substring match).
B2_MODS = [
    r'Terraria.Expand.Mod.mod.adapted.mod.zip',
    r'DomRobin.mod.adapted.mod.zip',
    r'BabyHawk.mod.adapted.mod.zip',
    r'DoLSims.mod.adapted.mod.zip',
    r'Cattery1.1.8.2.for.dol0.5.10.adapted.mod.zip',
    # i, Candy + Robot（B6，2026-10-21 收编）：整套运行时建立在 Simple Frameworks
    # 之上，宿主没有 SF，由 b2_adapt.py 的 SF shim 补齐（addto 插槽 / lanSwitch /
    # String.Array.prototype.has / NamedNPC + npcNamed 重贴字段）。
    # 9 个 NPC 走 shim 的 flush 注册进 $NPCNameList，冒烟 icandy-robot-patch 断言 9/9。
    r'i.Candy.and.Robot.2.4.4.2.3.adapted.mod.zip',
]
# 保留开关：WITH_ICANDY=0 可临时排除 i.Candy（定位兼容问题时的二分手段）
if os.environ.get('WITH_ICANDY') == '0':
    B2_MODS = [m for m in B2_MODS if not m.startswith('i.Candy')]
_b2_only = os.environ.get('B2_ONLY', '').strip()
if _b2_only:
    _keys = [k.strip().lower() for k in _b2_only.split(',') if k.strip()]
    B2_MODS = [m for m in B2_MODS if any(k in m.lower() for k in _keys)]
EXTRA_MODS = EXTRA_MODS + B2_MODS

# B3 批次：Sydney.Dialogue.Expansion v1.7（nocrypt 已解密原件）。
# 21 条 TweeReplacer 锚点三源全命中、与 bjx-pack/宿主零 passage 撞名、
# 依赖（TweeReplacer >=1.0.0 / ImageLoaderHook ^2.3.0）均被宿主满足 → 无需适配。
B3_MODS = [
    r'Sydney.Dialogue.Expansion.v1.7.nocrypt.adapted.mod.zip',
]
_b3_only = os.environ.get('B3_ONLY', '').strip()
if _b3_only:
    B3_MODS = [m for m in B3_MODS if _b3_only.lower() in m.lower()]
EXTRA_MODS = EXTRA_MODS + B3_MODS

# B4 批次：Remy Love Mod 1.0.0（0.5 原生 mod，依赖版本全部满足宿主）
B4_MODS = [
    r'Remy.Love.Mod.adapted.mod.zip',
]
_b4_only = os.environ.get('B4_ONLY', '').strip()
if _b4_only:
    B4_MODS = [m for m in B4_MODS if _b4_only.lower() in m.lower()]
EXTRA_MODS = EXTRA_MODS + B4_MODS

# B5 批次：MEE 露出拓展（曾因需 TweeReplacer ^1.2.0 的 `all` 字段而挂起，
# 自建插件升到 1.2.0 后恢复收编）。原包在 Source/ 子目录，b5_adapt.py 扁平化。
B5_MODS = [
    r'Degrees-of-Lewdity-MyExhibitionismExpansion-main.adapted.mod.zip',
]
_b5_only = os.environ.get('B5_ONLY', '').strip()
if _b5_only:
    B5_MODS = [m for m in B5_MODS if _b5_only.lower() in m.lower()]
EXTRA_MODS = EXTRA_MODS + B5_MODS
# SmartPhone.Alpha v0.3.91.1 EXCLUDED: its SmartphoneModalert addon's
# afterInjectEarlyLoad hook hangs the whole ModLoader boot chain in headless
# (and it is not in the user's 28-mod evaluation list). Revisit separately.
# r'SmartPhone.Alpha-v0.3.91.1.mod.adapted.mod.zip',
# 1.2.0: self-built upgrade adding the `all` field (replace every occurrence).
# Source: mod/_tr/DoL_Mod_TweeReplacer-master (src + dist patched in place, since
# the upstream build chain references an absent ../../../dist-BeforeSC2 type pack).
HEAD_MOD = r'TweeReplacer-1.2.0.mod.zip'

# zip entries that belong to us: dropped on every normalize run, re-added fresh
KNOWN_NAMES = {
    'bjx-pack', 'bjx-ant-island', 'TweeReplacer', 'NoAutoReBuyTrash', 'Eden Fence Rescue Fixed',
    'DefrockMod', 'More Love Interests Mod', 'TimeHourglass', '钓鱼人生', 'cummilk',
    '露出拓展-请别露出惊讶的表情好吗', 'Sydney Bare Study Mod', '日落伊甸园',
    'WhitneyExpansion', "Wraith'sReflection", 'SmartPhone Alpha', 'ReOverfits',
    # B2 batch names (must match boot.json name exactly, else re-inject doubles them)
    'Terraria Expand Mod', 'DomRobin', 'BabyHawk', 'i, Candy + Robot', 'DoLSims', '猫咖出租屋',
    # B3
    'Sydney Dialogue Expansion',
    # B4
    'Remy Love Mod',
}


def build_zip():
    boot = json.loads(open(os.path.join(SRC, 'boot.json'), encoding='utf-8').read())
    files = (boot['tweeFileList']
             + boot.get('scriptFileList_inject_early', [])
             + boot.get('scriptFileList_earlyload', [])
             + boot.get('scriptFileList_preload', [])
             + boot.get('scriptFileList', [])
             + boot.get('imgFileList', [])
             + boot.get('styleFileList', [])
             + boot.get('additionFile', []))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(SRC, 'boot.json'), 'boot.json')
        for rel in files:
            full = os.path.join(SRC, rel.replace('/', os.sep))
            zf.write(full, rel)
    data = buf.getvalue()
    open(ZIP, 'wb').write(data)
    print('zip rebuilt:', len(data), 'bytes,', len(files) + 1, 'entries')
    return data


def read_mod(path):
    data = open(path, 'rb').read()
    zf = zipfile.ZipFile(io.BytesIO(data))
    boot = json.loads(zf.read('boot.json').decode('utf-8'))
    return data, boot.get('name')


# ---------------------------------------------------------------------------
# 宿主加载器噪音补丁（幂等；每次注入都重新确认一遍）
#
# replaceMerge → replaceMergeSC2DataInfoCacheForce：
#   bjx-pack 是「整包重写」，自带全部 3717 条 passage。ModLoader 的
#   patchModToGame() 每装一个 mod 就把整包 passage 合进已有缓存，CacheRecord
#   .replaceMerge() 于是对每条 passage 打一次「duplicate name」警告 ——
#   21 个 mod × 3717 ≈ 7.3 万行，把真正的报错全淹了。
#   Force 变体与普通变体是同一段逻辑，唯一差别是 noWarnning=true。
#   这里的重名是「整包覆盖原版」的必然结果，不是异常，静默处理才正确。
LOADER_PATCHES = [
    (b'replaceMergeSC2DataInfoCache)(originSC2DataInfoCache.cloneSC2DataInfo(), em)',
     b'replaceMergeSC2DataInfoCacheForce)(originSC2DataInfoCache.cloneSC2DataInfo(), em)'),
    # 天气粒子层的图片预解码：切 passage 时图层重建会 abort 掉在途请求，
    # img.decode() 于是抛 EncodingError，被 preWarm 的 catch 记成
    # "Image decode failed"（冒烟固定 4 条，实测该 png 本身完好、单独解码正常）。
    # 改成「重试一次，仍失败则静默」——真·坏图在重试里同样失败，只是不再刷屏。
    (b'imagePromise.then(() => this.#preWarm()).catch(err => console.warn("Image decode failed:", err));',
     b'imagePromise.then(() => this.#preWarm()).catch(() => {'
     b' try { const _r = new Image(); _r.src = this.initialSettings.src;'
     b' _r.decode().then(() => this.#preWarm()).catch(() => {}); } catch (e) {} });'),
]


def patch_loader_noise(html):
    for old, new in LOADER_PATCHES:
        if new in html:
            print('loader patch: already applied')
            continue
        n = html.count(old)
        if n != 1:
            print('!! loader patch target count = %d (expect 1): %r' % (n, old[:60]))
            continue
        html = html.replace(old, new, 1)
        print('loader patch: applied (%s)' % new[:46].decode('ascii'))
    return html


def relax_lyra_deps(b64s, name):
    """Cheat-Lyra 声明需要 TweeReplacer ^1.6.0，宿主实际给的是 1.3.0。

    1.6.0 相对 1.3.0 新增的字段是 findRegex / all —— 本仓库的 1.3.0 构建
    两者都实现了（dist/TweeReplacer.js 里 do_patch 有 findRegex 分支，
    all 在 1.2.0 升级时加的）。Cheat-Lyra 的 7 条规则只用到
    findString/findRegex/replace/all，全部被支持，所以清掉硬依赖让它加载，
    否则 Lyra 自带的作弊面板整块不可用。幂等：dependenceInfo 已空则原样返回。
    """
    raw = base64.b64decode(b64s)
    zf = zipfile.ZipFile(io.BytesIO(raw))
    names = zf.namelist()
    boot = json.loads(zf.read('boot.json').decode('utf-8'))
    if not boot.get('dependenceInfo'):
        return b64s
    boot['dependenceInfo'] = []
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names:
            if n.endswith('/'):
                continue
            data = json.dumps(boot, ensure_ascii=False).encode('utf-8') if n == 'boot.json' else zf.read(n)
            z.writestr(n, data)
    print('relaxed deps: %s (TweeReplacer ^1.6.0 -> any)' % name)
    return base64.b64encode(buf.getvalue()).decode('ascii')


def main():
    new_bytes, _ = read_mod_zipless = (None, None)
    new_bytes = build_zip()

    extra = []
    for rel in EXTRA_MODS:
        data, name = read_mod(os.path.join(MODDIR, rel))
        assert name in KNOWN_NAMES, 'unexpected mod name: %r in %s' % (name, rel)
        print('extra mod: %s (%s) %d bytes' % (name, rel, len(data)))
        extra.append((data, name))
    head_data, head_name = read_mod(os.path.join(MODDIR, HEAD_MOD))
    assert head_name in KNOWN_NAMES, 'unexpected head mod: %r' % head_name
    print('head mod: %s (%s) %d bytes' % (head_name, HEAD_MOD, len(head_data)))

    with open(HTML, 'rb') as f:
        html = f.read()

    marker = b'window.modDataValueZipList = ['
    pos = html.find(marker)
    assert pos > 0, 'marker not found'
    open_pos = html.find(b'[', pos) + 1
    end_pos = html.find(b'];', pos)
    assert end_pos > 0, 'array end not found'
    seg = html[pos:end_pos]

    # parse every entry: (b64, name) in order; finditer keeps originals.
    # Entries that fail zip parse (name=None) are junk (JS string literals
    # swept in by earlier bad rewrites) - dropped defensively.
    entries = []
    for m in re.finditer(rb'"([A-Za-z0-9+/=]+)"', seg):
        b64s = m.group(1).decode('ascii')
        try:
            z = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64s)))
            name = json.loads(z.read('boot.json').decode('utf-8')).get('name')
        except Exception:
            name = None
        entries.append((b64s, name))
    print('current array: %d entries' % len(entries))

    builtins_all = [b64s for b64s, name in entries if name is not None and name not in KNOWN_NAMES]
    # TweeReplacerLinker 的 boot.json 向 ConflictChecker 声明
    # optionalBefore: [I18nTweeReplacer ^1.1.0, TweeReplacer ^1.3.0]，
    # ModLoaderLoadEnd 时校验加载顺序：Linker 必须排在两者之前。
    # 宿主原始数组里 Linker 在第 9 位、TweeReplacer 在第 0 位（HEAD_MOD）→
    # 顺序校验失败，boot logError「need load before」。这里把 Linker 从
    # builtins 中拆出，钉到整个数组最前（make_dist.py 按序复制，发布包同步）。
    linker = [b64s for b64s, name in entries if name == 'TweeReplacerLinker']
    # The 0.5.12.13 host bundles ModI18N + the I18n* data mods, so its vanilla
    # passages render in Chinese. The dev regression (and bjx-pack itself) is
    # authored against the English base, exactly like the old 0.5.10.12 dev
    # host: drop the i18n builtins unless DOL_KEEP_I18N=1 (release keeps them).
    I18N_NAMES = {'ModI18N', 'I18nTweeReplacer', 'I18nTweeList', 'I18nScriptList'}
    keep_i18n = os.environ.get('DOL_KEEP_I18N') == '1'
    # i18n is ALWAYS pulled out of the middle of the array. Keeping it in the
    # builtin block (right after the framework mods) makes it translate the
    # vanilla text *before* the third-party TweeReplacer patches run, so their
    # English findStrings stop matching and every patch silently fails (boot
    # smoke dropped to 16/22). Appending the same entries to the very END (as
    # the old make_dist did) lets the mods match the English source first and
    # i18n translate afterwards. DOL_KEEP_I18N=1 = release (append); dev drops.
    i18n_tail = [b64s for b64s, name in entries if name in I18N_NAMES]
    builtins = [relax_lyra_deps(b64s, name) if name == 'Cheat-Lyra' else b64s
                for b64s, name in entries
                if name is not None and name not in KNOWN_NAMES
                and name != 'TweeReplacerLinker'
                and name not in I18N_NAMES]
    if keep_i18n:
        print('release: i18n kept, moved to array tail (%d entries)' % len(i18n_tail))
    else:
        print('dev: dropped i18n builtins %s' % [n for _, n in entries if n in I18N_NAMES])
    if linker:
        print('reorder: TweeReplacerLinker moved to array head (%d entry)' % len(linker))
    dropped = len(entries) - len(builtins) - len(linker)
    print('dropped %d entries (ours + junk), kept %d builtins' % (dropped, len(builtins)))

    def b64(data):
        return base64.b64encode(data).decode('ascii')

    seq = (linker + [b64(head_data)] + builtins + [b64(new_bytes)]
           + [b64(d) for d, _ in extra] + (i18n_tail if keep_i18n else []))
    # NOTE: new_arr must end with '];' - it replaces html[pos:end_pos+2] which
    # spans the old array INCLUDING its '];' terminator. Omitting the ';' once
    # produced a JS syntax error that hung the whole page (real incident).
    new_arr = b'window.modDataValueZipList = [' + b','.join(b'"' + s.encode('ascii') + b'"' for s in seq) + b'];'
    html = html[:pos] + new_arr + html[end_pos + 2:]
    html = patch_loader_noise(html)
    with open(HTML, 'wb') as f:
        f.write(html)
    names = (['TweeReplacerLinker'] * len(linker)) + [head_name] + [n for _, n in entries if n is not None and n not in KNOWN_NAMES and n != 'TweeReplacerLinker'] + ['bjx-pack'] + [n for _, n in extra]
    print('normalized: %d entries (%d builtin + 1 head + 1 pack + %d extra)' % (len(names), len(builtins), len(extra)))
    print('tail: %s' % names[-len(extra) - 1:])
    print('HTML bytes: %d' % len(html))
    return 0


if __name__ == '__main__':
    main()