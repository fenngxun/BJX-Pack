"""Batch 3k: ghost energy combat (BJX spirit-form actions).

Ports BJX 0.4.3.3 base-combat/actionsGeneration.twee:1265-1315
(energyActions / energyActionInit) + energyActionEscape. The BJX UI
helpers (generateCombatAction / combatListColor) are part of BJX's
rewritten combat action framework which 0.5 does not share, so the
rendering uses 0.5's native <<radiobutton>> idiom (value-faithful -
this SugarCube build renders <<option>> with numeric index values,
verified in-engine, so listbox binding is not usable). The per-turn
effects consumer (effectsghost) already ships in bjx-tf-mushroom.twee.

energyActionEscape is generated for the stalk/swarm/vore escape
contexts; the swarm context is wired via gen_swarm.py (ghostescape
consumption lives in bjx-swarm-effects-hooks.twee).
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_energy')

TIERS = [
    (2, 'freeze', '死域霜寒'),
    (3, 'burn', '烈焰缠身'),
    (4, 'seasing', '海洋葬歌'),
]


def main():
    tier_radios = ''.join(
        '\t\t<<if $ghost is %d>><<radiobutton "$energyaction" "%s">>%s |<</if>>\n'
        % (g, val, label) for g, val, label in TIERS)

    init = '''<<widget "energyActionInit">>
\t<<if $options.bjx_eventTF and $ghost gte 1>>
\t\t<<if $energyaction is undefined>>
\t\t\t<<set $energyaction to "rest">>
\t\t<</if>>
\t\t<<if $energyaction is "rest">>
\t\t\t<span>你没有释放任何灵能。</span>
\t\t<<elseif $energyaction is "ghost">>
\t\t\t<span class="wraith">你的身躯处于灵体化。</span>
\t\t<<elseif $energyaction is "freeze">>
\t\t\t<span class="lblue">你的身躯散发着寒气。</span>
\t\t<<elseif $energyaction is "burn">>
\t\t\t<span class="orange">你的身躯缠绕着烈焰。</span>
\t\t<<elseif $energyaction is "seasing">>
\t\t\t<span class="blue">你吟唱着海洋的葬歌。</span>
\t\t<</if>>
\t\t<<radiobutton "$energyaction" "rest">>无 |
\t\t<<radiobutton "$energyaction" "ghost">>灵体化 |
''' + tier_radios + '''\t<</if>>
<</widget>>'''

    escape = '''<<widget "energyActionEscape">>
\t<<if $options.bjx_eventTF and $ghost gte 1>>
\t\t<<if $energyaction is undefined>>
\t\t\t<<set $energyaction to "rest">>
\t\t<</if>>
\t\t<<radiobutton "$energyaction" "rest">>无 |
\t\t<<radiobutton "$energyaction" "ghostescape">>灵体化逃脱
\t<</if>>
<</widget>>'''

    out = ('/* BJX pack: 灵体化能量动作（ghost 1+）。UI 用 0.5 原生 radiobutton\n'
           '   重写（BJX 的自建战斗 UI 框架 helper，0.5 无对应物；本构建的\n'
           '   listbox/option 把序号当值绑定，不可用）；每回合效果消费在\n'
           '   bjx-tf-mushroom.twee 的 effectsghost（耗能 100，逃脱 400/800）。 */\n'
           ':: BJX Energy Hooks [widget]\n'
           '\n'
           '/* 北极星模组 */\n'
           + init + '\n\n' + escape + '\n'
           '/* 北极星 */\n')

    assert out.count('<<widget "energyActionInit">>') == 1
    assert out.count('<<widget "energyActionEscape">>') == 1
    assert out.count('<<radiobutton "$energyaction"') == 7
    for _, val, _label in TIERS:
        assert '<<radiobutton "$energyaction" "%s">>' % val in out
    assert '<<radiobutton "$energyaction" "ghostescape">' in out

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'bjx-energy-hooks.twee'), 'w',
              encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('bjx-energy-hooks.twee: %d lines' % len(out.splitlines()))


if __name__ == '__main__':
    main()
