# -*- coding: utf-8 -*-
"""Olive 附身恢复清单补上 BJX 物种（real_xxx 真身机制的 0.5 收尾）。

背景
----
BJX 的 $real_* 真身快照在 0.5 里被原生的 freezePlayerStats/unfreezePlayerStats
取代（冻结整个 V，含全部 TF 状态与 transformationParts），schism 与 scarlet
两个场景因此天然覆盖。唯一的手工恢复点是 Olive 的 unbecomePinch——它按清单
逐个还原 $angel/$wolfgirl 等，0.5 只列了原生 8 种；不补的话，兽化状态在
"变回自己"后会丢（直到场景结束才被 pinchEnd 的全量解冻救回）。

补丁
----
special-olive.twee 的 unbecomePinch 内，`<<set $fox to $frozenValues.fox>>`
之后追加 14 条兽化线 + demonhunter + ghost/slime/mushroom 的还原行。
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game',
                   'overworld-town', 'loc-school')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_olive')

RESTORE = [
    'bee', 'sheep', 'deer', 'bear', 'raccoon', 'dragon', 'lizard', 'dolphin',
    'dog', 'fish', 'horse', 'spider', 'pig', 'frog',
]


def main():
    src = open(os.path.join(REF, 'special-olive.twee'),
               encoding='utf-8', newline='').read()

    anchor = '\t<<set $fox to $frozenValues.fox>>\n'
    assert src.count(anchor) == 1, 'anchor: %d' % src.count(anchor)

    lines = ['\t/* BJX pack: 兽化线状态也要在变回自己时还原（0.5 清单只列了原生 8 种） */\n']
    for sp in RESTORE:
        lines.append('\t<<set $%s to $frozenValues.%s>>\n' % (sp, sp))
    lines.append('\t<<set $demonhunter to $frozenValues.demonhunter>>\n')
    lines.append('\t<<set $ghost to $frozenValues.ghost>>\n')
    lines.append('\t<<set $slime to $frozenValues.slime>>\n')
    lines.append('\t<<set $mushroom to $frozenValues.mushroom>>\n')
    src = src.replace(anchor, anchor + ''.join(lines))

    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, 'bjx-olive-hooks.twee')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* BJX pack: vanilla 0.5 special-olive.twee + unbecomePinch '
                '恢复清单补全。 */\n' + src)

    text = open(out, encoding='utf-8').read()
    assert text.count('frozenValues.bee') == 1
    assert text.count('frozenValues.mushroom') == 1
    assert text.count('<<set $fox to $frozenValues.fox>>') == 1
    print('bjx-olive-hooks.twee: %d lines' % text.count('\n'))


if __name__ == '__main__':
    main()
