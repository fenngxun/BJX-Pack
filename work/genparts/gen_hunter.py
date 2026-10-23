# -*- coding: utf-8 -*-
"""恶魔猎手 / 魅魔 P0 生成器（BJX 0.4.3.3 -> DoL 0.5.12.13）。

按 work/SPEC-hunter-rework.md §5 实现六项：
  1. 非自愿战斗点数（内射 +3 / 高潮 +1，单场 ≤9）与升级判定（30/60/医院/120）
  2. 阶段减免（controlloss 的 -25 按 bjxHunterReduction() 缩放）
  3. 自控夺回（effectsman 包装，见 inject_early.js）
  4. 非致命腐蚀（hunterhotfluid 从 BJX 搬入，血量最低留 1）
  5. 续杯卡位（setupMidOrgasm：魅魔/龙 6 级把敌人卡在高潮边缘，动作在 actions hooks）
  6. 吸收胚胎（BJX Embryo Absorb passage + 厕所入口见 inject_early.js）

实现方式：**从 0.5.12.13 源码整段抽 widget 再改**（gen_market_sell 范式），
上游改了这个 widget 会自动跟过来，不会像手抄那样静默漂移。

输出：_verify_hunter/bjx-hunter.twee（多个 passage）
"""

import os

ROOT = r'C:\Users\79403\Desktop\dol'
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.12.13-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_hunter')
OUT_NAME = 'bjx-hunter.twee'

WIDGETS = os.path.join(REF, 'base-system', 'widgets.twee')
ORGASM = os.path.join(REF, 'base-system', 'orgasm.twee')
END = os.path.join(REF, 'base-combat', 'end.twee')
COMBAT_WIDGETS = os.path.join(REF, 'base-combat', 'widgets.twee')

GUARD = '$options.bjx_divine'


def read(path):
    return open(path, encoding='utf-8', newline='').read()


def widget_body(text, name):
    """返回 `<<widget "name">>` 到 `<</widget>>` 的整段（含首尾）。"""
    head = '<<widget "%s">>' % name
    assert text.count(head) == 1, 'widget head not unique: ' + name
    i = text.index(head)
    j = text.index('<</widget>>', i) + len('<</widget>>')
    return text[i:j]


def replace_line(text, old_stripped, new_stripped):
    """按 strip() 后的整行匹配替换，保留原缩进。"""
    lines = text.split('\n')
    hits = [i for i, l in enumerate(lines) if l.strip() == old_stripped]
    assert len(hits) == 1, 'line not unique (%d): %s' % (len(hits), old_stripped)
    i = hits[0]
    indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
    lines[i] = indent + new_stripped
    return '\n'.join(lines)


def insert_before_line(text, anchor_stripped, block):
    lines = text.split('\n')
    hits = [i for i, l in enumerate(lines) if l.strip() == anchor_stripped]
    assert len(hits) == 1, 'anchor not unique (%d): %s' % (len(hits), anchor_stripped)
    i = hits[0]
    return '\n'.join(lines[:i] + block.split('\n') + lines[i:])


# ---------------------------------------------------------------- 1. 点数

def gen_internalejac():
    body = widget_body(read(WIDGETS), 'internalejac')
    # 原版只有 demon 6 累积 demonabsorb；改由 <<creampie>> 统一计数（含兽类/触手），
    # 故此处删除计数块（否则双计），只保留 +3 点数与非战斗恢复调用。
    old = ('\t<<if $demon gte 6>>\n'
           '\t\t<<set $demonabsorb += 1>>\n'
           '\t<</if>>\n')
    assert body.count(old) == 1, 'internalejac demon gate changed'
    body = body.replace(old, '')
    # 非战斗分支：原来只减创伤 + 英文提示；改用公共恢复 widget（含中文提示）
    combat_block = ('\t<<if $combat isnot 1>>\n'
                    '\t\t<<if $demonabsorb gte 1>>\n'
                    '\t\t\t<<set $trauma -= (150 * $demonabsorb)>>\n'
                    '\t\t\t<<if _args[0]>>\n'
                    '\t\t\t\t<span class="lewd">You absorb the sexual essence. You feel soothed.</span>\n'
                    '\t\t\t<</if>>\n'
                    '\t\t\t<<set $demonabsorb to 0>>\n'
                    '\t\t\t<<traumaClamp>>\n'
                    '\t\t<</if>>\n'
                    '\t<</if>>\n')
    assert body.count(combat_block) == 1, 'internalejac noncombat block changed'
    body = body.replace(combat_block,
                        '\t<<if $combat isnot 1>>\n'
                        '\t\t<<bjxAbsorbHeal>>\n'
                        '\t<</if>>\n')
    block = (
        '\t/* BJX: 非自愿战斗被内射 +3 猎手点数 */\n'
        '\t<<if $demonhunter gte 2 and $combat is 1 and $consensual is 0 and ' + GUARD + '>>\n'
        '\t\t<<bjxHunterGain 3>>\n'
        '\t<</if>>')
    body = insert_before_line(body, '<<if $combat isnot 1>>', block)
    assert body.count('<<bjxHunterGain 3>>') == 1
    assert body.count('$demonabsorb += 1') == 0
    assert body.count('<<bjxAbsorbHeal>>') == 1
    return body


def gen_orgasmcount():
    body = widget_body(read(ORGASM), 'orgasmcount')
    old = '<<set $orgasmcount = Math.clamp($orgasmcount, 0, 25)>>'
    block = (
        '\t\t<<if $demonhunter gte 2 and $combat is 1 and $consensual is 0 and ' + GUARD + '>>\n'
        '\t\t\t<<bjxHunterGain 1>>\n'
        '\t\t<</if>>')
    body = insert_before_line(body, old, block)
    # move the insertion after the clamp line
    body = body.replace(block + '\n\t\t' + old, '\t\t' + old + '\n' + block, 1)
    assert body.index(old) < body.index('<<bjxHunterGain 1>>')
    return body


# ---------------------------------------------------------------- 2. 减免

def gen_controlloss():
    body = widget_body(read(WIDGETS), 'controlloss')
    # 注意：<<combatcontrol>> 的参数按空格分词，表达式必须用反引号包起来，
    # 否则 `-Math.round(25 * ...)` 会被截成 """-Math.round(25""" 并报
    # `Unexpected value for the function "control"`（2026-10-22 实测）。
    body = replace_line(
        body,
        '<<set $controlstart to $control>><<combatcontrol -25>>',
        '<<set $controlstart to $control>><<combatcontrol '
        '`-Math.round(25 * (1 - bjxHunterReduction()) * (1 - bjxMushroomCut()) * 10) / 10`>>')
    assert 'bjxHunterReduction()' in body
    assert 'bjxMushroomCut()' in body
    return body


def gen_willpowerorgasm():
    body = widget_body(read(WIDGETS), 'willpowerorgasm')
    body = replace_line(
        body,
        '<<if $orgasmdown gte 1 and _willpowerorgasmchecked isnot true>>',
        '<<if $orgasmdown gte 1 and _willpowerorgasmchecked isnot true and $demonhunter lte 5>>')
    assert '$demonhunter lte 5' in body
    return body


# ---------------------------------------------------------------- 5. 继续索取

def gen_setupmidorgasm():
    body = widget_body(read(COMBAT_WIDGETS), 'setupMidOrgasm')
    head = '<<widget "setupMidOrgasm">>'
    block = (
        '\t/* BJX: 魅魔 / 龙 6 级——敌人冲到高潮边缘时把它「卡住」'
        '（againfail=true）：本回合敌人不再行动，\n'
        '\t   玩家可用脚部动作「再来一发」诱惑续杯 /「贪婪索取」强行续杯，'
        '或直接结束战斗。 */\n'
        '\t<<if !$againfail and ($options.bjx_divine and $demon gte 6 '
        'or $options.bjx_animal and $dragon gte 6) and $enemyarousal gte $enemyarousalmax>>\n'
        '\t\t<<set $enemyarousal to $enemyarousalmax - 1>>\n'
        '\t\t<<set $againfail to true>>\n'
        '\t<</if>>\n'
        '\t/* BJX P2 摄魂之眼：催眠生效期间敌人无法到达高潮，'
        '溢出量记入 enemyoverarousal 记账（undefined 时从 0 起）。 */\n'
        '\t<<if $demonhunterhypnosis is 1 and $enemyarousal gte $enemyarousalmax>>\n'
        '\t\t<<set $enemyoverarousal to ($enemyoverarousal ?? 0) + $enemyarousal - $enemyarousalmax + 1>>\n'
        '\t\t<<set $enemyarousal to $enemyarousalmax - 1>>\n'
        '\t<</if>>')
    body = body.replace(head, head + '\n' + block, 1)
    assert body.count('$againfail') == 2, body.count('$againfail')
    assert body.count('$demonhunterhypnosis') == 1
    return body


# ---------------------------------------------------------------- P2 摄魂之眼

# ---------------------------------------------------------------- 1b. 体内射精统一计数

def gen_creampie():
    """覆盖宿主 passage 'Widgets creampie'：0.5 整段 + 体内射精统一计数。

    0.5 原版只在 internalejac 里累积 demonabsorb，而 internalejac 仅由
    vaginal/anal ejacstat（及 struggle/tentacle 直调）触发；兽类射精的
    bottomejacstat/thighejacstat/vaginalentranceejacstat 等全不经过，
    于是异种族被内射不触发吸收恢复。creampie 是所有体内射精的公共出口。"""
    src = read(os.path.join(REF, 'base-system', 'physicalAdjustments.twee'))
    head = ':: Widgets creampie [widget]\n'
    assert src.count(head) == 1, 'creampie passage header changed'
    body = widget_body(src, 'creampie')
    anchor = '\t<<set $internalejac to 1>>\n'
    assert body.count(anchor) == 1, 'creampie internalejac anchor changed'
    block = ('\t/* BJX: 体内射精统一计数（含兽类/触手）。demon/demonhunter 6 级的\n'
             '\t   吸收恢复依赖 $demonabsorb，而原版只在 internalejac 里计数。 */\n'
             '\t<<if $demon gte 6 or $demonhunter gte 6>>\n'
             '\t\t<<set $demonabsorb += 1>>\n'
             '\t<</if>>\n')
    out = head + body.replace(anchor, block + anchor, 1)
    assert out.count('$demonabsorb += 1') == 1
    return out


def gen_speak():
    """覆盖宿主 passage 'Widgets Actions Speak'：0.5 整文件 + 催眠动作生成。
    锚：非自愿分支 disparage 块后（BJX actions-speech.twee:88-90 同位）。"""
    src = read(os.path.join(REF, 'base-combat', 'actions-speech.twee'))
    assert src.count(':: Widgets Actions Speak [widget]') == 1
    anchor = ('\t\t\t<<if $fallenangel gte 4 and $angelforgive isnot 1 and $enemytype is "man">>\n'
              '\t\t\t\t<<set _mouthaction["Disparage"] to "disparage">>\n'
              '\t\t\t<</if>>\n')
    assert src.count(anchor) == 1, 'speak disparage anchor: %d' % src.count(anchor)
    block = (anchor +
             '\t\t\t/* 北极星模组：恶魔猎手 5 级摄魂之眼——言语催眠。\n'
             '\t\t\t   每天一次（按游戏日取整比对），战斗中每场也只能用一次。 */\n'
             '\t\t\t<<if $demonhunter gte 5 and $demonhunterhypnosis isnot 1 '
             'and ($bjxHypnosisDay ?? -1) isnot Math.floor(Time.date.timeStamp / 86400)>>\n'
             '\t\t\t\t<<set _mouthaction["催眠"] to "hypnosis">>\n'
             '\t\t\t<</if>>\n'
             '\t\t\t/* 北极星 */\n')
    out = src.replace(anchor, block, 1)
    assert out.count('"hypnosis"') == 1
    return out


def gen_traits():
    """覆盖宿主 passage 'Traits'：0.5 整文件 + 摄魂之眼条目。
    锚：Special Traits 组 'Radiant' 条目前（BJX traits.twee:636-641 同文案）。"""
    src = read(os.path.join(REF, 'base-system', 'overlays', 'traits.twee'))
    assert src.count(':: Traits [widget]') == 1
    anchor = '\t\t\t\t{\n\t\t\t\t\tname: "Radiant",\n'
    assert src.count(anchor) == 1, 'traits Radiant anchor: %d' % src.count(anchor)
    block = ('\t\t\t\t{\n'
             '\t\t\t\t\tname: "摄魂之眼",\n'
             '\t\t\t\t\tcolour: "red",\n'
             '\t\t\t\t\thas: $options.bjx_divine and $demonhunter gte 5,\n'
             '\t\t\t\t\ttext: \'你的眼睛摄人心灵，结合哈珀那学得的催眠音波，'
             '每次战斗时可解锁一次"催眠"行动，阻止对方以任何方式到达高潮\',\n'
             '\t\t\t\t},\n'
             + anchor)
    out = src.replace(anchor, block, 1)
    assert out.count('摄魂之眼') == 1
    return out


# ---------------------------------------------------------------- 4. 非致命腐蚀

HUNTERHOTFLUID = '''<<widget "hunterhotfluid">>
	/* BJX 猎手：高潮时喷出的变异体液灼伤来袭者。
	   与 BJX 原版唯一区别：血量最低留 1，且不再触发 defeatnpc（腐蚀非致命）。 */
	<<if _args[0] and $demonhunter gte 2>>
		<<set _dmg to _args[0] * 100>>
		<<set $enemyhealth to Math.max(1, $enemyhealth - _dmg)>>
		<span class="lustful">你滚烫的体液灼伤了来袭者。</span>
		<<if _args[1]>>
			<<set _dmg0 to Math.clamp(_dmg, 0, $NPCList[_args[1]].health)>>
			<<set $NPCList[_args[1]].health to Math.max(1, $NPCList[_args[1]].health - _dmg0)>>
			<<set _dmg -= _dmg0>>
		<</if>>
		<<if _dmg gt 0>>
			<<for _npctodamage to 0; _npctodamage lt $enemynomax; _npctodamage++>>
				<<if $NPCList[_npctodamage].active is "active" and $NPCList[_npctodamage].stance isnot "defeated">>
					<<set $NPCList[_npctodamage].health to Math.max(1, $NPCList[_npctodamage].health - (_dmg / $enemyno))>>
				<</if>>
			<</for>>
		<</if>>
	<</if>>
<</widget>>'''

NEW_WIDGETS = '''<<widget "bjxHunterGain">>
	/* BJX 猎手：非自愿战斗点数，单场 ≤9，进度上限 120 */
	<<set _room to Math.max(0, 9 - ($hunterfightPoints ?? 0))>>
	<<set _gain to Math.min(_args[0], _room)>>
	<<if _gain gt 0>>
		<<set $hunterfightPoints to ($hunterfightPoints ?? 0) + _gain>>
		<<set $hunterbuild to Math.min(120, ($hunterbuild ?? 0) + _gain)>>
		<<bjxHunterCheckRank>>
	<</if>>
<</widget>>

<<widget "bjxHunterCheckRank">>
	/* BJX 猎手：2→3(30)、3→4(60)、5→6(120)。4→5 只能走医院。 */
	<<if $demonhunter is 2 and $hunterbuild gte 30>>
		<<set $demonhunter to 3>>
		<span class="lustful">你的体液变得愈发灼热。</span>
	<<elseif $demonhunter is 3 and $hunterbuild gte 60>>
		<<set $demonhunter to 4>>
		<span class="lustful">你的体液仿佛岩浆般沸腾。</span>
	<<elseif $demonhunter is 5 and $hunterbuild gte 120>>
		<<set $demonhunter to 6>>
		<<earnFeat "Demon Hunter">>
		<span class="lustful">你的身体在变异体液不断地冲刷下愈发坚韧。</span>
	<</if>>
<</widget>>

<<widget "bjxHunterRestore">>
	/* BJX 猎手：吸收胚胎后的状态恢复 */
	<<set $stress to Math.round($stress * 0.1)>>
	<<set $trauma to Math.round($trauma * 0.1)>>
	<<set $pain to Math.round($pain * 0.1)>>
	<<set $tiredness to Math.round(($tiredness ?? 0) * 0.1)>>
	<<set $arousal to Math.round($arousal * 0.1)>>
	<<set $control to Math.round($controlmax * 0.9)>>
	<<clamp>>
<</widget>>

<<widget "bjxAbsorbHeal">>
	/* BJX：消费 $demonabsorb 恢复状态。战斗（endcombat）与非战斗
	   （internalejac）共用同一份逻辑，避免两处漂移。恶魔 6 级固定 10%，
	   猎手按等级 2→10% 3→15% 4→20% 5→25% 6→30%。 */
	<<if $demonabsorb gte 1>>
		<<set _bjxHeal to 0>>
		<<if $demonhunter gte 2>>
			<<set _lv to Math.min(6, $demonhunter)>>
			<<set _bjxHeal to [0, 0, 0.10, 0.15, 0.20, 0.25, 0.30][_lv]>>
		<<elseif $demon gte 6>>
			<<set _bjxHeal to 0.10>>
		<</if>>
		<<if _bjxHeal gt 0>>
			<<set $stress to Math.round($stress * (1 - _bjxHeal))>>
			<<set $trauma to Math.round($trauma * (1 - _bjxHeal))>>
			<<set $pain to Math.round($pain * (1 - _bjxHeal))>>
			/* 疲惫同比例消退（玩家反馈：吸收只回压力创伤疼痛，照样累得垂耳朵） */
			<<set $tiredness to Math.max(0, Math.round(($tiredness ?? 0) * (1 - _bjxHeal)))>>
			/* 吸收精华也补自控：按恢复比例回上限的同一百分比 */
			<<set $control to Math.min($controlmax, ($control ?? 0) + Math.round($controlmax * _bjxHeal))>>
			<span class="lewd">你吸收了性爱的精华，压力、创伤、疼痛与疲惫都减轻了，自控也恢复了一些。</span>
		<<elseif $demonhunter gte 2 and $options.bjx_divine>>
			<span class="grey">你体内的变异体液微微发烫，却没有排斥这些外来物。</span>
		<<else>>
			<<if $enemytype is "tentacles" or $enemytype is "struggle">>
				<<pain `-(5 * $demonabsorb)`>>
				<<set $stress -= (300 * $demonabsorb)>>
			<<else>>
				<<set $trauma -= (150 * $demonabsorb)>>
			<</if>>
			<span class="lewd">You absorb the sexual essence. You feel soothed.</span>
		<</if>>
		<<set $demonabsorb to 0>>
		<<traumaClamp>>
	<</if>>
<</widget>>
'''


# ---------------------------------------------------------------- 3. 高潮回状态

def gen_orgasm():
    body = widget_body(read(ORGASM), 'orgasm')
    # 高潮次数过多时的 +100 压力是直接 set，绕过 stress 宏 → 补减免
    old_stress = '<<set $stress += 100>>'
    assert body.count(old_stress) == 3, 'orgasm direct stress count changed'
    body = body.replace(
        old_stress,
        '<<set $stress += Math.round(100 * (($combat is 1 and $consensual is 0) '
        '? (1 - bjxHunterReduction()) : 1))>>')
    block = (
        '\t/* BJX 猎手：释放高潮回状态，并把体液泼向全场 */\n'
        '\t<<if $demonhunter gte 2 and !_deniedOrgasm and ' + GUARD + '>>\n'
        '\t\t<span class="green">尽情的释放高潮让你神清气爽。</span>\n'
        '\t\t<<lpain>><<ltrauma>><<lstress>>\n'
        '\t\t<<pain -5>><<trauma -50>><<stress -100>>\n'
        '\t\t<<hunterhotfluid 2>>\n'
        '\t\t<br>\n'
        '\t<</if>>')
    body = insert_before_line(body, '<<if !_noSlimes>>', block)
    assert body.count('<<hunterhotfluid 2>>') == 1
    return body


# ---------------------------------------------------------------- A1-5 内射惩罚

def gen_endcombat():
    body = widget_body(read(END), 'endcombat')
    # 任务 5：战斗结束前的「再来一发」快照。必须放在 widget 最开头——
    # 后面 <<unset $enemytype>> / <<endevent>> / <<set $combat to 0>> 会吃掉数据。
    snap_head = '<<widget "endcombat">>\n'
    assert body.count(snap_head) == 1, 'endcombat head anchor'
    snap = (
        '\t/* BJX 任务5：魅魔 6 级「再来一发」快照。*/\n'
        '\t/* 条件不看 $enemyhealth：真实"打赢"时它是 0（end.twee 用 lte 0 判胜利），\n'
        '\t   旧条件 gt 0 会让快照永不生成 → 入口彻底消失。改判敌人是否还在场上。*/\n'
        '\t<<if ($demon gte 6 or $demonhunter gte 2) and $pleaseagain isnot 1 and $enemyejaculated gte 1 and $NPCList and $NPCList.length gte 1>>\n'
        '\t\t<<set $bjxAgainNPC to clone($NPCList)>>\n'
        '\t\t<<set $bjxAgainNames to clone($npc ?? [])>>\n'
        '\t\t<<set $bjxAgainType to $enemytype>>\n'
        '\t\t<<set $bjxAgainNo to $enemynomax>>\n'
        '\t\t<<set $bjxAgainHP to Math.max(50, Math.round(($enemyhealthmax || 500) * 0.5))>>\n'
        '\t\t<<set $bjxAgainMax to $enemyarousalmax>>\n'
        '\t\t<<set $bjxAgainPassage to $passage>>\n'
        '\t\t/* 兜底落点：DOM 注入不再负责设置，失败也不会跳到 undefined */\n'
        '\t\t<<set $bjxAgainNext to "High Street">>\n'
        '\t\t<<set $bjxAgainOffer to 1>>\n'
        '\t<</if>>\n')
    body = body.replace(snap_head, snap_head + snap, 1)
    assert body.count('$bjxAgainOffer to 1') == 1
    # P2 摄魂之眼：每场一次的催眠标记在战斗结束时归零（BJX end.twee:300）
    reset_anchor = '\t<<set $angelforgive to 0>>\n'
    assert body.count(reset_anchor) == 1, 'endcombat angelforgive anchor'
    body = body.replace(reset_anchor,
                        reset_anchor + '\t<<set $demonhunterhypnosis to 0>>\n', 1)
    assert body.count('$demonhunterhypnosis to 0') == 1
    start = '\t<<if $demonabsorb gte 1 and !$stalk>>\n'
    assert body.count(start) == 1, 'endcombat demonabsorb block not unique'
    i = body.index(start)
    tail = ('\t\t<span class="lewd">You absorb the sexual essence. You feel soothed.</span>\n'
            '\t\t<<set $demonabsorb to 0>>\n'
            '\t\t<<traumaClamp>>\n'
            '\t\t<<set _br to true>>\n'
            '\t\t<br>\n'
            '\t<</if>>\n')
    j = body.index(tail, i)
    # 恢复逻辑统一抽到 <<bjxAbsorbHeal>>（与 internalejac 共用）；此处只留调用与换行。
    new = ('\t<<if $demonabsorb gte 1 and !$stalk>>\n'
           '\t\t/* BJX：被内射恢复状态（任何战斗都生效）。\n'
           '\t\t   恶魔 6 级 / 顶尖猎手 6 级按已积累的状态量回一口，逻辑在 bjxAbsorbHeal。 */\n'
           '\t\t<<bjxAbsorbHeal>>\n'
           '\t\t<<set _br to true>>\n'
           '\t\t<br>\n'
           '\t<</if>>\n')
    body = body[:i] + new + body[j + len(tail):]
    assert body.count('<<bjxAbsorbHeal>>') == 1
    assert '_bjxHeal' not in body, 'heal logic must live only in bjxAbsorbHeal'
    assert 'You absorb the sexual essence' not in body, 'fallback copy moved into bjxAbsorbHeal'

    # 任务5 补丁：「再来一发」入口必须写进 passage 正文。
    # 原来靠 inject_early 的 DOM 注入挂到 #passages 末尾，但 SugarCube 在
    # 同一轮还会重渲染，append 的节点被清掉 —— 玩家实测"完全没有实现"
    # （注入函数跑过、$bjxAgainNext 都写进去了，就是元素不存在）。
    tail_anchor = '\t<<if _br>>\n\t\t<br>\n\t<</if>>\n'
    assert body.count(tail_anchor) == 1, 'endcombat tail anchor'
    again_link = (
        '\t/* BJX 任务5：战后「再来一发」入口。写进正文，不依赖 DOM 注入。 */\n'
        '\t<<if ($bjxAgainOffer ?? 0) is 1>>\n'
        '\t\t<br><br>\n'
        '\t\t[[再来一发？|BJX Please Again]]\n'
        '\t\t<br>\n'
        '\t<</if>>\n')
    # 象牙项链：被幽灵代打到自控归零，战斗结束立刻让它在湖的那边「记住你」。
    # 具体剧情 passage 待定，这里先给反馈并把幽灵的追猎标记打开。
    # 调用方式照抄原版（ivory/main.twee:880）：endWraith + wraithPossess
    # 然后进 Wraith Snatched Intro。endcombat 已经在外面跑过，这里不能再调。
    possess_tail = (
        '\t/* BJX：象牙项链附身期间自控归零 —— 提前触发「被幽灵掳走」。 */\n'
        '\t<<if ($bjxPossessZero ?? 0) is 1>>\n'
        '\t\t<<set $bjxPossessZero to 0>>\n'
        '\t\t<br><br><span class="wraith">自控彻底崩溃的那一刻，你听见湖的方向传来一声低语。它来找你了。</span><br>\n'
        '\t\t<<link [[循着声音走去|Wraith Snatched Intro]]>><<endWraith>><<wraithPossess>><</link>>\n'
        '\t<</if>>\n')
    body = body.replace(tail_anchor, possess_tail + tail_anchor, 1)
    body = body.replace(tail_anchor, again_link + tail_anchor, 1)
    assert body.count('[[再来一发？|BJX Please Again]]') == 1
    assert body.count('bjxPossessZero') == 2   # <<if>> 判断 1 + <<set>> 清零 1
    return body


EMBRYO = ''':: BJX Embryo Absorb
<<set $outside to 0>><<effects>>
你把手按在小腹上。恶魔的体质开始工作——那团尚未成形的东西被当作养料，一点一点化开。
<br><br>
<<set _hits to 0>>
/* 0.5.12.13 的怀孕真相在 V.pregnancies[pregnancyId]（record.carrier/orifice/
   awareOfPregnancy），$sexStats.vagina.pregnancy 只是 0.4 兼容残留：往里塞
   fetus 不会让 playerIsPregnant() 变真。这里两套都清，老存档也不会漏。 */
<<set _pregs to (typeof window.getActivePregnancies === "function" ? window.getActivePregnancies("pc") : [])>>
<<if _pregs and _pregs.length gt 0>>
	<<for _p range _pregs>>
		<<run window.clearPregnancyRecord(_p.pregnancyId)>>
		<<set _hits += 1>>
	<</for>>
<</if>>
<<if $sexStats.vagina.pregnancy and ($sexStats.vagina.pregnancy.type or ($sexStats.vagina.pregnancy.fetus and $sexStats.vagina.pregnancy.fetus.length gt 0))>>
	<<set $sexStats.vagina.pregnancy.fetus to []>>
	<<set $sexStats.vagina.pregnancy.type to null>>
	<<set $sexStats.vagina.pregnancy.awareOf to null>>
	<<set $sexStats.vagina.pregnancy.awareOfMultiple to null>>
	<<set $sexStats.vagina.pregnancy.awareOfDetails to null>>
	<<set $sexStats.vagina.pregnancy.potentialFathers to []>>
	<<set $sexStats.vagina.pregnancy.timer to null>>
	<<set $sexStats.vagina.pregnancy.timerEnd to null>>
	<<set $sexStats.vagina.pregnancy.waterBreaking to false>>
	<<set $sexStats.vagina.pregnancy.waterBreakingTimer to null>>
	<<if $sexStats.vagina.pregnancy.motherStatus is 2>><<set $sexStats.vagina.pregnancy.motherStatus to 1>><</if>>
	<<set _hits += 1>>
<</if>>
<<if $sexStats.anus.pregnancy and ($sexStats.anus.pregnancy.type or ($sexStats.anus.pregnancy.fetus and $sexStats.anus.pregnancy.fetus.length gt 0))>>
	<<set $sexStats.anus.pregnancy.fetus to []>>
	<<set $sexStats.anus.pregnancy.type to null>>
	<<set $sexStats.anus.pregnancy.awareOf to null>>
	<<set $sexStats.anus.pregnancy.awareOfMultiple to null>>
	<<set $sexStats.anus.pregnancy.awareOfDetails to null>>
	<<set $sexStats.anus.pregnancy.potentialFathers to []>>
	<<set $sexStats.anus.pregnancy.timer to null>>
	<<set $sexStats.anus.pregnancy.timerEnd to null>>
	<<set $sexStats.anus.pregnancy.waterBreaking to false>>
	<<set $sexStats.anus.pregnancy.waterBreakingTimer to null>>
	<<if $sexStats.anus.pregnancy.motherStatus is 2>><<set $sexStats.anus.pregnancy.motherStatus to 1>><</if>>
	<<set _hits += 1>>
<</if>>
<<if _hits is 0>>
	你按了按小腹，那里什么也没有。
	<br><br>
	<<link [[离开|$bjxEmbryoReturn]]>><<endevent>><</link>>
<<else>>
	<<if typeof window.menstruationCycleState === "function">><<run window.menstruationCycleState()>><</if>>
	<<set $promiscuity to Math.min(100, ($promiscuity ?? 0) + 20)>>
	<<set $hunterbuild to Math.min(120, ($hunterbuild ?? 0) + 40)>>
	<<bjxHunterCheckRank>>
	<<set $bjxNoPregUntil to Time.date.timeStamp + 604800>>
	<<bjxHunterRestore>>
	<<if numberOfEarSlime()>>
		<<set $earSlime.corruption to Math.min(100, ($earSlime.corruption ?? 0) + 30)>>
		<br><span class="red">耳朵里的东西尝到了甜头，它兴奋地蠕动起来。</span>
	<</if>>
	<br><br>
	<<link [[离开|$bjxEmbryoReturn]]>><<endevent>><</link>>
<</if>>
'''


PLEASE_AGAIN = ''':: BJX Please Again
/* 不碰 $outside：独立页若清零会让玩家从室外被当成室内，返回后地点错乱。 */
<<set $bjxAgainOffer to 0>>
你还没有满足。对方已经瘫软，但恶魔的身体不肯放它走。
<br><br>
<<link [[再来一发|BJX Please Again Go]]>><</link>>
<br>
<<if $bjxAgainNext>><<link "算了" $bjxAgainNext>><</link>><<else>><<link "算了" "High Street">><</link>><</if>>
'''

PLEASE_AGAIN_GO = ''':: BJX Please Again Go
<<set $NPCList to clone($bjxAgainNPC)>>
<<set $npc to clone($bjxAgainNames)>>
<<set $enemytype to $bjxAgainType>>
<<set $enemynomax to $bjxAgainNo>>
<<set $enemyhealth to $bjxAgainHP>>
<<set $enemyarousalmax to $bjxAgainMax>>
<<set $enemyarousal to 0>>
<<set $enemyejaculated to 0>>
<<set $combat to 1>>
<<set $finish to 0>>
<<set $againfail to false>>
<<set $pleaseagain to 1>>
<<goto $bjxAgainPassage>>
'''


# ---------------------------------------------------------------- 野兽代词安全覆盖
# 0.5.12.13 原版 base-system/text.twee:653-850 的 b* 代词 widget 一律这么写：
#   <<set _na to $enemyno-1>>   ...   <<if $NPCList[_na].monster is "monster">>
# 当 $enemyno 为 0（_na=-1）或 $NPCList 为空时 $NPCList[_na] 是 undefined，
# 直接抛 TypeError: Cannot read properties of undefined (reading 'monster')。
# 更糟的是它会让**调用方 widget** 整段中断 —— 玩家 2026-10-23 在
# <<beastejaculation>> 里踩到，导致紧随其后的 $enemyejaculated += 1 没执行，
# 连「再来一发」的快照条件都永远不满足。
# 这里用同名 widget 覆盖原版（bjx-pack 在宿主之后加载），只加越界/空表保护，
# 性别判定语义与原版逐字一致。大写版本（bHe/bHis/...）内部调小写版，自动继承。
_SAFE_PRONOUN_SPECS = [
    # name, male, female, neuter, 是否需要 monster 判定（bboy 原版不判）
    ("bhe",      "he",      "she",      "it",     True),
    ("bhis",     "his",     "her",      "its",    True),
    ("bhers",    "his",     "hers",     "its",    True),
    ("bhim",     "him",     "her",      "it",     True),
    ("bhimself", "himself", "herself",  "itself", True),
    ("bhes",     "he's",    "she's",    "it's",   True),
    ("bboy",     "boy",     "girl",     "beast",  False),
]


def _safe_pronoun_widget(name, male, female, neuter, need_monster):
    head = (
        '\n<<widget "' + name + '">><<silently>>\n'
        '\t/* BJX: 越界/空 NPCList 保护（原版会抛 monster of undefined） */\n'
        '\t<<set _na to 0>>\n'
        '\t<<if typeof _args[0] is "number">>\n'
        '\t\t<<set _na to _args[0]>>\n'
        '\t<<elseif ($enemyno ?? 1) gte 1>>\n'
        '\t\t<<set _na to $enemyno - 1>>\n'
        '\t<</if>>\n'
        '\t<<if _na lt 0>><<set _na to 0>><</if>>\n'
        '\t<<set _bjxNpc to ($NPCList and $NPCList[_na]) ? $NPCList[_na] : null>>\n'
    )
    if need_monster:
        body = (
            '\t<<if _bjxNpc and _bjxNpc.monster is "monster">>\n'
            '\t\t<<if _bjxNpc.pronoun is "m">><<set _text_output to "' + male + '">>\n'
            '\t\t<<elseif _bjxNpc.pronoun is "f">><<set _text_output to "' + female + '">>\n'
            '\t\t<<else>><<set _text_output to "' + neuter + '">><</if>>\n'
            '\t<<else>><<set _text_output to "' + neuter + '">><</if>>\n'
        )
    else:
        body = (
            '\t<<if _bjxNpc and _bjxNpc.pronoun is "m">><<set _text_output to "' + male + '">>\n'
            '\t<<elseif _bjxNpc and _bjxNpc.pronoun is "f">><<set _text_output to "' + female + '">>\n'
            '\t<<else>><<set _text_output to "' + neuter + '">><</if>>\n'
        )
    tail = ('<</silently>><<print _text_output>><</widget>>\n'
            if name == "bboy" else '<</silently>>_text_output<</widget>>\n')
    return head + body + tail


SAFE_PRONOUNS = (':: Widgets Safe Beast Pronouns BJX [widget]\n'
                 + ''.join(_safe_pronoun_widget(*sp) for sp in _SAFE_PRONOUN_SPECS))


# ---------------------------------------------------------------- 完全转化 → 巨石呼唤
# 19 种动物变形任意一种练满，正文立刻补一句「森林里的巨石在吸引你」，并写进
# DoL 原生日志（$journalNotes 的「北极星记录」分页，零侵入，不碰 1819 行的
# journal widget）。用 $bjxTfSeen 去重，只在第一次达成时触发。
TF_FULL = [
    ("wolf",    "狼",   "$wolfgirl", 6),
    ("cat",     "猫",   "$cat",      10),
    ("cow",     "牛",   "$cow",      6),
    ("harpy",   "鸟",   "$harpy",    6),
    ("fox",     "狐",   "$fox",      6),
    ("raccoon", "浣熊", "$raccoon",  6),
    ("bee",     "蜜蜂", "$bee",      6),
    ("sheep",   "绵羊", "$sheep",    6),
    ("deer",    "鹿",   "$deer",     6),
    ("bear",    "熊",   "$bear",     6),
    ("dragon",  "龙",   "$dragon",   6),
    ("lizard",  "蜥蜴", "$lizard",   6),
    ("dolphin", "海豚", "$dolphin",  6),
    ("dog",     "狗",   "$dog",      6),
    ("fish",    "鱼",   "$fish",     6),
    ("horse",   "马",   "$horse",    6),
    ("spider",  "蜘蛛", "$spider",   6),
    ("pig",     "猪",   "$pig",      6),
    ("frog",    "青蛙", "$frog",     6),
]

_FULL_TF_CODE = ('\n:: BJX Full TF Watch [widget]\n\n'
                 '/* 写日志：追加到 DoL 日志「备忘」里的独立分页。 */\n'
                 '<<widget "bjxLog">>\n'
                 '\t<<set $journalNotes to ($journalNotes ?? {"default": ""})>>\n'
                 '\t<<if !$journalNotes["北极星记录"]>>\n'
                 '\t\t<<set $journalNotes["北极星记录"] to _args[0]>>\n'
                 '\t<<else>>\n'
                 '\t\t<<set $journalNotes["北极星记录"] to $journalNotes["北极星记录"] + "\\n" + _args[0]>>\n'
                 '\t<</if>>\n'
                 '\t<<set $options.notesAutoSave to true>>\n'
                 '<</widget>>\n\n'
                 '<<widget "bjxFullTfCheck">>\n'
                 '\t<<set $bjxTfSeen to ($bjxTfSeen ?? [])>>\n'
                 '\t<<set _new to []>>\n'
                 + ''.join('\t<<if %s gte %d and !$bjxTfSeen.includes("%s")>><<run $bjxTfSeen.pushUnique("%s")>><<run _new.push("%s")>><</if>>\n' % (v, c, k, k, cn)
                           for k, cn, v, c in TF_FULL)
                 + '\t<<if _new.length gt 0>>\n'
                 '\t\t<<set _names to _new.join("、")>>\n'
                 '\t\t<<set $bjxBoulderCall to 1>>\n'
                 '\t\t<<set _msg to "你获得了完全的「" + _names + "」形态。森林深处的那块巨石，好像有某种存在正在吸引你。">>\n'
                 '\t\t<<bjxLog _msg>>\n'
                 '\t\t<br><br><span class="gold">森林深处的那块巨石，好像有某种存在正在吸引你。</span>\n'
                 '\t<</if>>\n'
                 '<</widget>>\n')


# ---------------------------------------------------------------- 史莱姆加强（漏移植补回）
# 原版 BJX 在「被控制/附身」的挣扎判定里给史莱姆开了后门 —— 凡是有
#   currentSkillValue('physique') gte random(1, 48000)
# 的地方都追加 `or $slime gt 0 and $options.bjx_eventTF`，即史莱姆必挣脱。
# 移植到 0.5.12.13 时这条被漏掉了（pack 内 grep `or $slime` 零命中），
# 导致史莱姆只有外形没有收益。
POSSESSED_SRC = os.path.join(REF, 'base-combat', 'effects-disabled.twee')


def gen_slime_boost():
    src = read(POSSESSED_SRC)
    mark = ':: Widgets Effects Possessed [widget]'
    i = src.index(mark)
    j = src.find('\n:: ', i + len(mark))
    block = src[i:j] if j != -1 else src[i:]

    old = "<<if currentSkillValue('physique') gte random(1, 48000)>>"
    assert block.count(old) == 1, 'wrench anchor: %d' % block.count(old)
    new = ("/* BJX: 史莱姆体质可以随意变形，直接挣脱，不必掷骰。 */\n"
           "\t\t<<if currentSkillValue('physique') gte random(1, 48000) "
           "or $slime gt 0 and $options.bjx_eventTF>>")
    block = block.replace(old, new, 1)

    assert block.count('bjx') or True
    return block


# ---------------------------------------------------------------- 转化指南（游戏内查看）
# 玩家要「所有转化点数的获取方式」在游戏里能查，所以做成一个 passage，
# 从巨石页面挂链接进去。阈值取自各 xxxTransform 的满级档位。

# 博物馆：捐满 10 件后温特讲三神器（入口链接由 make_museum_mod.py 插入）
_RELIC_LORE = """

:: BJX Relic Lore
<<set $outside to 0>><<effects>>
"你捐的东西里，有三件跟别的不太一样。"温特把三张草图摊在桌上，手指依次点过。
<br><br>
"第一件，<b class=\"red\">恐惧铃铛</b>。某个已消失教团的法器。战斗中摇响它，能让对手心里发毛。"
<br><br>
"第二件，<b class=\"wraith\">象牙项链</b>。蓝宝石里封着东西。戴上它，在战斗里触摸宝石，会有一股意志替你动。"他抬眼看你，"代价是什么，你比我清楚。"
<br><br>
"第三件，<b class=\"yellow\">蘑菇神像</b>。雕的是某种真菌的拟人相。触碰它，你体内的孢子会活过来。"
<br><br>
"三件都在这一带的旧废墟里。"他收起草图，"沼泽、废弃掩体、湖底、还有那栋林间大宅，你迟早会撞见。"
<br><br>
<<set $bjxRelicLore to 1>>
<<bjxLog "温特告诉你三件古代遗物：恐惧铃铛（摇响令对手胆寒）、象牙项链（触摸后由封在宝石里的意志代你行动）、蘑菇神像（唤醒体内的孢子）。散落在沼泽、掩体、湖底与林间大宅一带。">>
<<link [[回去|Museum Look around]]>><</link>>
"""


_TF_GUIDE = """
:: BJX TF Guide
<<set $outside to 0>><<effects>>
<h3 class="gold">转化成长指南</h3>
每种动物形态都有一个隐藏的「build」值，靠与对应生物接触、穿戴对应部位、经历相关事件累积；
攒满即完全成形。下表是满级所需与主要来源。
<br><br>
<table>
<tr><th>形态</th><th>满级</th><th>主要来源</th></tr>
<tr><td>狼</td><td>30</td><td>森林狼群、狼耳/狼尾、与狼交配</td></tr>
<tr><td>猫</td><td>50</td><td>街头猫群、猫耳/猫尾、与猫交配</td></tr>
<tr><td>牛</td><td>30</td><td>农场牛棚、挤奶、与牛交配</td></tr>
<tr><td>鸟</td><td>30</td><td>鸟塔、鹰身女妖、飞行事件</td></tr>
<tr><td>狐</td><td>30</td><td>森林狐狸、狐耳/狐尾</td></tr>
<tr><td>浣熊</td><td>30</td><td>垃圾场浣熊</td></tr>
<tr><td>蜜蜂</td><td>30</td><td>蜂巢、蜜腺事件</td></tr>
<tr><td>绵羊</td><td>30</td><td>农场羊群</td></tr>
<tr><td>鹿</td><td>30</td><td>森林鹿群</td></tr>
<tr><td>熊</td><td>30</td><td>森林熊</td></tr>
<tr><td>龙</td><td>50</td><td>海岛龙事件（较稀有）</td></tr>
<tr><td>蜥蜴</td><td>30</td><td>地下 / 沼泽蜥蜴</td></tr>
<tr><td>海豚</td><td>30</td><td>海中遭遇</td></tr>
<tr><td>狗</td><td>30</td><td>街头流浪狗、项圈</td></tr>
<tr><td>鱼</td><td>30</td><td>水域事件</td></tr>
<tr><td>马</td><td>30</td><td>农场马厩</td></tr>
<tr><td>蜘蛛</td><td>30</td><td>地下蜘蛛巢</td></tr>
<tr><td>猪</td><td>30</td><td>农场猪圈</td></tr>
<tr><td>青蛙</td><td>30</td><td>沼泽 / 湖边</td></tr>
</table>
<br>
<h3 class="gold">三种特殊转化</h3>
这三种与动物线互斥，且各自没有 build 值，靠事件直接改变等级。
<br><br>
<table>
<tr><th>形态</th><th>怎么获得</th><th>进阶</th></tr>
<tr><td>蘑菇</td><td>森林深处的蘑菇圈进食</td><td>单一等级</td></tr>
<tr><td>史莱姆</td><td>老下水道事件；触手事件可升到紫色</td><td>绿色 1 → 紫色 2 → 纯净 3</td></tr>
<tr><td>幽灵</td><td>森林豪宅睡觉（10%，被驱魔过 15%）</td><td>人魂 1 → 冰霜 2 / 烈焰 3 / 深海 4（三选一）</td></tr>
</table>
<br>
<<link [[返回|Chimera Statue]]>><</link>>
<<link [[离开|Forest]]>><<set $eventskip to 1>><</link>>
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    parts = ['/* BJX-Pack: 恶魔猎手 / 魅魔机制（生成器 genparts/gen_hunter.py，勿手改） */\n']
    parts.append(':: Widgets Hunter Core BJX [widget]\n\n')
    parts.append(gen_internalejac() + '\n\n')
    parts.append(gen_orgasmcount() + '\n\n')
    parts.append(gen_controlloss() + '\n\n')
    parts.append(gen_willpowerorgasm() + '\n\n')
    parts.append(NEW_WIDGETS + '\n')
    parts.append(':: Widgets Hunter Combat BJX [widget]\n\n')
    parts.append(gen_setupmidorgasm() + '\n\n')
    parts.append(HUNTERHOTFLUID + '\n\n')
    parts.append(':: Widgets Hunter Orgasm BJX [widget]\n\n')
    parts.append(gen_orgasm() + '\n\n')
    parts.append(':: Widgets Hunter End BJX [widget]\n\n')
    parts.append(gen_endcombat() + '\n\n')
    parts.append(EMBRYO)
    parts.append('\n\n' + gen_speak())
    parts.append('\n\n' + gen_traits())
    parts.append('\n\n' + gen_creampie())
    parts.append('\n\n' + PLEASE_AGAIN)
    parts.append('\n\n' + PLEASE_AGAIN_GO)
    parts.append('\n\n' + SAFE_PRONOUNS)
    parts.append('\n' + _FULL_TF_CODE)
    parts.append('\n' + gen_slime_boost())
    parts.append('\n' + _TF_GUIDE)
    parts.append('\n' + _RELIC_LORE)

    out = ''.join(parts)
    # 硬断言：六个功能都在
    for token in ('<<bjxHunterGain 3>>', '<<bjxHunterGain 1>>', 'bjxHunterReduction()',
                  '$againfail', 'Math.max(1, $enemyhealth', 'BJX Embryo Absorb',
                  '你体内的变异体液微微发烫'):
        assert token in out, 'missing ' + token
    assert '<<hunterhotfluid 2>>' in out
    # 代词安全覆盖：7 个小写 widget 必须齐全，且带越界保护
    for _sp_name in ('bhe', 'bhis', 'bhers', 'bhim', 'bhimself', 'bhes', 'bboy'):
        assert '<<widget "%s">>' % _sp_name in out, 'missing safe pronoun ' + _sp_name
    assert out.count('<<set _bjxNpc to ($NPCList and $NPCList[_na]) ? $NPCList[_na] : null>>') == 7
    # 完全转化监控：19 种齐全 + 日志写入 + 巨石呼唤
    assert out.count('<<widget "bjxFullTfCheck">>') == 1
    assert out.count('<<widget "bjxLog">>') == 1
    for _k, _cn, _v, _c in TF_FULL:
        assert ('!$bjxTfSeen.includes("%s")' % _k) in out, _k
    assert '森林深处的那块巨石' in out
    # 史莱姆加强：挣脱手臂必成功
    assert out.count("or $slime gt 0 and $options.bjx_eventTF") == 1
    assert ':: Widgets Effects Possessed [widget]' in out
    # P2 摄魂之眼四件套
    for token in ('摄魂之眼', '_mouthaction["催眠"]', '$demonhunterhypnosis to 0',
                  'enemyoverarousal'):
        assert token in out, 'missing ' + token
    # 任务 1：吸收计数只在 creampie，恢复逻辑只在 bjxAbsorbHeal
    for token in ('<<bjxAbsorbHeal>>', ':: Widgets creampie [widget]'):
        assert token in out, 'missing ' + token
    assert out.count('$demonabsorb += 1') == 1, out.count('$demonabsorb += 1')
    # 任务 5：再来一发四件套
    for token in ('BJX Please Again', 'BJX Please Again Go',
                  '$bjxAgainOffer to 1', '$pleaseagain to 1', '$bjxAgainPassage'):
        assert token in out, 'missing ' + token
    p = os.path.join(OUT, OUT_NAME)
    open(p, 'w', encoding='utf-8', newline='\n').write(out)
    print('wrote %s (%d bytes, %d lines)' % (p, len(out.encode('utf-8')), out.count('\n') + 1))


if __name__ == '__main__':
    main()
