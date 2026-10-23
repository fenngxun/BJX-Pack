"""Batch 3l: swarm combat BJX additions (tail actions + ghost escape + TF drip).

0.5 ships the full swarm-encounter system natively (swarms.twee +
swarm-effects.twee), so unlike the other batches this is a full-file
re-declaration of the two 0.5 files with small BJX patches applied -
no widget-level 3-way merge needed because 0.5 rewrote swarmeffects
heavily and the BJX hunks re-anchor cleanly:

  * swarmactions: demonhunter orgasm-bypass on the action guard + the
    tail radio row (tailswarm / swim / swarmrest), mirroring the
    native feet row directly above it (radiobutton UI - native, no
    BJX combat-UI framework needed)
  * swarmeffects: ghostescape handling at the top (energy 800) + the
    tail resolution block after the native Legs section
  * swarms.twee: when the swarm orgasms on the PC it drips a matching
    TF build point (fish/eels -> fish, snakes -> lizard, spiders ->
    spider), gated on $options.bjx_animal

Deliberately NOT ported: BJX's tailActionInitSwarm / tailActionsSwarm /
generateCombatActionOthers div path - those depend on BJX's rewritten
combat UI framework (generateCombatActionOthers / combatListColor) which
0.5 does not share, and the native swarmactions radiobutton row covers
the same actions. energyActionEscape (bjx-energy-hooks.twee) is kept
for the swarm ghost escape; ghostescape consumption lives here.
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game', 'base-combat')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_swarm')


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def main():
    # ---------- 1. swarm-effects.twee ----------
    ef = read(os.path.join(REF, 'swarm-effects.twee'))

    # p1: demonhunter orgasm-bypass on the swarmactions guard (BJX keeps
    # acting through the post-orgasm window at hunter 6)
    p1_old = ('$orgasmdown lte 0 and ($pain lt 100 or $willpowerpain is undefined)'
              ' and $options.combatControls is "disabled"')
    assert ef.count(p1_old) == 1, 'p1 anchor: %d' % ef.count(p1_old)
    ef = ef.replace(p1_old,
                    '($orgasmdown lte 0 or $demonhunter gte 6) and ($pain lt 100 or '
                    '$willpowerpain is undefined) and $options.combatControls is "disabled"')

    # p2: tail radio row after the native feet row (same shape: swarm assist,
    # swim away, rest). "$swarm[\"steady\"]" string substitution needs the
    # swarmName helper for the label like the feet row does.
    p2_old = ('\t\t\t<<if $vorecreature is 0>>\n'
              '\t\t\t\t<label>Rest <<radiobutton "$feetaction" "swarmrest">></label> |\n'
              '\t\t\t<</if>>\n'
              '\n'
              '\t\t<</if>>\n'
              '\t\t<br><br>\n'
              '\t<</if>>\n')
    assert ef.count(p2_old) == 1, 'p2 anchor: %d' % ef.count(p2_old)
    p2_new = ('''\t\t\t<<if $vorecreature is 0>>
\t\t\t\t<label>Rest <<radiobutton "$feetaction" "swarmrest">></label> |
\t\t\t<</if>>

\t\t<</if>>
\t\t<br><br>

\t\t/* 北极星模组 */
\t\t<<if $hastail is "true" and $options.bjx_animal and $tailuse is 0>>
\t\t\t你的尾巴自由了。
\t\t\t<br>
\t\t\t<<if $swarm.amount.active[2] gte 1 and $thicktail is "true">>
\t\t\t\t<label>_swarmstead<<swarmName>>中的一只 <<radiobutton "$tailaction" "tailswarm" checked>></label> |
\t\t\t<</if>>

\t\t\t<<if $water is 1 and $vorecreature is 0 and $consensual isnot 1 and $swimtail is "true">>
\t\t\t\t<label><span class="teal">游至安全的地方</span><<radiobutton "$tailaction" "swim" checked>></label> |
\t\t\t<</if>>

\t\t\t<<if $vorecreature is 0>>
\t\t\t\t<label>休息<<radiobutton "$tailaction" "swarmrest">></label> |
\t\t\t<</if>>
\t\t\t<br><br>
\t\t<</if>>
\t\t/* 北极星 */
\t<</if>>
''')
    ef = ef.replace(p2_old, p2_new)

    # p3: ghost escape consumed at the top of swarmeffects (BJX puts it
    # near the top, before any action resolution)
    p3_old = ('<<widget "swarmeffects">>\n'
              '\t<<effectspain>>\n'
              '\t<<effectsorgasm>>\n'
              '\t<<effectsdissociation>>\n')
    assert ef.count(p3_old) == 1, 'p3 anchor: %d' % ef.count(p3_old)
    p3_new = ('''<<widget "swarmeffects">>
\t<<effectspain>>
\t<<effectsorgasm>>
\t<<effectsdissociation>>

\t/* 北极星模组 */
\t<<if $energyaction is "ghostescape">>
\t\t<<set $energyaction to "rest">>
\t\t<<if $energy gte 800>>
\t\t\t<<set $energy -= 800>>
\t\t\t<<set $swimdistance to 0>>
\t\t\t<span class="wraith">你全力催动灵能，使自己灵体化，逃脱出来。</span>
\t\t<<else>>
\t\t\t<span class="red">你的能量不足，无法灵体化逃脱。</span>
\t\t<</if>>
\t<</if>>
\t/* 北极星 */
''')
    ef = ef.replace(p3_old, p3_new)

    # p4: tail resolution after the native Legs section
    # 0.5.12.13 起这段合并成「手臂+腿一起休息」（旧版是单独的 feet 休息），
    # 锚点跟着换成新版文本。
    br_line = ('\t\t<<set _br to true>>\n'
               if '\t\t<<set _br to true>>\n' in ef else '')
    p4_old = ('\t<<if $leftaction is "swarmrest" and $rightaction is "swarmrest" '
              'and $feetaction is "swarmrest">>\n'
              '\t\t<<set $leftactiondefault to $leftaction>>\n'
              '\t\t<<set $rightactiondefault to $rightaction>>\n'
              '\t\t<<set $feetactiondefault to $feetaction>>\n'
              '\t\t<<set $leftaction to 0>>\n'
              + br_line
              + '\t\t<<set $rightaction to 0>>\n'
              '\t\t<<set $feetaction to 0>>\n'
              '\t\tYou rest your arms and legs.\n'
              '\t<</if>>\n')
    assert ef.count(p4_old) == 1, 'p4 anchor: %d' % ef.count(p4_old)
    p4_new = p4_old + '''
	/* 北极星模组：尾巴 */
	<<if $options.bjx_animal>>
		<<if $tailaction is "tailswarm">><<set $tailaction to 0>>
			<<set $swarm.amount.active[2] -= 1>><<set $swarm.amount.active[3] += 1>>
			<span class="lblue">你用尾巴$swarm["steady"]了<<swarmName>>中的一只。</span>
		<</if>>

		<<if $tailaction is "swim">><<set $tailaction to 0>><<set $swimdistance -= 1>>
			你摇动着尾巴，朝着安全的地方前进。
		<</if>>

		<<if $hastail is "true" and $tailaction is "swarmrest">><<set $tailaction to 0>>
			你放松你的尾巴。
		<</if>>
	<</if>>
	/* 北极星 */
'''
    ef = ef.replace(p4_old, p4_new)

    assert ef.count('tailswarm') == 2          # radios + resolution
    assert ef.count('ghostescape') == 1
    assert ef.count('北极星模组') == 3
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'bjx-swarm-effects-hooks.twee'), 'w',
              encoding='utf-8', newline='\n') as f:
        f.write('/* BJX pack: 0.5 虫群战斗全文重声明 + BJX 增量（尾巴动作行/灵体化逃脱/\n'
                '   恶魔猎手忍过高潮窗口）。动作行沿用 0.5 原生 radiobutton UI。 */\n' + ef)
    print('bjx-swarm-effects-hooks.twee: %d lines, 4 patches' % len(ef.splitlines()))

    # ---------- 2. swarms.twee ----------
    sw = read(os.path.join(REF, 'swarms.twee'))
    p5_old = '\t\t\t<<orgasm>>\n\t\t<</if>>\n'
    assert sw.count(p5_old) == 1, 'p5 anchor: %d' % sw.count(p5_old)
    p5_new = ('''\t\t\t<<orgasm>>
\t\t\t/* 北极星模组 */
\t\t\t<<if $options.bjx_animal>>
\t\t\t\t<<if ["fish", "eels"].includes($swarm.type)>>
\t\t\t\t\t<<transform fish 1>>
\t\t\t\t<</if>>
\t\t\t\t<<if $swarm.type is "snakes">>
\t\t\t\t\t<<transform lizard 1>>
\t\t\t\t<</if>>
\t\t\t\t<<if $swarm.type is "spiders">>
\t\t\t\t\t<<transform spider 1>>
\t\t\t\t<</if>>
\t\t\t<</if>>
\t\t\t/* 北极星 */
\t\t<</if>>
''')
    sw = sw.replace(p5_old, p5_new)
    assert sw.count('北极星模组') == 1
    assert '<<transform fish 1>>' in sw and '<<transform spider 1>>' in sw
    with open(os.path.join(OUT, 'bjx-swarms-hooks.twee'), 'w',
              encoding='utf-8', newline='\n') as f:
        f.write('/* BJX pack: 0.5 虫群系统全文重声明 + BJX 增量（虫群高潮时滴落\n'
                '   对应兽化 build：鱼/鳗→鱼化，蛇→蜥蜴化，蜘蛛→蜘蛛化）。 */\n' + sw)
    print('bjx-swarms-hooks.twee: %d lines, 1 patch' % len(sw.splitlines()))


if __name__ == '__main__':
    main()
