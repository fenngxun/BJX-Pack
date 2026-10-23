# -*- coding: utf-8 -*-
"""Build the bjx-pack mod source tree (batch 1: ant-island + bunker + taylor
+ casey + hive) from the BJX 0.4.3.3 source repo.

Idempotent: wipes and regenerates work/bjx-pack/tweeFileList content from
sources every run. inject_early.js is NOT touched (hand-maintained).
"""
import json
import os
import re
import shutil
import sys
import io
import time
import zipfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bjx_version import VERSION  # noqa: E402  单一版本号真相源

ROOT = r'C:\Users\79403\Desktop\dol'
WORK = os.path.join(ROOT, 'work')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
ANT = os.path.join(ROOT, 'work', 'bjx-ant-island')
PACK = os.path.join(ROOT, 'work', 'bjx-pack')
TWE = os.path.join(PACK, 'tweeFileList')


def gen_compat():
    """bjx-compat.twee: re-define the vanilla <<npcincr>> widget with Taylor
    and Casey added to its hardcoded NNPC whitelist. BJX only ever calls
    npcincr with love for these two, so the love case (no secondary
    whitelist) covers everything; later widget definitions override the
    vanilla one at load order."""
    src = read(os.path.join(REF, 'base-system', 'named-npcs.twee'))
    lines = src.split('\n')
    start = next(i for i, l in enumerate(lines) if l.startswith('<<widget "npcincr">>'))
    end = next(i for i, l in enumerate(lines) if l.startswith('<</widget>>') and i > start)
    body = lines[start:end + 1]
    wl = '\t<<set _validNNPCNames to ["Avery",'
    idx = next(i for i, l in enumerate(body) if l.startswith(wl))
    assert body[idx].rstrip().endswith(']>>'), 'whitelist line changed: ' + body[idx]
    body[idx] = body[idx].rstrip()[:-3] + ',"泰勒","凯西"]>>'
    out = ('/* BJX pack compat: vanilla npcincr with Taylor/Casey whitelisted.\n'
           '   0.5.10.12 hardcodes an NNPC whitelist inside <<npcincr>> that\n'
           '   rejects dynamically registered NPCs. */\n'
           ':: Widgets BJX Compat [widget]\n\n' + '\n'.join(body) + '\n')
    write(os.path.join(TWE, 'bjx-compat.twee'), out)
    print('bjx-compat.twee: npcincr whitelist +泰勒/凯西')


def gen_statistics():
    """bjx-statistics.twee: 原版 <<Statistics>> 整页 + BJX 兽化行。

    0.4.3.3 星扩的统计页（选项 -> 统计 -> 转化）在「狐化阶段」后面接了
    14 条 BJX 兽化 build/阶段行（羊/蜜蜂/鹿/熊/龙/蜥蜴/海豚/狗/鱼/浣熊/
    马/蜘蛛/青蛙/猪）＋蘑菇营养/进化阶段；移植时整页没跟过来，玩家只看
    得到原版 8 条。

    这里直接整页覆盖而不是用 TweeReplacer 打补丁：ModI18N 的运行时汉化
    先于 TweeReplacer 的 do_patch 生效，英文锚点已被替换成中文，补丁匹配
    不上（实测 findString 找不到）。整页覆盖走正常的 passage 覆盖语义，
    汉化、排序都不受影响。
    """
    src = read(os.path.join(REF, 'base-system', 'overlays', 'statistics.twee'))
    lines = src.split('\n')
    idx = next(i for i, l in enumerate(lines) if 'Fox manifestation:' in l)
    assert lines[idx + 1].strip() == '<br>', 'statistics anchor changed: ' + repr(lines[idx:idx + 2])

    TFS = [
        ('羊化', 'sheepbuild', 'sheep', 30),
        ('蜜蜂化', 'beebuild', 'bee', 30),
        ('鹿化', 'deerbuild', 'deer', 30),
        ('熊化', 'bearbuild', 'bear', 30),
        ('龙化', 'dragonbuild', 'dragon', 50),
        ('蜥蜴化', 'lizardbuild', 'lizard', 30),
        ('海豚化', 'dolphinbuild', 'dolphin', 30),
        ('狗化', 'dogbuild', 'dog', 30),
        ('鱼化', 'fishbuild', 'fish', 30),
        ('浣熊化', 'raccoonbuild', 'raccoon', 30),
        ('马化', 'horsebuild', 'horse', 30),
        ('蜘蛛化', 'spiderbuild', 'spider', 30),
        ('青蛙化', 'frogbuild', 'frog', 30),
        ('猪化', 'pigbuild', 'pig', 30),
    ]
    block = ['\t\t\t/* 北极星模组：事件兽化 */']
    for label, build, stage, need in TFS:
        block.append('\t\t\t%s: <<print Math.trunc($%s ?? 0)>> (%d+ 完成变形)' % (label, build, need))
        block.append('\t\t\t<br>')
        block.append('\t\t\t%s阶段: <<print Math.trunc($%s ?? 0)>>' % (label, stage))
        block.append('\t\t\t<br>')
    block.append('\t\t\t蘑菇营养(进化点): <<print Math.trunc($fungalpoint ?? 0)>> (每30天获得一个)')
    block.append('\t\t\t<br>')
    block.append('\t\t\t蘑菇进化阶段: <<print Math.trunc($mushroom ?? 0)>>')
    block.append('\t\t\t<br><br>')

    out = lines[:idx + 2] + block + lines[idx + 2:]
    write(os.path.join(TWE, 'bjx-statistics.twee'), '\n'.join(out))
    print('bjx-statistics.twee: %d 条兽化行 + 蘑菇' % len(TFS))


def gen_compat2():
    """bjx-compat2.twee: BJX hint macros (stat change indicators) that
    0.5.10.12 removed, plus two icon widgets the lakehouse references.
    g_science_star & friends no longer exist in 0.5.10.12, so the four
    school-skill macros drop their trailing star call."""
    def hint(widget_name, sign_class, text):
        return ('<<widget "%s">>\n'
                '\t<<if !$settings.blindStatsEnabled>> |\n'
                '\t\t<span class="%s">%s</span>\n'
                '\t<</if>>\n'
                '<</widget>>' % (widget_name, sign_class, text))

    parts = []
    parts.append(hint('lstress', 'green', '- Stress'))
    parts.append(hint('llstress', 'green', '- - Stress'))
    parts.append(hint('ltrauma', 'green', '- Trauma'))
    parts.append(hint('lltrauma', 'green', '- - Trauma'))
    parts.append(hint('gstress', 'red', '+ Stress'))
    parts.append(hint('ggstress', 'red', '+ + Stress'))
    parts.append(hint('gggstress', 'red', '+ + + Stress'))
    parts.append(hint('gpain', 'red', '+ Pain'))
    parts.append(hint('gtiredness', 'red', '+ Fatigue'))
    parts.append(hint('gwillpower', 'green', '+ Willpower'))
    parts.append(hint('ggwillpower', 'green', '+ + Willpower'))
    parts.append(hint('gphysique', 'green', '+ Physique'))
    parts.append(hint('ghandskill', 'green', '+ Hand skill'))
    parts.append(hint('gscience', 'green', '+ Science'))
    parts.append(hint('gmaths', 'green', '+ Maths'))
    parts.append(hint('genglish', 'green', '+ English'))
    parts.append(hint('ghistory', 'green', '+ History'))
    parts.append('''<<widget "gglove">>
\t<<if !$settings.blindStatsEnabled>> |
\t\t<<if _args[0]>>
\t\t\t<span class="green">+ + _args[0]'s Love</span>
\t\t<<else>>
\t\t\t<span class="green">+ + Love</span>
\t\t<</if>>
\t<</if>>
<</widget>>''')
    parts.append('''<<widget "llove">>
\t<<if !$settings.blindStatsEnabled>> |
\t\t<<if _args[0]>>
\t\t\t<span class="red">- _args[0]'s Love</span>
\t\t<<else>>
\t\t\t<span class="red">- Love</span>
\t\t<</if>>
\t<</if>>
<</widget>>''')
    parts.append('''<<widget "slime">>
\t<<if !$settings.blindStatsEnabled>> |
\t\t<span class="green">史莱姆</span>
\t<</if>>
<</widget>>''')
    parts.append('<<widget "bloodmirroricon">><<icon "mirror-blood.gif">><</widget>>')
    parts.append('<<widget "dyeicon">><<icon "dye.png">><</widget>>')

    out = ('/* BJX pack compat 2: hint macros + lakehouse icon widgets that\n'
           '   0.5.10.12 removed or never had. 0.5.10.12 keeps $statdisable\n'
           '   (blindStatsEnabled) so the guard clause still works. */\n'
           ':: Widgets BJX Compat 2 [widget]\n\n' + '\n\n'.join(parts) + '\n')
    write(os.path.join(TWE, 'bjx-compat2.twee'), out)
    print('bjx-compat2.twee: hint macros + bloodmirroricon/dyeicon')


def gen_beast_generation():
    """bjx-beast-generation.twee: regenerate from the FULL vanilla 0.5
    beast-generation.twee (single 'Widgets Beast Generation' passage:
    generateBEAST + beastattribute + generate_beast_traits + dolphin
    widgets), then patch in the 9 BJX extra beast types. Replaces the
    ant-island-era copy which only knew about 'ant'.

    Index safety: the 9 appended types resolve their attribute index via
    _t.indexOf (authoritative concat order), NOT $BeastList.indexOf -
    the JS ensureBeasts() push order differs (ant first) and 'snake' may
    or may not be present depending on save age."""
    src = read(os.path.join(REF, 'base-combat', 'beast-generation.twee'))

    def patch(anchor, replacement, what):
        assert src.count(anchor) == 1, 'anchor not unique for ' + what
        return src.replace(anchor, replacement)

    # P1: append the 9 BJX beast attribute rows after the vanilla _ps array.
    p1_anchor = '\t<<set _ps to [2,2,2,3,2,2,3,3,2,5,2,2,4,2,2]>> <!-- Size of penises -->\n'
    p1_add = (p1_anchor +
              '\t/* BJX pack: 9 extra beast types (attribute order is authoritative -\n'
              '\t   index resolution below uses _t, NOT $BeastList). */\n'
              '\t<<set _h to _h.concat([300,250,300,400,500,300,150,200,300])>>\n'
              '\t<<set _t to _t.concat(["sheep","deer","bee","wasp","dragon","ant","raccoon","frog","rat"])>>\n'
              '\t<<set _d to _d.concat([ ["松软的"],["俊美的"],["奇怪的"],["奇怪的"],["有鳞的"],["奇怪的"],["俊美的"],["湿滑的"],["肮脏的"] ])>>\n'
              '\t<<set _pd to _pd.concat(["肉棒","肉棒","肉棒","肉棒","肉棒","肉棒","肉棒","肉棒","肉棒"])>>\n'
              '\t<<set _ps to _ps.concat([4,3,2,2,5,3,2,2,3])>>\n')
    src = patch(p1_anchor, p1_add, 'P1 attribute arrays')

    # P2: resolve the appended types' index from _t instead of $BeastList.
    p2_anchor = '\t<<set _i to $BeastList.indexOf(_type)>>\n'
    p2_add = (p2_anchor +
              '\t<<if ["sheep","deer","bee","wasp","dragon","ant","raccoon","frog","rat"].includes(_type)>>\n'
              '\t\t<<set _i to _t.indexOf(_type)>>\n'
              '\t<</if>>\n')
    src = patch(p2_anchor, p2_add, 'P2 index resolution')

    # P3: deer have hooves like pigs and boars.
    src = patch('\t<<elseif $NPCList[_n].type is "pig" or $NPCList[_n].type is "boar">>\n',
                '\t<<elseif $NPCList[_n].type is "pig" or $NPCList[_n].type is "boar" or $NPCList[_n].type is "deer">>\n',
                'P3 deer hooves')

    # P4: monster conversion also drops claws for the claw-less BJX types.
    src = patch('<<if ["dog","pig","wolf","dolphin","boar","fox","hawk","cow","snake"].includes($NPCList[_n].type)>>',
                '<<if ["dog","pig","wolf","dolphin","boar","fox","hawk","cow","snake","deer","raccoon","frog","rat"].includes($NPCList[_n].type)>>',
                'P4 monster claws list')

    # P5: named monster conversions for sheep (sheepgirl/ramboy) and deer
    #     (deergirl/stagboy), inserted after the creature do-nothing branch.
    p5_anchor = ('\t\t<<elseif $NPCList[_n].type is "creature">>\n'
                 '\t\t\t<!-- do nothing so creatures don\'t become creatureboys -->\n')
    p5_add = (p5_anchor +
              '\t\t<<elseif $NPCList[_n].type is "sheep">>\n'
              '\t\t\t<<if $NPCList[_n].gender is "f">>\n'
              '\t\t\t\t<<set $NPCList[_n].type to "sheepgirl">>\n'
              '\t\t\t<<else>>\n'
              '\t\t\t\t<<set $NPCList[_n].type to "ramboy">>\n'
              '\t\t\t<</if>>\n'
              '\t\t<<elseif $NPCList[_n].type is "deer">>\n'
              '\t\t\t<<if $NPCList[_n].gender is "f">>\n'
              '\t\t\t\t<<set $NPCList[_n].type to "deergirl">>\n'
              '\t\t\t<<else>>\n'
              '\t\t\t\t<<set $NPCList[_n].type to "stagboy">>\n'
              '\t\t\t<</if>>\n')
    src = patch(p5_anchor, p5_add, 'P5 sheep/deer monster names')

    # P6: female monster-people chest access for the BJX types too.
    src = patch('["catgirl", "doggirl", "wolfgirl", "beargirl", "foxgirl", "cowgirl", "harpy"].includes($NPCList[_n].type)',
                '["catgirl", "doggirl", "wolfgirl", "beargirl", "foxgirl", "cowgirl", "harpy", "deergirl", "sheepgirl", "raccoongirl"].includes($NPCList[_n].type)',
                'P6 chest list')

    write(os.path.join(TWE, 'bjx-beast-generation.twee'), src)
    print('bjx-beast-generation.twee: vanilla 0.5 full text + 9-beast patch')


def gen_compat3():
    """bjx-compat3.twee: batch 3 hint macros (arousal/control/lust/purity/
    grace/pain/love/air), the foodsteakicon widget, and a transform macro
    re-definition that adds the 16 BJX beast-form cases on top of the
    vanilla 0.5 definition."""
    def hint(widget_name, sign_class, text):
        return ('<<widget "%s">>\n'
                '\t<<if !$settings.blindStatsEnabled>> |\n'
                '\t\t<span class="%s">%s</span>\n'
                '\t<</if>>\n'
                '<</widget>>' % (widget_name, sign_class, text))

    parts = []
    parts.append(hint('larousal', 'green', '- Arousal'))
    parts.append(hint('llarousal', 'green', '- - Arousal'))
    parts.append(hint('garousal', 'red', '+ Arousal'))
    parts.append(hint('ggarousal', 'red', '+ + Arousal'))
    parts.append(hint('gggarousal', 'red', '+ + + Arousal'))
    parts.append(hint('gcontrol', 'green', '+ Control'))
    parts.append(hint('llcontrol', 'red', '- - Control'))
    parts.append(hint('llpain', 'green', '- - Pain'))
    parts.append(hint('loxygen', 'blue', '- Air'))
    parts.append('''<<widget "glust">>
\t<<if !$settings.blindStatsEnabled>> |
\t\t<<if _args[0]>>
\t\t\t<span class="lewd">+ _args[0]'s Lust</span>
\t\t<<else>>
\t\t\t<span class="lewd">+ Lust</span>
\t\t<</if>>
\t<</if>>
<</widget>>''')
    parts.append('''<<widget "gglust">>
\t<<if !$settings.blindStatsEnabled>> |
\t\t<<if _args[0]>>
\t\t\t<span class="lewd">+ + _args[0]</span>
\t\t<<else>>
\t\t\t<span class="lewd">+ + Lust</span>
\t\t<</if>>
\t<</if>>
<</widget>>''')
    parts.append('''<<widget "gslust">>
\t<<if !$settings.blindStatsEnabled>> |
\t\t<span class="lewd">+ Sydney's Lust</span>
\t<</if>>
\t<<set _lustincrdisplay to 1>>
<</widget>>''')
    syd = '<<if $NPCName[$NPCNameList.indexOf("Sydney")].purity gte 1>>'
    parts.append('''<<widget "gspurity">>
\t<<if !$settings.blindStatsEnabled>> |
\t\t''' + syd + '''
\t\t\t<span class="teal">+ Sydney's Purity</span>
\t\t<<else>>
\t\t\t<span class="teal">- Sydney's Corruption</span>
\t\t<</if>>
\t<</if>>
\t<<set _warnstate to 1>>
<</widget>>''')
    parts.append('''<<widget "lspurity">>
\t<<if !$settings.blindStatsEnabled>> |
\t\t''' + syd + '''
\t\t\t<span class="purple">- Sydney's Purity</span>
\t\t<<else>>
\t\t\t<span class="purple">+ Sydney's Corruption</span>
\t\t<</if>>
\t\t<<if $NPCName[$NPCNameList.indexOf("Sydney")].purity lte 50 and _lustincrdisplay isnot 1>>
\t\t\t<<glust>>
\t\t<</if>>
\t<</if>>
\t<<set _warnstate to -1>>
<</widget>>''')
    parts.append('''<<widget "lllove">>
\t<<if !$settings.blindStatsEnabled>> |
\t\t<<if _args[0]>>
\t\t\t<span class="red">- - _args[0]'s Love</span>
\t\t<<else>>
\t\t\t<span class="red">- - Love</span>
\t\t<</if>>
\t<</if>>
<</widget>>''')
    parts.append('''<<widget "lllgrace">>
\t<<if !$settings.blindStatsEnabled and $temple_rank isnot undefined and $temple_rank isnot "prospective">>
\t\t<<if _args[0] is "monk">>
\t\t\t<<if $temple_rank is "initiate">> |
\t\t\t\t<span class="red">- - - Grace</span>
\t\t\t<<else>>
\t\t\t<</if>>
\t\t<<elseif _args[0] is "priest">>
\t\t\t<<if $temple_rank is "initiate" or $temple_rank is "monk">> |
\t\t\t\t<span class="red">- - - Grace</span>
\t\t\t<<else>>
\t\t\t<</if>>
\t\t<<elseif _args[0] is "bishop">>
\t\t\t<<if $temple_rank is "initiate" or $temple_rank is "monk" or $temple_rank is "priest">> |
\t\t\t\t<span class="red">- - - Grace</span>
\t\t\t<<else>>
\t\t\t<</if>>
\t\t<<else>> |
\t\t\t<span class="red">- - - Grace</span>
\t\t<</if>>
\t<</if>>
<</widget>>''')
    parts.append('<<widget "foodsteakicon">><<icon "tending/steak.png">><</widget>>')

    # transform: vanilla 0.5 definition + the 16 BJX beast-form cases.
    # BJX-only builds ($deerbuild etc.) are undefined in 0.5, hence ?? 0.
    src = read(os.path.join(REF, 'base-system', 'transformations.twee'))
    lines = src.split('\n')
    start = next(i for i, l in enumerate(lines) if l.startswith('<<widget "transform">>'))
    end = next(i for i, l in enumerate(lines) if l.startswith('<</widget>>') and i > start)
    body = lines[start:end + 1]
    idx = next(i for i, l in enumerate(body) if l.strip() == '<</switch>>')
    extra = ['\t\t\t/* BJX pack: extended beast forms */']
    for form in ['hunter', 'bee', 'sheep', 'deer', 'bear', 'dragon', 'lizard',
                 'dolphin', 'dog', 'raccoon', 'fish', 'horse', 'spider',
                 'frog', 'pig']:
        if form == 'dragon':
            # dragon line is gated: the PC must have completed a full
            # transformation (build 100) of another creature before dragon
            # build accumulates; negative args (decay) pass through
            extra.append('\t\t\t<<case "dragon">> <<if _args[1] gte 1 and !$bjx_dragonUnlock>><span class="gold">你的身躯尚未准备好承载龙之力。（需先完整变身过其他生物一次）</span><<else>><<set $dragonbuild to Math.clamp(($dragonbuild ?? 0) + _args[1], 0, 100)>><</if>>')
        elif form == 'hunter':
            # hunter: "build" is now the 0~360 progress of SPEC-hunter-rework
            # (was 0~100 "conviction"). Clamp must match bjxHunterGain.
            extra.append('\t\t\t<<case "hunter">> <<set $hunterbuild to Math.clamp(($hunterbuild ?? 0) + _args[1], 0, 360)>>')
        else:
            extra.append('\t\t\t<<case "%s">> <<set $%sbuild to Math.clamp(($%sbuild ?? 0) + _args[1], 0, 100)>>'
                         % (form, form, form))
    body[idx:idx] = extra
    # unlock detector (inside the <<if _args[1]>> block, right after the
    # switch): a non-dragon species whose build reaches 100 opens the line
    det = ['\t\t\t/* BJX pack: 龙化前置——非龙生物 build 达 100 即解锁龙化 */',
           '\t\t\t<<if _args[0] isnot "dragon" and _args[1] gte 1 and !$bjx_dragonUnlock>>',
           '\t\t\t\t<<run if ((State.variables[_args[0] + "build"] ?? 0) >= 100) State.variables.bjx_dragonUnlock = true;>>',
           '\t\t\t<</if>>']
    body[idx + len(extra) + 1:idx + len(extra) + 1] = det
    parts.append('\n'.join(body))

    out = ('/* BJX pack compat 3: batch-3 hint macros, foodsteakicon (uses the\n'
           '   0.5.10.12 tending/steak.png icon), and transform extended with\n'
           '   the BJX beast forms. Blind-stat guard uses blindStatsEnabled. */\n'
           ':: Widgets BJX Compat 3 [widget]\n\n' + '\n\n'.join(parts) + '\n')
    write(os.path.join(TWE, 'bjx-compat3.twee'), out)
    print('bjx-compat3.twee: 16 hint macros + foodsteakicon + transform ext')


def gen_forest_events():
    """bjx-forest-events.twee: forest events-bjx.twee with the hand-written
    BJX rescue logic replaced by the vanilla 0.5 forestRescue system
    (forestRescueSetup / forestRescueCheck / forestRescue)."""
    lines = read(os.path.join(BJX, 'overworld-forest', 'loc-forest', 'events-bjx.twee')).split('\n')

    def expect(idx, prefix):
        assert lines[idx].startswith(prefix), 'line %d: %r !~ %r' % (idx + 1, lines[idx], prefix)

    # --- Forest Dragon Molestation ---
    i = next(i for i, l in enumerate(lines) if l == '\t<<if $loveInterest>>')
    j = next(j for j in range(i, len(lines)) if lines[j] == '\t<</if>>' and j > i)
    assert 'enable_rescue' in '\n'.join(lines[i:j + 1])
    lines[i:j + 1] = ['\t<<forestRescueSetup>>']
    i = next(i for i, l in enumerate(lines) if l == '<<if $alarm is 1 and $rescue is 0>>')
    j = next(j for j in range(i, len(lines)) if lines[j] == '<</if>>' and j > i)
    lines[i:j + 1] = ['<<forestRescueCheck>>']
    # Finish rescue branch
    i = next(i for i, l in enumerate(lines) if l == '<<elseif $rescue is 1 and $alarm is 1>>')
    j = next(j for j in range(i, len(lines)) if lines[j] == '<</if>>' and j > i)
    assert 'edenCagedSave' in '\n'.join(lines[i:j])
    lines[i:j + 1] = ['<<elseif $rescue is 1>>', '\t<<forestRescue>>', '<</if>>']

    # --- Deer Rape ---
    i = next(i for i, l in enumerate(lines) if l == '\t<<set $enemytrust += 40>>')
    lines.insert(i + 1, '\t<<forestRescueSetup>>')
    i = next(i for i, l in enumerate(lines) if l == '<<if $alarm is 1 and $rescue is 0>>')
    j = next(j for j in range(i, len(lines)) if lines[j] == '<</if>>' and j > i)
    lines[i:j + 1] = ['<<forestRescueCheck>>']
    # drop the rescue-is-2 branch (BJX hand-made rescue page)
    i = next(i for i, l in enumerate(lines) if l == '<<if $alarm is 1 and $rescue is 2>>')
    expect(i + 1, '\t<span id="next">')
    assert 'Deer Rescue' in lines[i + 1]
    del lines[i:i + 2]
    expect(i, '<<elseif _combatend>>')
    lines[i] = '<<if _combatend>>'
    # merge the two hand-written rescue branches into <<forestRescue>>
    i = next(i for i, l in enumerate(lines) if l == '<<elseif $rescue is 1 and $forest lte 20>>')
    k = next(k for k in range(i, len(lines)) if lines[k] == '<</if>>' and k > i and
             'Deer Rape Finish' not in '\n'.join(lines[i:k]))
    # find final closing </if> of this if-chain: first <</if>> after the else-branch
    else_i = next(e for e in range(i, len(lines)) if lines[e] == '<<else>>' and e > i)
    k = next(k for k in range(else_i, len(lines)) if lines[k] == '<</if>>' and k > else_i)
    escape = '\n'.join(lines[else_i:k + 1])
    assert '推开' in escape
    lines[i:k + 1] = ['<<elseif $rescue is 1>>', '\t<<forestRescue>>'] + escape.split('\n')

    # --- misc ---
    txt = '\n'.join(lines)
    txt = txt.replace('<<if $analdisable is "f">>', '<<if $settings.analEnabled>>')
    txt = re.sub(r'^:: (.*\S) +$', lambda m: ':: ' + m.group(1), txt, flags=re.M)
    out = ('/* BJX pack: forest events (BJX 0.4.3.3 source) with the rescue\n'
           '   logic ported to the vanilla 0.5 forestRescue system. */\n' + txt + '\n')
    write(os.path.join(TWE, 'bjx-forest-events.twee'), out)
    n = len(re.findall(r'^::', txt, re.M))
    print('bjx-forest-events.twee: %d passages (rescue system translated)' % n)


def _widget_block(path, name):
    """Extract one widget definition block from a twee file."""
    lines = read(path).split('\n')
    start = next(i for i, l in enumerate(lines) if l.startswith('<<widget "%s">' % name))
    end = next(i for i, l in enumerate(lines) if l.startswith('<</widget>>') and i > start)
    return lines[start:end + 1]


def gen_forest_hooks():
    """bjx-forest-hooks.twee: vanilla 0.5 forest/bog event dispatchers with
    the BJX event entries appended, plus the BJX-only widgets and the
    BJX Forest Deer passage (superset of vanilla - vanilla never changed)."""
    f05 = os.path.join(REF, 'overworld-forest', 'loc-forest', 'widgets.twee')
    b05 = os.path.join(REF, 'overworld-forest', 'loc-bog', 'widgets.twee')
    fbx = os.path.join(BJX, 'overworld-forest', 'loc-forest', 'widgets.twee')

    out_parts = [':: Widgets BJX Forest Hooks [widget]\n']
    out_parts.append('/* Dispatchers re-defined: vanilla 0.5 text + BJX entries. */\n')

    def hook_widget(path, name, insert):
        block = _widget_block(path, name)
        idx = max(i for i, l in enumerate(block) if l.strip() == '<<runeventpool>>')
        block[idx:idx] = insert
        return '\n'.join(block)

    out_parts.append(hook_widget(f05, 'eventforestoutskirts', ['\t\t<<addevent "forestraccoon" 0.15>>']))
    out_parts.append(hook_widget(f05, 'eventforest', [
        '\t\t<<addevent "forestraccoon" 0.15>>',
        '\t\t<<addevent "forestdragon" 0.05>>',
    ]))
    out_parts.append(hook_widget(f05, 'eventforestdeep', [
        '\t\t<<addevent "forestraccoon" 0.15>>',
        '\t\t<<addevent "forestdragon" 0.05>>',
    ]))

    bog_insert = [
        '\t<<addinlineevent "bog_frog">>',
        '\t\t<<beastNEWinit 1 frog>>',
        '\t\t你小心翼翼地绕过一滩淤泥，突然之间闻到一股刺鼻的气味，这味道直冲天灵。然后水面开始泛起涟漪，从中钻出一条长长的、黏糊糊的舌头缠绕着你并把你拉入水中。',
        '\t\t<br><br>',
        '',
        '\t\t<<link [[继续|Bog Frog]]>><<set $molestationstart to 1>><</link>>',
        '\t<</addinlineevent>>',
        '\t<<addinlineevent "bog_mosquito">>',
        '\t\t在你穿越沼泽的时候，你感觉有什么东西在跟着你。一阵嗡嗡的响声萦绕在你耳边，原来是一群蚊子。',
        '\t\t<br><br>',
        '',
        '\t\t<<link [[继续|Bog Mosquito]]>><<set $struggle_start to 1>><</link>>',
        '\t<</addinlineevent>>',
        '\t<<if $options.bjx_eventTF and !$mushroom and !$ghost and !$slime>>',
        '\t\t<<addevent "mushroomgrove" 0.1>>',
        '\t<</if>>',
    ]
    out_parts.append(hook_widget(b05, 'eventbog', bog_insert))
    out_parts.append(hook_widget(b05, 'eventbogsafe', [
        '\t<<if $options.bjx_eventTF and !$mushroom and !$ghost and !$slime>>',
        '\t\t<<addevent "mushroomgrove" 0.1>>',
        '\t<</if>>',
    ]))

    out_parts.append('/* BJX-only widgets (vanilla 0.5 + 0.4.3.3 never had them). */\n')
    for w in ['forestraccoon', 'forestdragon', 'mushroomgrove', 'forest_deer']:
        out_parts.append('\n'.join(_widget_block(fbx, w)))

    joined = '\n\n'.join(out_parts)
    joined = joined.replace('$bestialitydisable is "f" or $monster is 1',
                            '$settings.bestialityEnabled or $monster is 1')

    # Forest Deer passage: BJX version is a strict superset of vanilla
    # (vanilla 0.5 == 0.4.3.3 verbatim, BJX adds the TF/danger branch).
    deer_lines = read(os.path.join(BJX, 'overworld-forest', 'loc-forest', 'events.twee')).split('\n')
    s = next(i for i, l in enumerate(deer_lines) if l == ':: Forest Deer')
    e = next(i for i in range(s + 1, len(deer_lines)) if deer_lines[i].startswith(':: '))
    deer = '\n'.join(deer_lines[s:e]).rstrip() + '\n'

    out = ('/* BJX pack: forest dispatcher hooks + BJX-only forest widgets\n'
           '   + the BJX Forest Deer passage (superset of vanilla). */\n'
           + joined + '\n\n' + deer)
    write(os.path.join(TWE, 'bjx-forest-hooks.twee'), out)
    print('bjx-forest-hooks.twee: 5 dispatchers hooked, 4 widgets, Forest Deer')


def gen_moor_events():
    """bjx-moor.twee: BJX moor additions - 6 dragon-encounter passages
    (events-bjx) + 10 pure-pool / demon-book passages (main-bjx).
    <<beastTrainGenerate>>/<<combatTrainAdvance>> exist in 0.5 with the same
    $combatTrain.length semantics; the <<slime>> hint macro already lives in
    bjx-compat2.twee. $skinColor (0.4.3.3 story var) -> Skin.color (0.5 JS
    object). Castle-page entrances are injected from inject_early.js."""
    merge(['overworld-plains/loc-moor/events-bjx.twee',
           'overworld-plains/loc-moor/main-bjx.twee'],
          'bjx-moor.twee',
          cleanup=[
              ('$skinColor.natural to "chilly"', 'Skin.color.natural to "chilly"'),
          ])


def gen_moor_hooks():
    """bjx-moor-hooks.twee: the vanilla 0.5 eventsmoormid dispatcher with
    the BJX 'watched' dragon encounter appended as case 12 (rng widened
    11 -> 12). Same strategy as the forest dispatchers: full vanilla text
    plus the BJX entry, so later vanilla edits stay visible."""
    body = _widget_block(os.path.join(REF, 'overworld-plains', 'loc-moor', 'widgets.twee'),
                         'eventsmoormid')
    text = '\n'.join(body)

    anchor = ('\t\t<<case 11>>\n'
              '\t\t\t<<moor_fox>>\n'
              '\t\t<</switch>>')
    repl = ('\t\t<<case 11>>\n'
            '\t\t\t<<moor_fox>>\n'
            '\t\t/* BJX pack: watched-by-dragons encounter */\n'
            '\t\t<<case 12>>\n'
            '\t\t\t<span class="blue">你感觉被什么监视了。</span>你环顾四周，任何东西都可能潜伏在你周围。<<gstress>><<stress 6>>\n'
            '\t\t\t<br><br>\n'
            '\n'
            '\t\t\t<<link [[绕路 (0:30)|Moor Dragons Detour]]>><<pass 30>><<trauma 6>><</link>><<gtrauma>>\n'
            '\t\t\t<br>\n'
            '\t\t\t<<link [[继续|Moor Dragons Continue]]>><<set $rng to random(1,100)>><</link>>\n'
            '\t\t\t<br>\n'
            '\t\t<</switch>>')
    assert text.count(anchor) == 1, 'case 11 anchor not unique in eventsmoormid'
    text = text.replace(anchor, repl)
    assert text.count('<<rng 11>>') == 1, 'rng 11 not unique in eventsmoormid'
    text = text.replace('<<rng 11>>', '<<rng 12>>')

    out = ('/* BJX pack: vanilla 0.5 eventsmoormid + BJX dragon case 12. */\n'
           ':: Moor Widgets BJX [widget]\n\n' + text + '\n')
    write(os.path.join(TWE, 'bjx-moor-hooks.twee'), out)
    print('bjx-moor-hooks.twee: eventsmoormid hooked (rng 12, case 12 dragons)')


def _passage_block(path, name):
    """Extract one passage block (:: Name ... up to the next :: header)."""
    lines = read(path).split('\n')
    start = next(i for i, l in enumerate(lines) if l == ':: ' + name)
    end = next((i for i, l in enumerate(lines) if i > start and l.startswith(':: ')), len(lines))
    block = lines[start:end]
    while block and block[-1].strip() == '':
        block.pop()
    return block


def gen_farm_events():
    """bjx-farm.twee: BJX farm additions - Moor Food Stand / Moor Hamburger /
    Farm Slime Shave (main-bjx, 3p), the meadow sheep encounter chain
    (meadow-bjx, 5p) and the tractor upgrade pages (upgrades-bjx, 7p).
    The meadow-bjx passage headers carry trailing spaces in the BJX source
    while every link points at the trimmed name - strip them so the links
    resolve. <<foodsteakicon>>/<<slime>> live in the pack's compat files;
    <<transform>> keeps its 0.4.3.3 signature in 0.5.10.12."""
    merge(['overworld-plains/loc-farm/main-bjx.twee',
           'overworld-plains/loc-farm/meadow-bjx.twee',
           'overworld-plains/loc-farm/upgrades-bjx.twee'],
          'bjx-farm.twee',
          cleanup=[
              # trailing \n anchors: ':: Meadow Sheep Sex \n' must NOT eat the
              # prefix of ':: Meadow Sheep Sex Finish \n'
              (':: Meadow Sheep Resist \n', ':: Meadow Sheep Resist\n'),
              (':: Meadow Sheep Rape Finish \n', ':: Meadow Sheep Rape Finish\n'),
              (':: Meadow Sheep Sex Finish \n', ':: Meadow Sheep Sex Finish\n'),
              (':: Meadow Sheep Rape \n', ':: Meadow Sheep Rape\n'),
              (':: Meadow Sheep Sex \n', ':: Meadow Sheep Sex\n'),
          ])


def gen_farm_hooks():
    """bjx-farm-hooks.twee: vanilla 0.5 "Meadow Relax" passage with the BJX
    sheep encounter inserted as <<elseif $rng gte 60>> (vanilla only has the
    fox >= 91 branch and the quiet else), plus the vanilla
    farm_upgrades_status widget with the BJX tractor purchase block after
    the Coop entry."""
    meadow = '\n'.join(_passage_block(
        os.path.join(REF, 'overworld-plains', 'loc-farm', 'meadow.twee'),
        'Meadow Relax'))

    sheep = (
        '<<elseif $rng gte 60>>\n'
        '\t<<beastNEWinit 1 sheep>>\n'
        '\t你感觉到一阵轻微的抚摸，将你从休息中唤醒。<<ltiredness>><<tiredness -6>>\n'
        '\t<br><br>\n'
        '\t在你睡觉的时候，一只柔软且毛茸茸的<<beasttype>>在你身上躺了下来。它带来的暖意感觉很好，对你的身体散发出舒适的感觉。<<lstress>><<stress -50>>\n'
        '\t<<if $monster is 1>>\n'
        '\t\t"哦，对不起。我吵醒你了吗？你看起来很冷，所以我靠近了点。"<<bHe>>偎依着你，那暖意是如此的舒缓，让你感觉身体进一步放松。"<<bHe>>将你抱得更紧了些，低声说: "我好想和你交配。"\n'
        '\t<</if>>\n'
        '\t<br><br>\n'
        '\t<<link [[抵抗|Meadow Sheep Resist]]>><</link>><<willpowerdifficulty 1 400>>\n'
        '\t<br>\n'
        '\t<<if $promiscuity gte 15>>\n'
        '\t\t<<link [[允许|Meadow Sheep Sex]]>><<set $sexstart to 1>><</link>><<deviant3>>\n'
        '\t<</if>>\n'
    )
    anchor = ('\t<</if>>\n'
              '<<else>>\n'
              '\tThe world seems a little lighter.')
    repl = ('\t<</if>>\n'
            '/* BJX pack: meadow sheep encounter */\n'
            + sheep +
            '<<else>>\n'
            '\tThe world seems a little lighter.')
    assert meadow.count(anchor) == 1, 'meadow else anchor not unique'
    meadow = meadow.replace(anchor, repl)

    widget = '\n'.join(_widget_block(
        os.path.join(REF, 'overworld-plains', 'loc-farm', 'widgets.twee'),
        'farm_upgrades_status'))

    tractor = (
        '\t\t/* BJX pack: tractor */\n'
        '\t\t拖拉机:\n'
        '\t\t<<if $farm isnot undefined>>\n'
        '\t\t\t<<if $farm.tractor is undefined>>\n'
        '\t\t\t\t<<set $farm.tractor to 0>>\n'
        '\t\t\t<</if>>\n'
        '\t\t<</if>>\n'
        '\t\t<<if $farm.tractor gte 3>>\n'
        '\t\t\t<span class="green">最大马力</span>\n'
        '\t\t<<elseif $farm.tractor gte 2>>\n'
        '\t\t\t<<link [[升级|Farm Upgrades Tractor 3]]>><</link>>\n'
        '\t\t<<elseif $farm.tractor gte 1>>\n'
        '\t\t\t<<link [[升级|Farm Upgrades Tractor 2]]>><</link>>\n'
        '\t\t<<else>>\n'
        '\t\t\t<<link [[购买|Farm Upgrades Tractor 1]]>><</link>>\n'
        '\t\t<</if>>\n'
        '\t\t<br>\n'
        '\t\t<<if $farm.tractor gte 1>>\n'
        '\t\t\t犁:\n'
        '\t\t\t<<if $farm.tractorplough is true>>\n'
        '\t\t\t\t<span class="green">已购买</span>\n'
        '\t\t\t<<else>>\n'
        '\t\t\t\t<<link [[购买|Farm Upgrades Tractor Plough]]>><</link>>\n'
        '\t\t\t<</if>>\n'
        '\t\t\t<br>\n'
        '\t\t\t播种机:\n'
        '\t\t\t<<if $farm.tractorseeddrill is true>>\n'
        '\t\t\t\t<span class="green">已购买</span>\n'
        '\t\t\t<<else>>\n'
        '\t\t\t\t<<link [[购买|Farm Upgrades Tractor Seed Drill]]>><</link>>\n'
        '\t\t\t<</if>>\n'
        '\t\t\t<br>\n'
        '\t\t\t收割机:\n'
        '\t\t\t<<if $farm.tractorharvester is true>>\n'
        '\t\t\t\t<span class="green">已购买</span>\n'
        '\t\t\t<<else>>\n'
        '\t\t\t\t<<link [[购买|Farm Upgrades Tractor Harvester]]>><</link>>\n'
        '\t\t\t<</if>>\n'
        '\t\t\t<br>\n'
        '\t\t\t装载机:\n'
        '\t\t\t<<if $farm.tractorloader is true>>\n'
        '\t\t\t\t<span class="green">已购买</span>\n'
        '\t\t\t<<else>>\n'
        '\t\t\t\t<<link [[购买|Farm Upgrades Tractor Loader]]>><</link>>\n'
        '\t\t\t<</if>>\n'
        '\t\t\t<br>\n'
        '\t\t<</if>>\n'
        '\t\t<br>\n'
    )
    t_anchor = ('\t\t<<else>>\n'
                '\t\t\t<<link [[Expand|Farm Upgrades Coop 1]]>><</link>>\n'
                '\t\t<</if>>\n'
                '\t\t<br>\n'
                '\t\tFarm Irrigation:')
    t_repl = ('\t\t<<else>>\n'
              '\t\t\t<<link [[Expand|Farm Upgrades Coop 1]]>><</link>>\n'
              '\t\t<</if>>\n'
              '\t\t<br>\n'
              + tractor +
              '\t\tFarm Irrigation:')
    assert widget.count(t_anchor) == 1, 'coop anchor not unique in farm_upgrades_status'
    widget = widget.replace(t_anchor, t_repl)

    out = ('/* BJX pack: vanilla 0.5 Meadow Relax + sheep elseif, and\n'
           '   farm_upgrades_status + tractor block. */\n'
           + meadow + '\n\n'
           ':: Farm Widgets BJX [widget]\n\n' + widget + '\n')
    write(os.path.join(TWE, 'bjx-farm-hooks.twee'), out)
    print('bjx-farm-hooks.twee: Meadow Relax hooked (sheep elseif), farm_upgrades_status hooked (tractor)')


def gen_tentacle_events():
    """bjx-tentacle-events.twee: BJX tentacle-world additions - the Lust
    Slime core transformation (2p), fox-taming / dragon-roar entries (2p)
    and the eight Living Clothes passages. 0.4.3.3 -> 0.5.10.12:
    $skinColor.natural -> Skin.color.natural (JS object), $penisexist /
    $vaginaexist -> $player.penisExist / $player.vaginaExist. The orphan
    single-colon ': Tentacle Lake Home Return' block is dropped (its link
    target 'Lake Home Bedroom' exists nowhere in either version). The
    vanilla 0.5 <<parasite>> widget is signature-compatible; hooks add the
    'livingclothes' type to parasiteinit."""
    txt = read(os.path.join(BJX, 'overworld-forest', 'loc-tentacle-world', 'main-bjx.twee'))
    txt = re.sub(r'\n: Tentacle Lake Home Return\n.*?(?=:: Tentacle Plains Fox New)',
                 '\n', txt, flags=re.S)
    assert ': Tentacle Lake Home Return' not in txt, 'orphan block not removed'
    for pat, sub in [
        ('$skinColor.natural to "amethyst"', 'Skin.color.natural to "amethyst"'),
        ('$penisexist isnot 1', '!$player.penisExist'),
        ('$penisexist is 1', '$player.penisExist'),
        ('$vaginaexist is 1', '$player.vaginaExist'),
    ]:
        txt = txt.replace(pat, sub)
    write(os.path.join(TWE, 'bjx-tentacle-events.twee'), txt)
    n = len(re.findall(r'^::', txt, re.M))
    print(f'bjx-tentacle-events.twee: 1 file, {n} passages')


def gen_tentacle_hooks():
    """bjx-tentacle-hooks.twee: (a) vanilla 0.5 loc-tentacle-world/main.twee
    passages with three BJX insertions: the lust-slime 'stay awake' link on
    Passout Tentacle World 3 (needs $slime > 0, /= 2), the Living Clothes
    find on Tentacle Plains (tentnorth -2 / tenteast -2) and the fox-taming
    / dragon-roar entries next to the vanilla fox entry (gated behind
    $options.bjx_animal, which also reverts the vanilla fox link to its
    original form when the option is on). (b) the vanilla parasiteinit
    widget re-registered with 'livingclothes' appended to $parasite.types
    (the vanilla <<parasite>> widget pushes into $parasite[type], so the
    type must be pre-initialised). (c) the BJX <<dragon>> hint macro."""
    src = read(os.path.join(REF, 'overworld-forest', 'loc-tentacle-world', 'main.twee'))

    # patch 1: lust slime link before the passout-4 link on Passout 3.
    # BJX replaces the vanilla 'Overwhelmed with unending orgasms' line
    # with its Chinese rendering, then adds the stay-awake gate.
    p1_anchor = ('Overwhelmed with unending orgasms, you eventually crash into unconsciousness.\n'
                 '<br><br>\n'
                 '\n'
                 '<<link [[Next|Passout Tentacle World 4]]>><<clotheson>><</link>>')
    p1_ins = ('/* BJX pack: lust slime core */\n'
              '无休止的高潮淹没了你，令你几乎陷入昏迷。\n'
              '<br><br>\n'
              '\n'
              '<<if $slime gt 0 and $slime isnot 2>>\n'
              '\t你体内的核心突然发出紫色的光芒，它开始稳定地跳动。随着脉搏的跳动，你注意到攻击你的触手在蠕动。它们突然停了下来，然后，随着你脉动的核心慢慢回旋。\n'
              '\t<br><br>\n'
              '\t高潮几乎榨干了你，但你本能地觉得继续保持清醒会以某种方式改变你身体的本质。你努力如是，但你觉得自己现在好像站在十字路口。\n'
              '\t<br><br>\n'
              '\t<<link [[凝神|Lust Slime]]>><</link>><<slime>>\n'
              '\t<br>\n'
              '<</if>>\n'
              '\n'
              '<<link [[Next|Passout Tentacle World 4]]>><<clotheson>><</link>>')
    assert src.count(p1_anchor) == 1, 'passout3 anchor not unique'
    src = src.replace(p1_anchor, p1_ins)

    # patch 2: living clothes find after the spray block on Tentacle Plains
    p2_anchor = ('\t\t<<peppersprayicon>><<link [[Touch|Tentacle Plains Spray]]>><<set $spraymax += 1>><<set $tentspray to 1>><<spray 5>><</link>><<gspraymax>>\n'
                 '\t\t<br><br>\n'
                 '\t<</if>>\n')
    p2_ins = p2_anchor + (
        '\t/* BJX pack: living clothes */\n'
        '\t<<if $tentnorth is -2 and $tenteast is -2 and $tentcloth isnot 1>>\n'
        '\t\t一套造型奇特的衣服悬浮在空中，与胸口齐高，由细长的卷须托着。\n'
        '\t\t<br>\n'
        '\t\t<<link [[触碰|Living Clothes Discovery]]>><<set $tentcloth to 1>><</link>>\n'
        '\t\t<br><br>\n'
        '\t<</if>>\n')
    assert src.count(p2_anchor) == 1, 'spray anchor not unique'
    src = src.replace(p2_anchor, p2_ins)

    # patch 3: fox link re-gated + fox-taming / dragon-roar entries
    p3_anchor = ('\t<<if $fox gte 6>>\n'
                 '\t\t<<tficon "fox">><<link [[Look for something to steal|Tentacle Plains Fox]]>><<transform fox 1>><</link>><<fox>>\n'
                 '\t\t<br>\n'
                 '\t<</if>>\n')
    p3_repl = ('\t<<if !$options.bjx_animal and $fox gte 6>>\n'
               '\t\t<<tficon "fox">><<link [[Look for something to steal|Tentacle Plains Fox]]>><<transform fox 1>><</link>><<fox>>\n'
               '\t\t<br>\n'
               '\t<</if>>\n'
               '\t/* BJX pack: fox taming + dragon roar */\n'
               '\t<<if $options.bjx_animal and $fox gte 6>>\n'
               '\t\t<<ind>><<link [[尝试调教触手|Tentacle Plains Fox New]]>><<transform fox 1>><</link>><<fox>>\n'
               '\t\t<br>\n'
               '\t<</if>>\n'
               '\t<<if $options.bjx_animal and $dragon gte 6>>\n'
               '\t\t<<ind>><<link [[龙之咆哮|Tentacle Plains Dragon]]>><<transform dragon 1>><</link>><<dragon>>\n'
               '\t\t<br>\n'
               '\t<</if>>\n')
    assert src.count(p3_anchor) == 1, 'fox anchor not unique'
    src = src.replace(p3_anchor, p3_repl)

    # parasiteinit with livingclothes type
    pinit = '\n'.join(_widget_block(
        os.path.join(REF, 'base-system', 'parasites.twee'), 'parasiteinit'))
    t_anchor = '\t<<set $parasite.types to [\n\t\t"urchin",\n\t\t"slime",\n\t\t"maggot",\n\t\t"parasite",]>>'
    assert pinit.count(t_anchor) == 1, 'parasite types anchor not unique'
    pinit = pinit.replace(t_anchor,
                          t_anchor + '\n\t/* BJX pack: living clothes */\n'
                          '\t<<set $parasite.types to $parasite.types.concat(["livingclothes"])>>')

    out = ('/* BJX pack: vanilla 0.5 tentacle-world main.twee + lust slime /\n'
           '   living clothes / fox-taming / dragon-roar entries. */\n'
           + src + '\n\n'
           ':: Parasites BJX [widget]\n\n'
           + pinit + '\n\n'
           '<<widget "dragon">>\n'
           '\t<<if $statdisable is "f">> |\n'
           '        <span class="blue">龙</span>\n'
           '    <</if>>\n'
           '<</widget>>\n')
    write(os.path.join(TWE, 'bjx-tentacle-hooks.twee'), out)
    print('bjx-tentacle-hooks.twee: tentacle-world hooked (lust slime, living clothes, fox/dragon)')


def gen_home_events():
    """bjx-home-events.twee: BJX loc-home additions - the Bailey's office /
    orphanage basement night break-in chain (15p: lockpick, break-in,
    basement lockpick/entry, tripwire, duct, bluff, tentacle, hallway,
    keypad, blackmail, tripwire 2, caught, caught finish, cage), the slime
    auto-shave finisher (1p), the antiques scroll / ivory necklace pages
    (2p) and the Bedroom cheat-code page (1p). 0.4.3.3 -> 0.5.10.12:
    $skinColor.natural is handled by the 2z pass; every widget used
    (dancedifficulty, neckstrip, ejaculation, rentnopay, skulduggeryskilluse
    / -required, bjxclotheswear, slime, combat chain) exists in 0.5 or the
    pack; $basement / $baileypicked / $basementpicked / $ghostIn /
    $blackmaildestroyed / $antiquescrollText / $code / $gob are BJX-only
    variables (no 0.5 collisions)."""
    merge(['overworld-town/loc-home/main-bjx.twee',
           'overworld-town/loc-home/code-bjx.twee'],
          'bjx-home-events.twee')


def gen_home_hooks():
    """bjx-home-hooks.twee: vanilla 0.5 loc-home/main.twee with four BJX
    insertions: (a) the Orphanage Bailey's-office block - at night, once
    the town-hall 'home' project is approved, the office door can be
    lockpicked (skulduggery 250) or broken into, and later the basement
    door likewise (skulduggery 1000); ghost-TF players can phase through
    ($ghost, set by the mirror/mushroom groups). (b) three antique links
    on Bedroom next to the table text (gated on $options.bjx_antiques and
    the museum-antiques state produced by the mansion/lake/bunker groups).
    (c) the slime auto-shave option above <<shaveOptions>> on Shave
    (home bathroom only - 0.5 shares this passage with Avery's bathroom).
    (d) the Bedroom cheat-code entry: the camouflage first line toggles
    V.codeinput (BJX hung the 'on' switch on its caption bar, which 0.5
    does not have, so the line now toggles both ways) and Gameplay
    Settings gains the code-input link."""
    src = read(os.path.join(REF, 'overworld-town', 'loc-home', 'main.twee'))

    # patch 1: Bailey's office link -> night break-in / basement block.
    p1_anchor = ('\t<<officeicon>><<link [[Bailey\'s office (0:01)|Bailey\'s Office]]>><<pass 1>><</link>>\n'
                 '\t<br>\n')
    p1_repl = ('\t/* BJX pack: bailey office / basement night break-in */\n'
               '\t<<if Time.dayState is "night" and $town_projects.home is 1 and $baileypicked is 1>>\n'
               '\t\t<<officeicon>><<link [[闯入贝利的办公室(0:20)|Bailey\'s Office Break In]]>><<pass 5>><</link>>\n'
               '\t\t<br><br>\n'
               '\t<<elseif Time.dayState is "night" and $town_projects.home is 1>>\n'
               '\t\t<<set $lock to 250>>\n'
               '\t\t<<if $skulduggery gte $lock>>\n'
               '\t\t\t<span class="green">这锁看起来很容易开。</span>\n'
               '\t\t\t<br>\n'
               '\t\t\t<<officeicon>><<link [[撬开贝利的办公室门锁(0:05)|Bailey\'s Office Lockpick]]>><<pass 20>><</link>>\n'
               '\t\t\t<br><br>\n'
               '\t\t<<else>>\n'
               '\t\t\t<span class="blue">这锁看起来超出了你的能力范围。</span> <<skulduggeryrequired>>\n'
               '\t\t\t<br><br>\n'
               '\t\t<</if>>\n'
               '\t\t<<if $options.bjx_eventTF and $ghost gte 1>>\n'
               "\t\t\t<span class ='wraith'>只要你集中精力，就能穿越这扇门。</span>\n"
               '\t\t\t<br>\n'
               "\t\t\t<<link [[穿越 (0:01)|Bailey's Office Break In]]>><<pass 1>><<set $ghostIn to true>><</link>>\n"
               '\t\t\t<br><br>\n'
               '\t\t<</if>>\n'
               '\t<<else>>\n'
               '\t\t<<officeicon>><<link [[贝利办公室（0:01）|Bailey\'s Office]]>><<pass 1>><</link>>\n'
               '\t\t<br><br>\n'
               '\t<</if>>\n'
               '\t<<if Time.dayState is "night" and $town_projects.home is 1 and $basement is 1 and $basementpicked is 1>>\n'
               '\t\t<<officeicon>><<link [[闯入地下室(0:01)|Orphanage Basement]]>><<pass 1>><</link>>\n'
               '\t\t<br><br>\n'
               '\t<<elseif Time.dayState is "night" and $town_projects.home is 1 and $basement is 1>>\n'
               '\t\t<<set $lock to 1000>>\n'
               '\t\t<<if $skulduggery gte $lock>>\n'
               '\t\t\t<span class="green">这锁看起来很容易开。</span>\n'
               '\t\t\t<br>\n'
               '\t\t\t<<officeicon>><<link [[撬开地下室门锁(0:30)|Basement Lockpick]]>><<pass 30>><</link>>\n'
               '\t\t\t<br><br>\n'
               '\t\t<<else>>\n'
               '\t\t\t<span class="blue">这锁看起来超出了你的能力范围。</span> <<skulduggeryrequired>>\n'
               '\t\t\t<br><br>\n'
               '\t\t<</if>>\n'
               '\t\t<<if $options.bjx_eventTF and $ghost gte 1>>\n'
               "\t\t\t<span class ='wraith'>只要你集中精力，就能穿越这扇门。</span>\n"
               '\t\t\t<br>\n'
               '\t\t\t<<link [[穿越 (0:01)|Orphanage Basement]]>><<pass 1>><<set $ghostIn to true>><</link>>\n'
               '\t\t\t<br><br>\n'
               '\t\t<</if>>\n'
               '\t<</if>>\n')
    assert src.count(p1_anchor) == 1, 'bailey office anchor not unique'
    src = src.replace(p1_anchor, p1_repl)

    # patch 2: antique links after the Bedroom table text.
    p2_anchor = ('<<tableText "noicon">> /* If fish tank option available, '
                 'table/chair location appears here, in line with bed/wardrobe locations */\n')
    p2_ins = p2_anchor + (
        '/* BJX pack: antiques */\n'
        '<<if $options.bjx_antiques and ($museumAntiques.antiques.antiqueliquor is "found" or $museumAntiques.antiques.antiqueliquor is "take")>>\n'
        '    <<link [[喝古董酒|Forest Mansion Bottle Drink]]>><<set $lastpassage to "Bedroom">><</link>>\n'
        '    <br>\n'
        '<</if>>\n'
        '<<if $options.bjx_antiques and $worn.neck.name isnot "ivory necklace" and ($museumAntiques.antiques.antiqueivorynecklace is "found" or $museumAntiques.antiques.antiqueivorynecklace is "take")>>\n'
        '    <<link [[戴上象牙项链|Antique Ivory Neck Lace Wear]]>><<set $lastpassage to "Bedroom">><</link>>\n'
        '    <br>\n'
        '<</if>>\n'
        '<<if $options.bjx_antiques and ($museumAntiques.antiques.antiquescroll is "found" or $museumAntiques.antiques.antiquescroll is "take")>>\n'
        '    <<link [[展开言灵卷轴|Home Open Antiquescroll]]>><<set $lastpassage to "Bedroom">><</link>>\n'
        '    <br>\n'
        '<</if>>\n')
    assert src.count(p2_anchor) == 1, 'tableText anchor not unique'
    src = src.replace(p2_anchor, p2_ins)

    # patch 3: slime auto-shave above <<shaveOptions>> (home bathroom only).
    p3_anchor = '<br>\n<<shaveOptions>>\n'
    p3_ins = ('/* BJX pack: slime auto-shave */\n'
              '<<if $location is "home" and ($pblevel gte 2 or $pbstrip gte 1 or $pblevelballs gte 2) and $slime gt 0 and $options.bjx_eventTF>>\n'
              '\t<<link [[自动脱毛 (0:15)->Slime Shave]]>><<pass 15>><<arousal 100>><<set $pblevel to 0>><<set $pbgrowth to 0>><<set $pblevelballs to 0>><<set $pbgrowthballs to 0>><<set $pbstrip to 0>><<set $makeup.pbcolour to 0>><</link>><<slime>>\n'
              '\t<br>\n'
              '<</if>>\n'
              '<br>\n<<shaveOptions>>\n')
    assert src.count(p3_anchor) == 1, 'shaveOptions anchor not unique'
    src = src.replace(p3_anchor, p3_ins)

    # patch 4a: camouflage first line toggles the cheat-code entry.
    p4a_anchor = 'You are in your bedroom.\n'
    p4a_repl = ('/* BJX pack: cheat code toggle */\n'
                '<span class="camouflage text"><a onclick="V.codeinput = (V.codeinput === 1 ? 0 : 1)">\n'
                '你正待在你的卧室中。\n'
                '</a></span><br><br>\n')
    assert src.count(p4a_anchor) == 1, 'bedroom first-line anchor not unique'
    src = src.replace(p4a_anchor, p4a_repl)

    # patch 4b: code-input link under Gameplay Settings.
    p4b_anchor = ('<<link [[Gameplay Settings|Settings]]>><<set $settingsExitPassage to "Bedroom">><</link>>\n'
                  '<br>\n')
    p4b_ins = p4b_anchor + (
        '/* BJX pack: cheat code entry */\n'
        '<<if V.codeinput is 1>><<link [[输入代码|Code]]>><</link>><br><</if>>\n')
    assert src.count(p4b_anchor) == 1, 'settings anchor not unique'
    src = src.replace(p4b_anchor, p4b_ins)

    out = ('/* BJX pack: vanilla 0.5 loc-home main.twee + bailey basement /\n'
           '   antiques / slime auto-shave / cheat-code hooks. */\n'
           + src)
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-home-hooks.twee'), out)
    print('bjx-home-hooks.twee: home hooked (bailey basement, antiques, slime shave, cheat code)')


def gen_hospital_events():
    """bjx-hospital-events.twee: BJX loc-hospital additions - the Harper
    slime inquiry (1p) plus the parasite-removal extensions (7p: the
    livingclothes paid-removal pair, the mushroom cure trio and the
    demonhunter hypnosis pair). 0.4.3.3 -> 0.5.10.12: every widget used
    (harper_intro, hospitalparasite, removeparasite, note, askicon, npc,
    arousal, upperwear 87 - 'patient gown' keeps the same index in both
    versions - and the ruined/clotheson family) exists in 0.5;
    mushroomuntransform already lives in bjx-tf-mushroom.twee and its
    transformationParts.mushroom key is ensured by inject_early.js;
    $slime / $mushroom / $demonhunter / $hunterhypnosispaid /
    $onemoreslime are BJX-only variables (no 0.5 collisions). The BJX
    'demonhunter' status-label widget is appended with its guard adapted
    to 0.5 ($statdisable -> !$settings.blindStatsEnabled)."""
    merge(['overworld-town/loc-hospital/main-bjx.twee',
           'overworld-town/loc-hospital/parasite-removal-bjx.twee'],
          'bjx-hospital-events.twee')
    widget = ('\n'
              ':: Widgets Demonhunter BJX [widget]\n'
              '\n'
              '/* BJX pack: status-label widget from BJX base-system/text.twee;\n'
              '   the 0.4.3.3 $statdisable guard is adapted to the 0.5\n'
              '   blind-stats setting. */\n'
              '<<widget "demonhunter">>\n'
              '\t<<if !$settings.blindStatsEnabled>> |\n'
              '\t\t<span class="lustful">恶魔猎手</span>\n'
              '\t<</if>>\n'
              '<</widget>>\n')
    with open(os.path.join(TWE, 'bjx-hospital-events.twee'), 'a', encoding='utf-8', newline='\n') as f:
        f.write(widget)
    print('bjx-hospital-events.twee: appended demonhunter status widget')


def gen_hospital_hooks():
    """Two vanilla 0.5 hospital files with BJX insertions.
    (a) loc-hospital/main.twee 'Hospital Foyer': three BJX inquiry links
    right after the body-parasite-removal block - demonhunter hypnosis
    training (progress 2-4, reaching 5 grants the soul-capturing eyes),
    the mushroom infection consult and the BJX slime consult.
    (b) loc-hospital/parasite-removal.twee 'Hospital Parasite': the BJX
    sewer-slime corrosion rumour appended after both ear-slime diagnoses
    (Harper hinting at the BJX sewers slime line), and a new
    livingclothes elseif branch (the paid 2500-pound removal chain)
    between the chastity-parasite branch and the fallback else."""
    # (a) Hospital Foyer: three BJX inquiry links.
    src = read(os.path.join(REF, 'overworld-town', 'loc-hospital', 'main.twee'))
    a1_anchor = ('\t\t\t<<socialiseicon "ask">><<link [[Enquire about body parasite removal (0:10)|Hospital Parasite]]>><<pass 10>><</link>>\n'
                 '\t\t\t<br>\n'
                 '\t\t<</if>>\n'
                 '\t\t<<if $player.breastsize lt 12>>\n')
    a1_ins = ('\t\t\t<<socialiseicon "ask">><<link [[Enquire about body parasite removal (0:10)|Hospital Parasite]]>><<pass 10>><</link>>\n'
              '\t\t\t<br>\n'
              '\t\t<</if>>\n'
              '\t\t/* BJX pack: demonhunter / mushroom / slime inquiries */\n'
              '\t\t<<if $demonhunter gte 2 and $demonhunter lte 4>>\n'
              "\t\t\t<<askicon>><<link [[要求学习催眠术 (0:10)|Hospital Demonhunter]]>><<pass 10>><</link>><<demonhunter>> <<note \"获取' 摄魂之眼' \" \"italic\">>\n"
              '\t\t\t<br>\n'
              '\t\t<</if>>\n'
              '\t\t<<if $mushroom gte 1>>\n'
              '\t\t\t<<askicon>><<link [[咨询你的蘑菇感染问题 (0:10)|Hospital Mushroom]]>><<pass 10>><</link>>\n'
              '\t\t\t<br>\n'
              '\t\t<</if>>\n'
              '\t\t<<if $slime gt 0>>\n'
              '\t\t\t<<askicon>><<link [[咨询你的史莱姆情况(0:10)|Harper Slime Inquiry]]>><<pass 10>><</link>>\n'
              '\t\t\t<br>\n'
              '\t\t<</if>>\n'
              '\t\t<<if $player.breastsize lt 12>>\n')
    assert src.count(a1_anchor) == 1, 'foyer parasite-removal anchor not unique'
    src = src.replace(a1_anchor, a1_ins)
    out = '/* BJX pack: vanilla 0.5 loc-hospital main.twee + foyer BJX inquiry links. */\n' + src
    if not out.endswith('\n'):
        out += '\n'
    # The three BJX inquiry links use <<askicon>>, a BJX-only wrapper around
    # the icon macro (BJX base-system/images.twee:991). 0.5 has no such
    # widget, so without it every link renders "macro does not exist"; the
    # underlying img/misc/icon/ask.png ships with the game.
    out += ('\n:: BJX Hospital Icons [widget]\n\n'
            '<<widget "askicon">>\n'
            '\t<<icon "ask.png">>\n'
            '<</widget>>\n')
    write(os.path.join(TWE, 'bjx-hospital-hooks.twee'), out)
    print('bjx-hospital-hooks.twee: hospital foyer hooked (3 inquiry links)')

    # (b) parasite-removal: two rumour insertions + livingclothes branch.
    src = read(os.path.join(REF, 'overworld-town', 'loc-hospital', 'parasite-removal.twee'))
    rumour = ('\t\t"顺便说一句，"<<he>>喃喃自语, "最近听说我们镇下水道里粘液具有了某种<i>腐蚀性</i>，如果不慎沾染了会腐蚀衣服甚至皮肤，所以如果你要去那里，请务必小心谨慎。甚至有传言说，粘液似乎具有了生命，会主动寻找人类吞噬，被其吞噬的人类也会变成其中一员。不过这都是一些嗑药出了<span class="gold">幻觉</span>的瘾君子的胡言乱语，没有任何科学合理性。"\n'
              '\t\t<br><br>\n')
    b1_anchor = ('\t\t"Firstly, the slime you describe," <<he>> continues. "Entering your ear? Hallucinations are a side effect of many medications. <i>Some people find solace at the temple</i> when they experience similar. Perhaps they could help."\n'
                 '\t\t<br><br>\n')
    assert src.count(b1_anchor) == 1, 'first ear-slime diagnosis anchor not unique'
    src = src.replace(b1_anchor, b1_anchor + rumour)

    b2_anchor = ('\t<<He>> listens intently, nodding along as if there\'s nothing strange about anything you\'re saying. When you\'re finished, <<he>> smiles. "A slime inside your ear?" <<he>> says. "Hallucinations are a side effect of many medications. <i>Some people find solace at the temple</i> when they experience similar. Perhaps they could help."\n'
                 '\t<br><br>\n')
    rumour2 = rumour.replace('\t\t', '\t')
    assert src.count(b2_anchor) == 1, 'second ear-slime diagnosis anchor not unique'
    src = src.replace(b2_anchor, b2_anchor + rumour2)

    b3_anchor = ('\t<<He>> listens intently, nodding along as if there\'s nothing strange about anything you\'re saying. When you\'re finished, <<he>> smiles. "As I thought, there\'s no danger. All you need to do is remove your $worn.genitals.name and the parasites should fall out."\n'
                 '\t<br><br>\n'
                 '\n'
                 '\t<<He>> starts tapping into <<his>> keyboard. "Do you have any further concerns?" You shake your head, wondering if removing the belt will be an ordeal in of itself.\n'
                 '\t<br><br>\n'
                 '\n'
                 '\t<<He>> rises and holds open the door for you. You leave the office.\n'
                 '\t<br><br>\n'
                 '\n'
                 '\t<<link [[Next|Hospital Foyer]]>><<endevent>><</link>>\n'
                 '<<else>>\n')
    b3_ins = ('\t<<link [[Next|Hospital Foyer]]>><<endevent>><</link>>\n'
              '/* BJX pack: livingclothes parasite removal branch */\n'
              '<<elseif $parasite.clit.name is "livingclothes" or $parasite.penis.name is "livingclothes" or\n'
              '\t$parasite.nipples.name is "livingclothes" or $parasite.bottom.name is "livingclothes">>\n'
              '\t<<He>>认真地听着，并时不时的点点头，好像你说的任何事情都没什么奇怪的。在你讲完后之后，<<he>>默默地转向<<his>>的电脑，开始浏览一些东西。"好吧，"<<he>>说道。\n'
              '\t<br><br>\n'
              '\t一种罕见但相对良性的病症，我们现在就能治好你。"你松了一口气。"请稍等片刻。"<<He>>转身回到<<his>>的电脑前。\n'
              '\t<br><br>\n'
              '\t一分钟后<<he>>回过头来。"我们可以用一种特殊的电击法对你进行电击, 其波长可以使这种寄生虫丧失能力。它对人完全无害, 但你可能会感到刺痛。"\n'
              '\t<br><br>\n'
              '\t"手术需要 £2500"<<He>>说。\n'
              '\t<br><br>\n'
              '\t<<if $money gte 250000>>\n'
              '\t\t<<link [[付款 (£2500 0:30)|Hospital Parasite Private Livingclothes]]>><<set $money -= 250000>><<pass 30>><</link>>\n'
              '\t\t<br>\n'
              '\t<</if>>\n'
              '\t<<link [[拒绝治疗并离开|Hospital Foyer]]>><<endevent>><</link>>\n'
              '\t<br>\n'
              '<<else>>\n')
    assert src.count(b3_anchor) == 1, 'chastity branch anchor not unique'
    src = src.replace(b3_anchor, b3_ins)
    out = '/* BJX pack: vanilla 0.5 loc-hospital parasite-removal.twee + sewer rumour + livingclothes branch. */\n' + src
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-hospital-parasite-hooks.twee'), out)
    print('bjx-hospital-parasite-hooks.twee: parasite removal hooked (rumour x2, livingclothes branch)')




# ============================================================================
# 2i. new modules, batch 3g (churchyard / bus-station / landfill groups)
#     generated by genparts agents, reviewed and merged verbatim
# ============================================================================
"""churchyard group generators (BJX 0.4.3.3 -> DoL 0.5.10.12 bjx-pack).

BJX only touches two files under overworld-forest/loc-churchyard/
(verified against the 0.4.3.3 baseline: main.twee carries exactly two
"北极星" insertions, everything else is untouched vanilla; catacombs.twee
/ events.twee / widgets.twee are not shipped in the BJX tree at all).

Events file bjx-churchyard-events.twee - 1 passage merged from BJX
overworld-forest/loc-churchyard/widgets-bjx.twee:
  :: chastityBreakDemon [widget] - demon-scene helper that melts/destroys
      the worn chastity belt (the gold belt gets its own text) and pushes
      the "broken" type; called from the BJX demon passages (base-debug/
      test demon.twee, demon group). <<genitalsruined>> exists in 0.5
      (base-clothing/widgets.twee); $worn.genitals.type keeps the 0.4.3.3
      array shape and the "broken" type still lifts 0.5's cursed-clothes
      check (base-clothing/widgets.twee checks !type.includes("broken")).
      $worn.genitals.cn_name_cap is the BJX Chinese clothing-name field
      kept verbatim (same policy as bjx-lakehouse.twee).

Hooks file bjx-churchyard-hooks.twee - vanilla 0.5
overworld-forest/loc-churchyard/main.twee (all 7 passages re-declared:
Churchyard, Churchyard Catacombs Lock / Sneak / Peer Slow / Peer Quick /
Intro / Leave) + the two BJX insertions:
  h1  :: Churchyard - night-only summoning entry "召唤仪式" -> Demon
      Start (demon-group passage) when $demonbookread is 1 (flag set by
      the BJX moor event), inserted after the Sepulchre link / before
      the Enter-the-forest link (0.5 main.twee lines 29-31).
  h2  :: Churchyard Catacombs Lock - BJX wraith-TF pass-through
      "穿越 (0:01)" -> Churchyard Catacombs Sneak guarded by
      <<if $options.bjx_eventTF and $ghost gte 1>> (guard matches the
      home/forest/bus-station group convention verbatim; inject_early.js
      initialises bjx_eventTF), inserted after the lockpick block /
      before the <<getouticon>> Leave link (0.5 line 56). Keeps BJX's
      $ghostIn reset-on-entry and set-on-pass-through (BJX-only flag,
      consumed by the compound / homes entry checks in later groups).

All other BJX-vs-0.5 diffs in main.twee (isBloodmoon()/Weather API,
pcAreArmsBound, <<lockicon "pick">>, <<wearProp "torch">>,
specialClothesUnlock) are vanilla 0.4.3.3 -> 0.5 evolution and are
intentionally NOT ported - the patch rides on the 0.5 text.
"""


def gen_churchyard_events():
    """bjx-churchyard-events.twee: the single BJX churchyard addition -
    :: chastityBreakDemon [widget] (widgets-bjx.twee): a demon stares at
    the PC's chastity belt, warms it and shatters it (gold variant gets
    the golden-shards text), then pushes the "broken" type and calls
    <<genitalsruined>>. 0.5 compatibility: genitalsruined exists,
    worn.genitals.type stays an array, "gold chastity belt" is still a
    0.5 item, and the "broken" type still suppresses 0.5's cursed-clothes
    regrip. $worn.genitals.cn_name_cap (BJX Chinese name field) is kept
    verbatim per the lakehouse precedent."""
    merge(['overworld-forest/loc-churchyard/widgets-bjx.twee'],
          'bjx-churchyard-events.twee')


def gen_churchyard_hooks():
    """Vanilla 0.5 loc-churchyard main.twee + two BJX insertions.

    h1 'Churchyard': the night-time summoning-ritual link ("召唤仪式"
    -> Demon Start, delivered by the demon group), shown once the moor
    demon book has been read ($demonbookread is 1 - BJX-only flag, set
    by the BJX moor event; undefined compares false, matching the
    home/island group policy for BJX-only comparison sites). Inserted
    after the Sepulchre link, before the Enter-the-forest link.
    h2 'Churchyard Catacombs Lock': the BJX wraith pass-through
    ("穿越 (0:01)" -> Churchyard Catacombs Sneak with the $ghostIn flag)
    guarded by $options.bjx_eventTF and $ghost gte 1 - both kept verbatim
    per the home-group precedent (inject_early.js seeds bjx_eventTF, and
    $ghost stays 0 until the ghost TF group lands). Inserted between the
    lockpick block and the Leave link."""
    src = read(os.path.join(REF, 'overworld-forest', 'loc-churchyard', 'main.twee'))

    # h1: Churchyard - summoning entry after the sepulchre link.
    h1_anchor = ('<<foresticon "churchyard">><<link [[Sepulchre|Churchyard Catacombs Lock]]>><</link>>\n'
                 '<br>\n')
    h1_ins = (h1_anchor +
              '/* BJX pack: demon-book summoning entry ($demonbookread is set by\n'
              '   the BJX moor event; Demon Start comes with the demon group). */\n'
              '<<if $demonbookread is 1 and Time.dayState is "night">>\n'
              '    <<link [[召唤仪式|Demon Start]]>><</link>>\n'
              '    <br>\n'
              '<</if>>\n')
    assert src.count(h1_anchor) == 1, 'churchyard sepulchre link anchor not unique'
    src = src.replace(h1_anchor, h1_ins)

    # h2: Churchyard Catacombs Lock - wraith pass-through before the leave link.
    h2_anchor = '<<getouticon>><<link [[Leave|Churchyard]]>><</link>>\n'
    h2_ins = ('/* BJX pack: BJX wraith-TF pass-through entry ($ghost from the TF\n'
              '   chain; $options.bjx_eventTF seeded by inject_early.js; $ghostIn\n'
              '   is consumed by the compound / homes entry checks). */\n'
              '<<set $ghostIn to false>>\n'
              '<<if $options.bjx_eventTF and $ghost gte 1>>\n'
              "\t<span class ='wraith'>只要你集中精力，就能穿越这扇门。</span>\n"
              '\t<br>\n'
              '\t<<link [[穿越 (0:01)|Churchyard Catacombs Sneak]]>><<pass 1>><<set $ghostIn to true>><</link>>\n'
              '\t<br>\n'
              '<</if>>\n')
    assert src.count(h2_anchor) == 1, 'catacombs lock leave-link anchor not unique'
    src = src.replace(h2_anchor, h2_ins + h2_anchor)

    out = ('/* BJX pack: vanilla 0.5 loc-churchyard main.twee + demon summoning\n'
           '   entry + wraith pass-through. */\n' + src)
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-churchyard-hooks.twee'), out)
    print('bjx-churchyard-hooks.twee: churchyard hooked (summoning entry, wraith pass-through)')
"""bus-station group generators (BJX 0.4.3.3 -> DoL 0.5.10.12 bjx-pack).

Events file bjx-busstation-events.twee - 1 passage merged from BJX
overworld-town/loc-bus-station/main-bjx.twee:
  :: Ghost Van Escape - landing passage after phasing through the moving
      livestock van's door; <<gpain>> comes from bjx-compat2.twee and
      <<violence 200>> keeps the BJX magnitude (both versions share the
      same violence widget body; pack precedent: lakehouse violence 100).

Hooks file bjx-busstation-hooks.twee - vanilla 0.5
overworld-town/loc-bus-station/main.twee (all 10 passages kept) + 5 BJX
ghost pass-through insertions, every one guarded by
<<if $options.bjx_eventTF and $ghost gte 1>> so it stays silent until
the ghost transformation group is ported ($ghost stays 0; the guard
matches the home/forest group convention verbatim):
  h1  :: Bus Station Livestock      van door -> Ghost Van Escape
      (inserted between the "van rumbles into motion" paragraph and the
      [[Next|Street Van Journey]] link; 0.5 main.twee lines 76-79)
  h2  :: Bus Station Front Door     -> Harvest Street
      (after the lockpick <</if>>, before the <<busstationicon>> Leave
      link; 0.5 lines 107-114)
  h3  :: Bus Station Back Door      -> Industrial Alleyways
      (same spot; 0.5 lines 130-137; the 0.4.3.3 passage name
      'Industrial alleyways' is retargeted to the 0.5 capitalised
      'Industrial Alleyways' - SugarCube links are case-sensitive)
  h4  :: Bus Station Entrance       -> Bus Station
      (same spot, before the <<harvesticon>> Leave link; lines 153-160)
  h5  :: Bus Station Back Entrance  -> Bus Station
      (same spot, before the <<alleyicon>> Leave link; lines 177-184)
The four door blocks keep BJX's <<set $ghostIn to false>> reset on
entry and <<set $ghostIn to true>> on pass-through ($ghostIn is
BJX-only, no 0.5 collision, no consumer until the ghost group lands).
All other BJX-vs-0.5 diffs in this file (dangerEvent() rework, alley/
exit link reshuffle, $cheatsEnabled) are vanilla 0.4.3.3 -> 0.5
evolution and are intentionally NOT ported.

Anchors deliberately start at each door's <<lockicon "pick">> line and
span down to that door's unique Leave icon line: bare link text alone
is ambiguous in this file (<<busstationicon>><<link [[Leave|Bus
Station]]>> appears twice; the Bus Station pick line appears in both
Entrance and Back Entrance).
"""


def gen_busstation_events():
    """bjx-busstation-events.twee: the single BJX bus-station addition -
    :: Ghost Van Escape (main-bjx.twee), the outcome of ghost-phasing
    through the moving livestock van's door: the PC tumbles onto Harvest
    Street with scraped skin (<<gpain>> + <<violence 200>>, then a
    0:10 link back to Harvest Street). No variable translation needed:
    no 0.4.3.3-only widgets and no renamed link targets appear."""
    merge(['overworld-town/loc-bus-station/main-bjx.twee'],
          'bjx-busstation-events.twee')


def gen_busstation_hooks():
    """Vanilla 0.5 loc-bus-station main.twee + 5 ghost pass-throughs.

    h1 'Bus Station Livestock': ghost pass-through link to the new
       Ghost Van Escape passage, inserted after the "van rumbles into
       motion" paragraph and before the [[Next|Street Van Journey]]
       link; unlike the doors it carries <<endevent>> and no $ghostIn.
    h2 'Bus Station Front Door': <<set $ghostIn to false>> + guarded
       pass-through to Harvest Street, inserted between the lockpick
       <</if>> and the <<busstationicon>> Leave link.
    h3 'Bus Station Back Door': same insertion pattern, pass-through
       retargeted to the 0.5 passage name 'Industrial Alleyways'
       (BJX 0.4.3.3 linked to lowercase 'Industrial alleyways', which
       no longer exists in 0.5 - SugarCube links are case-sensitive).
    h4 'Bus Station Entrance': same insertion pattern before the
       <<harvesticon>> Leave link, pass-through to Bus Station.
    h5 'Bus Station Back Entrance': same insertion pattern before the
       <<alleyicon>> Leave link, pass-through to Bus Station."""
    src = read(os.path.join(REF, 'overworld-town', 'loc-bus-station', 'main.twee'))

    # h1: Bus Station Livestock - van door pass-through.
    h1_anchor = ("You try to open the doors, but they're locked. You look around, "
                 "but see no other way out. The van rumbles into motion.\n"
                 "<br><br>\n"
                 "\n"
                 "<<link [[Next|Street Van Journey]]>><</link>>")
    h1_ins = ("You try to open the doors, but they're locked. You look around, "
              "but see no other way out. The van rumbles into motion.\n"
              "<br><br>\n"
              "\n"
              "/* BJX pack: ghost pass-through before the van leaves */\n"
              "<<if $options.bjx_eventTF and $ghost gte 1>>\n"
              "\t<span class ='wraith'>只要你集中精力，就能穿越这扇门。</span>\n"
              "\t<br>\n"
              "\t<<link [[穿越 (0:01)|Ghost Van Escape]]>><<endevent>><<pass 1>><</link>>\n"
              "\t<br>\n"
              "<</if>>\n"
              "\n"
              "<<link [[Next|Street Van Journey]]>><</link>>")
    assert src.count(h1_anchor) == 1, 'livestock van anchor not unique'
    src = src.replace(h1_anchor, h1_ins)

    # h2-h5: the four door passages. Each anchor spans the door's
    # <<lockicon "pick">> line down to its unique Leave icon line.
    pick = ('\t\t<<lockicon "pick">><<link [[Pick it (0:10)|%s]]>>'
            '<<pass 10>><<crimeUp 5 "trespassing">><</link>><<crime "trespassing">>\n')
    red = ('\t<span class="red">The lock looks beyond your ability to pick.</span>'
           '<<skulduggeryrequired>>\n'
           '\t<br><br>\n'
           '<</if>>\n')
    # (passage, pick link target, lines between pick and the red block,
    #  Leave line, ghost pass-through target)
    doors = [
        ('Bus Station Front Door', 'Harvest Street',
         '\t\t<br>\n\t<</if>>\n<<else>>\n',
         '<<busstationicon>><<link [[Leave|Bus Station]]>><</link>>\n',
         'Harvest Street'),
        ('Bus Station Back Door', 'Industrial Alleyways',
         '\t<</if>>\n\t<br>\n<<else>>\n',
         '<<busstationicon>><<link [[Leave|Bus Station]]>><</link>>\n',
         'Industrial Alleyways'),
        ('Bus Station Entrance', 'Bus Station',
         '\t<</if>>\n\t<br>\n<<else>>\n',
         '<<harvesticon>><<link [[Leave|Harvest Street]]>><</link>>\n',
         'Bus Station'),
        ('Bus Station Back Entrance', 'Bus Station',
         '\t\t<br>\n\t<</if>>\n<<else>>\n',
         '<<alleyicon>><<link [[Leave|Industrial Alleyways]]>><</link>>\n',
         'Bus Station'),
    ]
    for name, pick_target, mid, leave, target in doors:
        anchor = (pick % pick_target) + mid + red + leave
        block = ('/* BJX pack: ghost pass-through */\n'
                 '<<set $ghostIn to false>>\n'
                 '<<if $options.bjx_eventTF and $ghost gte 1>>\n'
                 "\t<span class ='wraith'>只要你集中精力，就能穿越这扇门。</span>\n"
                 '\t<br>\n'
                 '\t<<link [[穿越 (0:01)|' + target + ']]>><<pass 1>>'
                 '<<set $ghostIn to true>><</link>>\n'
                 '\t<br>\n'
                 '<</if>>\n')
        assert src.count(anchor) == 1, name + ' anchor not unique'
        src = src.replace(anchor, (pick % pick_target) + mid + red + block + leave)

    out = ('/* BJX pack: vanilla 0.5 loc-bus-station main.twee + 5 ghost '
           'pass-throughs (livestock van + 4 doors). */\n' + src)
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-busstation-hooks.twee'), out)
    print('bjx-busstation-hooks.twee: 5 ghost pass-throughs inserted')
"""landfill 组生成器（BJX 0.4.3.3 -> DoL 0.5.10.12 ModLoader pack）。

产出三个 twee 文件（TWE = work/bjx-pack/tweeFileList）：

1. bjx-landfill-events.twee  (merge, 8 passages, 全部来自 BJX 新文件
   overworld-town/loc-landfill/main-bjx.twee):
       :: Trash Mammals            浣熊窝遭遇入口（dencounter 0/重访两版）
       :: Raccoons Love            顺从线战斗循环（consensual, beastCombatInit）
       :: Raccoons Love Ejaculation
       :: Raccoons Love Finish     善终/反杀/平局三分支
       :: Raccoons Rape            抵抗线战斗循环（controlloss, molested）
       :: Raccoons Rape Ejaculation
       :: Raccoons Rape Escape
       :: Raccoons Rape End        四种收尾分支
   merge cleanup: $bestialitydisable is "f" -> $settings.bestialityEnabled;
   BJX 独有变量防御 <<if $raccoon gte 4>> / <<if $dencounter is 0>>
   -> ($raccoon ?? 0) / ($dencounter ?? 0)。$deviancy gte 35 保留
   （0.5 的 $deviancy 变量仍存在，与 bjx-forest-events.twee 的
   Forest Raccoon 先例一致）。

2. bjx-landfill-hooks.twee     (0.5 原版 loc-landfill/main.twee 全文 + 9 处
   BJX 插入, 对应 BJX main.twee 的 9 个"北极星"块):
       H1  Trash Intro     头部: <<set $dencounter to ($dencounter ?? 0)>>
       H2  Trash           $trash lte 0 else 分支: 浣熊窝描述 + 进入内部
                           (0:03) 链接 -> Trash Mammals (<<beastNEWinit 3
                           raccoon>>; $dencounter/$deviancy 按上述规则处理)
       H3  Trash           高潮耳蜗 slime 感染条件追加 and ($slime ?? 0)
                           is 0（BJX slime 线独有防重）
       H4  Trash           出口区（trash_unlocked else 之后, $trash lte 0
                           结束之前）: 凯西白天翻垃圾 + 打招呼(0:05) ->
                           Casey Hello; $NPCName[$NPCNameList.indexOf
                           ("凯西")].love -> C.npc["凯西"].love
                           （inject_early.js 以中文名"凯西"注册并建立
                           C.npc 别名; 0.5 原版无 Casey named NPC）
       H5  Trash           machinery 链末尾追加 elseif: $bunker is "found"
                           时显示 进入活板门(0:02) -> The Bunker Intro
                           （bjx-bunker.twee 已有该 passage）
       H6  Trash Gate Enter   robin else 内 lock 链之后: 幽灵 $ghost gte 1
                           且 $options.bjx_eventTF 时 穿越 (0:01) -> Trash
       H7  Trash Gate Leave   lock 链之后: 同上 穿越 (0:01) -> Elk Street
       H8  Trash Search    trash gte 100 链 brothel 分支后插入 elseif:
                           rng gte 90 且 bunker 未发现 -> 发现活板门
                           ($bunker to "found")
       H9  Trash Search    trash gte 100 链 eye 分支后插入 elseif:
                           rng gte 20 -> 浣熊目击提示文本

3. bjx-landfill-widgets.twee  (0.5 原版 loc-landfill/widgets.twee 全文 + 1 处
   BJX 插入, 对应 BJX widgets.twee 的 trash_1 北极星块):
       W1  eventstrash 内 <<addinlineevent "trash_1" 1>>: rng gte 91 时改为
                           浣熊伏击（<<beastNEWinit 1 raccoon>>, bestiality
                           开启走 Trash Beast / 关闭则逃跑），否则落入原版
                           私闯者事件; $bestialitydisable is "f" ->
                           $settings.bestialityEnabled

依赖（0.5 侧均已确认存在）: beastNEWinit/generateBEAST（raccoon 类型由
bjx-beast-generation.twee 的 9-beast patch 提供）、beastCombatInit、
beastTrainGenerate、combatTrainAdvance、beastejaculation、beastwound、
beast/effectsman/stateman/actionsman/nexttext、consensual/controlloss/
violence/neutral/molested、deviancy1/deviancy4/deviant2、tearful/clotheson/
endcombat/endevent、beastescape、beasttype/beastsplural/bHe 系（text.twee，
直出 type 字符串 "raccoon"，与 BJX 0.4.3.3 行为一致）、Time.dayState、
C.npc（inject_early.js）、$options.bjx_eventTF（inject_early.js 默认 true）。
BJX 独有 story 变量: $dencounter / $raccoon / $bunker / $slime / $ghost /
$ghostIn（均由本组或既有组设置/消费, 引用点按需 ?? 防御）。
"""


def gen_landfill_events():
    """bjx-landfill-events.twee: BJX loc-landfill/main-bjx.twee merged
    verbatim (8 passages: Trash Mammals + the 7 Raccoons combat-chain
    passages). 0.4.3.3 -> 0.5.10.12 translations via merge cleanup:
    (a) $bestialitydisable is "f" -> $settings.bestialityEnabled (the 0.5
    settings flag, same direction as the forest-group precedent);
    (b) the BJX-only story vars $raccoon and $dencounter get ?? 0 guards
    on their *comparisons* (is/gte against undefined would misfire for
    `is 0`); the `<<set $dencounter to 1>>` write needs no guard.
    $deviancy gte 35 stays as-is: $deviancy still exists in 0.5 (it is
    what hasSexStat reads internally) and the forest group kept the same
    direct comparison in its forestraccoon event."""
    merge(['overworld-town/loc-landfill/main-bjx.twee'],
          'bjx-landfill-events.twee',
          cleanup=[
              ('$bestialitydisable is "f"', '$settings.bestialityEnabled'),
              ('<<if $raccoon gte 4>>', '<<if ($raccoon ?? 0) gte 4>>'),
              ('<<if $dencounter is 0>>', '<<if ($dencounter ?? 0) is 0>>'),
          ])


def gen_landfill_hooks():
    """bjx-landfill-hooks.twee: vanilla 0.5 loc-landfill/main.twee full
    text with the 9 BJX insertions (the 9 北极星 blocks of the BJX
    main.twee), 0.4.3.3 -> 0.5 adapted:
    H1 Trash Intro - $dencounter init (?? 0 form, idempotent);
    H2 Trash - front-gate else branch replaced by the BJX raccoon-den
       description + 进入内部(0:03) link to Trash Mammals ($dencounter
       guarded, $deviancy gte 15 kept as a direct comparison);
    H3 Trash - orgasm ear-slime gate gains `and ($slime ?? 0) is 0`
       (BJX slime line anti-repeat; plain `$slime is 0` would be false
       for undefined and wrongly suppress the vanilla 0.5 event);
    H4 Trash - Casey greeting link at the exit block, NPC access via
       C.npc["凯西"] (the name inject_early.js registers the NPC under);
    H5 Trash - bunker trapdoor elseif after the Robin-mist machinery
       branch, guarded ($bunker ?? 0) is "found";
    H6/H7 Trash Gate Enter / Leave - ghost phase-through option
       ($options.bjx_eventTF and $ghost gte 1, unguarded like the
       home/forest group precedents: undefined gte 1 is safely false);
    H8 Trash Search - bunker discovery elseif (rng gte 90) after the
       brothel-canister branch;
    H9 Trash Search - raccoon sighting elseif (rng gte 20) after the
       baleful-eye branch."""
    src = read(os.path.join(REF, 'overworld-town', 'loc-landfill', 'main.twee'))

    # H1: Trash Intro - initialise the raccoon-den encounter counter.
    h1_anchor = (':: Trash Intro\n'
                 '<<set $location to "landfill">><<set $bus to "elk">>'
                 '<<set $outside to 1>><<effects>>\n')
    h1_ins = (h1_anchor +
              '/* BJX pack: initialise the raccoon-den encounter counter */\n'
              '<<set $dencounter to ($dencounter ?? 0)>>\n')
    assert src.count(h1_anchor) == 1, 'H1 Trash Intro anchor not unique'
    src = src.replace(h1_anchor, h1_ins)

    # H2: Trash - front-gate description replaced by the BJX raccoon den.
    h2_anchor = ('<<else>>\n'
                 "\tYou're at the front gate. You can see Elk Street on the "
                 'other side. A sign reads: "These premises and all objects '
                 'within are private property."\n'
                 '<</if>>\n')
    h2_ins = ('<<else>>\n'
              '\t/* BJX pack: BJX front-gate description + raccoon den */\n'
              '\t你正站在垃圾场的前门处，在这你可以看到另一边的麋鹿街。'
              '旁边的一块牌子上写着: "这片土地和其中的所有物品都是私人财产"。\n'
              '\t<br><br>\n'
              '\t<i>你听到附近有奇怪的声音...</i>\n'
              '\t<br><br>\n'
              '\n'
              '\t<<if $stress lt $stressmax and $eventskip is 1>>\n'
              '\t\t在周围的垃圾堆里，你注意到有一堆特别结实的垃圾。\n'
              '\t\t<br><br>\n'
              '\t\t里面似乎有一块空地，地上铺着头发或布料。\n'
              '\t\t<br><br>\n'
              '\t\t<<if ($dencounter ?? 0) is 0>>\n'
              '\t\t\t你看到里面有什么东西，那是条纹尾巴吗？\n'
              '\t\t\t<br><br>\n'
              "\t\t\t<span class='lewd'>调查可能不是个好主意</span>，但你还是很好奇。\n"
              '\t\t\t<br><br>\n'
              '\t\t<<else>>\n'
              '\t\t\t你以前来过这里，或者至少去过类似的地方。很难说，因为这里到处都是垃圾，'
              "但你可以肯定这是一个<span class='green'>浣熊窝。</span>\n"
              '\t\t\t<br><br>\n'
              '\t\t\t考虑到你第一次进去时发生过的事，你正在犹豫是否要进入。\n'
              '\t\t\t<br><br>\n'
              '\t\t\t<<if $deviancy gte 15>>\n'
              "\t\t\t\t<span class='lewd'>不过，这次可能会有所不同，会更令人愉快。</span>\n"
              '\t\t\t\t<br><br>\n'
              '\t\t\t<</if>>\n'
              '\t\t<</if>>\n'
              '\t\t<<link [[进入内部(0:03)|Trash Mammals]]>><<beastNEWinit 3 raccoon>><<pass 3>><</link>>\n'
              '\t\t<br><br>\n'
              '\t<</if>>\n'
              '<</if>>\n')
    assert src.count(h2_anchor) == 1, 'H2 front-gate anchor not unique'
    src = src.replace(h2_anchor, h2_ins)

    # H3: Trash - BJX slime line suppresses the vanilla ear-slime event.
    h3_anchor = ('\t<<if $rng gte 51 and $settings.parasitesEnabled and '
                 '($parasite.left_ear.name is undefined or '
                 '$parasite.right_ear.name is undefined) and '
                 '$settings.slimesEnabled and $hallucinations gte 1>>\n')
    h3_ins = ('\t/* BJX pack: suppress the vanilla ear-slime while the BJX\n'
              '\t   slime line is active ($slime is a BJX-only var) */\n'
              '\t<<if $rng gte 51 and $settings.parasitesEnabled and '
              '($parasite.left_ear.name is undefined or '
              '$parasite.right_ear.name is undefined) and '
              '$settings.slimesEnabled and $hallucinations gte 1 and '
              '($slime ?? 0) is 0>>\n')
    assert src.count(h3_anchor) == 1, 'H3 ear-slime gate anchor not unique'
    src = src.replace(h3_anchor, h3_ins)

    # H4: Trash - Casey scavenging greeting inside the $trash lte 0 block.
    h4_anchor = ('\t\t\t\t<<lockicon "gate">><<link [[Try the gate (0:05)|'
                 'Trash Gate Leave]]>><<pass 5>><</link>>\n'
                 '\t\t\t\t<br>\n'
                 '\t\t\t<</if>>\n'
                 '\t\t<</if>>\n'
                 '\t<</if>>\n')
    h4_ins = ('\t\t\t\t<<lockicon "gate">><<link [[Try the gate (0:05)|'
              'Trash Gate Leave]]>><<pass 5>><</link>>\n'
              '\t\t\t\t<br>\n'
              '\t\t\t<</if>>\n'
              '\t\t<</if>>\n'
              '\t\t/* BJX pack: Casey scavenging at the gate */\n'
              '\t\t<<if C.npc["凯西"].love gte 41 and Time.dayState is "day">>\n'
              '\t\t\t你看到凯西在垃圾堆里翻找东西，偶尔会把什么放进口袋或扔掉。\n'
              '\t\t\t<<link [[打招呼(0:05)|Casey Hello]]>><<pass 5>><</link>>\n'
              '\t\t<</if>>\n'
              '\t<</if>>\n')
    assert src.count(h4_anchor) == 1, 'H4 Casey anchor not unique'
    src = src.replace(h4_anchor, h4_ins)

    # H5: Trash - bunker trapdoor elseif after the Robin-mist branch.
    h5_anchor = ('\t<<elseif $trash gte 100 and $robinmissing is "landfill" '
                 'and $robinmistknown>>\n'
                 '\t\t<<getinicon>><<link [[Go towards the sound of heavy '
                 'machinery (0:10)|Robin Mist Intro]]>><<pass 10>><</link>>\n'
                 '\t\t<br>\n'
                 '\t<</if>>\n')
    h5_ins = ('\t<<elseif $trash gte 100 and $robinmissing is "landfill" '
              'and $robinmistknown>>\n'
              '\t\t<<getinicon>><<link [[Go towards the sound of heavy '
              'machinery (0:10)|Robin Mist Intro]]>><<pass 10>><</link>>\n'
              '\t\t<br>\n'
              '\t/* BJX pack: bunker trapdoor */\n'
              '\t<<elseif $trash gte 100 and ($bunker ?? 0) is "found">>\n'
              '\t\t<<getinicon>><<link [[进入活板门(0:02)|The Bunker Intro]]>>'
              '<<set $eventskip to 1>><<pass 2>><</link>>\n'
              '\t<</if>>\n')
    assert src.count(h5_anchor) == 1, 'H5 bunker trapdoor anchor not unique'
    src = src.replace(h5_anchor, h5_ins)

    # H6: Trash Gate Enter - ghost phase-through (into the landfill).
    h6_anchor = ("\t\t<span class=\"blue\"><i>There must be a key, but you "
                 "haven't any idea where you could find one.</i></span>\n"
                 '\t\t<br><br>\n'
                 '\t<</if>>\n'
                 '<</if>>\n'
                 '\n'
                 '<<elkicon>><<link [[Leave|Elk Street]]>><</link>>\n')
    h6_ins = ("\t\t<span class=\"blue\"><i>There must be a key, but you "
              "haven't any idea where you could find one.</i></span>\n"
              '\t\t<br><br>\n'
              '\t<</if>>\n'
              '\t/* BJX pack: ghost phase through the gate */\n'
              '\t<<set $ghostIn to false>>\n'
              '\t<<if $options.bjx_eventTF and $ghost gte 1>>\n'
              "\t\t<span class='wraith'>只要你集中精力，就能穿越这扇门。</span>\n"
              '\t\t<br>\n'
              '\t\t<<link [[穿越 (0:01)|Trash]]>><<pass 1>><<set $trash to 0>>'
              '<<set $ghostIn to true>><</link>>\n'
              '\t\t<br>\n'
              '\t<</if>>\n'
              '<</if>>\n'
              '\n'
              '<<elkicon>><<link [[Leave|Elk Street]]>><</link>>\n')
    assert src.count(h6_anchor) == 1, 'H6 Gate Enter ghost anchor not unique'
    src = src.replace(h6_anchor, h6_ins)

    # H7: Trash Gate Leave - ghost phase-through (onto Elk Street).
    h7_anchor = ('<<else>>\n'
                 '\t<span class="red">The lock looks beyond your ability to '
                 'pick.</span> <<skulduggeryrequired>>\n'
                 '\t<br><br>\n'
                 '<</if>>\n'
                 '\n'
                 '<<getouticon>><<link [[Leave|Trash]]>><</link>>\n')
    h7_ins = ('<<else>>\n'
              '\t<span class="red">The lock looks beyond your ability to '
              'pick.</span> <<skulduggeryrequired>>\n'
              '\t<br><br>\n'
              '<</if>>\n'
              '/* BJX pack: ghost phase through the gate */\n'
              '<<set $ghostIn to false>>\n'
              '<<if $options.bjx_eventTF and $ghost gte 1>>\n'
              "\t<span class='wraith'>只要你集中精力，就能穿越这扇门。</span>\n"
              '\t<br>\n'
              '\t<<link [[穿越 (0:01)|Elk Street]]>><<pass 1>>'
              '<<set $ghostIn to true>><</link>>\n'
              '\t<br>\n'
              '<</if>>\n'
              '\n'
              '<<getouticon>><<link [[Leave|Trash]]>><</link>>\n')
    assert src.count(h7_anchor) == 1, 'H7 Gate Leave ghost anchor not unique'
    src = src.replace(h7_anchor, h7_ins)

    # H8: Trash Search - bunker discovery (deep landfill, rng gte 90).
    h8_anchor = ('\t\t<<set $brothel_machine_repair to 3>>\n'
                 '\t<<elseif $rng gte 81>>\n')
    h8_ins = ('\t\t<<set $brothel_machine_repair to 3>>\n'
              '\t/* BJX pack: discover the bunker trapdoor */\n'
              '\t<<elseif $rng gte 90 and ($bunker ?? 0) isnot "found">>\n'
              '\t\t当你探索垃圾填埋场时，你注意到垃圾堆中有一个奇怪的大洞。'
              '一个生锈的活板门半开着，仿佛在邀请你进去。\n'
              '\t\t<<set $bunker to "found">>\n'
              '\t<<elseif $rng gte 81>>\n')
    assert src.count(h8_anchor) == 1, 'H8 bunker discovery anchor not unique'
    src = src.replace(h8_anchor, h8_ins)

    # H9: Trash Search - raccoon sighting (deep landfill, rng gte 20).
    h9_anchor = ('\t<<elseif $rng gte 31>>\n'
                 '\t\tThe rubbish gives way in a small avalanche, '
                 '<span class="red">revealing a baleful eye.</span> It pierces '
                 'you with its stare, before vanishing into the mountain. It '
                 "happened so quick you might have imagined it, but when you "
                 "close your eyes, it's still there, "
                 'watching.<<ghallucinogens>><<ggstress>>'
                 '<<set $hallucinogen += 90>><<stress 12>>\n'
                 '\t<<else>>\n')
    h9_ins = ('\t<<elseif $rng gte 31>>\n'
              '\t\tThe rubbish gives way in a small avalanche, '
              '<span class="red">revealing a baleful eye.</span> It pierces '
              'you with its stare, before vanishing into the mountain. It '
              "happened so quick you might have imagined it, but when you "
              "close your eyes, it's still there, "
              'watching.<<ghallucinogens>><<ggstress>>'
              '<<set $hallucinogen += 90>><<stress 12>>\n'
              '\t/* BJX pack: raccoon sighting */\n'
              '\t<<elseif $rng gte 20>>\n'
              '\t\t当你在垃圾堆里搜寻有用的东西时，你听到附近有窃窃私语声。'
              '快速转过身，你看到一个黑色的小东西跑进了附近的裂缝。那是一只浣熊吗？\n'
              '\t<<else>>\n')
    assert src.count(h9_anchor) == 1, 'H9 raccoon sighting anchor not unique'
    src = src.replace(h9_anchor, h9_ins)

    out = ('/* BJX pack: vanilla 0.5 loc-landfill main.twee + 9 BJX insertions\n'
           '   (raccoon den, ear-slime guard, Casey greeting, bunker trapdoor\n'
           '   x2, ghost gate phase x2). */\n' + src)
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-landfill-hooks.twee'), out)
    print('bjx-landfill-hooks.twee: 9 insertions '
          '(den, slime guard, casey, bunker door+find, ghost x2, sighting)')


def gen_landfill_widgets():
    """bjx-landfill-widgets.twee: vanilla 0.5 loc-landfill/widgets.twee
    full text with the single BJX insertion (W1): inside eventstrash, the
    trash_1 inline event gains a raccoon-ambush branch - on $rng gte 91 a
    <<beastNEWinit 1 raccoon>> fires, bestiality enabled (monster or
    $settings.bestialityEnabled) leads to Trash Beast, otherwise the
    escape flavour text + beastescape; every other roll falls through to
    the vanilla 0.5 private-property confrontee. The 0.4.3.3
    $bestialitydisable is "f" guard is translated to
    $settings.bestialityEnabled. trash_2..trash_10 and the passouttrash /
    trashSelect widgets stay pure 0.5."""
    src = read(os.path.join(REF, 'overworld-town', 'loc-landfill', 'widgets.twee'))

    # 0.5.12.13 reindented the Seduce branch (+1 tab) and bumped
    # <<promiscuous1>> to <<promiscuous2>>; mirror whichever the base uses.
    seduce = ('\t\t<<link [[Seduce|Trash Seduce]]>><</link>><<promiscuous2>>\n'
              '\t\t<br>\n'
              if '<<promiscuous2>>' in src else
              '\t<<link [[Seduce|Trash Seduce]]>><</link>><<promiscuous1>>\n'
              '\t<br>\n')
    w1_anchor = ('<<addinlineevent "trash_1" 1>>\n'
                 '\t<<generate1>><<person1>>"Stop right there," a voice '
                 'shouts behind you. "This is private property. What the '
                 "fuck do you think you're doing?\"\n"
                 '\t<br><br>\n'
                 '\n'
                 '\t<<link [[Explain|Trash Explain]]>><</link>>'
                 '<<englishdifficulty 1 1000>>\n'
                 '\t<br>\n'
                 '\t<<if hasSexStat("promiscuity", 2)>>\n' + seduce
                 + '\t<</if>>\n'
                 '\t<<link [[Run|Trash Run]]>><</link>>'
                 '<<athleticsdifficulty 1 1000>>\n'
                 '\t<br>\n'
                 '<</addinlineevent>>\n')
    w1_ins = ('<<addinlineevent "trash_1" 1>>\n'
              '\t/* BJX pack: raccoon ambush (rng 91+) */\n'
              '\t<<if $rng gte 91>>\n'
              '\t\t<<beastNEWinit 1 raccoon>>\n'
              '\t\t你听到身后有叽叽喳喳的声音。一只<<beasttype>>从一堆东西后面走了出来，'
              '对你呲牙咧嘴。\n'
              '\t\t<br><br>\n'
              '\t\t<<if $monster is 1 or $settings.bestialityEnabled>>\n'
              '\t\t\t<<link [[继续|Trash Beast]]>><<set $molestationstart to 1>>'
              '<</link>>\n'
              '\t\t\t<br>\n'
              '\t\t<<else>>\n'
              '\t\t\t你吓了一跳，连忙转头逃跑。虽然受了点伤，但还是有惊无险地逃走了。\n'
              '\t\t\t<<beastescape>>\n'
              '\t\t\t<br><br>\n'
              '\t\t\t<<link [[继续|Trash]]>><<endevent>>'
              '<<set $eventskip to 1>><</link>>\n'
              '\t\t\t<br>\n'
              '\t\t<</if>>\n'
              '\t<<else>>\n'
              '\t<<generate1>><<person1>>"Stop right there," a voice '
              'shouts behind you. "This is private property. What the '
              "fuck do you think you're doing?\"\n"
              '\t<br><br>\n'
              '\n'
              '\t<<link [[Explain|Trash Explain]]>><</link>>'
              '<<englishdifficulty 1 1000>>\n'
              '\t<br>\n'
              '\t<<if hasSexStat("promiscuity", 2)>>\n' + seduce
              + '\t<</if>>\n'
              '\t<<link [[Run|Trash Run]]>><</link>>'
              '<<athleticsdifficulty 1 1000>>\n'
              '\t<br>\n'
              '\t<</if>>\n'
              '<</addinlineevent>>\n')
    assert src.count(w1_anchor) == 1, 'W1 trash_1 anchor not unique'
    src = src.replace(w1_anchor, w1_ins)

    out = ('/* BJX pack: vanilla 0.5 loc-landfill widgets.twee + BJX trash_1\n'
           '   raccoon ambush branch. */\n' + src)
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-landfill-widgets.twee'), out)
    print('bjx-landfill-widgets.twee: trash_1 raccoon ambush hooked')


# ------------------------------------------------- 3h: lake-underwater group
"""lake-underwater group generators (BJX 0.4.3.3 -> DoL 0.5.10.12 bjx-pack),
batch 3h. Ported from the verified standalone genparts/gen_lake_underwater.py
(same text, output now lands in TWE directly).

Events file bjx-lake-underwater-events.twee - 2 passages merged from BJX
loc-lake/underwater-bjx.twee: :: Slime Reversion (red-light reversion entry
from the hooked Lake Ruin Sit, <<pass 10>>) and :: Slime Reversion 2
(clothing integrity zeroed + <<slimeuntransform>> back to Lake Ruin Plinth).
The single BJX-only $slime_tf read gets a ?? 0 guard; slimeuntransform /
removeparasite / headruined / legsruined / feetruined / integritycheck all
exist on the 0.5 side (slimeuntransform via bjx-tf-mushroom.twee).

Hooks file bjx-lake-underwater-hooks.twee - vanilla 0.5 loc-lake
underwater.twee + 8 BJX insertions (three-way diff against the 0.4.3.3
baseline; the ghost pass-through and flywait blocks live in loc-lake/main.twee
= the future lake-main group, NOT here):
  P1 Lake Ruin Door        Chinese door text, necklace collapsed onto the
                           is "notFound" single branch
  P2 Lake Ruin Sit         Chinese sit text + slime-TF reversion branch
                           before the pregnancy guard (if -> elseif)
  P3 Lake Ruin Sit         ear-slime branch Chinese (keeps 0.5
                           numberOfEarSlime(true) gte 2 + corruption 0)
  P4 Lake Ruin Sit         tentacle epilogue Chinese, $tentacledisable
                           is "f" -> $settings.tentaclesEnabled
  P5 Lake Ruin Plinth      slime variant of the blood-moon tentacle grab
                           (elseif, tentacles cannot hold a slime)
  P6 Lake Ruin Plinth      silent _bmoon branch pulls a slime in
  P7 Consentacles Leave    $swimmingSuccess or ($slime ?? 0) gt 0 escape
  P8 Lake Pots             ivory-box link tags $skulduggeryhands to 1
                           (consumed by the later BJX skill-difficulties
                           group; writing it early is harmless)
"""


def gen_lake_underwater_events():
    vanilla = read(os.path.join(REF, 'overworld-forest', 'loc-lake',
                                'underwater.twee'))
    vanilla_passages = re.findall(r'^:: (.+)$', vanilla, re.M)

    merge(['overworld-forest/loc-lake/underwater-bjx.twee'],
          'bjx-lake-underwater-events.twee',
          cleanup=[('<<if $slime_tf is 1>>', '<<if ($slime_tf ?? 0) is 1>>')])
    txt = read(os.path.join(TWE, 'bjx-lake-underwater-events.twee'))

    # --- verify ---
    ev_passages = re.findall(r'^:: (.+)$', txt, re.M)
    assert ev_passages == ['Slime Reversion', 'Slime Reversion 2'], \
        'events passage list wrong: %r' % ev_passages
    for p in ev_passages:
        assert p not in vanilla_passages, \
            'events passage %r collides with a 0.5 passage' % p
    assert txt.count('($slime_tf ?? 0) is 1') == 1
    assert txt.count('<<slimeuntransform>>') == 1
    assert txt.count('<<removeparasite left_ear>>') == 1
    assert txt.count('<<removeparasite right_ear>>') == 1
    assert txt.count('<<pass 10>>') == 1
    assert txt.count('[[继续|Slime Reversion 2]]') == 1
    assert txt.count('[[继续|Lake Ruin Plinth]]') == 1
    assert 'Lake Ruin Plinth' in vanilla_passages, \
        'link target Lake Ruin Plinth missing from 0.5'
    assert '$tentacledisable' not in txt
    assert '$bestialitydisable' not in txt
    print('bjx-lake-underwater-events.twee: 2 passages (slime reversion), '
          '%d lines' % len(txt.splitlines()))


def gen_lake_underwater_hooks():
    vanilla = read(os.path.join(REF, 'overworld-forest', 'loc-lake',
                                'underwater.twee'))
    vanilla_passages = re.findall(r'^:: (.+)$', vanilla, re.M)
    assert len(vanilla_passages) == 33, \
        'unexpected 0.5 passage count: %d' % len(vanilla_passages)
    src = vanilla

    # P1: Lake Ruin Door - opening text Chinese-ised, necklace collapsed
    # onto the is "notFound" single branch (semantically equal to 0.5's
    # isnot/else pair). Keeps 0.5's lakeRuin.key/wearProp/lakeicon lines.
    p1_anchor = ('You hear the ancient mechanism creak and the door groans '
                 'open. Beyond is a plinth, stood alone in a rubble-strewn '
                 'room.\n'
                 '<<if $museumAntiques.antiques.antiqueivorynecklace isnot '
                 '"notFound">>\n'
                 "\tYou look around the barren room. You don't see anything "
                 'besides the plinth.\n'
                 '<<else>>\n'
                 "\tAtop it sits an ivory necklace. It's studded with blue "
                 'jewels.\n'
                 '<</if>>\n')
    p1_ins = ('/* BJX pack: 北极星模组 (Chinese door text; necklace shown '
              'when notFound) */\n'
              '你听到古老齿轮的运转声，随后门呻吟着打开了。门后是一个基座，'
              '它就孤零零地立在一个布满碎石的房间里。\n'
              '<<if $museumAntiques.antiques.antiqueivorynecklace is '
              '"notFound">>\n'
              '    一条象牙项链被放在基座顶部，蓝色的宝石镶嵌其上。\n'
              '<</if>>\n')
    assert src.count(p1_anchor) == 1, 'P1 Lake Ruin Door anchor not unique'
    src = src.replace(p1_anchor, p1_ins)

    # P2: Lake Ruin Sit - header Chinese-ised + the slime-TF reversion
    # branch inserted before the vanilla pregnancy-guard if (which turns
    # into the elseif). $slime is a BJX-only var -> ?? 0 guard.
    p2_anchor = ('You grip the plinth, and pull your <<bottom>> against it. '
                 'The instant you do, a red light blazes into life, '
                 'illuminating the room. Previously unseen statues stare '
                 'down at you from above.\n'
                 '<br><br>\n'
                 '<<if !(!$player.vaginaExist and playerIsPregnant())>>\n')
    p2_ins = ('/* BJX pack: 北极星模组 (Chinese sit text) */\n'
              '你抓住矮柱，把你的<<bottom>>紧贴着它。你一触摸，一盏红灯亮起，'
              '照亮了房间。之前未曾见过的雕像从上面凝视着你。\n'
              '<br><br>\n'
              '/* BJX pack: slime-TF reversion entry ($slime is the BJX-only\n'
              '   slime-TF flag set by slimetransform) */\n'
              '<<if ($slime ?? 0) gt 0>>\n'
              '\t你猛地后退，痉挛着。房间摇晃颤动，地板上出现了一道裂缝。'
              '它变宽了，更多的红光透了进来。\n'
              '\t你的全身沐浴在深红色之中。你的身体开始在房间颤抖。'
              '你的皮肤开始扭曲和起泡，颜色变成红色，就像里面的核心一样。\n'
              '\t<br><br>\n'
              '\t与此同时，同样的核心越来越大……\n'
              '\t<br><br>\n'
              '\t<<link [[继续|Slime Reversion]]>><<pass 10>><</link>>'
              '<br><br>\n'
              '<<elseif !(!$player.vaginaExist and playerIsPregnant())>>\n')
    assert src.count(p2_anchor) == 1, 'P2 Lake Ruin Sit entry anchor not unique'
    src = src.replace(p2_anchor, p2_ins)

    # P3: Lake Ruin Sit - ear-slime branch text Chinese-ised. Keeps 0.5's
    # numberOfEarSlime(true) API, world_corruption calls and the
    # $earSlime.corruption to 0 value (0.4.3.3 said 1; that is vanilla
    # evolution, not a BJX change).
    p3_anchor = ('\tYou jerk back, and convulse. The room shakes and '
                 'trembles. A crack appears in the floor. It widens, '
                 'letting in more of the red light.\n'
                 '\t<<if numberOfEarSlime(true) gte 2>>\n'
                 '\t\tYou feel the slimes squirm from your ears. They '
                 'vanish into the crevice.\n'
                 '\t\t<<world_corruption "soft" 20>>\n'
                 '\t<<else>>\n'
                 '\t\tYou feel the slime squirm from your ear. It vanishes '
                 'into the crevice.\n'
                 '\t\t<<world_corruption "soft" 10>>\n'
                 '\t<</if>>\n')
    p3_ins = ('\t你猛地后退，痉挛着。房间摇晃颤动，地板上出现了一道裂缝。'
              '它变宽了，更多的红光透了进来。\n'
              '\t<<if numberOfEarSlime(true) gte 2>>\n'
              '\t\t你感觉到史莱姆从你的耳朵里蠕动着。它们消失在了裂缝里。\n'
              '\t\t<<world_corruption "soft" 20>>\n'
              '\t<<else>>\n'
              '\t\t你感觉到史莱姆从你的耳朵里蠕动着。它消失在了裂缝里。\n'
              '\t\t<<world_corruption "soft" 10>>\n'
              '\t<</if>>\n')
    assert src.count(p3_anchor) == 1, 'P3 ear-slime branch anchor not unique'
    src = src.replace(p3_anchor, p3_ins)

    # P4: Lake Ruin Sit - tentacle epilogue Chinese-ised. The BJX guard
    # `$tentacledisable is "f"` becomes $settings.tentaclesEnabled (the 0.5
    # flag; the 0.5 text at this very spot already used it). The vanilla
    # <<set $physicalTransform to 0>> line two blocks above is kept (BJX
    # dropped it inside the dead $slime_tf branch - no runtime difference).
    lake_plinth_set = ('<<set $wraith.timer = -50>>'
                       if '[[Next|Lake Ruin Plinth]]>><<set $wraith.timer = -50>><</link>>'
                       in src else '')
    p4_anchor = ('\t<<if $settings.tentaclesEnabled>>\n'
                 '\t\tThe light fades, and all falls quiet. Yet you feel a '
                 'presence. Something stayed behind.\n'
                 '\t\t<br><br>\n'
                 '\n'
                 '\t\tOver a dozen tentacles curl up the side of the plinth, '
                 'forming a prison around you.\n'
                 '\t\t<br><br>\n'
                 '\n'
                 '\t\t<<link [[Next|Lake Ruin Sit Tentacles]]>>'
                 '<<set $molestationstart to 1>><</link>>\n'
                 '\t\t<br>\n'
                 '\t<<else>>\n'
                 '\n'
                 '\t\t<<link [[Next|Lake Ruin Plinth]]>>' + lake_plinth_set
                 + '<</link>>\n'
                 '\t\t<br>\n'
                 '\t<</if>>\n')
    p4_ins = ('\t<<if $settings.tentaclesEnabled>>\n'
              '\t\t光线消失了，一切都变得安静了。但你感觉到了一个存在。'
              '有东西留了下来。\n'
              '\t\t<br><br>\n'
              '\t\t十几根触手沿着矮柱蜷曲而上，形成了一个囚笼把你围住。\n'
              '\t\t<br><br>\n'
              '\t\t<<link [[继续|Lake Ruin Sit Tentacles]]>>'
              '<<set $molestationstart to 1>><</link>>\n'
              '\t\t<br>\n'
              '\t<<else>>\n'
              '\t\t<<link [[继续|Lake Ruin Plinth]]>>' + lake_plinth_set
              + '<</link>>\n'
              '\t\t<br>\n'
              '\t<</if>>\n')
    assert src.count(p4_anchor) == 1, 'P4 tentacle epilogue anchor not unique'
    src = src.replace(p4_anchor, p4_ins)

    # P5: Lake Ruin Plinth - slime variant of the blood-moon tentacle grab,
    # inserted as an elseif before the vanilla grab branch. Translated
    # guard: $tentacledisable is "f" -> $settings.tentaclesEnabled;
    # $slime gt 0 -> ($slime ?? 0) gt 0.
    p5_anchor = ('\t<<investigateicon>><<link [[Search|Lake Ruin Deep Offer]]>>'
                 '<</link>><<loxygen>>\n'
                 '\t<br>\n'
                 '<<elseif $settings.tentaclesEnabled and _bmoon and '
                 '$phase isnot 1 and $museumAntiques.antiques.'
                 'antiqueivorynecklace isnot "notFound">>\n')
    p5_ins = ('\t<<investigateicon>><<link [[Search|Lake Ruin Deep Offer]]>>'
              '<</link>><<loxygen>>\n'
              '\t<br>\n'
              '/* BJX pack: 北极星模组 (slime-TF variant of the blood-moon\n'
              '   tentacle grab - they cannot hold a slime) */\n'
              '<<elseif $settings.tentaclesEnabled and _bmoon and '
              '$phase isnot 1 and $museumAntiques.antiques.'
              'antiqueivorynecklace isnot "notFound" and ($slime ?? 0) '
              'gt 0>>\n'
              '\t<br><br>\n'
              '\t你感觉水在你周围搅动，当你环顾四周时，水搅动得越来越强烈了。'
              '在红色月光的微弱照射下，触手从黑暗中伸出。'
              '<span class="red">其中两条试图缠住你的脚踝，但无法抓住。</span>\n'
              '\t<br><br>\n'
              '\n'
              '\t<<link [[触碰|Lake Ruin Sit]]>><</link>>\n'
              '\t<br>\n'
              '<<elseif $settings.tentaclesEnabled and _bmoon and '
              '$phase isnot 1 and $museumAntiques.antiques.'
              'antiqueivorynecklace isnot "notFound">>\n')
    assert src.count(p5_anchor) == 1, 'P5 plinth slime elseif anchor not unique'
    src = src.replace(p5_anchor, p5_ins)

    # P6: Lake Ruin Plinth - inside the silent _bmoon branch, the plinth
    # pulls a slime-transformed PC in. Indentation kept verbatim from BJX
    # (4 spaces + tab for the inner lines).
    p6_anchor = ('<<elseif _bmoon>>\n'
                 '\tThe water around you is eerily silent, and deathly '
                 'still, the room barely illuminated in the red glow.\n'
                 '\t<br><br>\n'
                 '<<else>>\n')
    p6_ins = ('<<elseif _bmoon>>\n'
              '\tThe water around you is eerily silent, and deathly '
              'still, the room barely illuminated in the red glow.\n'
              '\t<br><br>\n'
              '\t/* BJX pack: 北极星模组 (the plinth pulls a slime in) */\n'
              '\t<<if ($slime ?? 0) gt 0>>\n'
              '    \t<span class="green">你感觉底座对你有股奇怪的吸引力……'
              '</span>\n'
              '    \t<br><br>\n'
              '    \t<<link [[触碰|Lake Ruin Sit]]>><</link>>\n'
              '    \t<br><br>\n'
              '\t<</if>>\n'
              '<<else>>\n')
    assert src.count(p6_anchor) == 1, 'P6 silent bmoon anchor not unique'
    src = src.replace(p6_anchor, p6_ins)

    # P7: Lake Ruin Deep Consentacles Leave - a slime slips the ankle
    # snare even without a swimming success. Keeps 0.5's <<clotheson>>.
    p7_anchor = ('<<if $swimmingSuccess>>\n'
                 '\t<span class="green">You free your ankles and make your '
                 'escape.</span> The tentacles grasp at you with increasing '
                 'desperation. You narrowly avoid one shooting for your '
                 'leg, and swim through the doorway. The tentacles protrude '
                 'from the room and grope around the walls, but they refuse '
                 'to chase you any further. They slink away.\n'
                 '\t<<clotheson>>\n'
                 '\t<<link [[Continue|Lake Ruin Deep]]>><</link>>'
                 '<<loxygen>>\n')
    p7_ins = ('/* BJX pack: 北极星模组 (a slime slips the ankle snare) */\n'
              '<<if $swimmingSuccess or ($slime ?? 0) gt 0>>\n'
              '\t<span class="green"><<if ($slime ?? 0) gt 0>>'
              '它们无法牢牢抓住你的四肢。<</if>>你解放出脚踝，然后逃跑。'
              '</span>触手越来越绝望，它们疯狂的想要抓捕你。你勉强躲过了，'
              '然后游过了门口。触手从房间里伸出来，在墙上摸索，'
              '但它们没有再追你了，不甘地缩了回去。\n'
              '\t<<clotheson>>\n'
              '\t<<link [[继续|Lake Ruin Deep]]>><</link>>'
              '<<loxygen>>\n')
    assert src.count(p7_anchor) == 1, 'P7 consentacles leave anchor not unique'
    src = src.replace(p7_anchor, p7_ins)

    # P8: Lake Pots - the ivory-box lock link tags the free-hands flag the
    # BJX skill-difficulties hook consumes ($options.bjx_stealhand). Keeps
    # 0.5's lockicon "unlock" (BJX's templeicon "chastity release" is the
    # 0.4.3.3 icon, vanilla evolution).
    p8_anchor = ('\t\t<<set $skulduggerydifficulty to 300>>\n'
                 '\t\t<<lockicon "unlock">><<link [[Open it|Lake Ruin Box]]>>'
                 '<<wateraction>><</link>><<skulduggerydifficulty>>'
                 '<<loxygen>>\n')
    p8_ins = ('\t\t<<set $skulduggerydifficulty to 300>>\n'
              '\t\t/* BJX pack: 北极星模组 (tag the free-hands flag for the\n'
              '\t\t   BJX skill-difficulties steal bonus) */\n'
              '\t\t<<lockicon "unlock">><<link [[打开|Lake Ruin Box]]>>'
              '<<wateraction>><<set $skulduggeryhands to 1>><</link>>'
              '<<skulduggerydifficulty>><<loxygen>>\n')
    assert src.count(p8_anchor) == 1, 'P8 pots box link anchor not unique'
    src = src.replace(p8_anchor, p8_ins)

    out = ('/* BJX pack: vanilla 0.5 loc-lake underwater.twee + 8 BJX '
           'insertions\n'
           '   (slime-TF reversion line: door / sit / plinth x2 / '
           'consentacles leave / pots). */\n' + src)
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-lake-underwater-hooks.twee'), out)
    verify_lake_underwater_hooks(out, vanilla, vanilla_passages)


def verify_lake_underwater_hooks(out, vanilla, vanilla_passages):
    # passage names identical to 0.5, same order (same-name override).
    out_passages = re.findall(r'^:: (.+)$', out, re.M)
    assert out_passages == vanilla_passages, \
        'hooks passage list diverges from 0.5'

    # superset sanity + untouched-vanilla markers preserved.
    assert len(out) > len(vanilla), 'hooks output not longer than 0.5 text'
    assert len(out.splitlines()) > len(vanilla.splitlines())
    for marker, expected in [
        ('Weather.isFrozen("lake")', vanilla.count('Weather.isFrozen("lake")')),
        ('npcCanHunt("Ivory Wraith")',
         vanilla.count('npcCanHunt("Ivory Wraith")')),
        ('<<plinthroom>>', vanilla.count('<<plinthroom>>')),
        ('numberOfEarSlime(true) gte 2',
         vanilla.count('numberOfEarSlime(true) gte 2')),
        ('<<clotheson>>', vanilla.count('<<clotheson>>')),
        ('<<wearProp "key" "bronze">>',
         vanilla.count('<<wearProp "key" "bronze">>')),
        (':: Lake Ruin Deep NonConsentacles Banish', 1),
        ('<<set $lakeRuin.key to 2>>', 1),
        ('<<lockicon "unlock">>', vanilla.count('<<lockicon "unlock">>')),
        ('<<lakeicon "plinth">>', vanilla.count('<<lakeicon "plinth">>')),
        ('<<set $physicalTransform to 0>>', 1),
        ('<<set $earSlime.corruption to 0>>', 1),
        ('<<if $player.sex is "f" and ["mixed", "impregnation"].includes('
         '$earSlime.focus) and $player.ballsExist>>', 1),
    ]:
        got = out.count(marker)
        assert got == expected, \
            'vanilla marker %r: expected %d, got %d' % (marker, expected, got)

    # per-patch key markers exist with the right counts.
    for marker, expected in [
        ('你听到古老齿轮的运转声', 1),                       # P1
        ('一条象牙项链被放在基座顶部', 1),                   # P1
        ('[[继续|Slime Reversion]]', 1),                     # P2
        ('与此同时，同样的核心越来越大', 1),                 # P2
        ('<<elseif !(!$player.vaginaExist and playerIsPregnant())>>', 1),  # P2
        ('你感觉到史莱姆从你的耳朵里蠕动着。它们消失在了裂缝里', 1),      # P3
        ('你感觉到史莱姆从你的耳朵里蠕动着。它消失在了裂缝里', 1),        # P3
        ('十几根触手沿着矮柱蜷曲而上', 1),                   # P4
        ('[[继续|Lake Ruin Sit Tentacles]]', 1),             # P4
        ('[[触碰|Lake Ruin Sit]]', 2),                       # P5 + P6
        ('其中两条试图缠住你的脚踝，但无法抓住', 1),         # P5
        ('你感觉底座对你有股奇怪的吸引力', 1),               # P6
        ('它们无法牢牢抓住你的四肢', 1),                     # P7
        ('<<if $swimmingSuccess or ($slime ?? 0) gt 0>>', 1),  # P7
        ('[[继续|Lake Ruin Deep]]', 1),                      # P7
        ('[[打开|Lake Ruin Box]]', 1),                       # P8
        ('<<set $skulduggeryhands to 1>>', 1),               # P8
    ]:
        got = out.count(marker)
        assert got == expected, \
            'patch marker %r: expected %d, got %d' % (marker, expected, got)

    # variable translation bookkeeping.
    assert out.count('$tentacledisable') == 0
    assert out.count('($slime ?? 0) gt 0') == 5
    assert out.count('$settings.tentaclesEnabled') == 5  # 4 vanilla + P5
    assert out.count('Lake Ruin Box]]') == vanilla.count('Lake Ruin Box]]')

    # <<if>> / <</if>> delta stays balanced (+2 each: P6 block + the
    # P7 inline if; P2 only relabels the chain head if->elseif).
    d_if = (len(re.findall(r'<<if\b', out))
            - len(re.findall(r'<<if\b', vanilla)))
    d_end = out.count('<</if>>') - vanilla.count('<</if>>')
    assert (d_if, d_end) == (2, 2), 'if/end delta %r' % ((d_if, d_end),)

    print('bjx-lake-underwater-hooks.twee: 8 patches applied, %d lines '
          '(0.5 vanilla: %d lines)' % (len(out.splitlines()),
                                       len(vanilla.splitlines())))


# --------------------------------------------------- 3h: sewers-old group
"""sewers-old group generators (BJX 0.4.3.3 -> DoL 0.5.10.12 bjx-pack),
batch 3h. Ported from the verified standalone genparts/gen_old_sewers.py.

Events file bjx-sewers-old-events.twee - 7 passages from BJX
old-sewers-events-bjx.twee (sewers slime line: Sewers Slime Again /
Slime Transformation Redux x3 / Slime Transformation 1-4). Translations:
$skinColor.natural -> Skin.color.natural (the pack-wide 2z sweep would
catch it, but it is done here explicitly), BJX-only reads ?? 0 guarded,
<<earnFeat "Slime">> -> "Ear Slime Amalgam" (0.5 feats.js has no "Slime"
key; the amalgam feat text "You became one with your best friend" matches).

Hooks files (0.5 vanilla full text + BJX patches, same-name override):
  bjx-sewers-old-hooks.twee    old-sewers-events.twee + 6 patches
    E1/E2  Shackle pick-lock links x2 (尝试撬锁 + $skulduggeryhands)
    E3     Shackle Struggle opening -> BJX Chinese (($onemoreslime ?? 0))
    E4     Sewers Slime 4: throbbing cock -> throbbing boycock
    E5     Sewers Slime 3 ending Next -> slime-line fork (Sewers Slime Again)
    E6     Sewers Slime 5 ending -> double ear-slime takeover fork
  bjx-sewers-main-hooks.twee   loc-sewers/main.twee + 4 patches
    M1     Drain Water Passout: ear-slime branch before isPregnancyEnding
    M2     Drain Ladder: historytrait block -> BJX Chinese version
    M3/M4  Drain Slime capture + Watch climax: ear-slime resonance fork;
           both target the payload-carrying Next|Drain Struggle links
           (the bare <span id="next"> variant at 0.5 main.twee:816 stays)
  bjx-sewers-widgets-hooks.twee  loc-sewers/widgets.twee + 1 patch
    W1     Morgan shackle pick-lock link rewritten like E1
"""


def find_line(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    raise AssertionError('line not found: ' + needle[:60])


def translate_block(block):
    """0.4.3.3 -> 0.5 variable translations applied to a BJX block."""
    out = []
    for l in block:
        l = l.replace('$slimedisable is "f"', '$settings.slimesEnabled')
        l = l.replace('$ghost is 0 and $mushroom is 0',
                      '($ghost ?? 0) is 0 and ($mushroom ?? 0) is 0')
        l = l.replace('$slime gt 0 and $slime isnot 1',
                      '($slime ?? 0) gt 0 and ($slime ?? 0) isnot 1')
        l = l.replace('<<if $onemoreslime is 1>>',
                      '<<if ($onemoreslime ?? 0) is 1>>')
        out.append(l)
    return out


def patch_pick_lock(lines):
    """Rewrite every `Pick the lock|Sewers Shackle Pick` link line to the
    BJX form (尝试撬锁 + $skulduggeryhands). Handles both the plain and
    the lockicon-prefixed variants. Returns (lines, count)."""
    n = 0
    for i, l in enumerate(lines):
        if 'Pick the lock|Sewers Shackle Pick' in l:
            assert '<<link' in l and '<</link>>' in l
            l = l.replace('[[Pick the lock|Sewers Shackle Pick]]',
                          '[[尝试撬锁|Sewers Shackle Pick]]')
            l = l.replace('<</link>><<skulduggerydifficulty>>',
                          '<</link>><<set $skulduggeryhands to 1>>'
                          '<<skulduggerydifficulty>>')
            lines[i] = l
            n += 1
    return lines, n


SEWERS_HDR = ('/* BJX pack: vanilla 0.5 {src} + BJX sewers-old '
              'insertions. */\n')


def gen_sewers_old_events():
    src = read(os.path.join(BJX, 'overworld-underground', 'loc-sewers',
                            'old-sewers-events-bjx.twee'))
    pairs = [
        ('<<set $skinColor.natural to "slimy">>',
         '<<set Skin.color.natural to "slimy">>'),
        ('<<if $slime isnot 1>> ', '<<if ($slime ?? 0) isnot 1>> '),
        ('<<if $slime isnot 1>>', '<<if ($slime ?? 0) isnot 1>>'),
        ('<<if $slime is 1>>', '<<if ($slime ?? 0) is 1>>'),
        ('$ghost is 0 and $mushroom is 0',
         '($ghost ?? 0) is 0 and ($mushroom ?? 0) is 0'),
        ('<<if $slime_tf is 1>>', '<<if ($slime_tf ?? 0) is 1>>'),
        ('<<if $onemoreslime is 1>>', '<<if ($onemoreslime ?? 0) is 1>>'),
        ('<<earnFeat "Slime">', '<<earnFeat "Ear Slime Amalgam">'),
    ]
    for old, new in pairs:
        n = src.count(old)
        assert n >= 1, 'events cleanup source missing: ' + old
        src = src.replace(old, new)
    assert '$skinColor' not in src
    assert '<<earnFeat "Ear Slime Amalgam">>' in src
    out = ('/* BJX pack: BJX old-sewers-events-bjx.twee merged (7 passages)\n'
           '   with 0.5 translations. */\n' + src)
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-sewers-old-events.twee'), out)
    print('bjx-sewers-old-events.twee: 7 passages (sewers slime line), '
          '%d lines' % len(out.splitlines()))


def gen_sewers_old_hooks():
    src = read(os.path.join(REF, 'overworld-underground', 'loc-sewers',
                            'old-sewers-events.twee'))
    bjx = read(os.path.join(BJX, 'overworld-underground', 'loc-sewers',
                            'old-sewers-events.twee'))
    lines = src.split('\n')

    # E1 + E2: the two pick-lock links (icon variant included by the
    # plain substring match on the link target).
    lines, n_pick = patch_pick_lock(lines)
    assert n_pick == 2, f'expected 2 pick-lock links, got {n_pick}'

    # E3: shackle-struggle opening paragraph -> BJX Chinese block.
    # BJX block sits between the 北极星 markers around the (unique)
    # onemoreslime if; extract by locating the BJX `你试图挣脱` line.
    bjx_lines = bjx.split('\n')
    bi = find_line(bjx_lines, '你试图挣脱')
    e3_bjx = bjx_lines[bi:find_line(bjx_lines, '/* 北极星 */', bi)]
    e3_bjx = translate_block(e3_bjx)
    assert any('($onemoreslime ?? 0) is 1' in l for l in e3_bjx)
    i = find_line(lines, 'You try to pull yourself free')
    assert lines[i + 1].strip() == '' or lines[i + 1].startswith('<')
    lines[i:i + 1] = e3_bjx

    # E4: BJX wording tweak.
    i = find_line(lines, 'throbbing cock')
    lines[i] = lines[i].replace('throbbing cock', 'throbbing boycock')

    # E5: Sewers Slime 3 ending Next link -> slime-line fork.
    bi = find_line(bjx_lines, '<<if $slime gt 0 and $slime isnot 1>>')
    e5_bjx = bjx_lines[bi:find_line(bjx_lines, '/* 北极星 */', bi)]
    e5_bjx = translate_block(e5_bjx)
    assert 'Sewers Slime Again' in ''.join(e5_bjx)
    i = find_line(lines, '<<link [[Next|Sewers Slime 4]]>><</link>>')
    lines[i:i + 1] = ['/* BJX pack: slime-line fork */'] + e5_bjx

    # E6: Sewers Slime 5 ending -> double ear-slime takeover fork.
    bi = find_line(bjx_lines, '<<if $parasite.left_ear.name is "slime" '
                              'and $parasite.right_ear.name is "slime" '
                              'and $ghost is 0 and $mushroom is 0>>')
    e6_bjx = bjx_lines[bi:find_line(bjx_lines, '/* 北极星 */', bi)]
    e6_bjx = translate_block(e6_bjx)
    joined = ''.join(e6_bjx)
    assert 'Slime Transformation 1' in joined and 'Slime Transformation 3' in joined
    i = find_line(lines, 'So disoriented by this point')
    assert lines[i + 1].strip() == '<br><br>'
    assert lines[i + 2].strip() == '<<destinationsewersrandom>>'
    lines[i:i + 3] = ['/* BJX pack: double ear-slime takeover fork */'] + e6_bjx

    out = '\n'.join(lines)
    out = SEWERS_HDR.format(src='loc-sewers/old-sewers-events.twee') + out
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-sewers-old-hooks.twee'), out)
    verify_sewers_old_hooks(out, src)
    print('bjx-sewers-old-hooks.twee: 6 patches (E1-E6), %d lines'
          % len(out.splitlines()))


def verify_sewers_old_hooks(out, vanilla):
    assert out.count('尝试撬锁') == 2
    assert out.count('<<set $skulduggeryhands to 1>>') == 2
    assert 'Pick the lock|Sewers Shackle Pick' not in out
    assert out.count('Sewers Slime Again') == 1
    assert out.count('throbbing boycock') == 1
    for mark in ('顺其自然', 'Slime Transformation 1', 'Slime Transformation 3'):
        assert out.count(mark) >= 1, mark
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert len(out) > len(vanilla)
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')


def gen_sewers_main_hooks():
    src = read(os.path.join(REF, 'overworld-underground', 'loc-sewers',
                            'main.twee'))
    bjx = read(os.path.join(BJX, 'overworld-underground', 'loc-sewers',
                            'main.twee'))
    lines = src.split('\n')
    bjx_lines = bjx.split('\n')

    # M1: Drain Water Passout - ear-slime branch before isPregnancyEnding.
    bi = find_line(bjx_lines, '你失去知觉的身体被水流带走')
    bi -= 1  # the <<if $parasite...>> line
    assert '$parasite.left_ear.name is "slime"' in bjx_lines[bi]
    ei = find_line(bjx_lines, '<<elseif isPlayerNonparasitePregnancyEnding()>>', bi)
    m1 = translate_block(bjx_lines[bi:ei])
    assert '[[继续|Sewers Slime]]' in ''.join(m1)
    i = find_line(lines, ':: Drain Water Passout')
    j = find_line(lines, '<<if isPregnancyEnding()>>', i)
    assert j - i <= 4
    lines[j:j + 1] = ['/* BJX pack: double ear-slime takeover */'] + m1 + \
        ['<<elseif isPregnancyEnding()>>']

    # M2: Drain Ladder - historytrait block -> BJX Chinese version.
    bi = find_line(bjx_lines, '你听说过雨水渠下面的旧下水道')
    bi -= 1  # <<if $historytrait gte 1>>
    assert '$historytrait' in bjx_lines[bi]
    ei = find_line(bjx_lines, '/* 北极星 */', bi)
    m2 = translate_block(bjx_lines[bi:ei])
    assert '$settings.slimesEnabled' in ''.join(m2)
    i = find_line(lines, ':: Drain Ladder')
    j = find_line(lines, '<<if $historytrait gte 1>>', i)
    k = find_line(lines, '<</if>>', j)
    assert k - j <= 8
    lines[j:k + 1] = m2

    # M3/M4: Drain Slime capture + Drain Slime Watch climax.
    for head in ('大型史莱姆的行动似乎让你耳朵里的史莱姆也变得疯狂起来',
                 '在你的反复高潮中，你耳朵里的史莱姆也变得疯狂起来'):
        bi = find_line(bjx_lines, head)
        bi -= 1  # <<if $parasite...>> line
        assert '$parasite.left_ear.name is "slime"' in bjx_lines[bi]
        ei = find_line(bjx_lines, '/* 北极星 */', bi)
        block = translate_block(bjx_lines[bi:ei])
        joined = ''.join(block)
        assert '[[顺其自然|Slime Transformation 1]]' in joined
        assert '[[抵抗|Drain Struggle]]' in joined
        # locate the matching 0.5 Next link (payload form: the plain
        # `<span id="next">` variant at main.twee:816 stays untouched)
        i = find_line(lines, '<<link [[Next|Drain Struggle]]>>'
                            '<<set $phase to 1>>')
        lines[i:i + 1] = ['/* BJX pack: double ear-slime resonance */'] + block

    out = '\n'.join(lines)
    out = SEWERS_HDR.format(src='loc-sewers/main.twee') + out
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-sewers-main-hooks.twee'), out)
    verify_sewers_main_hooks(out, src)
    print('bjx-sewers-main-hooks.twee: 4 patches (M1-M4), %d lines'
          % len(out.splitlines()))


def verify_sewers_main_hooks(out, vanilla):
    # the payload-carrying Next links are all rewritten; the bare
    # `<span id="next">` variant must survive untouched
    assert out.count('<<link [[Next|Drain Struggle]]>><<set $phase to 1>>') == 0
    assert out.count('<<link [[Next|Drain Struggle]]>><</link>>') == 1
    assert out.count('[[抵抗|Drain Struggle]]') == 2
    assert out.count('[[顺其自然|Slime Transformation 1]]') == 2
    assert out.count('[[继续|Sewers Slime]]') == 1
    assert out.count('<<elseif isPregnancyEnding()>>') == 1
    assert out.count('$settings.slimesEnabled') == \
        vanilla.count('$settings.slimesEnabled') + 2
    assert 'isPlayerNonparasitePregnancyEnding' not in out
    assert 'pregnancyWatersBrokenPassout' not in out
    # M1 (Drain Water Passout) never had the ghost/mushroom guard in
    # BJX; only M3/M4 carry it -> 2 occurrences (one per block)
    assert out.count('($ghost ?? 0) is 0 and ($mushroom ?? 0) is 0') == 2
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert len(out) > len(vanilla)
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')


def gen_sewers_widgets_hooks():
    src = read(os.path.join(REF, 'overworld-underground', 'loc-sewers',
                            'widgets.twee'))
    lines = src.split('\n')
    lines, n = patch_pick_lock(lines)
    assert n == 1, f'expected 1 pick-lock link in widgets, got {n}'
    out = '\n'.join(lines)
    out = SEWERS_HDR.format(src='loc-sewers/widgets.twee') + out
    assert out.count('尝试撬锁') == 1
    assert out.count('<<set $skulduggeryhands to 1>>') == 1
    assert 'Pick the lock|Sewers Shackle Pick' not in out
    vps = [l[3:] for l in src.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops
    if not out.endswith('\n'):
        out += '\n'
    write(os.path.join(TWE, 'bjx-sewers-widgets-hooks.twee'), out)
    print('bjx-sewers-widgets-hooks.twee: 1 patch (W1), %d lines'
          % len(out.splitlines()))


def sewers_old_cross_check():
    """The 7 new events passages must not collide with any 0.5 sewers
    passage (same-name override would shadow the wrong text)."""
    ev = read(os.path.join(TWE, 'bjx-sewers-old-events.twee'))
    new_ps = [l[3:].split('[')[0].strip()
              for l in ev.split('\n') if l.startswith(':: ')]
    assert len(new_ps) == 7, new_ps
    known = set()
    for f in ('old-sewers-events.twee', 'old-sewers.twee', 'main.twee',
              'widgets.twee', 'morgan.twee'):
        p = os.path.join(REF, 'overworld-underground', 'loc-sewers', f)
        for l in read(p).split('\n'):
            if l.startswith(':: '):
                known.add(l[3:].split('[')[0].strip())
    clash = [p for p in new_ps if p in known]
    assert not clash, 'passage name clash with 0.5: %s' % clash
    print('sewers-old cross-check OK: 7 new passages, no collisions')


def read(path):
    return open(path, encoding='utf-8', newline='').read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # LF line endings, like the ant-island sources
    open(path, 'w', encoding='utf-8', newline='\n').write(text)


def merge(files, out_name, cleanup=None):
    """Concatenate BJX source twee files into one pack twee."""
    parts = []
    for rel in files:
        txt = read(os.path.join(BJX, rel.replace('/', os.sep)))
        if cleanup:
            for pat, sub in cleanup:
                txt = txt.replace(pat, sub)
        if not txt.endswith('\n'):
            txt += '\n'
        parts.append(txt)
    write(os.path.join(TWE, out_name), '\n'.join(parts))
    n = sum(1 for p in parts for _ in re.finditer(r'^::', p, re.M))
    print(f'{out_name}: {len(parts)} files, {n} passages')
    return out_name


def main():
    # Fresh twee dir (keep inject_early.js).
    # NOTE: the sandbox blocks bulk rmtree (>50 files) on generated output, so
    # we rebuild in place and prune afterwards only the files this run did not
    # rewrite (stale outputs of a removed generator). The run start is stamped
    # so the mtime check never mistakes a freshly written file for stale.
    build_start = time.time()
    os.makedirs(TWE, exist_ok=True)

    # 1. carry over ant-island files (already ported & verified).
    #    Museum trio is excluded: it is regenerated by make_museum_mod.py
    #    (19 antiques incl. bunker/bog/scroll/mushroom) directly into TWE.
    MUSEUM_FILES = {'bjx-museum-antiques.twee', 'bjx-museum-widgets.twee', 'bjx-museum-talk.twee'}
    ant_files = sorted(f for f in os.listdir(os.path.join(ANT, 'tweeFileList'))
                       if f not in MUSEUM_FILES)
    for f in ant_files:
        shutil.copyfile(os.path.join(ANT, 'tweeFileList', f), os.path.join(TWE, f))
    print('ant-island files copied:', len(ant_files))

    # 1b. regenerate museum trio (19 antiques) into TWE
    import subprocess
    import sys
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                 'make_museum_mod.py')], check=True)

    # 2. new modules, batch 1
    merge(['overworld-town/loc-bunker-bjx/main.twee',
           'overworld-town/loc-bunker-bjx/events.twee',
           'overworld-town/loc-bunker-bjx/widgets.twee'],
          'bjx-bunker.twee')

    merge(['overworld-town/special-taylor-bjx/main.twee',
           'overworld-town/special-taylor-bjx/widgets.twee'],
          'bjx-taylor.twee')

    merge(['overworld-town/special-casey-bjx/main.twee'],
          'bjx-casey.twee')

    # hive: drop the undefined <<mathsdifficulty 250 700>> macro call
    # (undefined in BOTH 0.4.3.3 and 0.5.10.12 - a BJX authoring bug)
    merge(['overworld-forest/loc-hive-bjx/main.twee',
           'overworld-forest/loc-hive-bjx/events.twee',
           'overworld-forest/loc-hive-bjx/widgets.twee'],
          'bjx-hive.twee',
          cleanup=[('<<mathsdifficulty 250 700>>', '')])

    # compat: vanilla npcincr re-defined with Taylor/Casey whitelisted
    gen_compat()

    # 2b. new modules, batch 2 (mansion + lakehouse + transformations +
    #     town-hall home chain)
    merge(['overworld-forest/loc-mansion-bjx/main.twee',
           'overworld-forest/loc-mansion-bjx/events.twee',
           'overworld-forest/loc-mansion-bjx/widgets.twee'],
          'bjx-mansion.twee')

    merge(['base-clothing/wardrobes-bjx.twee'],
          'bjx-wardrobes.twee')

    # lakehouse: $weather was removed in 0.5.10.12 (use the Weather API), and
    # isPlayerNonparasitePregnancyEnding/pregnancyWatersBrokenPassout are gone
    # (link straight to the passout passage).
    merge(['overworld-forest/loc-lakehouse-bjx/lakehouse.twee',
           'overworld-forest/loc-lakehouse-bjx/widgets.twee',
           'overworld-forest/loc-lakehouse-bjx/upgrades.twee',
           'overworld-forest/loc-lakehouse-bjx/assault.twee'],
          'bjx-lakehouse.twee',
          cleanup=[
              ('$weather is "rain"', 'Weather.precipitation is "rain"'),
              ('$weather is "snow"', 'Weather.precipitation is "snow"'),
              ('$weather is "overcast"', 'Weather.overcast'),
              ('\t<<if isPlayerNonparasitePregnancyEnding()>>\n'
               '\t\t<<pregnancyWatersBrokenPassout>>\n'
               '\t<<else>>\n'
               '\t\t<<link [[你眼前一黑…->Lake House Passout]]>><</link>>\n'
               '\t<</if>>',
               '\t<<link [[你眼前一黑…->Lake House Passout]]>><</link>>'),
          ])

    # transformations + mushroom evolve: <<speakActions>> is undefined in
    # 0.5.10.12, drop the single call.
    merge(['base-combat/actions-tf-bjx.twee',
           'overworld-town/loc-home/mushroomevolve.twee'],
          'bjx-tf-mushroom.twee',
          cleanup=[
              ('            \t<<speakActions>>\n', ''),
          ])

    # town hall home-project chain + Quinn blackmail + office scenes
    merge(['overworld-town/loc-town-hall/main-bjx.twee'],
          'bjx-townhall.twee')

    gen_compat2()

    # 2c. new modules, batch 3a (forest group)
    gen_beast_generation()
    gen_compat3()
    gen_forest_events()
    gen_forest_hooks()

    # 2d. new modules, batch 3b (moor group)
    gen_moor_events()
    gen_moor_hooks()

    # 2e. new modules, batch 3c (farm group)
    gen_farm_events()
    gen_farm_hooks()

    # 2f. new modules, batch 3d (tentacle-world group)
    gen_tentacle_events()
    gen_tentacle_hooks()

    # 2g. new modules, batch 3e (home group)
    gen_home_events()
    gen_home_hooks()

    # 2h. new modules, batch 3f (hospital group)
    gen_hospital_events()
    gen_hospital_hooks()

    # 2i. new modules, batch 3g (churchyard / bus-station / landfill groups)
    gen_churchyard_events()
    gen_churchyard_hooks()
    gen_busstation_events()
    gen_busstation_hooks()
    gen_landfill_events()
    gen_landfill_hooks()
    gen_landfill_widgets()

    # 2j. new modules, batch 3h (lake-underwater / sewers-old groups)
    gen_lake_underwater_events()
    gen_lake_underwater_hooks()
    gen_sewers_old_events()
    gen_sewers_old_hooks()
    gen_sewers_main_hooks()
    gen_sewers_widgets_hooks()
    sewers_old_cross_check()

    # 2k. new modules, batch 3i (temple / maths / special-NPC / bird /
    #     street / deepseadive groups). Unlike 2j these stay as standalone
    #     genparts scripts (their read/write/find_line/main helpers would
    #     collide if inlined), so run each one in a subprocess - each
    #     regenerates its _verify_* output dir idempotently, exactly as the
    #     museum trio does via make_museum_mod.py - then copy every .twee
    #     into TWE. All outputs are LF, matching write().
    GENPARTS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            'genparts')
    for gen in ('gen_temple.py', 'gen_maths.py', 'gen_special_npcs.py',
                'gen_bird.py', 'gen_street.py', 'gen_ghost_shops.py',
                'gen_ghost_civic.py', 'gen_fly.py', 'gen_deepseadive.py',
                'gen_monstertower.py', 'gen_actions_tail.py',
                'gen_options_bjx.py', 'gen_tending.py', 'gen_tf_animals.py',
                'gen_cheats_bjx.py', 'gen_olive_hook.py', 'gen_energy.py',
                'gen_swarm.py', 'gen_chimera.py', 'gen_stolen_books.py',
                'gen_market_sell.py', 'gen_bjx_switches.py',
                'gen_hunter.py', 'gen_wardrobe_repair.py',
                'gen_wardrobe_sale.py'):
        subprocess.run([sys.executable, os.path.join(GENPARTS, gen)],
                       check=True, cwd=GENPARTS)
    copied_3i = 0
    for vd in ('_verify_temple', '_verify_maths', '_verify_special_npcs',
               '_verify_bird', '_verify_street', '_verify_deepseadive',
               '_verify_monstertower', '_verify_tail', '_verify_ghost_shops',
               '_verify_ghost_civic', '_verify_fly',
               '_verify_options', '_verify_tending', '_verify_tf',
               '_verify_cheats', '_verify_olive', '_verify_energy',
               '_verify_swarm', '_verify_chimera', '_verify_market_sell',
               '_verify_bjx_switches', '_verify_hunter', '_verify_wardrobe_repair',
               '_verify_wardrobe_sale'):
        vd_path = os.path.join(GENPARTS, vd)
        for f in sorted(os.listdir(vd_path)):
            if f.endswith('.twee'):
                shutil.copyfile(os.path.join(vd_path, f),
                                os.path.join(TWE, f))
                copied_3i += 1
    print('batch 3i files copied:', copied_3i)
    # 只做下限保护：以后新增 gens 不应该让总数变少（stale 文件被删会触发）
    assert copied_3i >= 88, f'batch 3i expected >=88 twee files, got {copied_3i}'

    # (the temporary 'BJX Bunker Found' passage was removed in batch 3g: the
    #  bunker discovery now lives in bjx-landfill-hooks.twee's Trash Search
    #  patch - rng 90+ with trash 100 - landing on the real The Bunker Intro)

    # 2z. cross-cutting variable translation: 0.5 dropped the $skinColor
    #     story variable (old saves migrate it into $player.skin.color and
    #     unset it). Read/write sites must go through the window.Skin
    #     proxy instead; the backup slot becomes a plain story variable.
    #     Order matters: naturalreset before natural.
    translated = 0
    for fn in sorted(os.listdir(TWE)):
        if not fn.endswith('.twee'):
            continue
        p = os.path.join(TWE, fn)
        txt = open(p, encoding='utf-8', newline='').read()
        new = (txt.replace('$skinColor.naturalreset', '$bjx_skin_naturalreset')
                  .replace('$skinColor.natural', 'Skin.color.natural'))
        if new != txt:
            open(p, 'w', encoding='utf-8', newline='\n').write(new)
            translated += 1
    leftovers = 0
    for fn in os.listdir(TWE):
        if fn.endswith('.twee'):
            leftovers += open(os.path.join(TWE, fn), encoding='utf-8').read().count('$skinColor')
    assert leftovers == 0, f'$skinColor remnants: {leftovers}'
    print(f'skinColor translation: {translated} files patched')

    # 3. inject_early.js carried over (first run copy, later runs keep edits)
    inj_dir = os.path.join(PACK, 'scriptFileList_inject_early')
    inj = os.path.join(inj_dir, 'inject_early.js')
    if not os.path.exists(inj):
        os.makedirs(inj_dir, exist_ok=True)
        shutil.copyfile(os.path.join(ANT, 'scriptFileList_inject_early', 'inject_early.js'), inj)
        print('inject_early.js copied from ant-island (will need manual extension)')

    # 3b. third-party zero-dependency script: AveryOrphanageNote main.js.
    #     Runtime DOM hook that blocks Avery's forced adoption when a note is
    #     left in Bailey's Office. Pure JS, no plugin deps; patched against
    #     window.averyMansionScore (named-npc.js exposes it globally). Extracted
    #     from mod/AveryOrphanageNote.zip each run (idempotent).
    sc_dir = os.path.join(PACK, 'scriptFileList')
    with zipfile.ZipFile(os.path.join(ROOT, 'mod', 'AveryOrphanageNote.zip')) as _z:
        _avery_js = _z.read('main.js').decode('utf-8')
    write(os.path.join(sc_dir, 'avery_orphanage_note.js'), _avery_js)
    print('avery_orphanage_note.js extracted from AveryOrphanageNote.zip')

    # 3c. statistics 整页覆盖必须在 prune 之前生成。
    #     原来排在 prune 之后（#4 boot.json 段），导致每轮都被判 stale 剪掉再重建，
    #     日志里固定出现 `stale twee pruned: 1 ['bjx-statistics.twee']`（2026-10-23 修）。
    gen_statistics()

    # 4. prune stale outputs: any .twee not rewritten by this run is left over
    #    from a generator that no longer exists. mtime is a reliable marker
    #    because every generator rewrites its file (identical content included).
    stale = []
    for fn in sorted(os.listdir(TWE)):
        fp = os.path.join(TWE, fn)
        if os.path.isfile(fp) and os.path.getmtime(fp) < build_start - 2:
            stale.append(fn)
            os.remove(fp)
    print('stale twee pruned:', len(stale), stale)

    # 4. boot.json（gen_statistics 已在 3c 生成）
    twees = ['tweeFileList/' + f for f in sorted(os.listdir(TWE))]
    boot = {
        "name": "bjx-pack",
        "version": VERSION,
        "scriptFileList_earlyload": [],
        "scriptFileList_inject_early": ["scriptFileList_inject_early/inject_early.js"],
        "scriptFileList_preload": [],
        "scriptFileList": ["scriptFileList/avery_orphanage_note.js"],
        "additionFile": [],
        "styleFileList": ["style/bjx-combat-xray-left.css"],
        "tweeFileList": twees,
        # NOTE: no imgFileList. The animal TF art comes from the official
        # 星扩原版图片包 companion mod the user installs alongside bjx-pack;
        # listing the same paths here made the ImageLoaderHook merge
        # duplicates and stall boot.
        "imgFileList": [],
        "replacePatchList": [],
        "additionBinaryFile": [],
        "addonPlugin": [],
        "dependenceInfo": [{"modName": "ModLoader", "version": ">=1.1.0"}]
    }
    write(os.path.join(PACK, 'boot.json'), json.dumps(boot, ensure_ascii=False, indent=2) + '\n')
    print('boot.json written,', len(twees), 'twee files')

    # 5. sanity: no passage name duplicates inside the pack itself
    names = []
    for f in os.listdir(TWE):
        for m in re.finditer(r'^::\s*(.+)$', read(os.path.join(TWE, f)), re.M):
            name = re.split(r'\s+\[', m.group(1))[0].strip()
            names.append((name, f))
    dupes = {}
    for n, f in names:
        dupes.setdefault(n, set()).add(f)
    bad = {k: v for k, v in dupes.items() if len(v) > 1}
    # 同 pack 内 passage 撞名 = SugarCube 后加载覆盖 = 静默丢内容（§4.4 铁律）。
    # 2026-10-23 代码审查 P2：这里原来是 print 告警，构建照样成功。
    assert not bad, 'duplicate passage names inside pack (%d): %s' % (
        len(bad), '; '.join('%s -> %s' % (k, sorted(v)) for k, v in list(bad.items())[:10]))
    print('no duplicate passage names inside pack:', len(names), 'passages total')

    # 6. 重建代码地图（work/CODE-MAP.md + code-map.json）。
    #    「找东西」是改代码时最大的时间开销，地图必须随产物一起刷新，
    #    否则它自己就变成一份会腐化的手写文档。失败只警告，不影响构建。
    try:
        subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                     'gen_code_map.py')], check=True, cwd=WORK)
    except Exception as e:  # noqa: BLE001
        print('!! gen_code_map.py failed (build still ok): %s' % e)


if __name__ == '__main__':
    main()