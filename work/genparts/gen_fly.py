# -*- coding: utf-8 -*-
"""飞行系统组生成器（BJX 0.4.3.3 -> DoL 0.5.10.12 ModLoader pack）。

独立验证版：输出写到本脚本同目录的 _verify_fly/ 下（不写 tweeFileList,
不改 build_pack.py）。正式接线时由 build_pack.py 以完全相同的文本写入
work/bjx-pack/tweeFileList。

本组交付三块内容, 对应 BJX 的 loc-fly-bjx 目录 + 17 处 flywait 调用点:

1. bjx-fly.twee (merge, 1 passage)
        :: Fly  俯视地图（住宅/商业/工业/镇外四组跳转）, 全文来自
                BJX overworld-town/loc-fly-bjx/main.twee。
   0.5 适配（脚本内逐条断言）:
     - 三条小巷目标名 0.4.3.3 "Residential alleyways" ->
       0.5 "Residential Alleyways"（商业/工业同理）。SugarCube 链接
       大小写敏感, 0.5 已把三处 passage 首字母大写。
     - <<mooricon "tower">> -> <<icon "bird-tower/tower.png">>：
       0.5 的 mooricon 只剩 remy / remy cottage / default 三支,
       "tower" 会静默落到 moor.png（鹰塔变成荒原图）。0.5 图标实际
       路径 img/misc/icon/bird-tower/tower.png, base-system/images.twee
       里已有同款用法（第 628、726 行）。
     - $syndromeeden / $syndromewolves / $syndromebird 三个 BJX 存档标记
       在 0.5 原生存在（ingame.js / time.js / versionUpdate 均读取），
       保留原文比较, 未定义即 false。
     - 无 $skinColor / $bestialitydisable / $statdisable 等 0.4.3.3
       独有写法（脚本断言）, 不需要变量翻译。
   依赖的 20 个图标 widget + <<effects>> / <<pass>> 全部为 0.5 原生,
   脚本逐一断言存在; 22 个跳转目标 passage 也逐一断言存在于 0.5。

2. bjx-fly-widgets.twee (merge, 1 个 [widget] passage)
        :: Widgets Fly [widget]
           <<flywait>>  原样照搬: <<add_link "<icon><<link [[起飞|Fly]]>>...">>
           <<dragonwingsicon>>  兼容补齐（说明见下）
   wing 图标说明: flywait 的 add_link 参数是双引号字符串, 内部不能再嵌
   双引号, 所以 BJX 用 <<dragonwingsicon>> widget 间接取图标。该 widget
   定义在 BJX base-system/images.twee:791（本组以外的文件, 未移植）,
   且 dragonwings.png 在 BJX 源码里没有图片资源。这里补一个同名 widget,
   指向 0.5 原生翅膀图标 actions/wing.png（img/misc/icon/actions/wing.png,
   0.5 的 <<glideicon>> 亦用它）。名称与 0.5/pack 均无冲突（脚本断言）。
   <<flywait>> 与 0.5/pack 现有 widget 也无重名, 因此不涉及 HANDOFF
   §4.4 的覆盖机制; 若将来撞名, 后加载的 pack 定义覆盖 vanilla 即可。

3. bjx-fly-hooks.twee (0.5 原版全文为底 + 3 处插入, 3 个文件)
        park  overworld-town/loc-alley/park.twee     :: Park
              插在男女厕所链接之后（BJX 原位置）。
        lake  overworld-forest/loc-lake/main.twee    :: Lake Shore
              BJX 的落点是「湖边小屋」链接之后; 0.5 把 Lake House 整体
              挪出了 Lake Shore, 该段不存在。按同一语义改插在
              "archaeological field office" 块之后（同为该页的常驻设施
              链接区, 再往后就是按 exhibitionism 分档的散步链接）。
        farm  overworld-plains/loc-farm/main.twee    :: Farmland
              插在 riding school 的 if/else 之后、Meadow 之前（BJX 原位）。
   每处插入内容:
        /* BJX pack: 起飞入口（BJX flywait） */
        <<if $options.bjx_animal and ($transformationParts.bird.wings isnot
        "disabled" and $birdFly gte 1 or $transformationParts.dragon.wings
        isnot "disabled")>>
            <<flywait>>
        <</if>>
   守卫沿用 BJX 原文语义, 未做改写: $options.bjx_animal 由
   inject_early.js:77-78 在 undefined 时置 true; $birdFly 是 0.5 原生
   V 变量; $transformationParts.dragon 由 ensureBjxTfKeys 补键（0.5 新档
   直接读子属性会 TypeError, HANDOFF §4.3）。缩进按宿主文件实际 tab 数
   推定（街头 3 tab / domus 4 tab / exposed 1 tab / park 2 / lake 2 /
   farm 1）, 锚点均先 repr() 核对再 assert count==1。

街头 14 个文件的起飞入口不在本脚本产出: gen_street.py 是 loc-street 的
唯一生成器, 其 build_fly_street_hooks() 负责 14 处插入并产出
_verify_street/bjx-street-fly-hooks.twee（同样 0.5 全文 + 单点插入 +
vps==ops）。本脚本 import 该函数复用其逻辑, 只做清点与交叉校验（两个产物
的 passage 集合必须不相交, 避免重名覆盖）。这样任何一个 passage 都只有
一个产物文件定义它。

自测: cd work/genparts && python gen_fly.py
      python gen_street.py   # 生成街头 14 处产物
"""

import os

import gen_street

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
PACK = os.path.join(ROOT, 'work', 'bjx-pack', 'tweeFileList')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_fly')

FLY_DIR = os.path.join(BJX, 'overworld-town', 'loc-fly-bjx')

# 0.5 把三条小巷 passage 的首字母大写了, SugarCube 链接大小写敏感。
ALLEY_FIX = [
    ('Residential alleyways', 'Residential Alleyways'),
    ('Commercial alleyways', 'Commercial Alleyways'),
    ('Industrial alleyways', 'Industrial Alleyways'),
]

# Fly 里出现的图标 widget（0.5 原生, 逐一断言）。
FLY_ICONS = ['domusicon', 'barbicon', 'danubeicon', 'wolficon', 'alleyicon',
             'connudatusicon', 'clifficon', 'highicon', 'starfishicon',
             'nightingaleicon', 'oxfordicon', 'parkicon', 'mericon',
             'elkicon', 'harvesticon', 'lakeicon', 'farmicon', 'edenicon',
             'wolfcaveicon', 'mooricon']

# Fly 的 22 个跳转目标（0.5 passage 名）。
FLY_TARGETS = ['Domus Street', 'Barb Street', 'Danube Street', 'Wolf Street',
               'Residential Alleyways', 'Connudatus Street', 'Cliff Street',
               'High Street', 'Starfish Street', 'Nightingale Street',
               'Oxford Street', 'Commercial Alleyways', 'Park', 'Mer Street',
               'Elk Street', 'Harvest Street', 'Industrial Alleyways',
               'Lake Shore', 'Farmland', 'Eden Clearing',
               'Wolf Cave Clearing', 'Bird Tower']

# 非街头 3 个宿主的插入锚点（整文件 patch 用）。
# 每条: (相对 REF 的路径, 锚点, 插入位置 after/before, 缩进 tab 数, 说明)
HOOKS = [
    ('overworld-town/loc-alley/park.twee',
     '\t\t<<icon "women-toilet.png">><<link [[Women\'s toilets (0:01)|'
     'Women\'s Toilets]]>><<pass 1>><<endevent>><</link>>\n\t\t<br>\n',
     'after', 2, 'Park: 男女厕所链接之后（BJX 原位置）'),
    ('overworld-forest/loc-lake/main.twee',
     '\t\t<<if $town_projects.diving gte 4>>\n'
     '\t\t\t<<if $exposed gte 2>>\n'
     '\t\t\t\tIt\'s not the best idea to stroll into the archaeological '
     'field office in your state.\n'
     '\t\t\t<<else>>\n'
     '\t\t\t\t<<lakeicon "field office">><<link [[Archaeological field '
     'office (0:02)|Lake Office]]>><<pass 2>><</link>>\n'
     '\t\t\t<</if>>\n'
     '\t\t\t<br>\n'
     '\t\t<</if>>\n',
     'after', 2,
     'Lake Shore: field office 块之后（0.5 已无 Lake House 链接, 同段落位）'),
    ('overworld-plains/loc-farm/main.twee',
     '\t\t<<steedicon>><span class="blue">You\'re too exposed to go to '
     'the riding school!</span>\n\t\t<br>\n\t<</if>>\n',
     'after', 1, 'Farmland: riding school 之后、Meadow 之前（BJX 原位置）'),
]

GATE = ('<<if $options.bjx_animal and '
        '($transformationParts.bird.wings isnot "disabled" and '
        '$birdFly gte 1 or $transformationParts.dragon.wings isnot '
        '"disabled")>>')


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def write(name, text):
    os.makedirs(OUT, exist_ok=True)
    if not text.endswith('\n'):
        text += '\n'
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print('%s: %d lines written' % (name, len(text.splitlines())))


def passages(text):
    return [l[3:].split('[')[0].strip()
            for l in text.split('\n') if l.startswith(':: ')]


# 0.5.12.13 的源码树是从成品 HTML 还原的（只有 twee，没有 js），
# 所以「JS 里的宏存在」这类断言只在真的读到 js 时才做。
HAS_JS = [False]


def ref_corpus():
    """0.5 全部 twee + js 文本（widget / passage / macro 断言用）。"""
    chunks = []
    for base, _dirs, files in os.walk(REF):
        for fn in sorted(files):
            if fn.endswith('.twee') or fn.endswith('.js'):
                if fn.endswith('.js'):
                    HAS_JS[0] = True
                chunks.append(read(os.path.join(base, fn)))
    return '\n'.join(chunks)


def pack_corpus():
    # Skip this group's own outputs: the build regenerates in place, so the
    # previous run's copies are still in PACK and would trip the "新 passage
    # 不得与 pack 撞名" assertions (self-match).
    chunks = []
    for fn in sorted(os.listdir(PACK)):
        if fn.endswith('.twee') and not fn.startswith('bjx-fly'):
            chunks.append(read(os.path.join(PACK, fn)))
    return '\n'.join(chunks)


def fly_block(ind):
    return (ind + '/* BJX pack: 起飞入口（BJX flywait） */\n'
            + ind + GATE + '\n'
            + ind + '\t<<flywait>>\n'
            + ind + '<</if>>\n')


# ---------------------------------------------------------------- Fly passage
def gen_fly():
    src = read(os.path.join(FLY_DIR, 'main.twee'))
    assert passages(src) == ['Fly'], passages(src)

    # 三条小巷目标名按 0.5 大写化（先核对锚点唯一）。
    for old, new in ALLEY_FIX:
        target = '|' + old + ']]'
        assert src.count(target) == 1, 'alley target not unique: ' + old
        src = src.replace(target, '|' + new + ']]')

    # 0.5 的 mooricon 无 "tower" 分支 -> 直接取 0.5 原生塔图标。
    old_icon = '<<mooricon "tower">>'
    assert src.count(old_icon) == 1
    assert '<<icon "bird-tower/tower.png">>' in ref_corpus()
    src = src.replace(old_icon, '<<icon "bird-tower/tower.png">>')

    # merge cleanup: 0.4.3.3 独有变量/注释零残留。
    for bad in ('$skinColor', 'bestialitydisable', 'statdisable',
                '$skullduggeryhands', '$slimedisable', '北极星'):
        assert bad not in src, bad

    # 0.5 依赖断言。
    native = ref_corpus()
    for w in FLY_ICONS:
        assert ('<<widget "%s">>' % w) in native, 'missing widget ' + w
    for w in ('add_link', 'hideDisplay'):
        assert ('<<widget "%s">>' % w) in native, 'missing widget ' + w
    if HAS_JS[0]:
        assert 'Macro.add("icon"' in native, 'icon macro missing'
        assert 'Macro.add("effects"' in native, 'effects macro missing'
        assert 'Macro.add("pass"' in native, 'pass macro missing'
    for t in FLY_TARGETS:
        assert t in passages(native), 'missing passage ' + t
    assert 'syndromeeden' in native and 'syndromewolves' in native and \
        'syndromebird' in native

    # 新 passage 不得与 0.5 / pack 撞名。
    assert 'Fly' not in passages(native), 'Fly already in 0.5'
    assert 'Fly' not in passages(pack_corpus()), 'Fly already in pack'

    out = ('/* BJX pack: BJX overworld-town/loc-fly-bjx/main.twee (1 passage).\n'
           '   0.5 deltas: alley way link targets capitalised; mooricon\n'
           '   "tower" (absent from 0.5 mooricon) -> native\n'
           '   bird-tower/tower.png. No variable translation needed. */\n' + src)
    write('bjx-fly.twee', out)
    print('  Fly: %d link targets, %d icons verified' %
          (len(FLY_TARGETS), len(FLY_ICONS)))


# ---------------------------------------------------------------- widgets
def gen_widgets():
    src = read(os.path.join(FLY_DIR, 'widgets.twee'))
    assert ':: Widgets Fly [widget]' in src
    body = ('<<widget "flywait">>\n'
            '    <<add_link "<<dragonwingsicon>><<link [[起飞|Fly]]>>'
            '<</link>><br>">><<hideDisplay>>\n'
            '<</widget>>\n')
    assert body in src, 'flywait body differs from BJX source'
    assert '$' not in body, 'widget body must be variable-free'

    native = ref_corpus()
    pack = pack_corpus()
    for name in ('flywait', 'dragonwingsicon'):
        assert ('<<widget "%s">>' % name) not in native, \
            name + ' already defined by 0.5'
        assert ('<<widget "%s">>' % name) not in pack, \
            name + ' already defined by pack'
    assert ':: Widgets Fly' not in native and ':: Widgets Fly' not in pack

    out = ('/* BJX pack: BJX overworld-town/loc-fly-bjx/widgets.twee.\n'
           '   <<flywait>> verbatim. <<dragonwingsicon>> is a shim: BJX had it\n'
           '   in base-system/images.twee:791 (not migrated here) and the png\n'
           '   does not exist in the BJX source tree, so it now points at the\n'
           '   native wing icon (0.5 <<glideicon>> uses the same file).\n'
           '   Neither widget name collides with 0.5 or the current pack, so\n'
           '   no <<widget>> override (HANDOFF 4.4) is involved. */\n'
           ':: Widgets Fly [widget]\n'
           '\n'
           '<<widget "dragonwingsicon">>\n'
           '\t<<icon "actions/wing.png">>\n'
           '<</widget>>\n'
           '\n' + body)
    write('bjx-fly-widgets.twee', out)
    print('  widgets: flywait + dragonwingsicon shim (actions/wing.png)')


# ---------------------------------------------------------------- hooks
def gen_hooks():
    chunks = []
    report = []
    for rel, anchor, where, tabs, note in HOOKS:
        vanilla = read(os.path.join(REF, rel))
        assert anchor.count('\n') >= 2, 'anchor too short: ' + rel
        assert vanilla.count(anchor) == 1, \
            'anchor not unique in %s: %r' % (rel, anchor[:60])
        block = fly_block('\t' * tabs)
        if where == 'after':
            out = vanilla.replace(anchor, anchor + block)
        else:
            assert where == 'before'
            out = vanilla.replace(anchor, block + anchor)

        # 每个宿主文件: passage 名称/顺序不变, 只多一个起飞块。
        vps, ops = passages(vanilla), passages(out)
        assert vps == ops, 'passage order changed in ' + rel
        assert out.count('<<flywait>>') == 1, rel
        assert out.count(GATE) == 1, rel
        assert len(out) - len(vanilla) == len(block), rel
        assert out.count('<<if') - vanilla.count('<<if') == 1, rel
        assert out.count('<</if>>') - vanilla.count('<</if>>') == 1, rel
        chunks.append(out)
        report.append((rel, vps[0], note))

    # 三个文件拼成一个产物: passage 不能重复定义。
    names = []
    for c in chunks:
        names.extend(passages(c))
    assert len(names) == len(set(names)), 'duplicate passage across hook files'

    # 街头产物由 gen_street.py 生成; 这里复用其逻辑做清点/交叉校验,
    # 但不写出（避免同一 passage 被两个产物定义）。
    street_out, street_report = gen_street.build_fly_street_hooks()
    street_names = passages(street_out)
    clash = set(names) & set(street_names)
    assert not clash, 'street/fly hook passage clash: %s' % sorted(clash)
    assert len(street_names) == len(set(street_names))

    out = ('/* BJX pack: 飞行系统 hooks - vanilla 0.5 full-file patches for\n'
           '   Park / Lake Shore / Farmland, one takeoff entry each.\n'
           '   Street entries live in bjx-street-fly-hooks.twee (gen_street.py\n'
           '   is the only loc-street generator; no passage is defined twice). */\n'
           + ''.join(chunks).lstrip('\n'))
    assert out.count('<<flywait>>') == len(HOOKS), 'flywait count drift'
    write('bjx-fly-hooks.twee', out)
    for rel, p, note in report:
        print('  %-38s :: %-12s %s' % (rel, p, note))
    return street_report


def main():
    print('BJX fly group ->', os.path.relpath(OUT, ROOT))
    gen_fly()
    gen_widgets()
    street = gen_hooks()
    print('FLY INVENTORY (BJX 0.4.3.3 -> DoL 0.5.10.12)')
    print('  Fly passage ....... 1  new      bjx-fly.twee')
    print('  flywait widget .... 1  + shim   bjx-fly-widgets.twee')
    print('  street takeoff ... %2d  gen_street.py -> bjx-street-fly-hooks.twee'
          % len(street))
    print('  park/lake/farm .... 3  bjx-fly-hooks.twee')
    print('  call sites total . %2d  (14 street + 3 rural)' % (len(street) + 3))
    print('ALL FLY CHECKS PASSED')


if __name__ == '__main__':
    main()
