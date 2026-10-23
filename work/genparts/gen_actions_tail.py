"""Batch 3j: actions-tail (combat tail actions).

Ports BJX 0.4.3.3 base-combat/actions-tail-bjx.twee (tailshake /
tailspin / tailstab widgets) plus the tail slot plumbing:

  * tailActionInit / tailActions / tailactionDifficulty widgets
    (from BJX actionsGeneration.twee:1456+) - outer gate rewritten:
    `$hastail is "true"` relies on a BJX-only variable that tracks TF
    changes, so we derive the gate directly from the TF keys instead
    (dog / spider / bee tails). generateCombatAction call converted to
    the 0.5 two-arg signature (0.5 computes the colour internally).
  * actionsstab widget (BJX actions-text.twee:749, BJX-only flavour
    text; `personselect $feettarget` in the original is a bug - the
    stab target is $tailtarget, fixed here).
  * tail slot mount in actionsGeneration.twee (0.5 full text + 2
    patches: the action div after #feetaction, the safereplace line
    after #feetaction's - both wrapped in `<<if $options.bjx_animal>>`
    exactly like BJX did between feet and mouth).
  * tail resolution block in effects.twee (0.5 full text + 1 patch
    after the first "End of stalked actions" - the banner that follows
    matches BJX's insertion context). $corruption_slime gets a ?? 0
    guard (BJX-only variable).

Known limitation (deferred): tailspin writes the $cobweb counter, but
the enemy-side web restraint lives in BJX's init.twee/beast.twee
turn-render preemption chain, which is entangled with the whole BJX
energy-system enemy side (ghost immunity / freeze / burn / seasing)
and 0.5's new man-combat.twee architecture - that is a separate
batch. So tailspin currently spins silk and counts, without restraining.
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game', 'base-combat')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_tail')


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


# BJX actions-hands.twee:129-145 / 535-548. Offers three museum-relic
# actions while fighting; handlers live in the effects hooks below.
ANTIQUE_WIDGETS = """

/* 北极星模组 */
<<widget "leftantiques">>
	<<if $options.bjx_antiques>>
		<<if $consensual isnot 1 and ($museumAntiques.antiques.antiquebell is "found" or $museumAntiques.antiques.antiquebell is "take")>>
			<<set _leftaction["摇响恐惧铃铛"] to "antiquebell">>
		<</if>>
		<<if !$mushroomsatisfy and $museumAntiques.antiques.antiquemushroom is "found" or $museumAntiques.antiques.antiquemushroom is "take">>
			<<set _leftaction["抚摸蘑菇神像"] to "antiquemushroom">>
		<</if>>
		<<if $consensual isnot 1 and $worn.neck.name is "ivory necklace">>
			<<set _leftaction["触摸象牙项链"] to "antiqueivorynecklace">>
		<</if>>
	<</if>>
<</widget>>

<<widget "rightantiques">>
	<<if $options.bjx_antiques>>
		<<if $consensual isnot 1 and ($museumAntiques.antiques.antiquebell is "found" or $museumAntiques.antiques.antiquebell is "take")>>
			<<set _rightaction["摇响恐惧铃铛"] to "antiquebell">>
		<</if>>
		<<if !$mushroomsatisfy and $museumAntiques.antiques.antiquemushroom is "found" or $museumAntiques.antiques.antiquemushroom is "take">>
			<<set _rightaction["抚摸蘑菇神像"] to "antiquemushroom">>
		<</if>>
		<<if $consensual isnot 1 and $worn.neck.name is "ivory necklace">>
			<<set _rightaction["触摸象牙项链"] to "antiqueivorynecklace">>
		<</if>>
	<</if>>
<</widget>>
/* 北极星 */
"""

# BJX effects.twee:492-546 (the g* stat badges are dropped: 0.5 renders
# stat changes itself and the badge widgets are not ported).
ANTIQUE_EFFECTS = """
\t\t/* 北极星模组 */
\t\t<<if $leftaction is "antiquebell" or $rightaction is "antiquebell">>
\t\t\t<<if $leftaction is "antiquebell">>
\t\t\t\t<<set $leftaction to 0>><<set $leftactiondefault to "rest">>
\t\t\t<</if>>
\t\t\t<<if $rightaction is "antiquebell">>
\t\t\t\t<<set $rightaction to 0>><<set $rightactiondefault to "rest">>
\t\t\t<</if>>
\t\t\t你拿起恐惧铃铛，有规律地摇响，瞬间你心跳加速，莫大的恐惧席卷而来。
\t\t\t<br>
\t\t\t你强迫着自己继续摇动，天空撕裂开来，阴影延伸着，朝你和你的对手袭来。
\t\t\t<br>
\t\t\t没过多久，你的对手就仰面躺倒在地上，表情扭曲着，掐住了自己的脖子，艰难的喘着气。
\t\t\t<br>
\t\t\t<<set $enemyhealth to 0>>
\t\t\t<<set $finish to 1>>
\t\t\t<<willpowerdifficulty 1 900>>
\t\t\t<<if $willpowerSuccess>>
\t\t\t\t你深呼吸了几次，这只是幻觉而已，你安慰着自己。
\t\t\t\t<<willpower 5>><<trauma 500>><<set $stress += $stressmax / 5>>
\t\t\t\t<br>
\t\t\t<<else>>
\t\t\t\t阴影如仿若无物地穿过了你的双臂，但又实打实地扼住了你的咽喉。<span class="red">你喘不过气来了。</span>
\t\t\t\t<<control -100>><<trauma 500>><<set $stress += $stressmax>>
\t\t\t\t<br>
\t\t\t<</if>>
\t\t<</if>>

\t\t<<if $leftaction is "antiquemushroom" or $rightaction is "antiquemushroom">>
\t\t\t<<if $leftaction is "antiquemushroom">>
\t\t\t\t<<set $leftaction to 0>><<set $leftactiondefault to "rest">>
\t\t\t<</if>>
\t\t\t<<if $rightaction is "antiquemushroom">>
\t\t\t\t<<set $rightaction to 0>><<set $rightactiondefault to "rest">>
\t\t\t<</if>>
\t\t\t你拿出蘑菇神像，抚摸上面神秘的花纹，顿时蘑菇神像发出紫色的幽光。
\t\t\t<br>
\t\t\t紫色的幽光覆盖了对方，好像从对方身躯中抽出了什么，送入了你的体内。
\t\t\t<br>
\t\t\t<<set $arousal += $enemyarousal>>
\t\t\t<<set $enemyarousal to 0>>
\t\t\t对方打了个哆嗦，表情从沉醉转为冷静，<<if $consensual isnot 1>>又转而变得愤怒，<<set $enemyanger += 50>><</if>>"你，你对我做了什么？"
\t\t\t<br>
\t\t<</if>>

\t\t<<if $leftaction is "antiqueivorynecklace" or $rightaction is "antiqueivorynecklace">>
\t\t\t<<if $leftaction is "antiqueivorynecklace">>
\t\t\t\t<<set $leftaction to 0>><<set $leftactiondefault to "rest">>
\t\t\t<</if>>
\t\t\t<<if $rightaction is "antiqueivorynecklace">>
\t\t\t\t<<set $rightaction to 0>><<set $rightactiondefault to "rest">>
\t\t\t<</if>>
\t\t\t你触摸脖子上的象牙项链，瞬间项链上的蓝宝石发出光芒。
\t\t\t<br>
\t\t\t<span class='wraith'>一股意志降临，接管了你的身体。</span>
\t\t\t<br>
\t\t\t<<set $possessed to true>>
\t\t<</if>>
\t\t/* 北极星 */

"""

# BJX effects.twee:5103-5141 (dragon breath mouth effect).
DRAGON_EFFECT = """\t\t/* 北极星模组 */
\t\t<<if $mouthaction is "dragonBreath">>
\t\t\t<<set $mouthactiondefault to "dragonBreath">><<set $mouthaction to 0>>
\t\t\t<<set $enemyhealth -= 200>>
\t\t\t<<set _npctodefeat to []>>
\t\t\t<<for _npctodamage to 0; _npctodamage lt $enemynomax; _npctodamage++>>
\t\t\t\t<<if $NPCList[_npctodamage].active is "active" and $NPCList[_npctodamage].stance isnot "defeated" and (!$fightTargets or $fightTargets.includes(_npctodamage))>>
\t\t\t\t\t<<set _enemydivide to $fightTargets ? $enemyno-$fightTargets.length : $enemyno>>
\t\t\t\t\t<<set $NPCList[_npctodamage].health -= (200/_enemydivide)>>
\t\t\t\t\t<<if $enemyno gte 2 and $NPCList[_npctodamage].health lte 0>>
\t\t\t\t\t\t<<set _npctodefeat.push(_npctodamage)>>
\t\t\t\t\t<</if>>
\t\t\t\t<</if>>
\t\t\t<</for>>
\t\t\t<<for $_defeatcontroller to 0; $_defeatcontroller lt _npctodefeat.length; $_defeatcontroller++>>
\t\t\t\t<<if $enemyno gte 2>>
\t\t\t\t\t<<defeatnpc _npctodefeat[$_defeatcontroller]>>
\t\t\t\t<</if>>
\t\t\t<</for>>
\t\t\t<<if $dragonbreathuse is undefined>>
\t\t\t\t<<set $dragonbreathuse to 0>>
\t\t\t<</if>>
\t\t\t<<set $dragonbreathuse += 1>><<set $speechdragonbreath to 1>>
\t\t\t<<if $enemytype is "beast">>
\t\t\t\t<span class='gold'>你向着<<beasttype>>喷射龙息。它呜咽了起来。</span>
\t\t\t<<elseif $enemyno gte 2>>
\t\t\t\t<span class='gold'>你向着<<group>>喷射龙息。他们痛苦地后退。</span>
\t\t\t\t<<if !$npc.includes("Eden") and !$npc.includes("Morgan") and !$npc.includes("Kylar") and !$npc.includes("Ivory Wraith") and !$abomination>>
\t\t\t\t\t<<ggcrime "assault">><<crimeUp 500 "assault">>
\t\t\t\t<</if>>
\t\t\t<<else>>
\t\t\t\t<span class='gold'>你向着袭击者喷射龙息。<<He>>痛苦地后退。</span>
\t\t\t\t<<if !$npc.includes("Eden") and !$npc.includes("Morgan") and !$npc.includes("Kylar") and !$npc.includes("Ivory Wraith") and !$abomination>>
\t\t\t\t\t<<ggcrime "assault">><<crimeUp 500 "assault">>
\t\t\t\t<</if>>
\t\t\t<</if>>
\t\t<</if>>
\t\t/* 北极星 */

"""


def main():
    os.makedirs(OUT, exist_ok=True)

    # ---------- 1. bjx-actions-tail.twee (widgets) ----------
    widgets = ''':: Widgets Actions Tail [widget]
/* BJX actions-tail: tailshake / tailspin / tailstab + slot plumbing.
   Ported from 0.4.3.3 actions-tail-bjx.twee, actionsGeneration.twee
   (tailActionInit / tailActions / tailactionDifficulty) and
   actions-text.twee (actionsstab). Outer gate re-derived from TF keys
   because the BJX-only $hastail tracker is not ported. */

<<widget "tailActionInit">>
	<<if $options.bjx_animal and ($transformationParts.dog.tail is "default" or $transformationParts.spider.tail is "default" or $transformationParts.bee.tail is "default")>>
		<<if not $options.combatControls.includes("adio") and _targetnumber gt 1>>
			<<targetListBox "tail" _targetlistall>>
		<</if>>
		<<set _tailOptions to "free">>
		<span @class="($lastOptions.tail isnot _tailOptions ? 'gold':'')">你的尾巴是自由的。</span>
		<<if $options.combatControls.includes("adio") and _targetnumber gt 1>>
			<br>
			<<targetListBox "tail" _targetlistall>>
		<</if>>
		<<if _targetnumber is 1>>
			<<set $tailtarget to _firsttarget>>
		<</if>>
		<<if $lastOptions.tail isnot _tailOptions>>
			<<set _tailGold to true>>
		<</if>>
		<<if $_changetype isnot true>>
			<<tailActions>>
			<<if Object.keys(_tailaction).length gt 0>>
				<<if Object.values(_tailaction).includes($tailactiondefault) is false or _args[0] is true or $tailactiondefault is "rest">>
					<<set _defaultsCombatAction to "tailaction">>
					<<set _actionsSet = DefaultActions.get($defaultsCombatType, $defaultsType, _defaultsCombatAction)>>
					<<set _pass to false>>
					<<for _set to 0; _set lt $maxDefaultActionSets; _set++>>
						<<if Object.values(_tailaction).includes(_actionsSet[_set])>>
							<<set $tailactiondefault to clone(_actionsSet[_set])>>
							<<set _pass to true>>
							<<break>>
						<</if>>
					<</for>>
					<<if _pass is false>>
						<<set $tailactiondefault to Object.values(_tailaction)[0]>>
					<</if>>
				<</if>>
				<<set $tailaction to $tailactiondefault>>
				<<generateCombatAction _tailaction "tailaction">>
				<<if $options.combatControls.includes("ists")>>
					<div id="tailactionDifficulty">
						<<tailactionDifficulty>>
					</div>>
				<</if>>
			<</if>>
			<<set $lastOptions.tail to clone(_tailOptions)>>
		<</if>>
	<</if>>
<</widget>>

<<widget "tailactionDifficulty">>
	<<if _args[0] is undefined>>
		<<set _diffAction to $tailaction>>
	<<else>>
		<<set _diffAction to _args[0]>>
	<</if>>
<</widget>>

<<widget "tailActions">>
	<<set _tailaction to {}>>
	<<set _tailaction["休息"] to "rest">>
	<<if $NPCList[0].state isnot "stalk">>
		<<switch _tailOptions>>
			<<case "free">>
				<<if $options.bjx_animal and $transformationParts.dog.tail is "default">>
					<<tailshake>>
				<</if>>
				<<if $options.bjx_animal and $transformationParts.spider.tail is "default" and ($cobwebuse is undefined or $cobwebuse lte 5)>>
					<<tailspin>>
				<</if>>
				<<if $options.bjx_animal and $transformationParts.bee.tail is "default">>
					<<tailstab>>
				<</if>>
		<</switch>>
	<</if>>
<</widget>>

<<widget "tailshake">>
	<<if ($fightTargets is undefined or $fightTargets.includes($tailtarget))>>
		<<set _tailaction["摇尾巴"] to "tailshake">>
	<</if>>
<</widget>>

<<widget "tailspin">>
	<<if $consensual isnot 1 and ($fightTargets is undefined or $fightTargets.includes($tailtarget))>>
		<<set _tailaction["吐丝"] to "tailspin">>
	<</if>>
<</widget>>

<<widget "tailstab">>
	<<if $consensual isnot 1 and ($fightTargets is undefined or $fightTargets.includes($tailtarget))>>
		<<set _tailaction["刺击"] to "tailstab">>
	<</if>>
<</widget>>

<<widget "actionsstab">>
	<<if $enemytype is "beast">>
		<<if $pain lte 20>>
			你刺中了<<beasttype>>。
		<<elseif $pain lte 60>>
			你努力刺中了<<beasttype>>。
		<<else>>
			你拼命地刺向<<beasttype>>。
		<</if>>
	<<else>>
		<<if $leftarm is "grappled" or $rightarm is "grappled">>
			你挣扎着反抗攻击者的抓握，一边甩出尾刺，一边试图挣脱。
		<<else>>
			<<if $pain lte 20>>
				你不服气，尾巴狠狠地刺了过去。
			<<elseif $pain lte 60>>
				虽然受了伤，但你还是用尾巴刺击着对方。
			<<else>>
				绝望席卷了你，而你只能奋力挣扎。
			<</if>>
		<</if>>
	<</if>>
<</widget>>
'''
    # fix the deliberate typo guard: no nested <</div>> - sanity check tags
    assert widgets.count('<</widget>>') == 7, widgets.count('<</widget>>')
    widgets = widgets.replace('</div>>\n', '</div>\n')  # typo guard (no-op if clean)
    with open(os.path.join(OUT, 'bjx-actions-tail.twee'), 'w',
              encoding='utf-8', newline='') as f:
        f.write(widgets)
    print('bjx-actions-tail.twee: %d lines' % len(widgets.splitlines()))

    # ---------- 2. bjx-combat-actions-hooks.twee ----------
    ag = read(os.path.join(REF, 'actionsGeneration.twee'))
    # p1: mount the tail action div after the feet div (BJX inserted it
    # between feet and mouth, wrapped in the bjx_animal option check)
    p1_old = ('\t\t\t<div id="feetaction" @class="$options.combatControls + \'Control\'">\n'
              '\t\t\t\t<<feetActionInit>>\n'
              '\t\t\t</div>\n')
    p1_new = p1_old + (
        '\n'
        '\t\t\t/* 北极星模组 */\n'
        '\t\t\t<<if $options.bjx_animal>>\n'
        '\t\t\t\t<div id="tailaction" @class="$options.combatControls + \'Control\'">\n'
        '\t\t\t\t\t<<tailActionInit>>\n'
        '\t\t\t\t</div>\n'
        '\t\t\t<</if>>\n'
        '\t\t\t/* 北极星 */\n')
    assert ag.count(p1_old) == 1, 'p1 anchor: %d' % ag.count(p1_old)
    ag = ag.replace(p1_old, p1_new)

    # p2: safereplace line for the tail slot after feet's
    p2_old = '\t<<safereplace #feetaction>><<feetActionInit true>><</safereplace>>\n'
    p2_new = p2_old + (
        '\t<<if $options.bjx_animal>>\n'
        '\t\t<<safereplace #tailaction>><<tailActionInit true>><</safereplace>>\n'
        '\t<</if>>\n'
        '\t/* 北极星模组 */\n'
        '\t<<if $options.bjx_eventTF and $ghost gte 1>>\n'
        '\t\t<<safereplace #energyaction>><<energyActionInit true>><</safereplace>>\n'
        '\t<</if>>\n'
        '\t/* 北极星 */\n')
    assert ag.count(p2_old) == 1, 'p2 anchor: %d' % ag.count(p2_old)
    ag = ag.replace(p2_old, p2_new)

    # p2b: mount the energy action div before the action list container
    # (BJX renders it even during stalk - the ghost form escapes from
    # stalking - so it sits outside the !$stalk_end gate)
    p2b_old = '\t<<if !$stalk_end>>\n\t\t<div id="listContainer">\n'
    p2b_new = (
        '\t/* 北极星模组 */\n'
        '\t<<if $options.bjx_eventTF and $ghost gte 1>>\n'
        '\t\t<div id="energyaction" @class="$options.combatControls + \'Control\'">\n'
        '\t\t\t<<energyActionInit>>\n'
        '\t\t</div>\n'
        '\t<</if>>\n'
        '\t/* 北极星 */\n'
        + p2b_old)
    assert ag.count(p2b_old) == 1, 'p2b anchor: %d' % ag.count(p2b_old)
    ag = ag.replace(p2b_old, p2b_new)

    # p3: BJX antique combat actions (museum relics usable in a fight).
    # Offers come from leftantiques/rightantiques (appended below); the
    # gating flag $options.bjx_antiques is seeded true by inject_early.
    p3_old = '\t\t\t\t<<leftspraynew>>\n'
    assert ag.count(p3_old) == 1, 'p3 anchor: %d' % ag.count(p3_old)
    ag = ag.replace(p3_old, p3_old +
                    '\t\t\t\t/* 北极星模组 */\n'
                    '\t\t\t\t<<leftantiques>>\n'
                    '\t\t\t\t/* 北极星 */\n')
    p4_old = '\t\t\t\t<<rightspraynew>>\n'
    assert ag.count(p4_old) == 1, 'p4 anchor: %d' % ag.count(p4_old)
    ag = ag.replace(p4_old, p4_old +
                    '\t\t\t\t/* 北极星模组 */\n'
                    '\t\t\t\t<<rightantiques>>\n'
                    '\t\t\t\t/* 北极星 */\n')

    # p5: dragon breath mouth action (BJX speakActions, kept English to
    # match the rest of the 0.5 combat UI). Requires dragon TF stage 6.
    p5_old = ('\t\t\t<<case "free">>\n'
              '\t\t\t\t<<if $head isnot "grappled" and $head isnot "bound">>\n')
    assert ag.count(p5_old) == 1, 'p5 anchor: %d' % ag.count(p5_old)
    ag = ag.replace(p5_old,
                    '\t\t\t<<case "free">>\n'
                    '\t\t\t\t/* 北极星模组：龙息（BJX speakActions / actions-tf-bjx） */\n'
                    '\t\t\t\t<<if $options.bjx_animal and $dragon gte 6 and $consensual isnot 1'
                    ' and ($dragonbreathuse lt 5 or $dragonbreathuse is undefined)>>\n'
                    '\t\t\t\t\t<<set _mouthaction["Dragon breath"] to "dragonBreath">>\n'
                    '\t\t\t\t<</if>>\n'
                    '\t\t\t\t<<if $head isnot "grappled" and $head isnot "bound">>\n')

    # p7: 魅魔 / 龙 6 级的「续杯」脚部动作（BJX actionsGeneration.twee:1216）。
    # 敌人冲到高潮边缘（enemyarousal >= max）时，脚部动作列表里出现
    # 「再来一发」(pleaseagain) /「贪婪索取」(forceagain)，由玩家主动选择。
    p7_old = '\t\t<<set _feetaction["Rest"] to "rest">>\n'
    assert ag.count(p7_old) == 1, 'p7 anchor: %d' % ag.count(p7_old)
    p7_new = p7_old + (
        '\t\t/* 北极星模组：高潮边缘的续杯动作。\n'
        '\t\t   againfail 也要显示：setupMidOrgasm 已经把 arousal 压到 max-1，\n'
        '\t\t   否则下一次渲染条件不成立，动作只出现一回合，错过就彻底消失。\n'
        '\t\t   任务 5 起：走过战后独立页面流程（$pleaseagain=1）不再显示旧入口。 */\n'
        '\t\t<<if $options.bjx_divine and $demon gte 6 and $pleaseagain isnot 1 '
        'and ($enemyarousal gte $enemyarousalmax or $againfail)>>\n'
        '\t\t\t<<set _feetaction["再来一发"] to "pleaseagain">>\n'
        '\t\t<</if>>\n'
        '\t\t<<if $options.bjx_animal and $dragon gte 6 and $pleaseagain isnot 1 '
        'and ($enemyarousal gte $enemyarousalmax or $againfail)>>\n'
        '\t\t\t<<set _feetaction["贪婪索取"] to "forceagain">>\n'
        '\t\t<</if>>\n'
        '\t\t/* 北极星 */\n')
    ag = ag.replace(p7_old, p7_new)

    # p8: 续杯动作的难度标签（BJX actionsGeneration.twee:1196）
    p8_old = ('\t\t<<case "ambush">><<if $NPCList[0].state is "stalk">>'
              '<<stalk_skulduggery_difficulty>><</if>>\n')
    assert ag.count(p8_old) == 1, 'p8 anchor: %d' % ag.count(p8_old)
    p8_new = p8_old + (
        '\t\t/* 北极星模组 */\n'
        '\t\t<<case "pleaseagain">><span class="lewd">- 恶魔</span>\n'
        '\t\t<<case "forceagain">><span class="gold">- 龙</span>\n'
        '\t\t/* 北极星 */\n')
    ag = ag.replace(p8_old, p8_new)

    # p6: the two antique widgets, appended after the last vanilla widget
    ag += ANTIQUE_WIDGETS
    with open(os.path.join(OUT, 'bjx-combat-actions-hooks.twee'), 'w',
              encoding='utf-8', newline='') as f:
        f.write(ag)
    print('bjx-combat-actions-hooks.twee: %d lines, 9 patches' %
          len(ag.splitlines()))

    # ---------- 3. bjx-combat-effects-hooks.twee ----------
    ef = read(os.path.join(REF, 'effects.twee'))

    # p-e0: 摄魂之眼催眠结算（BJX effects.twee:3712-3725，P2 移植）。
    # 锚：forgive 块后、mock/disparage 块前（BJX 原版同位）。
    e0_old = ('\t\t<<if $mouthaction is "mock" or $mouthaction is "disparage">>\n')
    assert ef.count(e0_old) == 1, 'hypnosis anchor: %d' % ef.count(e0_old)
    e0_new = ('\t\t/* 北极星模组：摄魂之眼催眠结算（恶魔猎手 5 级，每场一次） */\n'
              '\t\t<<if $mouthaction is "hypnosis">>\n'
              '\t\t\t<<set $mouthaction to 0>><<set _sound to 1>>\n'
              '\t\t\t<<if $neckuse is "hand" and $oxygen lt $oxygenmax '
              'and $settings.asphyxiaLevel gte 2>>\n'
              '\t\t\t\t<<wheeze>>\n'
              '\t\t\t<<else>>\n'
              '\t\t\t\t<<set $mouthactiondefault to "rest">>\n'
              '\t\t\t\t<<set $demonhunterhypnosis to 1>>\n'
              '\t\t\t\t<<set $bjxHypnosisDay to Math.floor(Time.date.timeStamp / 86400)>>\n'
              '\t\t\t\t<<if $enemytype is "beast">>\n'
              '\t\t\t\t\t"乖乖<<beasttype>>，不准射射哦！"\n'
              '\t\t\t\t<<else>>\n'
              '\t\t\t\t\t"没有我的允许，你不许高潮哦！"\n'
              '\t\t\t\t<</if>>\n'
              '\t\t\t<</if>>\n'
              '\t\t<</if>>\n'
              '\t\t/* 北极星 */\n'
              '\n' + e0_old)
    ef = ef.replace(e0_old, e0_new)
    assert ef.count('$mouthaction is "hypnosis"') == 1

    # p-e1: the ghost energy per-turn effects (effectsghost ships in
    # bjx-tf-mushroom.twee) right after the possessed block, mirroring
    # BJX effects.twee:87-89. effectsoverarousal/effectspoison from BJX
    # are NOT inserted here (not ported).
    e1_old = '\t\t\t<<effectspossessed>>\n\t\t<</if>>\n'
    e1_new = (e1_old +
              '\n'
              '\t\t/* 北极星模组 */\n'
              '\t\t<<effectsghost>>\n'
              '\t\t/* 北极星 */\n')
    assert ef.count(e1_old) == 1, 'possessed anchor: %d' % ef.count(e1_old)
    ef = ef.replace(e1_old, e1_new)

    # anchor: the first "End of stalked actions" - uniquely identified by
    # the <<stalk_catch>> block right before it (the other two occurrences
    # sit after different code)
    anchor = ('\t\t\t\t<<stalk_catch>>\n'
              '\t\t\t<</if>>\n'
              '\t\t<</if>>\n'
              '\n'
              '\t\t/*End of stalked actions */\n')
    assert ef.count(anchor) == 1, 'effects anchor: %d' % ef.count(anchor)

    tail_block = (
        '\n'
        '\t\t/* 北极星模组：尾巴动作结算（bjx actions-tail） */\n'
        '\t\t<<if $options.bjx_animal>>\n'
        '\t\t\t<<if $tailaction is "rest">>\n'
        '\t\t\t\t<<set $tailaction to 0>><<set $tailactiondefault to "rest">>你的尾巴放松下来。\n'
        '\t\t\t<</if>>\n'
        '\t\t\t<<if $tailaction is "tailshake">>\n'
        '\t\t\t\t<<set $tailaction to 0>><<set $tailactiondefault to "tailshake">>\n'
        '\t\t\t\t你快速地摇动着尾巴，讨好着对方。\n'
        '\t\t\t\t<<meek 10>>\n'
        '\t\t\t\t<<if !$tailshaked and setup.NPCNameList.includes($NPCList[$tailtarget].fullDescription)>>\n'
        '\t\t\t\t\t<<npcincr $NPCList[$tailtarget].fullDescription love 2>>\n'
        '\t\t\t\t\t<<set $tailshaked to true>>\n'
        '\t\t\t\t\t你温顺的样子打动了对方，对方对你的<span class="green">好感提高了。</span>\n'
        '\t\t\t\t<</if>>\n'
        '\t\t\t<</if>>\n'
        '\t\t\t<<if $tailaction is "tailspin">>\n'
        '\t\t\t\t<<set $tailaction to 0>><<set $tailactiondefault to "tailspin">>\n'
        '\t\t\t\t你朝着对方吐出蜘蛛丝线，迅速织成一张蜘蛛网，将对方紧紧包裹住。\n'
        '\t\t\t\t<<set $cobweb = ($cobweb ? $cobweb + 1 : 1)>>\n'
        '\t\t\t\t<<set $cobwebuse = ($cobwebuse ? $cobwebuse + 1 : 1)>>\n'
        '\t\t\t<</if>>\n'
        '\t\t\t<<if $tailaction is "tailstab">>\n'
        '\t\t\t\t<<set $tailaction to 0>><<set $tailactiondefault to "tailstab">>\n'
        '\t\t\t\t<<if $parasite.left_ear.name is "slime" and random(1, 3) is 3 or $parasite.right_ear.name is "slime" and random(1, 3) is 3>>\n'
        '\t\t\t\t\t<<if ($corruption_slime ?? 0) gte (currentSkillValue(\'willpower\') / 10)>>\n'
        '\t\t\t\t\t\t你试着刺中<<if $enemytype is "beast">><<beasttype>>，<<else>><<personselect $tailtarget>><<person>>，<</if>>\n'
        '\t\t\t\t\t\t<span class="red">但史莱姆让你的尾巴动弹不得。</span>\n'
        '\t\t\t\t\t\t<<gwillpower>><<willpower 1>>\n'
        '\t\t\t\t\t<<else>>\n'
        '\t\t\t\t\t\t史莱姆试图固定你的尾巴，<span class="green">但你挣脱了它的控制。</span>\n'
        '\t\t\t\t\t\t<<actionsstab $tailtarget>><<defiance 5 $tailtarget>><<set $attackstat += 1>>\n'
        '\t\t\t\t\t\t<<set $NPCList[$tailtarget].poison += 3>>\n'
        '\t\t\t\t\t<</if>>\n'
        '\t\t\t\t<<else>>\n'
        '\t\t\t\t\t<<actionsstab $tailtarget>><<defiance 5 $tailtarget>><<set $attackstat += 1>>\n'
        '\t\t\t\t\t<<set $NPCList[$tailtarget].poison += 3>>\n'
        '\t\t\t\t<</if>>\n'
        '\t\t\t<</if>>\n'
        '\t\t<</if>>\n'
        '\t\t/* 北极星 */\n')
    ef = ef.replace(anchor, anchor + tail_block)

    # BJX antique combat effects: inserted right before the paired-hit
    # resolution, exactly where BJX puts them (effects.twee:492).
    anchor2 = ('\t\t<<if $leftaction is "lefthit" and $rightaction is "righthit"'
               ' and $lefttarget is $righttarget>>\n')
    assert ef.count(anchor2) == 1, 'antique effects anchor: %d' % ef.count(anchor2)
    ef = ef.replace(anchor2, ANTIQUE_EFFECTS + anchor2)

    # BJX dragon breath mouth effect: right before the mouth widget's
    # stalked-actions section (effects.twee:5103).
    anchor3 = ('\t\t/*Stalked actions */\n'
               '\t\t<<if !$stalk_end>>\n'
               '\t\t\t<<if $mouthaction is "up">>\n')
    assert ef.count(anchor3) == 1, 'dragon effects anchor: %d' % ef.count(anchor3)
    ef = ef.replace(anchor3, DRAGON_EFFECT + anchor3)

    # e2: 续杯动作结算（BJX effects.twee:2546-2598）。
    # 锚在脚部动作 "rest" 处理块之后、vanilla "kick" 块之前。
    e2_old = ('\t\t<<if $feetaction is "rest">>\n'
              '\t\t\t<<set $feetaction to 0>><<set $feetactiondefault to "rest">>\n'
              '\t\t\tYou rest your legs.\n'
              '\t\t<</if>>\n')
    assert ef.count(e2_old) == 1, 'e2 anchor: %d' % ef.count(e2_old)
    e2_new = e2_old + (
        '\n'
        '\t\t/* 北极星模组：续杯动作结算（魅魔 / 龙 6 级） */\n'
        '\t\t<<if $feetaction is "pleaseagain">>\n'
        '\t\t\t<<set $feetaction to 0>><<set $feetactiondefault to "rest">>\n'
        '\t\t\t/* 0.5 的 <<ejaculation>> 结尾自带 <<animateCombat>>，会与同页 actionsman\n'
        '\t\t\t   的第二次 animateCombat 撞 key "combatMain"（MultiCanvasModel already\n'
        '\t\t\t   exists）。临时关掉 combatImages 让其 exit，调完恢复。 */\n'
        '\t\t\t<<set $bjxCmbBak to $options.combatImages>><<set $options.combatImages to 0>>\n'
        '\t\t\t<<ejaculation>>\n'
        '\t\t\t<<set $options.combatImages to $bjxCmbBak>>\n'
        '\t\t\t<span class=\'lewd\'>"再来一次嘛~"你摆出一个诱人的姿势 : "人家还想要~"</span>\n'
        '\t\t\t<br>\n'
        '\t\t\t<<set $seductiondifficulty to (10000 - $enemyarousalmax * 10)>>\n'
        '\t\t\t<<seductionskilluse>>\n'
        '\t\t\t<<seductioncheck>>\n'
        '\t\t\t<br>\n'
        '\t\t\t<<if $enemyarousalmax gt 0 and $seductionrating gte $seductionrequired>>\n'
        '\t\t\t\t<span class=\'green\'>你的诱惑成功让对方再次提起了性致。</span>\n'
        '\t\t\t\t<br>\n'
        '\t\t\t\t<<set $againfail to false>>\n'
        '\t\t\t\t<<if !$options.bjx_endlessagain>>\n'
        '\t\t\t\t\t<<set $enemyarousalmax -= 200>>\n'
        '\t\t\t\t<</if>>\n'
        '\t\t\t\t<<set $enemyarousal to 0>>\n'
        '\t\t\t\t<<submission 10>>\n'
        '\t\t\t<<else>>\n'
        '\t\t\t\t<span class=\'red\'>任你百般诱惑，对方却再无法提起干劲了。</span>\n'
        '\t\t\t\t<br>\n'
        '\t\t\t\t<<set $againfail to true>>\n'
        '\t\t\t\t<<set $finish to 1>>\n'
        '\t\t\t\t<<set $enemyarousalmax to 0>>\n'
        '\t\t\t<</if>>\n'
        '\t\t<</if>>\n'
        '\n'
        '\t\t<<if $feetaction is "forceagain">>\n'
        '\t\t\t<<set $feetaction to 0>><<set $feetactiondefault to "rest">>\n'
        '\t\t\t<<set $bjxCmbBak to $options.combatImages>><<set $options.combatImages to 0>>\n'
        '\t\t\t<<ejaculation>>\n'
        '\t\t\t<<set $options.combatImages to $bjxCmbBak>>\n'
        '\t\t\t<span class=\'lewd\'>"还不够，还不够。"你用双腿牢牢地锁住对方 : "满足我，别想逃！"</span>\n'
        '\t\t\t<br>\n'
        '\t\t\t<<physiquedifficulty `$enemyhealth * 50 - $enemyarousalmax * 10` '
        '`$enemyhealth * 50 - $enemyarousalmax * 10`>>\n'
        '\t\t\t<br>\n'
        '\t\t\t<<if $enemyarousalmax gt 0 and $physiqueSuccess>>\n'
        '\t\t\t\t<span class=\'green\'>尽管不太情愿，对方还是在你的动作下有了感觉。</span>\n'
        '\t\t\t\t<br>\n'
        '\t\t\t\t<<set $againfail to false>>\n'
        '\t\t\t\t<<if !$options.bjx_endlessagain>>\n'
        '\t\t\t\t\t<<set $enemyarousalmax -= 200>>\n'
        '\t\t\t\t<</if>>\n'
        '\t\t\t\t<<set $enemyarousal to 0>>\n'
        '\t\t\t\t<<set $enemyhealth = $enemyhealthmax>>\n'
        '\t\t\t\t<<brat 10>>\n'
        '\t\t\t<<else>>\n'
        '\t\t\t\t<span class=\'red\'>被你的疯狂吓到，对方拼命挣脱了你的掌控逃跑了。</span>\n'
        '\t\t\t\t<br>\n'
        '\t\t\t\t<<set $againfail to true>>\n'
        '\t\t\t\t<<set $finish to 1>>\n'
        '\t\t\t\t<<set $enemyarousalmax to 0>>\n'
        '\t\t\t<</if>>\n'
        '\t\t<</if>>\n'
        '\t\t/* 北极星 */\n')
    ef = ef.replace(e2_old, e2_new)
    assert ef.count('pleaseagain') == 1 and ef.count('forceagain') == 1

    with open(os.path.join(OUT, 'bjx-combat-effects-hooks.twee'), 'w',
              encoding='utf-8', newline='') as f:
        f.write(ef)
    print('bjx-combat-effects-hooks.twee: %d lines, tail+antique+dragon+again inserted' %
          len(ef.splitlines()))


if __name__ == '__main__':
    main()