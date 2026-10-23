"""Batch 3m: Chimera's Blessing (奇美拉的祝福) adaptation.

Ports the standalone Chimera mod (refs/chimera-mod, quest line: pray at a
forest boulder -> offer five complete native transformations via
meditation -> name it -> three egg quests -> stack all native beast forms
at once). The mod targets this SugarCube version almost perfectly - the
cat line's states 7-10 (heterochromia stages) are 0.5-native, Harper /
museumAntiqueStatus / wearProp / world_corruption / $pbdisable all exist.

Adaptations applied here:
  1. Quest13: the egg-2 hint uses the <<ndef>> macro which this SugarCube
     build does not ship -> rewritten as plain truthy checks.
  2. Quest33: `$chimeraq33requiredflos.delete(x)` - Array.prototype.delete
     does not exist -> filter(). Also a guard for undefined
     $plots[$chimeraq33location] (home garden before it is built, farm
     before first visit) so the for-range never walks undefined.
  3. Quest12 Take: wearProp "brass statuette" -> "antique brass statuette"
     (0.5's prop name; the vanilla temple-quarters find uses it).

The eight vanilla-passage entry links (Forest / Temple / Bird Tower /
Museum / Island / Farm Fields / Garden Flowers / Hospital Foyer) are DOM
injections - see injectChimeraEntries in inject_early.js; the Farm
Fields / Garden Flowers links also set $chimeraq33location which the mod
never assigns itself.
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'refs', 'chimera-mod', 'game')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_chimera')

FILES = ['chimera.twee', 'chimera_meditation.twee', 'chimera_transform.twee',
         'chimera_quest.twee', 'chimera_end.twee',
         'chimera_lifeofquality.twee', 'chimera_settings.twee']


def read(path):
    # universal newlines: the mod source ships CRLF
    with open(path, encoding='utf-8') as f:
        return f.read()


def patch_quest(text):
    # 1. <<ndef>> does not exist in this SugarCube build
    old_ndef = ('<<if $chimeraq32 is 1 or (!ndef $island && !ndef $island.home '
                '&& !ndef $island[$island.home] && $island[$island.home].chair is "advanced")>>')
    assert text.count(old_ndef) == 1, 'ndef anchor: %d' % text.count(old_ndef)
    text = text.replace(old_ndef,
                        '<<if $chimeraq32 is 1 or ($island and $island.home '
                        'and $island[$island.home] and $island[$island.home].chair is "advanced")>>')

    # 2. Array.prototype.delete does not exist (exact bytes: "    \t<<run ...")
    old_del = '    \t<<run $chimeraq33requiredflos.delete(_plantbed.plant)>> \n'
    assert text.count(old_del) == 1, 'delete anchor: %d' % text.count(old_del)
    text = text.replace(old_del,
                        '    \t<<run $chimeraq33requiredflos = $chimeraq33requiredflos.filter'
                        '(function (f) { return f !== _plantbed.plant; });>> \n')

    # 3. prop name must match 0.5's definition
    old_prop = '<<wearProp "brass statuette">>'
    assert text.count(old_prop) == 1, 'prop anchor: %d' % text.count(old_prop)
    text = text.replace(old_prop, '<<wearProp "antique brass statuette">>')

    # 4. guard the plot loops against an unbuilt/never-visited location:
    #    open the guard right after the nostrangeflower init and close it at
    #    the very end of the passage so the undefined case renders only the
    #    fallback message
    head_old = '<<set $_nostrangeflower to true>>\n<<for _plantbed range $plots[$chimeraq33location]>>'
    assert text.count(head_old) == 1, 'q33 head anchor: %d' % text.count(head_old)
    head_new = ('<<set $_nostrangeflower to true>>\n'
                '<<if $plots[$chimeraq33location] is undefined>>\n'
                '\t这里的土地还没有开垦，暂时种不出他所需要的东西。\n'
                '\t<<if $chimeraq33location is "farm">>\n'
                '\t\t<<link [[返回|Farm Fields]]>><</link>>\n'
                '\t<<else>>\n'
                '\t\t<<link [[返回|Garden Flowers]]>><</link>>\n'
                '\t<</if>>\n'
                '<<else>>\n'
                '<<for _plantbed range $plots[$chimeraq33location]>>')
    text = text.replace(head_old, head_new)
    tail_old = '<<link [[返回|Garden Flowers]]>><</link>>\n    <</if>>\n<</if>>\n\n'
    assert text.count(tail_old) == 1, 'q33 tail anchor: %d' % text.count(tail_old)
    text = text.replace(tail_old,
                        '<<link [[返回|Garden Flowers]]>><</link>>\n    <</if>>\n<</if>>\n<</if>>\n\n')
    return text


# ---------------------------------------------------------------- 巨石改造（2026-10-23）
# 原 mod 是「冥想 5 种 → 命名 → 三个蛋任务 → 才能叠加」的长任务链，且只认 0.4 的
# 5 种变形。北极星另外加了 14 种动物转化。改成「收集式」：把已练满的形态拿到巨石
# 「献上」，巨石永久记住；收集越多能同时继承越多（3→2、6→3、10→4、15→5、19→全部）。
# 只管动物，不碰天使/恶魔/堕天使/蘑菇。原任务链 passage 保留但不再给入口。
ANIMALS = [
    # key, 中文, 等级变量, 满级, build 变量（harpy 用 $birdbuild，别写成 $harpybuild）
    ("wolf",    "狼",   "$wolfgirl", 6,  "$wolfbuild"),
    ("cat",     "猫",   "$cat",      10, "$catbuild"),
    ("cow",     "牛",   "$cow",      6,  "$cowbuild"),
    ("harpy",   "鸟",   "$harpy",    6,  "$birdbuild"),
    ("fox",     "狐",   "$fox",      6,  "$foxbuild"),
    ("raccoon", "浣熊", "$raccoon",  6,  "$raccoonbuild"),
    ("bee",     "蜜蜂", "$bee",      6,  "$beebuild"),
    ("sheep",   "绵羊", "$sheep",    6,  "$sheepbuild"),
    ("deer",    "鹿",   "$deer",     6,  "$deerbuild"),
    ("bear",    "熊",   "$bear",     6,  "$bearbuild"),
    ("dragon",  "龙",   "$dragon",   6,  "$dragonbuild"),
    ("lizard",  "蜥蜴", "$lizard",   6,  "$lizardbuild"),
    ("dolphin", "海豚", "$dolphin",  6,  "$dolphinbuild"),
    ("dog",     "狗",   "$dog",      6,  "$dogbuild"),
    ("fish",    "鱼",   "$fish",     6,  "$fishbuild"),
    ("horse",   "马",   "$horse",    6,  "$horsebuild"),
    ("spider",  "蜘蛛", "$spider",   6,  "$spiderbuild"),
    ("pig",     "猪",   "$pig",      6,  "$pigbuild"),
    ("frog",    "青蛙", "$frog",     6,  "$frogbuild"),
]


def _tf(key):
    # 原版 5 种与北极星 14 种的 widget 都是 <key>Transform
    return key + 'Transform'


def gen_boulder():
    L = []
    L.append(":: Chimera Statue\n")
    L.append(
        "<<if $chimeraintro is not 1>>\n"
        "\t<<set $chimeraintro to 1>>\n"
        "\t<<set $chimeraCollected to []>>\n"
        "\t<<set $chimeraInherit to []>>\n"
        "\t你靠近了奇怪的巨石。它正屹立在一片被松树环绕的空地中央，周围的空气中带着淡淡的松脂香味。<br>\n"
        "\t它和你平常看到的石头别无二致，但它周围的草地有些平整地不自然，像是被人修剪过。\n"
        "\t你把手贴上去，一股温热顺着指尖爬上来，像是在辨认你体内的东西。<br><br>\n"
        "\t<<link [[继续|Chimera Statue]]>><</link>>\n"
        "<<else>>\n")
    L.append(
        "\t<<set $chimeraCollected to ($chimeraCollected ?? [])>>\n"
        "\t<<set $chimeraInherit to ($chimeraInherit ?? [])>>\n"
        "\t<<set _n to $chimeraCollected.length>>\n"
        "\t<<set _slots to 0>>\n"
        "\t<<if _n gte 19>><<set _slots to 19>>\n"
        "\t<<elseif _n gte 15>><<set _slots to 5>>\n"
        "\t<<elseif _n gte 10>><<set _slots to 4>>\n"
        "\t<<elseif _n gte 6>><<set _slots to 3>>\n"
        "\t<<elseif _n gte 3>><<set _slots to 2>>\n"
        "\t<<elseif _n gte 1>><<set _slots to 1>>\n"
        "\t<</if>>\n"
        "\t<<set _free to []>>\n")
    for key, cn, var, cap, bv in ANIMALS:
        L.append("\t<<if %s gte %d and !$chimeraCollected.includes(\"%s\")>><<run _free.push(\"%s\")>><</if>>\n"
                 % (var, cap, key, key))
    L.append(
        "\t<<if ($bjxBoulderCall ?? 0) is 1>>\n"
        "\t\t<span class=\"gold\">它认得你——你身上那种刚刚成形的力量，让它主动把纹路亮了起来。</span><br><br>\n"
        "\t\t<<set $bjxBoulderCall to 0>>\n"
        "\t<</if>>\n"
        "\t你正站在巨石面前。石面上的纹路缓缓流动，像是在等你交出什么。<br><br>\n"
        "\t<<if _free.length gt 0>>\n"
        "\t\t<span class=\"lewd\">巨石在回应你体内的血脉。你可以把已经完全成形的形态交给它——交出去之后你就不再保有它，但它会永远记住。</span><br>\n"
        "\t\t<<for _f range _free>>\n"
        "\t\t\t<<set _nm to chimeraName(_f)>>\n"
        "\t\t\t<<link \"献上 · \" + _nm>><<chimeraCollect _f>><</link>><br>\n"
        "\t\t<</for>>\n"
        "\t<</if>>\n")
    L.append(
        "\t<<if _n gt 0>>\n"
        "\t\t<br><hr><br>\n"
        "\t\t巨石记住的形态：收集 <<print _n>> 种，可同时继承 <<print _slots>> 种，已选 <<print $chimeraInherit.length>> 种。<br>\n"
        "\t\t<<for _f range $chimeraCollected>>\n"
        "\t\t\t<<set _nm to chimeraName(_f)>>\n"
        "\t\t\t<<if $chimeraInherit.includes(_f)>>\n"
        "\t\t\t\t<<link \"◆ \" + _nm + \"（点此取消）\">><<chimeraToggle _f>><</link>><br>\n"
        "\t\t\t<<elseif $chimeraInherit.length lt _slots>>\n"
        "\t\t\t\t<<link \"◇ \" + _nm>><<chimeraToggle _f>><</link>><br>\n"
        "\t\t\t<<else>>\n"
        "\t\t\t\t<span class=\"sub\">◇ <<print _nm>>（继承位已满）</span><br>\n"
        "\t\t\t<</if>>\n"
        "\t\t<</for>>\n"
        "\t\t<br>\n"
        "\t\t<<if $chimeraInherit.length gt 0>>\n"
        "\t\t\t<<link [[同调|Chimera Statue]]>><<chimeraApply>><</link>>\n"
        "\t\t<</if>>\n"
        "\t<</if>>\n")
    L.append(
        "\t<<if _free.length is 0 and _n is 0>>\n"
        "\t\t你身上的变形还不够完整，巨石对你没有反应。<br>\n"
        "\t<</if>>\n"
        "\t<<if _n gt 0>>\n"
        "\t\t<<link [[归还全部|Chimera Statue]]>><<chimeraClear>><<set $chimeraInherit to []>><</link>><br><br>\n"
        "\t<</if>>\n"
        "\t<<link [[转化指南|BJX TF Guide]]>><</link>><br>\n"
        "\t<<link [[返回|Forest]]>><<set $eventskip to 1>><</link>>\n"
        "<</if>>\n")
    return ''.join(L)


def gen_widgets():
    L = []
    L.append(":: Chimera Boulder Widgets [widget]\n\n")
    L.append('<<widget "chimeraName">>\n')
    first = True
    for key, cn, var, cap, bv in ANIMALS:
        kw = 'if' if first else 'elseif'
        first = False
        L.append('\t<<%s _args[0] is "%s">>%s\n' % (kw, key, cn))
    L.append('\t<<else>>？？？\n\t<</if>>\n<</widget>>\n\n')
    L.append(
        '<<widget "chimeraCollect">>\n'
        '\t<<set $chimeraCollected to ($chimeraCollected ?? [])>>\n'
        '\t<<set _nm to chimeraName(_args[0])>>\n'
        '\t<<if $chimeraCollected.includes(_args[0])>>\n'
        '\t\t巨石已经记住这种形态了。\n'
        '\t<<else>>\n'
        '\t\t<<run $chimeraCollected.pushUnique(_args[0])>>\n'
        '\t\t<<set $chimeraInherit to ($chimeraInherit ?? [])>>\n'
        '\t\t<<run $chimeraInherit.pushUnique(_args[0])>>\n'
        '\t\t/* 交出即失去：只清这一种，别的形态保留 */\n')
    for key, cn, var, cap, bv in ANIMALS:
        L.append('\t\t<<if _args[0] is "%s">><<%s 99>><</if>>\n' % (key, _tf(key)))
    L.append(
        '\t\t<span class="lewd">你把「<<print _nm>>」的形态交了出去。体内的那部分被抽空，石面上的纹路亮了一瞬——它记住了。</span>\n'
        '\t<</if>>\n'
        '<</widget>>\n\n')
    L.append(
        '<<widget "chimeraToggle">>\n'
        '\t<<set $chimeraInherit to ($chimeraInherit ?? [])>>\n'
        '\t<<set _k to _args[0]>>\n'
        '\t<<if $chimeraInherit.includes(_k)>>\n'
        '\t\t/* Array.prototype.delete 不存在，用 filter */\n'
        '\t\t<<set $chimeraInherit to $chimeraInherit.filter(function (x) { return x !== _k; })>>\n'
        '\t\t已取消继承「<<chimeraName _k>>」。\n'
        '\t<<else>>\n'
        '\t\t<<run $chimeraInherit.pushUnique(_k)>>\n'
        '\t\t已选择继承「<<chimeraName _k>>」。\n'
        '\t<</if>>\n'
        '<</widget>>\n\n')
    L.append(
        '<<widget "chimeraApply">>\n'
        '\t<<chimeraClear>>\n'
        '\t<<set $chimeraInherit to ($chimeraInherit ?? [])>>\n')
    for key, cn, var, cap, bv in ANIMALS:
        L.append(
            '\t<<if $chimeraInherit.includes("%s")>>\n'
            '\t\t/* build 拉满再逐级推进，比抄 parts 稳 */\n'
            '\t\t<<set %s to 100>>\n'
            '\t\t<<for _i to 1; _i lte 14; _i++>><<%s _i>><</for>>\n'
            '\t<</if>>\n' % (key, bv, _tf(key)))
    L.append(
        '\t石面上的纹路尽数亮起，你选中的形态在体内一层层叠了回去。\n'
        '<</widget>>\n')
    return ''.join(L)



def gen_forestshop():
    """覆盖 Forest Shop Entrance：与 Gwylan 好感度 ≥30 时，她会讲三种特殊转化。"""
    src = read(os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.12.13-target'),
                            'game', 'overworld-forest', 'loc-forestshop', 'shop-events.twee'))
    mark = ':: Forest Shop Entrance'
    i = src.index(mark)
    j = src.find('\n:: ', i + len(mark))
    block = src[i:j] if j != -1 else src[i:]

    old = '<<set $outside to 0>><<set $location to "forest_shop">><<effects>>\n'
    assert block.count(old) == 1, 'forest shop head anchor'
    add = (
        old +
        '/* BJX：与店主好感度 ≥30 时，她会告诉你三种特殊转化的事（每次来都能再问）。 */\n'
        '<<if ($gwylanLovePercent ?? 0) gte 30 and $options.bjx_eventTF>>\n'
        '\t<<if $ghost gte 1>>\n'
        '\t\t"你身上有湖的味道。"她压低声音，"灵体还能再往前走——冰之神社、海岛蚁丘、深海沉船，三个地方各是一种归宿，你只能选一个。"\n'
        '\t<<elseif $slime gte 1>>\n'
        '\t\t"软软的那种？"她笑了笑，"想更纯粹，就去荒原的净化水池躺一会儿。下水道那套只是起点。"\n'
        '\t<<elseif $mushroom gte 1>>\n'
        '\t\t"戴帽子的那个。"她指了指你的头，"蘑菇没有第二形态，但它能让你对痛、累、刺激都迟钝一些。够了。"\n'
        '\t<<else>>\n'
        '\t\t"森林里有些东西比衣服更贴身。"她说，"蘑菇圈能让你变成菇类；老下水道会把你泡成史莱姆；至于幽灵——"她看了一眼湖的方向，"在豪宅睡一晚，看它愿不愿意。"\n'
        '\t\t"不过这三种彼此排斥，选了就回不了头。"\n'
        '\t<</if>>\n'
        '\t<br><br>\n'
        '<</if>>\n')
    block = block.replace(old, add, 1)
    return block


def main():
    os.makedirs(OUT, exist_ok=True)
    for fn in FILES:
        if fn == 'chimera.twee':
            # 整个文件只有 :: Chimera Statue 一个 passage，已由 bjx-chimera_boulder.twee
            # 重写；同时输出会触发 pack 内的 duplicate passage 检查。
            print('bjx-chimera.twee SKIPPED (Chimera Statue moved to boulder)')
            continue
        text = read(os.path.join(SRC, fn))
        if fn == 'chimera_quest.twee':
            text = patch_quest(text)
        with open(os.path.join(OUT, 'bjx-' + fn), 'w',
                  encoding='utf-8', newline='\n') as f:
            f.write('/* BJX pack: Chimera\'s Blessing (奇美拉的祝福) 适配版。 */\n' + text)
        print('bjx-' + fn, len(text.splitlines()), 'lines')

    # 巨石改造：覆盖原 Chimera Statue（bjx-chimera_boulder 排在 bjx-chimera.twee 之后）
    boulder = ('/* BJX pack: 巨石收集式变形（重写，替代原任务链入口）。 */\n'
               + gen_boulder())
    with open(os.path.join(OUT, 'bjx-chimera_boulder.twee'), 'w',
              encoding='utf-8', newline='\n') as f:
        f.write(boulder)
    print('bjx-chimera_boulder.twee', len(boulder.splitlines()), 'lines')
    fs = ('/* BJX pack: 森林商店（Gwylan）情报补丁。 */\n' + gen_forestshop())
    with open(os.path.join(OUT, 'bjx-forestshop-hooks.twee'), 'w',
              encoding='utf-8', newline='\n') as f:
        f.write(fs)
    print('bjx-forestshop-hooks.twee', len(fs.splitlines()), 'lines')
    assert ':: Forest Shop Entrance' in fs and 'gwylanLovePercent' in fs

    wid = ('/* BJX pack: 巨石 widget。 */\n' + gen_widgets())
    with open(os.path.join(OUT, 'bjx-chimera_boulderwidgets.twee'), 'w',
              encoding='utf-8', newline='\n') as f:
        f.write(wid)
    print('bjx-chimera_boulderwidgets.twee', len(wid.splitlines()), 'lines')
    assert boulder.count(':: Chimera Statue') == 1
    assert wid.count('<<widget "chimeraApply">>') == 1
    assert wid.count('<<widget "chimeraToggle">>') == 1
    assert wid.count('<<widget "chimeraCollect">>') == 1
    # 19 种都要有「献上」判定、名字映射、应用分支
    for _k, _cn, _v, _c, _b in ANIMALS:
        assert ('chimeraCollected.includes(\"%s\")' % _k) in boulder, _k
        assert ('_args[0] is \"%s\"' % _k) in wid, _k
        assert ('$chimeraInherit.includes(\"%s\")' % _k) in wid, _k
        assert ('<<set %s to 100>>' % _b) in wid, _k
    assert '.delete(' not in wid

    # sanity: the patched markers exist exactly once across the output
    q = read(os.path.join(OUT, 'bjx-chimera_quest.twee'))
    assert q.count('!ndef') == 0
    assert q.count('.delete(') == 0
    assert q.count('antique brass statuette') == 1
    assert q.count('$plots[$chimeraq33location] is undefined') == 1
    assert q.count('<<else>>') >= 6


if __name__ == '__main__':
    main()
