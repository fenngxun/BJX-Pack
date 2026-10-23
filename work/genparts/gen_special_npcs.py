# -*- coding: utf-8 -*-
"""special-NPC 组（robin / sydney / whitney）生成器
（BJX 0.4.3.3 -> DoL 0.5.10.12 ModLoader pack）。

独立验证版：输出写到本脚本同目录的 _verify_special_npcs/ 下（不写 TWE，
不改 build_pack.py）。正式接线时由 build_pack.py 以完全相同的文本写入
work/bjx-pack/tweeFileList（hooks 靠 tweeFileList 顺序 + passage 同名
整段覆盖生效，与 gen_old_sewers 同机制）。

产出十四个 twee 文件（4 merge + 10 hooks）：

merge 文件（BJX 新文件直接合并 + 0.5 变量翻译）：
1. bjx-special-robin-events.twee (3 passages)
       :: Robin Raccoon            浣熊变身依偎（$raccoon gte 6 入口在
                                   robin-options 的 R1 patch）
       :: Robin Dragon             龙变身打盹（$dragon gte 6）
       :: Robin BJX TF Widgets [widget]
                                   附带 <<widget "raccoon">> 图标宏（BJX
                                   text.twee:6579 原文，门控改 0.5 的
                                   !$settings.blindStatsEnabled；0.5
                                   tficon 无 raccoon 参数）。<<dragon>>
                                   已由 pack bjx-tentacle-hooks.twee 提供。
   翻译: $robinraccoon/$robindragon 读取点 ?? 0 防御（BJX 独有变量）;
   $transformationParts.raccoon.tail -> ($transformationParts.raccoon?.tail
   ?? "disabled")（inject_early.js ensureBjxTfKeys 只补了 slime/ghost/
   mushroom，raccoon/dragon 键由 BJX variables-modUpdate.twee 负责，
   该组未移植 -> ?. 防御后未变身时安全 false，与 0.5 fox 行的
   isnot "hidden" 判断同思路）; dragon.horns 同理 ?? "hidden"。

2. bjx-special-sydney-events.twee (11 passages, sydney main-bjx.twee)
       Sydney Chastity Remove Again          二次贞操带事件入口
       Sydney Temple Corrupt Again / 2 / Pick Again / Fight Again /
       Fight Again Finish / Search Again     堕落线复刻（0.5 temple.twee
                                             Corrupt 系列的同构变体）
       Sydney Temple Pure Again / Pure Cancel / Pure Again 2 / Again 3
                                             纯洁线复刻（0.4.3.3 粉末检验
                                             仪式，0.5 已重写为问卷评估，
                                             Again 系列独立并存）
   翻译: $NPCName[$NPCNameList.indexOf("Sydney")].xxx -> C.npc.Sydney.xxx
   （alias2.js initCNPC 的 getter/setter 别名，读写均安全）x8;
   !$worn.genitals.origin is "temple" -> isnot "temple"（对齐 0.5
   temple.twee:858 的修正写法，BJX 沿用了 0.4.3.3 的优先级坑写法）;
   $worn.genitals.cn_name_cap -> name_cap（BJX 汉化字段，0.5 原版衣物
   无 cn_name_cap，输出 undefined）。
   purity 显示宏 gspurity/lspurity/gslust/lllove/gglust 0.5 全有
   （base-system/text.js:494-577 statDisplay.create 注册，与 0.4.3.3
   text.twee 同名同语义，侦察结论里"gspurity 无定义"是只搜了 twee
   widget 定义形式的误判，无需替换）。<<sydneySchedule>> 0.5 也有
   （03-JavaScript/named-npc.js:187 DefineMacro）。

3. bjx-special-sydney-temple-events.twee (1 passage, temple-bjx.twee)
       :: Temple Sydney Chastity   趁悉尼睡着偷装贞操带（skulduggerycheck）
   翻译: NPCName -> C.npc.Sydney x4。

4. bjx-special-whitney-events.twee (1 passage, whitney main-bjx.twee)
       :: School Leave Whitney Hurt  龙喷火反击惠特尼（W1 入口）
   无需翻译（<<endevent>> / Oxford Street 0.5 原生）。

hooks 文件（0.5 原版全文 + BJX patch，passage 名单与 0.5 完全一致）：
5.  bjx-robin-widgets-hooks.twee   R1: fox 块后插浣熊依偎/龙打盹两链接
                                    （$raccoon/$dragon gte 6 -> ?? 0）
6.  bjx-robin-lemonade-hooks.twee  R2: Steal the water -> 偷水 +
                                    <<set $skulduggeryhands to 1>>
7.  bjx-robin-halloween-hooks.twee R3: fox TF case 后插 sheep/bee/dragon/
                                    lizard TF 四个 case（BJX 服装值无
                                    产生来源，死分支，无害保留）
8.  bjx-whitney-main-hooks.twee    W1: Throw Whitney off 后插喷火链接
                                       （$dragon gte 6 -> ?? 0）
                                    W2: Refuse -> Disagree（BJX 措辞）
                                    W3: whispers 借内裤句 -> BJX 措辞
                                    W4: Bully Alley Rob Next -> 继续 +
                                       skulduggeryhands
9.  bjx-whitney-halloween-hooks.twee  W5: fox TF 后插 bee/sheep TF 两 case
10. bjx-sydney-main-hooks.twee     S1: demon elseif 后插龙眼 elseif
                                    （(($dragon ?? 0) gte 1 and
                                    ($transformationParts.dragon?.eyes ??
                                    "disabled") isnot "disabled")）
11. bjx-sydney-temple-hooks.twee   S2: Steal -> 偷窃 + skulduggeryhands
                                    S3: Corrupt Sex 结束判定
                                    _combatend and !($finish is 1 and
                                    $loveDrunk) -> BJX 具体条件版
                                    ($enemyhealth lte 0) or ($enemyarousal
                                    gte $enemyarousalmax) or ($finish is 1
                                    and !$loveDrunk)——and 优先级高于 or，
                                    BJX 原文无括号，改写时全部显式加括号
                                    保语义（铁律：or/and 优先级隐患）。
12. bjx-sydney-walk-hooks.twee     S4: worldview 两行 -> templePromised
                                    分支（承诺伴侣则答应 + npcincr Sydney
                                    purity -5）
13. bjx-sydney-widgets-hooks.twee  S5/S6/S7: 三处 $sydneyChastityRemoveIntro
                                    is 1 单分支 -> corruptroom-or-
                                    templePromised 双分支（链接到
                                    Sydney Chastity Remove Again；temple
                                    处 0.5 用 lockicon "unlock"，BJX 的
                                    templeicon "chastity release" 0.5
                                    无此参数，icon 随 0.5）
                                    S8: Pure elseif 后插 CorruptAgain/
                                    PureAgain 两 elseif（<<askicon>> 0.5
                                    无 -> <<socialiseicon "ask">>，与 0.5
                                    相邻行一致）
14. bjx-park-robin-hooks.twee      P1: Steal the milk -> 偷牛奶 +
                                    skulduggeryhands

北极星块全部从 BJX 源按标记行切片提取（零手抄），块内做变量翻译。
W2/W3 为 BJX 无标记的裸替换行，按内容定位替换。

npcincr 白名单：Robin/Whitney/Sydney 均在 0.5 原生 _validNNPCNames
（named-npcs.twee:1228）与 lust 白名单内，无需 compat 扩展。

依赖（0.5 侧均已确认）: <<robinoptions>>/<<sydneyOptions>>、
<<sydneySchedule>>（named-npc.js:187）、<<temple_effects>>、<<monks>>、
<<nnpc_brother>>/<<temple_title>>、<<generateConfessor>>、
<<defileSacredGround>>、<<genitalsruined>>、<<takeHandholdingVirginity>>、
<<skulduggerycheck/use/required/difficulty>>、statusCheck/playerChastity/
currentSkillValue（JS）、$sydneySeen/$templePromised/$temple_rank/
$temple_evaluation/$sydneyChastityRemoveIntro/$daily.sydney.wake|cum|
sydneyCum/$speech_attitude/$player.penisExist|vaginaExist/
$worn.genitals.origin/$vaginalchastityparasite/$enemy* 系/$loveDrunk/
_combatend/$temple_confessor_intro/_sydneyStatus/_sydneyVirgin、
C.npc 别名（alias2.js）、$skulduggeryhands（skulduggerydifficulty 读）。
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '_verify_special_npcs')

TOWN_REF = os.path.join(REF, 'overworld-town')
TOWN_BJX = os.path.join(BJX, 'overworld-town')


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def write(name, text):
    os.makedirs(OUT, exist_ok=True)
    if not text.endswith('\n'):
        text += '\n'
    assert '\r' not in text, 'CRLF leaked into ' + name
    with open(os.path.join(OUT, name), 'w', encoding='utf-8',
              newline='') as f:
        f.write(text)
    print(f'{name}: {len(text.splitlines())} lines written')


def passages(text):
    return [l[3:].split('[')[0].strip()
            for l in text.split('\n') if l.startswith(':: ')]


def find_line(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    raise AssertionError('line not found: ' + needle[:70])


def bjx_block(lines, start_needle, end_needle='/* 北极星 */'):
    """Slice a 北极星 block out of BJX source lines: from the line
    containing start_needle up to (exclusive) the line containing
    end_needle. Marker comments are dropped, payload lines kept."""
    si = find_line(lines, start_needle)
    ei = find_line(lines, end_needle, si + 1)
    block = lines[si:ei]
    return [l for l in block if '/* 北极星模组 */' not in l]


def check_hook(name, out, vanilla, marks):
    """Common hook verification: passage list identical to 0.5, macro
    balance preserved, every marker present the expected number of
    times."""
    vps, ops = passages(vanilla), passages(out)
    assert vps == ops, name + ': passage name/order must stay identical'
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>'), name + ': if/ifend'
    # NOTE: <<elseif>> has no closing tag in SugarCube 2 (the 0.5 tree
    # never uses <</elseif>>), so there is no elseif balance to check;
    # mark counts below pin every inserted elseif individually.
    for mark, want in marks.items():
        got = out.count(mark)
        assert got == want, f'{name}: {mark!r} count {got} != {want}'
    print(f'{name}: {len(ops)} passages, '
          f'{len(out) - len(vanilla)} chars inserted, '
          f'{len(marks)} marks OK')


# --------------------------------------------------------------- merges

# Pinned before the first pronoun macro in both Robin passages (see
# gen_robin_events): 0.5 rejects the "none" pronoun placeholder with a red
# error span, so fall back to Robin's default male pronoun.
ROBIN_PRONOUN = ('<<set $pronoun to (($NPCName[$NPCNameList.indexOf("Robin")] || {}).pronoun || "m")>>\n'
                 '<<if $pronoun is "none">><<set $pronoun to "m">><</if>>')

def gen_robin_events():
    src = read(os.path.join(TOWN_BJX, 'special-robin', 'main-bjx.twee'))
    pairs = [
        ('<<if $robinraccoon isnot 1>>', '<<if ($robinraccoon ?? 0) isnot 1>>'),
        ('<<if $robindragon isnot 1>>', '<<if ($robindragon ?? 0) isnot 1>>'),
        ('$transformationParts.raccoon.tail isnot "disabled"',
         '($transformationParts.raccoon?.tail ?? "disabled") isnot "disabled"'),
        ('$transformationParts.dragon.horns isnot "hidden"',
         '($transformationParts.dragon?.horns ?? "hidden") isnot "hidden"'),
    ]
    for old, new in pairs:
        assert src.count(old) == 1, 'robin events source missing: ' + old
        src = src.replace(old, new)

    # 0.5 pronoun macros (<<He>>/<<His>>/<<him>>) resolve the ambient
    # $pronoun, while 0.4.3.3 fell back to the player's gender. These
    # passages are entered from <<robinoptions>> without any NPC context,
    # and a named NPC whose pronoun was never initialised carries the
    # literal value "none" (0.5's N/A marker), which every pronoun macro
    # rejects with a red error span. Pin $pronoun to Robin before the
    # first pronoun macro runs; "m" is the fallback for a fresh save.
    head = '<<set $outside to 0>><<set $location to "home">><<effects>>'
    assert src.count(head) == 2, 'robin events head count: %d' % src.count(head)
    src = src.replace(head, head + '\n' + ROBIN_PRONOUN)

    assert src.count('<<if $pronoun is "none">>') == 2
    assert src.count('C.npc') == 0  # robin merge touches no NPC props
    out = ('/* BJX pack: BJX special-robin/main-bjx.twee merged\n'
           '   (2 passages) + <<raccoon>> icon widget, with 0.5\n'
           '   translations. */\n' + src + """
:: Robin BJX TF Widgets [widget]

/* BJX pack: <<raccoon>> TF icon widget (BJX text.twee:6579), gating
   rewritten to the 0.5 style. 0.5 tficon has no "raccoon" argument.
   <<dragon>> already ships in bjx-tentacle-hooks.twee. */
<<widget "raccoon">>
	<<if !$settings.blindStatsEnabled>> |
		<span class="gold">浣熊</span>
	<</if>>
<</widget>>
""")
    ps = passages(out)
    assert ps == ['Robin Raccoon', 'Robin Dragon',
                  'Robin BJX TF Widgets'], ps
    assert out.count('($raccoon ?? 0)') == 0  # merge uses robinraccoon only
    assert out.count('widget "raccoon"') == 1
    write('bjx-special-robin-events.twee', out)


def gen_sydney_events():
    src = read(os.path.join(TOWN_BJX, 'special-sydney', 'main-bjx.twee'))
    n = src.count('$NPCName[$NPCNameList.indexOf("Sydney")].')
    assert n == 8, f'expected 8 NPCName refs, got {n}'
    src = src.replace('$NPCName[$NPCNameList.indexOf("Sydney")].',
                      'C.npc.Sydney.')
    old = '<<elseif playerChastity() and !$worn.genitals.origin is "temple">>'
    assert src.count(old) == 1
    src = src.replace(old,
                      '<<elseif playerChastity() and '
                      '$worn.genitals.origin isnot "temple">>')
    assert src.count('$worn.genitals.cn_name_cap') == 1
    src = src.replace('$worn.genitals.cn_name_cap',
                      '$worn.genitals.name_cap')
    assert '$NPCName[' not in src and 'cn_name' not in src
    out = ('/* BJX pack: BJX special-sydney/main-bjx.twee merged\n'
           '   (11 passages) with 0.5 translations: NPCName indexOf ->\n'
           '   C.npc.Sydney (alias2.js), origin temple priority fix,\n'
           '   cn_name_cap -> name_cap. */\n' + src)
    ps = passages(out)
    assert len(ps) == 11, ps
    assert out.count('C.npc.Sydney.') == 8
    assert out.count('Sydney Temple Corrupt Search Again') >= 2
    assert out.count('Sydney Temple Pure Again 3') >= 2
    assert 'gspurity' in out and 'lspurity' in out  # 0.5 text.js has both
    write('bjx-special-sydney-events.twee', out)


def gen_sydney_temple_events():
    src = read(os.path.join(TOWN_BJX, 'special-sydney', 'temple-bjx.twee'))
    n = src.count('$NPCName[$NPCNameList.indexOf("Sydney")].')
    assert n == 4, f'expected 4 NPCName refs, got {n}'
    src = src.replace('$NPCName[$NPCNameList.indexOf("Sydney")].',
                      'C.npc.Sydney.')
    assert '$NPCName[' not in src
    out = ('/* BJX pack: BJX special-sydney/temple-bjx.twee merged\n'
           '   (1 passage) with NPCName -> C.npc.Sydney translation. */\n'
           + src)
    ps = passages(out)
    assert ps == ['Temple Sydney Chastity'], ps
    assert out.count('C.npc.Sydney.') == 4
    write('bjx-special-sydney-temple-events.twee', out)


def gen_whitney_events():
    src = read(os.path.join(TOWN_BJX, 'special-whitney', 'main-bjx.twee'))
    for must in (':: School Leave Whitney Hurt', 'Oxford Street',
                 '朝着惠特尼喷火', '<<endevent>>'):
        assert must in src, must
    out = ('/* BJX pack: BJX special-whitney/main-bjx.twee merged\n'
           '   (1 passage), no translation needed. */\n' + src)
    assert passages(out) == ['School Leave Whitney Hurt']
    write('bjx-special-whitney-events.twee', out)


# --------------------------------------------------------------- hooks

def gen_robin_widgets_hooks():
    src = read(os.path.join(TOWN_REF, 'special-robin', 'widgets.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'special-robin',
                            'widgets.twee')).split('\n')
    lines = src.split('\n')

    # R1: raccoon cuddle + dragon nap links, inserted after the fox
    # block (which is the last TF link before the lovestage flirt).
    block = bjx_block(bjx, '<<if _robin.trauma lt 20 and $raccoon gte 6>>')
    block = [l.replace('$raccoon gte 6', '($raccoon ?? 0) gte 6')
              .replace('$dragon gte 6', '($dragon ?? 0) gte 6')
             for l in block]
    assert any('Robin Raccoon' in l for l in block)
    assert any('Robin Dragon' in l for l in block)
    i = find_line(lines, 'Swish tail (0:20)|Robin Fox')
    j = find_line(lines, '<</if>>', i)
    assert j - i == 2  # <br>, </if>
    lines[j + 1:j + 1] = ['\t\t/* BJX pack: raccoon/dragon TF links */'] \
        + block

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 special-robin/widgets.twee + BJX\n'
           '   raccoon/dragon TF links. */\n' + out)
    check_hook('robin-widgets-hooks', out, src, {
        'Robin Raccoon': 1, 'Robin Dragon': 1,
        '($raccoon ?? 0) gte 6': 1, '($dragon ?? 0) gte 6': 1,
        '<<raccoon>>': 1, '<<dragon>>': 1,
    })
    write('bjx-robin-widgets-hooks.twee', out)


def gen_robin_lemonade_hooks():
    src = read(os.path.join(TOWN_REF, 'special-robin', 'lemonade.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'special-robin',
                            'lemonade.twee')).split('\n')
    lines = src.split('\n')

    # R2: Steal the water -> 偷水 + skulduggeryhands.
    i = find_line(lines, 'Steal the water|Robin\'s Lemonade Steal')
    bi = find_line(bjx, '偷水|Robin\'s Lemonade Steal')
    assert '$skulduggeryhands' in bjx[bi]
    lines[i:i + 1] = ['\t\t/* BJX pack: skulduggery hands setup */',
                      bjx[bi]]

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 special-robin/lemonade.twee + BJX\n'
           '   steal-water rewrite. */\n' + out)
    check_hook('robin-lemonade-hooks', out, src, {
        '偷水|Robin\'s Lemonade Steal': 1,
        '<<set $skulduggeryhands to 1>>': 1,
        'Steal the water|Robin\'s Lemonade Steal': 0,
    })
    write('bjx-robin-lemonade-hooks.twee', out)


def gen_robin_halloween_hooks():
    src = read(os.path.join(TOWN_REF, 'special-robin', 'halloween.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'special-robin',
                            'halloween.twee')).split('\n')
    lines = src.split('\n')

    # R3: four TF costume cases, inserted after the fox TF case block,
    # before the "<!-- Misc lines -->" comment.
    block = bjx_block(bjx, '<<case "sheep TF">>')
    assert len(block) == 8  # 4 cases x 2 lines
    i = find_line(lines, '<<case "fox TF">>')
    j = find_line(lines, '<!-- Misc lines -->', i)
    assert j - i < 10
    lines[j:j] = ['\t\t/* BJX pack: sheep/bee/dragon/lizard TF costume '
                  'lines */'] + block

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 special-robin/halloween.twee + BJX\n'
           '   TF costume cases. */\n' + out)
    check_hook('robin-halloween-hooks', out, src, {
        '<<case "sheep TF">>': 1, '<<case "bee TF">>': 1,
        '<<case "dragon TF">>': 1, '<<case "lizard TF">>': 1,
    })
    write('bjx-robin-halloween-hooks.twee', out)


def gen_whitney_main_hooks():
    src = read(os.path.join(TOWN_REF, 'special-whitney', 'main.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'special-whitney',
                            'main.twee')).split('\n')
    lines = src.split('\n')

    # W1: dragon fire-breath link after "Throw Whitney off" <br>.
    block = bjx_block(bjx, '<<if $dragon gte 6>>')
    block = [l.replace('$dragon gte 6', '($dragon ?? 0) gte 6')
             for l in block]
    assert any('School Leave Whitney Hurt' in l for l in block)
    i = find_line(lines, 'Throw Whitney off|School Leave Whitney Throw')
    assert lines[i + 1].strip() == '<br>'
    lines[i + 2:i + 2] = ['\t\t\t\t/* BJX pack: dragon fire breath */'] \
        + block

    # W2: Refuse -> Disagree (BJX wording).
    i = find_line(lines, '[[Refuse|Bully Panties 2]]')
    assert lines[i].count('Refuse') == 1
    lines[i] = lines[i].replace('[[Refuse|Bully Panties 2]]',
                                '[[Disagree|Bully Panties 2]]')

    # W3: whispered-panties line -> BJX wording.
    bi = find_line(bjx, 'who seems to head to the library')
    i = find_line(lines, 'who promptly runs off in the direction of '
                         'the library')
    assert 'fresh pair' in bjx[bi] and 'fresh pair' in lines[i]
    lines[i] = bjx[bi]

    # W4: Bully Alley Rob Next -> 继续 + skulduggeryhands.
    bi = find_line(bjx, '<<link [[继续|Bully Alley Rob]]>>')
    assert '$skulduggeryhands' in bjx[bi]
    i = find_line(lines, '<<link [[Next|Bully Alley Rob]]>><</link>>'
                         '<<skulduggerydifficulty>>')
    lines[i:i + 1] = ['/* BJX pack: skulduggery hands setup */', bjx[bi]]

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 special-whitney/main.twee + 4 BJX\n'
           '   patches (W1 fire breath / W2 Disagree / W3 whisper line\n'
           '   / W4 skulduggery hands). */\n' + out)
    check_hook('whitney-main-hooks', out, src, {
        '朝惠特尼喷火': 1,
        '($dragon ?? 0) gte 6': 1,
        '[[Disagree|Bully Panties 2]]': 1,
        '[[Refuse|Bully Panties 2]]': 0,
        'who seems to head to the library': 1,
        '<<link [[继续|Bully Alley Rob]]>>': 1,
    })
    assert out.count('<<set $skulduggeryhands to 1>>') == 1
    write('bjx-whitney-main-hooks.twee', out)


def gen_whitney_halloween_hooks():
    src = read(os.path.join(TOWN_REF, 'special-whitney', 'halloween.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'special-whitney',
                            'halloween.twee')).split('\n')
    lines = src.split('\n')

    # W5: bee/sheep TF costume cases after the fox TF case.
    block = bjx_block(bjx, '<<case "bee TF">>')
    assert len(block) == 4  # 2 cases x 2 lines
    i = find_line(lines, '<<case "fox TF">>')
    j = find_line(lines, '<!-- Misc lines -->', i)
    assert j - i < 10
    lines[j:j] = ['\t/* BJX pack: bee/sheep TF costume lines */'] + block

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 special-whitney/halloween.twee +\n'
           '   BJX TF costume cases. */\n' + out)
    check_hook('whitney-halloween-hooks', out, src, {
        '<<case "bee TF">>': 1, '<<case "sheep TF">>': 1,
    })
    write('bjx-whitney-halloween-hooks.twee', out)


def gen_sydney_main_hooks():
    src = read(os.path.join(TOWN_REF, 'special-sydney', 'main.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'special-sydney',
                            'main.twee')).split('\n')
    lines = src.split('\n')

    # S1: dragon-eyes elseif after the demon branch.
    block = bjx_block(bjx, '<<elseif ($dragon gte 1 and '
                           '$transformationParts.dragon.eyes isnot '
                           '"disabled")>>')
    block = [l.replace(
        '<<elseif ($dragon gte 1 and $transformationParts.dragon.eyes '
        'isnot "disabled")>>',
        '<<elseif (($dragon ?? 0) gte 1 and '
        '($transformationParts.dragon?.eyes ?? "disabled") isnot '
        '"disabled")>>') for l in block]
    assert '隐形眼镜' in ''.join(block)
    i = find_line(lines, '<<elseif $cow gte 2 and '
                         '$transformationParts.cow.horns isnot "hidden">>')
    lines[i:i] = ['\t\t\t\t/* BJX pack: dragon eyes notice */'] + block

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 special-sydney/main.twee + BJX\n'
           '   dragon-eyes elseif. */\n' + out)
    check_hook('sydney-main-hooks', out, src, {
        '($dragon ?? 0) gte 1': 1,
        '($transformationParts.dragon?.eyes ?? "disabled")': 1,
        '隐形眼镜': 1,
    })
    write('bjx-sydney-main-hooks.twee', out)


def gen_sydney_temple_hooks():
    src = read(os.path.join(TOWN_REF, 'special-sydney', 'temple.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'special-sydney',
                            'temple.twee')).split('\n')
    lines = src.split('\n')

    # S2: Steal -> 偷窃 + skulduggeryhands.
    bi = find_line(bjx, '偷窃|Temple Plate Steal')
    assert '$skulduggeryhands' in bjx[bi]
    i = find_line(lines, '<<link [[Steal|Temple Plate Steal]]>>')
    lines[i:i + 1] = ['\t\t/* BJX pack: skulduggery hands setup */',
                      bjx[bi]]

    # S3: Corrupt Sex ending condition. BJX replaces _combatend with
    # concrete enemy conditions; parenthesise every clause so the
    # and/or precedence cannot bite (and binds tighter than or).
    bi = find_line(bjx, '<<if $enemyhealth lte 0 or $enemyarousal gte '
                        '$enemyarousalmax or $finish is 1 and '
                        '!$loveDrunk>>')
    i = find_line(lines, '<<if _combatend and !($finish is 1 and '
                         '$loveDrunk)>>')
    rewritten = ('<<if ($enemyhealth lte 0) or '
                 '($enemyarousal gte $enemyarousalmax) or '
                 '($finish is 1 and !$loveDrunk)>>')
    lines[i:i + 1] = ['/* BJX pack: concrete end conditions, explicit '
                      'clausal parens */', rewritten]

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 special-sydney/temple.twee + 2 BJX\n'
           '   patches (S2 plate steal / S3 corrupt-sex end cond). */\n'
           + out)
    check_hook('sydney-temple-hooks', out, src, {
        '偷窃|Temple Plate Steal': 1,
        '<<set $skulduggeryhands to 1>>': 1,
        '($enemyhealth lte 0) or ($enemyarousal gte $enemyarousalmax) or '
        '($finish is 1 and !$loveDrunk)': 1,
    })
    # every other _combatend line (196/272/1007/1239/2193) stays vanilla
    assert out.count('<<if _combatend') == \
        src.count('<<if _combatend') - 1
    write('bjx-sydney-temple-hooks.twee', out)


def gen_sydney_walk_hooks():
    src = read(os.path.join(TOWN_REF, 'special-sydney', 'walk.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'special-sydney',
                            'walk.twee')).split('\n')
    lines = src.split('\n')

    # S4: shame refusal -> templePromised fork (promised partners accept).
    block = bjx_block(bjx, '<<if $templePromised is "Sydney">>')
    assert any('npcincr Sydney purity -5' in l for l in block)
    assert any('<<set _walk to true>>' in l for l in block)
    assert any('<<set _walk to false>>' in l for l in block)
    i = find_line(lines, 'my mind isn\'t in a good place')
    assert lines[i + 1].strip() == '<<set _walk to false>>'
    lines[i:i + 2] = ['\t/* BJX pack: templePromised fork */'] + block

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 special-sydney/walk.twee + BJX\n'
           '   templePromised fork. */\n' + out)
    check_hook('sydney-walk-hooks', out, src, {
        '<<npcincr Sydney purity -5>>':
            1 + src.count('<<npcincr Sydney purity -5>>'),
        '<<set _walk to true>>':
            1 + src.count('<<set _walk to true>>'),
        '<<set _walk to false>>':
            src.count('<<set _walk to false>>'),  # replaced line == added line
        '$templePromised is "Sydney"':
            1 + src.count('$templePromised is "Sydney"'),
    })
    write('bjx-sydney-walk-hooks.twee', out)


def gen_sydney_widgets_hooks():
    src = read(os.path.join(TOWN_REF, 'special-sydney', 'widgets.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'special-sydney',
                            'widgets.twee')).split('\n')
    lines = src.split('\n')

    # S5/S6/S7: the three single-branch chastity-remove intro links
    # (school chat / school flirt / temple unlock) gain a BJX branch
    # that routes corruptroom-seers and promised partners to the Again
    # passage. BJX icon forms are swapped for their 0.5 equivalents
    # (templeicon "chastity release" and askicon do not exist in 0.5).
    icon_swaps = [
        ('<<socialiseicon>><<link [[聊天 (0:15)|Sydney Chastity Remove '
         'Again]]>>', '<<socialiseicon>>'),
        ('<<brothelicon>><<link [[调情 (0:15)|Sydney Chastity Remove '
         'Again]]>>', '<<brothelicon>>'),
        ('<<templeicon "chastity release">><<link '
         '[[询问对方贞操带的事|Sydney Chastity Remove Again]]>>',
         '<<lockicon "unlock">>'),
    ]
    for bjx_link, vanilla_icon in icon_swaps:
        bi = find_line(bjx, bjx_link)
        # slice the BJX if/elseif pair (marker-free block: from the
        # `<<if $sydneyChastityRemoveIntro is 1 and ...>>` line down to
        # the `<<elseif $sydneyChastityRemoveIntro is 1>>` line)
        si = bi - 1
        assert 'sydneyChastityRemoveIntro is 1 and' in bjx[si]
        ei = find_line(bjx, '<<elseif $sydneyChastityRemoveIntro is 1>>',
                       si)
        block = bjx[si:ei + 1]
        # icon swap for the temple variant
        block = [l.replace('<<templeicon "chastity release">>',
                           '<<lockicon "unlock">>') for l in block]
        target_link = ('Sydney Chastity Remove Again' if '聊天' in bjx_link
                       else '调情' if '调情' in bjx_link
                       else '询问对方贞操带的事')
        assert any(target_link in l for l in block)
        # locate the matching vanilla `<<if ... is 1>>` line that owns
        # vanilla_icon on the next line
        i = find_line(lines, '<<if $sydneyChastityRemoveIntro is 1>>')
        while vanilla_icon not in lines[i + 1]:
            i = find_line(lines, '<<if $sydneyChastityRemoveIntro is 1>>',
                          i + 1)
        assert 'Sydney Chastity Remove' in lines[i + 1] or \
            'Chastity Remove' in lines[i + 1]
        lines[i:i + 1] = ['\t\t\t/* BJX pack: again-fork for corruptroom/'
                          'promised partners */'] + block

    # S8: two extra elseif branches (Corrupt Again / Pure Again) after
    # the vanilla Pure elseif, before the else. askicon -> 0.5 form.
    block = bjx_block(bjx, '<<elseif $sydneyChastityRemoveCorruptAgain>>')
    block = [l.replace('<<askicon>>', '<<socialiseicon "ask">>')
             for l in block]
    assert any('Sydney Temple Corrupt Again' in l for l in block)
    assert any('Sydney Temple Pure Again' in l for l in block)
    i = find_line(lines, '<<elseif $sydneyChastityRemovePure and '
                         '$templePromised isnot "Sydney" and '
                         '!$temple_evaluation>>')
    j = find_line(lines, '<<else>>', i)
    assert j - i == 3  # ask line, <br>, else
    lines[j:j] = ['\t\t\t/* BJX pack: again-passage follow-ups */'] + block

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 special-sydney/widgets.twee + 4 BJX\n'
           '   patches (S5-S7 chastity again forks, S8 again links). */\n'
           + out)
    check_hook('sydney-widgets-hooks', out, src, {
        'Sydney Chastity Remove Again': 3,
        'Sydney Temple Corrupt Again': 1,
        'Sydney Temple Pure Again': 1,
        '$sydneySeen.includes("corruptroom") or $templePromised is '
        '"Sydney"': 3,
        '<<lockicon "unlock">>': 1 + src.count('<<lockicon "unlock">>'),
        '<<socialiseicon "ask">>': 2 + src.count(
            '<<socialiseicon "ask">>'),
        '<<askicon>>': 0,
        '<<templeicon "chastity release">>': 0,
    })
    write('bjx-sydney-widgets-hooks.twee', out)


def gen_park_robin_hooks():
    src = read(os.path.join(TOWN_REF, 'loc-park', 'robin.twee'))
    bjx = read(os.path.join(TOWN_BJX, 'loc-park',
                            'robin.twee')).split('\n')
    lines = src.split('\n')

    # P1: Steal the milk -> 偷牛奶 + skulduggeryhands.
    bi = find_line(bjx, '偷牛奶|Robin Milk Steal')
    assert '$skulduggeryhands' in bjx[bi]
    i = find_line(lines, '<<link [[Steal the milk|Robin Milk Steal]]>>')
    lines[i:i + 1] = ['\t\t/* BJX pack: skulduggery hands setup */',
                      bjx[bi]]

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 loc-park/robin.twee + BJX\n'
           '   steal-milk rewrite. */\n' + out)
    check_hook('park-robin-hooks', out, src, {
        '偷牛奶|Robin Milk Steal': 1,
        '<<set $skulduggeryhands to 1>>': 1,
        'Steal the milk|Robin Milk Steal': 0,
    })
    write('bjx-park-robin-hooks.twee', out)


# ---------------------------------------------------------------- cross

def cross_check():
    """The 15 new BJX passages + widget passage must not collide with
    any passage in the whole 0.5 tree (a collision would silently
    override vanilla content)."""
    new_names = set()
    for f in ('bjx-special-robin-events.twee',
              'bjx-special-sydney-events.twee',
              'bjx-special-sydney-temple-events.twee',
              'bjx-special-whitney-events.twee'):
        new_names |= set(passages(read(os.path.join(OUT, f))))
    assert len(new_names) == 16, sorted(new_names)

    known = {}
    for base, _dirs, files in os.walk(REF):
        for fn in files:
            if not fn.endswith('.twee'):
                continue
            for header in read(os.path.join(base, fn)).split('\n'):
                if header.startswith(':: '):
                    known.setdefault(
                        header[3:].split('[')[0].strip(),
                        os.path.relpath(os.path.join(base, fn), REF))
    clash = {p: known[p] for p in new_names if p in known}
    assert not clash, 'passage name clash with 0.5: %s' % clash
    print('cross-check OK: 16 new passages (15 content + 1 widget), '
          'no collisions with any of %d vanilla passages' % len(known))

    # the Again-chain target passages referenced from hooks all exist
    hooks = ''.join(read(os.path.join(OUT, f)) for f in os.listdir(OUT)
                    if f.endswith('-hooks.twee'))
    for target in ('Sydney Chastity Remove Again',
                   'Sydney Temple Corrupt Again',
                   'Sydney Temple Pure Again',
                   'School Leave Whitney Hurt',
                   'Robin Raccoon', 'Robin Dragon'):
        assert target in hooks
        assert target in new_names, target
    print('cross-check OK: all hook link targets exist in merge files')

    # Temple Sydney Chastity is entered from loc-temple/main.twee, which
    # is hooked by the temple group (gen_temple.py), not this group.
    assert 'Temple Sydney Chastity' in new_names
    temple_hooks = os.path.join(os.path.dirname(os.path.abspath(OUT)),
                                '_verify_temple', 'bjx-temple-main-hooks.twee')
    if os.path.exists(temple_hooks):
        assert 'Temple Sydney Chastity' in read(temple_hooks)
        print('cross-check OK: Temple Sydney Chastity entry present in '
              'temple-group hooks')


def main():
    gen_robin_events()
    gen_sydney_events()
    gen_sydney_temple_events()
    gen_whitney_events()
    gen_robin_widgets_hooks()
    gen_robin_lemonade_hooks()
    gen_robin_halloween_hooks()
    gen_whitney_main_hooks()
    gen_whitney_halloween_hooks()
    gen_sydney_main_hooks()
    gen_sydney_temple_hooks()
    gen_sydney_walk_hooks()
    gen_sydney_widgets_hooks()
    gen_park_robin_hooks()
    cross_check()
    print('ALL SPECIAL-NPC CHECKS PASSED')


if __name__ == '__main__':
    main()