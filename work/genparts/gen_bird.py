# -*- coding: utf-8 -*-
"""bird 组生成器（BJX 0.4.3.3 -> DoL 0.5.10.12 ModLoader pack）。

独立验证版：输出写到本脚本同目录的 _verify_bird/ 下（不写 TWE，不改
build_pack.py）。正式接线时由 build_pack.py 以完全相同的文本写入
work/bjx-pack/tweeFileList（hooks 靠 tweeFileList 顺序 + passage 同名
整段覆盖生效，与 gen_old_sewers 同机制）。

产出三个 twee 文件：

1. bjx-bird-events.twee (merge, 2 passages, 全部来自 BJX 新文件
   overworld-plains/loc-bird/main-bjx.twee):
        :: Bird Tower Ghost Descend    幽灵穿活板门下楼（出口 ->
                                     Bird Tower Base Leave）
        :: Bird Tower Bask Groom Dragon  龙翅被鹰梳理的享受线
                                     （出口 <<bird_perch_options>>）
   merge cleanup: 两 passage 头部 <<effects>> -> <<setTowerTemp>>
   <<effects>>（0.5 塔内 passage 一致性, setTowerTemp 为 0.5 新增的
   塔温维护 widget, 无参调用安全）。其余 verbatim: <<bhim>>/<<bHe>>/
   <<bhe>>/<<wife>>/<<lstress>>/<<bird_perch_options>> 均为 0.5 现有
   宏（text.twee:2104 wife / loc-bird/widgets.twee:907
   bird_perch_options / main.twee:1944 Bird Tower Base Leave）。

2. bjx-bird-main-hooks.twee (0.5 原版 loc-bird/main.twee 全文 +
   3 处 BJX patch; 0.5 bird 模块 2764 -> 8190 行大重构, 多处锚点全文
   不唯一, 全部 patch 先 passage 定界再 assert 唯一):
        B1  Bird Tower Look    飞行提示 if/elseif 块（12 行）整段 ->
                            BJX 双路径版（!$options.bjx_animal 走
                            0.4.3.3 计数变量, $options.bjx_animal 走
                            transformationParts 部件判定; 中文文本）
                            适配: <<if $pain gte 20>> -> 21（0.5 阈值;
                            $transformationParts.fallenAngel 键名 BJX
                            与 0.5 一致, ingame.js:1940 驼峰映射,
                            不做改写）

        B2  Bird Tower Door    正文（英文描述 + Next 链接）整段 ->
                            BJX 中文描述 + $options.bjx_eventTF and
                            $ghost gte 1 幽灵穿门分支（->
                            Bird Tower Ghost Descend）+ [[返回|Bird
                            Tower]]（ghost 门控 verbatim, 与
                            busstation/churchyard/landfill 组先例
                            一致: undefined gte 1 安全 false）
        B3  Bird Tower Bask    harpy groom 分支后插入 <<elseif
                            $dragon gte 6>> 龙翅梳理中文块（->
                            Bird Tower Bask Groom Dragon）, 并给
                            angel/demon/fallenangel elseif 追加 bee
                            判定。适配: $dragon gte 6 / $bee gte 6
                            （0.5 无 $dragon/$bee 计数变量）-> 按北极星
                            作者自己在 B1/W 系的 0.5 风格判定改为
                            $transformationParts.dragon.wings /
                            bee.wings isnot "disabled"（dragon/bee 键
                            由主会话 inject_early.js 统一补）;
                            $daystate -> Time.dayState（0.5 变量迁移）;
                            缩进 +1 tab 对齐 0.5 的
                            addinlineevent 层级

3. bjx-bird-widgets-hooks.twee (0.5 原版 loc-bird/widgets.twee 全文
   + 3 处 BJX patch; 0.5 的 bird_fly_options 大重构（plucked 分支/
   hunts 集成/getTimeString 链接）但 BJX 三处均为条件行级替换, 结构
   保留; <<if $harpy gte 6>> 在 widgets.twee 出现 4 处（853/876/
   1031/1073）, 全部 patch 先按 <<widget "...">> 定界再 assert 唯一):
        W1  bird_fly_options 顶层 <<if $harpy gte 6>> -> BJX 双路径
                            （bird.wings or dragon.wings）
        W2  bird_fly_options <<elseif $birdFly is 1>> -> BJX 双路径
                            （$birdFly is 1 or dragon.wings, 龙翅玩家
                            免学飞直接进远飞分支）
        W3  bird_fly_options <<elseif $angel gte 6 or $demon gte 6 or
                            $fallenangel gte 2>> -> BJX 双路径
                            （angel/fallenAngel/demon/bee 四键部件
                            判定, 键名 verbatim）

transformationParts dragon/bee 引用点统计（0.5 原生无此二键, 由主会话
inject_early.js ensureBjxTfKeys 统一补; 现有实现只补 slime/ghost/
mushroom, 需追加 dragon/bee）:
    dragon.wings x4  main-B1(671) / main-B3(2032, 由 $dragon gte 6
                     适配) / widgets-W1(417) / widgets-W2(430)
    bee.wings   x3  main-B1(675) / main-B3(2058, 由 $bee gte 6 适配) /
                     widgets-W3(447)
    （括号内为 BJX 源文件 overworld-plains/loc-bird/ 的行号）
另: $options.bjx_animal 在 BJX 侧由 04-Variables/variables-modUpdate
.twee:29 默认 true, 当前 pack/inject_early.js 均未种子——未种子时
!undefined=true 走计数变量路径（0.5 无 $harpy 变量更新则恒 false）,
BJX 新路径全部沉默。需主会话在 inject_early.js 补
V.options.bjx_animal = true 种子（tentacle 组 bjx-tentacle-hooks
.twee:557/562/566 同样依赖）。

依赖（0.5 侧均已确认）: <<setTowerTemp>>（widgets.twee:3036）、
<<bird_perch_options>>（widgets.twee:907）、<<bird_pass>>、
<<bhim>>/<<bHe>>/<<bhe>>/<<bhis>>/<<bHis>>/<<beasttype>>/<<wife>>
（base-system/text.twee）、<<lstress>>、<<garousal>>、<<orgasm>>、
<<arousal>>、<<ggdom>>/<<ldom>>/<<glove>>/<<deviant1>>、$monster/
$harpy/$angel/$demon/$fallenangel（variables-start.twee:355-376 均有,
$dragon/$bee 无——见上）、$birdFly、Time.dayState、
Bird Tower Base Leave passage（main.twee:1944）、
Bird Tower Perch Sex / Bird Tower Bask Groom Push passage、
$options.bjx_eventTF（inject_early.js:70 默认 true）、
transformationParts bird/angel/demon/fallenAngel 键（0.5 原生,
ingame.js setupTransformations, setup 名 "fallenangel" 经 :1940
映射为部件键 "fallenAngel"）。
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_bird')


def read(path):
    """Read as UTF-8 and normalise CRLF sources (BJX + refs are CRLF)
    down to LF so every patch anchors on LF text."""
    with open(path, encoding='utf-8', newline='') as f:
        return f.read().replace('\r\n', '\n')


def write(name, text):
    os.makedirs(OUT, exist_ok=True)
    if not text.endswith('\n'):
        text += '\n'
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print('%s: %d lines written' % (name, len(text.splitlines())))


def find_line(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    raise AssertionError('line not found: ' + needle[:60])


def translate_bird_block(lines):
    """0.4.3.3 -> 0.5 translations applied to a BJX block. NB: the
    camelCase $transformationParts.fallenAngel key is correct in 0.5 too
    (ingame.js:1940 maps the setup name "fallenangel" to the parts key
    "fallenAngel"); no case fixup is applied."""
    out = []
    for l in lines:
        l = l.replace('<<if $pain gte 20>>', '<<if $pain gte 21>>')
        l = l.replace('$daystate is "dawn"', 'Time.dayState is "dawn"')
        l = l.replace('$daystate is "dusk"', 'Time.dayState is "dusk"')
        out.append(l)
    return out


def patch_in_passage(src, passage_name, anchor, replacement, tag):
    """Passage-scoped replace: the anchor must occur exactly once inside the
    named ':: passage' (never file-wide - the 0.5 bird rework made several
    of these anchors ambiguous elsewhere in the file)."""
    chunks = src.split('\n:: ')
    hits = 0
    for i in range(1, len(chunks)):
        name = chunks[i].split('\n', 1)[0].split('[')[0].strip()
        if name == passage_name:
            assert chunks[i].count(anchor) == 1, (
                '%s: anchor not unique inside passage %s' % (tag, passage_name))
            chunks[i] = chunks[i].replace(anchor, replacement, 1)
            hits += 1
    assert hits == 1, '%s: passage %s not found (%d)' % (tag, passage_name, hits)
    return '\n:: '.join(chunks)


def patch_in_widget(src, widget_name, anchor, replacement, tag):
    """Widget-scoped replace for the widget-only file (no :: headers):
    the anchor must occur exactly once inside the named <<widget "...">>."""
    chunks = src.split('\n<<widget "')
    hits = 0
    for i in range(1, len(chunks)):
        name = chunks[i].split('"', 1)[0]
        if name == widget_name:
            assert chunks[i].count(anchor) == 1, (
                '%s: anchor not unique inside widget %s' % (tag, widget_name))
            chunks[i] = chunks[i].replace(anchor, replacement, 1)
            hits += 1
    assert hits == 1, '%s: widget %s not found (%d)' % (tag, widget_name, hits)
    return '\n<<widget "'.join(chunks)


HDR = '/* BJX pack: vanilla 0.5 {src} + BJX bird insertions. */\n'


# ---------------------------------------------------------------- events
def gen_events():
    src = read(os.path.join(BJX, 'overworld-plains', 'loc-bird',
                            'main-bjx.twee'))
    # every BJX tower passage gains the 0.5 setTowerTemp scene header
    for ps in ('Bird Tower Ghost Descend', 'Bird Tower Bask Groom Dragon'):
        old = ':: %s\n<<effects>>' % ps
        assert src.count(old) == 1, 'events header missing for ' + ps
        src = src.replace(old, ':: %s\n<<setTowerTemp>><<effects>>' % ps)
    out = ('/* BJX pack: BJX loc-bird main-bjx.twee merged (2 passages)\n'
           '   with 0.5 setTowerTemp headers. */\n' + src)
    # merge sanity
    assert '<<link [[穿过|Bird Tower Base Leave]]>>' in out
    assert out.count('<<setTowerTemp>>') == 2
    assert '<<bird_perch_options>>' in out
    assert '$skinColor' not in out and '$bestialitydisable' not in out
    ps = [l[3:].split('[')[0].strip() for l in out.split('\n')
          if l.startswith(':: ')]
    assert ps == ['Bird Tower Ghost Descend', 'Bird Tower Bask Groom Dragon']
    print('[M] events merge: 2 passages -> %s' % ', '.join(ps))
    write('bjx-bird-events.twee', out)


# ------------------------------------------------------------- main hooks
def gen_main_hooks():
    vanilla = read(os.path.join(REF, 'overworld-plains', 'loc-bird',
                                'main.twee'))
    bjx = read(os.path.join(BJX, 'overworld-plains', 'loc-bird', 'main.twee'))
    bjx_lines = bjx.split('\n')
    src = vanilla

    # ---- B1: Bird Tower Look - flight hint if/elseif block -> BJX
    # dual-path version (Chinese text, bjx_animal gate, dragon/bee wings).
    bi = find_line(bjx_lines, '<<if !$options.bjx_animal and $harpy gte 6 '
                              'or $options.bjx_animal and')
    ei = find_line(bjx_lines, '/* 北极星 */', bi)
    b1 = translate_bird_block(bjx_lines[bi:ei])
    joined = ''.join(b1)
    assert '$transformationParts.bird.wings' in joined
    assert '$transformationParts.dragon.wings' in joined
    assert '$transformationParts.bee.wings' in joined
    assert '$transformationParts.fallenAngel.wings' in joined
    assert '<<if $pain gte 21>>' in joined
    assert '如果你有更好的起跳点' in joined
    b1_anchor = (
        '<<if $harpy gte 6>>\n'
        '\t<!-- Redirects the player to the Perch, where flight can happen.'
        ' Moved everything to widgets.twee in the "bird_fly_options"'
        ' widget.-->\n'
        '\tThe wind could carry you a long way, if you had a better jumping'
        ' point. <span class="blue">The perch might be perfect.</span>\n'
        '\t<br><br>\n'
        '<<elseif $angel gte 6 or $demon gte 6 or $fallenangel gte 2>>\n'
        '\t<<if $pain gte 21>>\n'
        "\t\tYour wings should carry you down, <span class=\"purple\">but"
        " you're too injured for such a risky jump right now.</span>\n"
        '\t<<else>>\n'
        '\t\tYour wings would carry you down, if you had a better jumping'
        ' point. <span class="blue">The perch might be perfect.</span>\n'
        '\t<</if>>\n'
        '\t<br><br>\n'
        '<</if>>')
    b1_ins = ('/* BJX pack: BJX flight hint (bjx_animal dual path; '
              'dragon/bee wings\n   via transformationParts, keys seeded '
              'by inject_early.js) */\n' + '\n'.join(b1))
    src = patch_in_passage(src, 'Bird Tower Look', b1_anchor, b1_ins, 'B1')
    print('[P1] B1 Bird Tower Look   : passage 定界 | 12 行 harpy/angel '
          'if/elseif 块 -> BJX 双路径中文版 (pain 20->21)')

    # ---- B2: Bird Tower Door - body -> BJX Chinese text + ghost
    # phase-through branch.
    bi = find_line(bjx_lines, '你跪在活板门旁边')
    ei = find_line(bjx_lines, '/* 北极星 */', bi)
    b2 = bjx_lines[bi:ei]
    joined = ''.join(b2)
    assert '<<if $options.bjx_eventTF and $ghost gte 1>>' in joined
    assert '[[穿过活板门|Bird Tower Ghost Descend]]' in joined
    assert '[[返回|Bird Tower]]' in joined
    b2_anchor = (
        'You kneel beside the trapdoor. The wood is ancient, but dry and'
        ' preserved. You pull the door, but the lock proves firm. You peer'
        " inside the mechanism and see a mess of rust. You won't be able to"
        ' pick it.\n'
        '<br><br>\n'
        '\n'
        '<<link [[Next|Bird Tower]]>><</link>>\n'
        '<br>')
    b2_ins = ('/* BJX pack: BJX door text + ghost phase-through '
              '(bjx_eventTF) */\n' + '\n'.join(b2))
    src = patch_in_passage(src, 'Bird Tower Door', b2_anchor, b2_ins, 'B2')
    print('[P2] B2 Bird Tower Door   : passage 定界 | 英文正文+Next -> '
          'BJX 中文 + ghost 穿门分支 (-> Bird Tower Ghost Descend)')

    # ---- B3: Bird Tower Bask - dragon-wings grooming elseif inserted
    # between the harpy branch and the angel/demon/fallenangel elseif
    # (which also gains the bee-wings check).
    bi = find_line(bjx_lines, '<<elseif $dragon gte 6>>')
    ai = find_line(bjx_lines, '<<elseif $angel gte 6 or $demon gte 6 or '
                              '$fallenangel gte 2 or $bee gte 6>>', bi)
    dragon = bjx_lines[bi:ai]
    assert dragon[-1].strip() == '<</if>>'
    # reindent the body one tab deeper (0.5 nests this inside
    # <<addinlineevent>>), then set the elseif head at the 0.5 level
    dragon = ['\t' + l if (i > 0 and l.startswith('\t')) else l
              for i, l in enumerate(dragon)]
    dragon[0] = ('\t\t<<elseif $transformationParts.dragon.wings isnot '
                 '"disabled">>')
    dragon = translate_bird_block(dragon)
    joined = ''.join(dragon)
    assert 'Time.dayState is "dawn"' in joined
    assert '[[享受 (0:05)|Bird Tower Bask Groom Dragon]]' in joined
    assert '[[回报|Bird Tower Perch Sex]]' in joined
    assert '<<transform bird 1>>' not in joined  # BJX: dragons stay dragons
    b3_anchor = (
        '\t\t\t\t<<link [[Push away|Bird Tower Bask Groom Push]]>>'
        '<<npcincr "Great Hawk" dom -1>><</link>><<ldom>><br>\n'
        '\t\t\t<</if>>\n'
        '\t\t<<elseif $angel gte 6 or $demon gte 6 or $fallenangel gte 2>>')
    b3_ins = (
        '\t\t\t\t<<link [[Push away|Bird Tower Bask Groom Push]]>>'
        '<<npcincr "Great Hawk" dom -1>><</link>><<ldom>><br>\n'
        '\t\t\t<</if>>\n'
        '\t\t/* BJX pack: dragon-wings grooming branch (dragon/bee wings\n'
        '\t\t   via transformationParts, keys seeded by inject_early.js) */\n'
        + '\n'.join(dragon) + '\n'
        '\t\t<<elseif $angel gte 6 or $demon gte 6 or $fallenangel gte 2 or'
        ' $transformationParts.bee.wings isnot "disabled">>')
    src = patch_in_passage(src, 'Bird Tower Bask', b3_anchor, b3_ins, 'B3')
    print('[P3] B3 Bird Tower Bask   : passage 定界 | 插入 dragon groom '
          'elseif ($dragon gte 6 -> dragon.wings 判定, +1 tab 缩进) + '
          'angel elseif 追加 bee.wings ($bee gte 6 适配)')

    out = HDR.format(src='overworld-plains/loc-bird/main.twee') + src
    verify_main_hooks(out, vanilla)
    write('bjx-bird-main-hooks.twee', out)


def verify_main_hooks(out, vanilla):
    # vanilla passage name/order untouched
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    # B1
    assert out.count('如果你有更好的起跳点') == 2
    assert out.count('$options.bjx_animal') == 4  # B1 if + elseif, 2 each
    assert out.count('$transformationParts.dragon.wings') == 2  # B1 + B3
    assert out.count('$transformationParts.bee.wings') == 2      # B1 + B3
    assert out.count('$transformationParts.fallenAngel.wings') == \
        vanilla.count('$transformationParts.fallenAngel.wings') + 1  # B1
    assert '<<if $pain gte 21>>' in out
    # B2 (text body "脑袋穿过活板门" + link both match the bare substring,
    # so assert on the link form)
    assert out.count('[[穿过活板门|Bird Tower Ghost Descend]]') == 1
    assert out.count('穿过活板门') == 2
    assert out.count('Bird Tower Ghost Descend') == 1
    assert out.count('<<link [[返回|Bird Tower]]>>') == 1
    # the Door passage no longer offers the vanilla Next link
    for ch in out.split('\n:: '):
        if ch.split('\n', 1)[0].strip() == 'Bird Tower Door':
            assert 'Next|Bird Tower' not in ch
    # B3
    assert out.count('Bird Tower Bask Groom Dragon') == 1
    assert out.count('[[享受 (0:05)|Bird Tower Bask Groom Dragon]]') == 1
    assert out.count('Time.dayState is "dawn"') >= 1
    # structural sanity
    assert len(out) > len(vanilla)
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')
    print('main-hooks verify OK: %d passages, +%d chars' %
          (len(ops), len(out) - len(vanilla)))


# ---------------------------------------------------------- widgets hooks
def gen_widgets_hooks():
    vanilla = read(os.path.join(REF, 'overworld-plains', 'loc-bird',
                                'widgets.twee'))
    src = vanilla

    # W1: top-level harpy gate -> BJX dual path (bird/dragon wings).
    w1_anchor = '<<if $harpy gte 6>>'
    w1_ins = ('<<if !$options.bjx_animal and $harpy gte 6 or'
              ' $options.bjx_animal and'
              ' ($transformationParts.bird.wings isnot "disabled" or'
              ' $transformationParts.dragon.wings isnot "disabled")>>')
    src = patch_in_widget(src, 'bird_fly_options', w1_anchor, w1_ins, 'W1')
    print('[P4] W1 fly_options if   : widget 定界 | <<if $harpy gte 6>> -> '
          'BJX 双路径 (bird.wings or dragon.wings)')

    # W2: birdFly remote-fly branch -> BJX dual path (dragon wings fly
    # without lessons).
    w2_anchor = '<<elseif $birdFly is 1>>'
    w2_ins = ('<<elseif !$options.bjx_animal and $birdFly is 1 or'
              ' $options.bjx_animal and ($birdFly is 1 or'
              ' $transformationParts.dragon.wings isnot "disabled")>>')
    src = patch_in_widget(src, 'bird_fly_options', w2_anchor, w2_ins, 'W2')
    print('[P5] W2 fly_options fly  : widget 定界 | <<elseif $birdFly is 1>>'
          ' -> BJX 双路径 (龙翅免学飞)')

    # W3: angel/demon/fallenangel glide branch -> BJX dual path
    # (angel/fallenangel/demon/bee wings).
    w3_anchor = ('<<elseif $angel gte 6 or $demon gte 6 or'
                 ' $fallenangel gte 2>>')
    w3_ins = ('<<elseif !$options.bjx_animal and ($angel gte 6 or'
              ' $demon gte 6 or $fallenangel gte 2) or'
              ' $options.bjx_animal and'
              ' ($transformationParts.angel.wings isnot "disabled" or'
              ' $transformationParts.fallenAngel.wings isnot "disabled" or'
              ' $transformationParts.demon.wings isnot "disabled" or'
              ' $transformationParts.bee.wings isnot "disabled")>>')
    src = patch_in_widget(src, 'bird_fly_options', w3_anchor, w3_ins, 'W3')
    print('[P6] W3 fly_options glide: widget 定界 | angel/demon/fallenangel '
          'elseif -> BJX 双路径四键')

    out = HDR.format(src='overworld-plains/loc-bird/widgets.twee') + src
    verify_widgets_hooks(out, vanilla)
    write('bjx-bird-widgets-hooks.twee', out)


def verify_widgets_hooks(out, vanilla):
    # widget name/order untouched
    vw = [l[10:-2] for l in vanilla.split('\n')
          if l.startswith('<<widget "')]
    ow = [l[10:-2] for l in out.split('\n')
          if l.startswith('<<widget "')]
    assert vw == ow, 'widget name/order must stay identical to 0.5'
    # all three gates rewritten, exactly once each
    assert out.count('<<if $harpy gte 6>>') == 3  # 853/876/1031 stay
    assert out.count('$options.bjx_animal') == 6  # 2 per rewritten gate
    assert out.count('$transformationParts.dragon.wings') == 2  # W1 + W2
    assert out.count('$transformationParts.bee.wings') == 1      # W3
    assert out.count('$transformationParts.fallenAngel.wings') == \
        vanilla.count('$transformationParts.fallenAngel.wings') + 1  # W3
    assert out.count('$transformationParts.bird.wings') == \
        vanilla.count('$transformationParts.bird.wings') + 1     # W1
    assert out.count('$transformationParts.angel.wings') == \
        vanilla.count('$transformationParts.angel.wings') + 1    # W3
    assert out.count('$transformationParts.demon.wings') == \
        vanilla.count('$transformationParts.demon.wings') + 1    # W3
    assert '<<elseif $birdFly is 1>>' not in out
    # the three other widgets with harpy checks stay pure 0.5
    for ch in out.split('\n<<widget "'):
        name = ch.split('"', 1)[0]
        if name in ('bird_rescue', 'bird_warning', 'bird_perch_options'):
            assert 'bjx_animal' not in ch, name
    # structural sanity
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')
    assert len(out) > len(vanilla)
    print('widgets-hooks verify OK: %d widgets, +%d chars' %
          (len(ow), len(out) - len(vanilla)))


# ---------------------------------------------------------------- cross
def cross_check():
    """The 2 new passages must not collide with any 0.5 bird passage,
    and the whole 0.5 tree must not define them either."""
    ev = read(os.path.join(OUT, 'bjx-bird-events.twee'))
    new_ps = [l[3:].split('[')[0].strip()
              for l in ev.split('\n') if l.startswith(':: ')]
    assert len(new_ps) == 2, new_ps
    known = set()
    bdir = os.path.join(REF, 'overworld-plains', 'loc-bird')
    for f in os.listdir(bdir):
        if f.endswith('.twee'):
            for l in read(os.path.join(bdir, f)).split('\n'):
                if l.startswith(':: '):
                    known.add(l[3:].split('[')[0].strip())
    clash = [p for p in new_ps if p in known]
    assert not clash, 'passage name clash with 0.5: %s' % clash
    # transformationParts dragon/bee reference census across outputs
    census = {}
    for f in ('bjx-bird-main-hooks.twee', 'bjx-bird-widgets-hooks.twee'):
        t = read(os.path.join(OUT, f))
        for key in ('dragon', 'bee'):
            census['%s:%s.wings' % (f, key)] = t.count(
                '$transformationParts.%s.wings' % key)
    total_dragon = sum(v for k, v in census.items() if 'dragon' in k)
    total_bee = sum(v for k, v in census.items() if 'bee' in k)
    assert total_dragon == 4, census   # B1 + B3 + W1 + W2
    assert total_bee == 3, census      # B1 + B3 + W3
    print('cross-check OK: 2 new passages, no collisions; '
          'transformationParts dragon.wings x%d, bee.wings x%d'
          % (total_dragon, total_bee))


def main():
    gen_events()
    gen_main_hooks()
    gen_widgets_hooks()
    cross_check()
    print('ALL BIRD CHECKS PASSED')


if __name__ == '__main__':
    main()