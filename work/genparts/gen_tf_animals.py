# -*- coding: utf-8 -*-
"""变形系统：15 条兽化线（BJX 0.4.3.3 -> DoL 0.5.10.12 ModLoader pack）。

背景
----
0.5 原生只有 5 条动物线（wolf/cat/cow/bird/fox）+ 4 条神圣线；BJX 额外做了
15 条兽化线。pack 此前只把 `transform`（build 累积）扩成了 15 种，没有
`xxxTransform`（部件落地）、没有衰减、没有形态文本 —— 结果是 build 涨了
但角色毫无变化。本脚本补上这一整条链路。

产出（写到本脚本同目录 _verify_tf/，由 build_pack.py 复制进 tweeFileList）
------------------------------------------------------------------------
1. bjx-tf-animals.twee
   :: BJX TF Animals [widget]
       15 个 xxxTransform（BJX 原文，仅做 0.5 变量翻译）
       toggleTransform（BJX 原文；`$wolf` -> 0.5 的 `$wolfgirl`）
       clearcheeks / clearears / cleareyes / clearhorns / cleartail /
       clearwings / clearhalo（BJX widgets.twee:5418-5500，0.5 无对应宏）
   :: BJX TF Descriptions [widget]
       11 个形态文本 widget（bee/deer/bear/sheep/fish/horse/spider/frog/
       pig/dolphin/dog）；raccoon/dragon 已由 bjx-special-robin-events.twee
       与 bjx-tentacle-hooks.twee 提供，不重复定义。

2. bjx-tf-core-hooks.twee
   transformationStateUpdate    = 0.5 原文 + 15 条兽化 build 衰减
                                  + 扩展后的 $physicalTransform 判定
   transformationAlteration     = 0.5 原文 + 15 条兽化部件落地
   clearAnimalTransformations   = 0.5 原文 + 15 个 xxxTransform 99

变量翻译（HANDOFF §4.2）
------------------------
  $transformdisable is "f"        -> $settings.transformAnimalEnabled
  $transformdisabledivine is "f"  -> $settings.transformDivineEnabled
  $statdisable is "f"             -> !$settings.blindStatsEnabled
  $wolf（BJX 状态变量）           -> $wolfgirl（0.5 同名语义）

依赖的 BJX 独有变量（inject_early.js 已补种/本组新增）
  $Xbuild / $X（X = 15 种）、$hastail / $thintail / $thicktail / $swimtail
  $countTransform（toggleTransform 每次重算）
"""

import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_tf')

# (state var, build var, widget prefix, parts) - parts mirror the BJX
# setupTransformationPiecesObject literal (transformations.twee:19-35).
SPECIES = [
    ('raccoon', 'raccoonbuild', ['mask', 'ears', 'tail']),
    ('bee',     'beebuild',     ['ears', 'tail', 'wings']),
    ('sheep',   'sheepbuild',   ['ears', 'tail', 'horns']),
    ('deer',    'deerbuild',    ['ears', 'tail', 'horns']),
    ('bear',    'bearbuild',    ['ears', 'tail']),
    ('dragon',  'dragonbuild',  ['tail', 'wings', 'eyes', 'horns', 'claws']),
    ('lizard',  'lizardbuild',  ['horns', 'tail', 'eyes']),
    ('dolphin', 'dolphinbuild', ['tail']),
    ('dog',     'dogbuild',     ['ears', 'tail']),
    ('fish',    'fishbuild',    ['fins', 'tail']),
    ('horse',   'horsebuild',   ['ears', 'tail']),
    ('spider',  'spiderbuild',  ['eyes', 'tail']),
    ('pig',     'pigbuild',     ['ears', 'tail']),
    ('frog',    'frogbuild',    ['eyes', 'cheeks']),
]

# traits added by BJX (setupTransformationPiecesObject, $.extend line).
BJX_TRAITS = ['lungs', 'incognito', 'aquatic', 'vigorous', 'webbedfeet',
              'kicks', 'longtongue', 'strongnose', 'bearbuild']


def read(path):
    return open(path, encoding='utf-8', newline='').read()


def write(name, text):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('%s: %d lines' % (name, text.count('\n')))


def widget_block(text, name):
    """Return the full <<widget "name">> ... <</widget>> block."""
    start = text.find('<<widget "%s">>' % name)
    assert start >= 0, 'widget not found: ' + name
    end = text.find('<</widget>>', start)
    assert end >= 0, 'widget end not found: ' + name
    return text[start:end + len('<</widget>>')]


def passages(text):
    return re.findall(r'^:: (.+)$', text, re.M)


def translate_05(txt):
    """0.4.3.3 -> 0.5 variable/setting translations (HANDOFF §4.2)."""
    txt = txt.replace('$transformdisable is "f"',
                      '$settings.transformAnimalEnabled')
    txt = txt.replace('$transformdisable is "t"',
                      '!$settings.transformAnimalEnabled')
    txt = txt.replace('$transformdisabledivine is "f"',
                      '$settings.transformDivineEnabled')
    txt = txt.replace('$statdisable is "f"', '!$settings.blindStatsEnabled')
    # 0.4.3.3 SugarCube exposed widget arguments as $args; 0.5 uses _args.
    # dragonTransform / lizardTransform still read $args[0] (two sites).
    txt = txt.replace('$args[', '_args[')
    return txt


# ---------------------------------------------------------------- part 1

def gen_animals():
    """15 个 xxxTransform + toggleTransform + clear* + 11 个形态文本。"""
    src = read(os.path.join(BJX, 'base-system', 'transformations.twee'))
    blocks = []
    for state, build, parts in SPECIES:
        name = state + 'Transform'
        blk = widget_block(src, name)
        blk = translate_05(blk)
        # every widget must guard on the 0.5 settings flag, never the
        # 0.4.3.3 $transformdisable story variable
        assert '$transformdisable' not in blk, name
        blocks.append(blk)

    toggle = widget_block(src, 'toggleTransform')
    # 0.5 renamed the wolf state variable ($wolf -> $wolfgirl); $wolfbuild
    # must stay untouched.
    toggle = re.sub(r'\$wolf\b(?!build)', '$wolfgirl', toggle)
    toggle = translate_05(toggle)
    # BJX pack: dragon-line unlock detector, appended at the end of
    # toggleTransform (which runs after every TF state change, including
    # the cheat-panel full-apply path). A non-dragon species at state 6 or
    # with build 100 opens the dragon line; $bjx_dragonUnlock persists.
    # Migration: saves that already carry dragon TF (V.dragon >= 1) unlock
    # immediately so the gate never retro-locks them.
    toggle = toggle.replace(
        '<</widget>>',
        '\t/* BJX pack: 龙化前置——曾完整变身过其他生物（状态 6 或 build 100）即解锁；\n'
        '\t   已有龙化状态的老存档直接解锁（迁移规则） */\n'
        '\t<<if !$bjx_dragonUnlock>>\n'
        '\t\t<<run (function(){ if (V.bjx_dragonUnlock) { return; }'
        ' if ((V.dragon ?? 0) >= 1) { V.bjx_dragonUnlock = true; return; }'
        ' var st = ["wolfgirl","cat","cow","harpy","fox","raccoon","bee","sheep",'
        '"deer","bear","lizard","dolphin","dog","fish","horse","spider","pig","frog"];'
        ' var bd = ["wolf","cat","cow","bird","fox","hunter","bee","sheep","deer",'
        '"bear","lizard","dolphin","dog","fish","horse","spider","pig","frog"];'
        ' var i; for (i = 0; i < st.length; i++) { if ((V[st[i]] ?? 0) >= 6)'
        ' { V.bjx_dragonUnlock = true; return; } }'
        ' for (i = 0; i < bd.length; i++) { if ((V[bd[i] + "build"] ?? 0) >= 100)'
        ' { V.bjx_dragonUnlock = true; return; } } })();>>\n'
        '\t<</if>>\n'
        '<</widget>>', 1)
    assert 'bjx_dragonUnlock' in toggle

    # shared unlock hook for the no-arg (cheat panel / test) full-transform
    # branch: it sets build 100 AFTER toggleTransform ran, so it reports
    # completion itself; dragon's own full apply does not self-unlock
    fulltf_widget = ('<<widget "bjxFullTfDone">>\n'
                     '\t<<if _args[0] isnot "dragon">>\n'
                     '\t\t<<set $bjx_dragonUnlock to true>>\n'
                     '\t<</if>>\n'
                     '<</widget>>')

    wsrc = read(os.path.join(BJX, 'base-system', 'widgets.twee'))
    clears = []
    for c in ('clearcheeks', 'clearears', 'cleareyes', 'clearhorns',
              'cleartail', 'clearwings', 'clearhalo'):
        clears.append(widget_block(wsrc, c))

    tsrc = read(os.path.join(BJX, 'base-system', 'text.twee'))
    # raccoon / dragon already ship in bjx-special-robin-events.twee and
    # bjx-tentacle-hooks.twee; redefining them here would be a silent
    # last-loaded-wins coin flip.
    desc_names = ['bee', 'deer', 'bear', 'sheep', 'fish', 'horse',
                  'spider', 'frog', 'pig', 'dolphin', 'dog']
    descs = []
    for n in desc_names:
        blk = widget_block(tsrc, n)
        descs.append(translate_05(blk))

    head = ('/* BJX pack: 变形系统 15 条兽化线（BJX transformations.twee /\n'
            '   widgets.twee / text.twee）。0.5 原生 5 条动物线不受影响：\n'
            '   核心骨架（衰减/落地/清理）在 bjx-tf-core-hooks.twee。 */\n'
            ':: BJX TF Animals [widget]\n\n')
    out = head + '\n\n'.join(blocks + [toggle] + clears + [fulltf_widget]) + '\n\n'
    # the no-arg full-transform branches set build 100 after toggleTransform;
    # hook the shared unlock right after each of those lines (dragon's own
    # full apply is refused inside bjxFullTfDone)
    out = re.sub(r'(<<set \$(\w+)build to 100>>)',
                 lambda m: m.group(1) + '<<bjxFullTfDone "%s">>' % m.group(2)
                 if m.group(2) != 'dragon' else m.group(1),
                 out)
    out += ('/* 形态文本：角色描述里的「| 蜜蜂」等；raccoon/dragon 由其它\n'
            '   pack 文件提供，此处不重复定义。 */\n'
            ':: BJX TF Descriptions [widget]\n\n')
    out += '\n\n'.join(descs) + '\n'

    ps = passages(out)
    assert ps == ['BJX TF Animals [widget]', 'BJX TF Descriptions [widget]'], ps
    for state, _, _ in SPECIES:
        assert ('widget "%sTransform"' % state) in out, state
    assert 'widget "toggleTransform"' in out
    assert out.count('<<widget "raccoon">>') == 0
    assert out.count('<<widget "dragon">>') == 0
    write('bjx-tf-animals.twee', out)


# ---------------------------------------------------------------- part 2

def gen_core():
    """0.5 原文 + BJX 兽化线的衰减 / 落地 / 清理。"""
    ref = read(os.path.join(REF, 'base-system', 'transformations.twee'))

    su = widget_block(ref, 'transformationStateUpdate')
    al = widget_block(ref, 'transformationAlteration')
    ca = widget_block(ref, 'clearAnimalTransformations')

    # (a) stateUpdate: call toggleTransform first (it recomputes
    # $countTransform / $physicalTransform / $eventTransform), then decay
    # every BJX build just before the alteration pass.
    su = su.replace('<<widget "transformationStateUpdate">>\n',
                    '<<widget "transformationStateUpdate">>\n'
                    '\t<<toggleTransform>>\n', 1)

    decay = ['\t/* BJX pack: 15 条兽化线的 build 衰减（0.5 原生 5 条仍走上方'
             '的领圈/怀孕守卫）。$countTransform 由 toggleTransform 每次重算，'
             '缺省 1。 */']
    for state, build, _ in SPECIES:
        decay.append('\t<<if $%s gte 1 and playerNormalPregnancyType() isnot "%s">>'
                     % (build, state))
        decay.append('\t\t<<transform %s `-($countTransform ?? 1)`>>' % state)
        decay.append('\t<</if>>')
    decay = '\n'.join(decay) + '\n\n\t'
    assert su.count('\t<<transformationAlteration>>') == 1
    su = su.replace('\t<<transformationAlteration>>',
                    decay + '<<transformationAlteration>>')

    # (b) stateUpdate: $physicalTransform must also count the new species,
    # otherwise transformationAlteration's "manifested" branch never runs.
    old_phys = ('\t<<if $cat gt 0 or $wolfgirl gt 0 or $cow gt 0 or '
                '$harpy gt 0 or $fox gt 0>>\n'
                '\t\t<<set $physicalTransform to 1>>\n'
                '\t<<else>>\n'
                '\t\t<<set $physicalTransform to 0>>\n'
                '\t<</if>>')
    assert su.count(old_phys) == 1, 'physicalTransform block changed in 0.5'
    new_phys = ('\t<<if $cat gt 0 or $wolfgirl gt 0 or $cow gt 0 or '
                '$harpy gt 0 or $fox gt 0'
                + ''.join(' or $%s gt 0' % s for s, _, _ in SPECIES)
                + '>>\n'
                '\t\t<<set $physicalTransform to 1>>\n'
                '\t<<else>>\n'
                '\t\t<<set $physicalTransform to 0>>\n'
                '\t<</if>>')
    su = su.replace(old_phys, new_phys)

    # (c) alteration: 0.5 keeps its single-active-transform switch for the
    # native five; BJX lines manifest independently when bjx_animal is on.
    lines = ['\t/* BJX pack: 15 条兽化线（bjx_animal 关闭时整块跳过，'
             '保留 0.5 的单形态机制） */',
             '\t<<if $settings.transformAnimalEnabled and $options.bjx_animal>>']
    for state, build, _ in SPECIES:
        lines.append('\t\t<<if $%s gte 5 or $%s gte 1>><<%sTransform $%s>><</if>>'
                     % (build, state, state, state))
    lines.append('\t<</if>>')
    al = al.replace('<</widget>>', '\n'.join(lines) + '\n<</widget>>')

    # (c2) 完全转化监控：每次转化状态更新后检查 19 种是否又满了一个，
    #      满了就在正文补一句「巨石在吸引你」并写进日志（widget 在 gen_hunter 里）。
    assert su.count('<</widget>>') == 1, 'stateUpdate widget close'
    su = su.replace('<</widget>>', '\t<<bjxFullTfCheck>>\n<</widget>>', 1)

    # (d) clearAnimalTransformations: 0.5 only clears its five native lines.
    ca = ca.replace('<</widget>>',
                    ''.join('\t<<%sTransform 99>>\n' % s for s, _, _ in SPECIES)
                    + '<</widget>>')

    out = ('/* BJX pack: 变形核心骨架 —— 0.5 原文全文重声明 + BJX 15 条兽化线。\n'
           '   三个 widget 均以 0.5 版本为底（保留单形态机制 / 恐慌隐藏 /\n'
           '   $physicalTransform 语义），只在末尾追加 BJX 分支。 */\n'
           ':: BJX TF Core [widget]\n\n')
    out += su + '\n\n' + al + '\n\n' + ca + '\n'

    assert passages(out) == ['BJX TF Core [widget]'], passages(out)
    for state, _, _ in SPECIES:
        assert out.count('<<%sTransform 99>>' % state) == 1, state
        assert ('<<%sTransform $%s>>' % (state, state)) in out, state
        assert ('$%sbuild gte 1' % state) in out, state
    assert out.count('<<transformationAlteration>>') == 1
    assert out.count('<<bjxFullTfCheck>>') == 1
    write('bjx-tf-core-hooks.twee', out)


def gen_divine():
    """猎人线 + 堕天线补丁（0.5 原文为底，只插 BJX 分支）。"""
    bjx = read(os.path.join(BJX, 'base-system', 'transformations.twee'))
    ref = read(os.path.join(REF, 'base-system', 'transformations.twee'))

    # --- new widgets: the whole hunter line is BJX-only (cheats/schism) ---
    hunter = []
    for name in ('fallenstart', 'hunterstart', 'hunterTransform', 'hunterButNotOut'):
        hunter.append(translate_05(widget_block(bjx, name)))

    # --- fallenButNotOut: 0.5 body + BJX case 5 + toggleTransform on 99 ---
    fbo = widget_block(ref, 'fallenButNotOut')
    case5 = ('\t\t\t/* BJX pack: 混沌线（fallenangel 6） */\n'
             '\t\t\t<<case 5>>\n'
             '\t\t\t\t<<if $fallenbuild gte 30 and $angelbuild gte 30>>\n'
             '\t\t\t\t\t<<set $fallenangel to 6>>\n'
             '\t\t\t\t\t<span class="gold">在光明与黑暗的交织中，你体会到了混沌的真谛。</span>\n'
             '\t\t\t\t\t<<clearwings>>\n'
             '\t\t\t\t\t<<set $transformationParts.fallenAngel.wings to "fallenplus">>\n'
             '\t\t\t\t<</if>>\n')
    assert fbo.count('\t\t\t<<case 99>>') == 1
    fbo = fbo.replace('\t\t\t<<case 99>>', case5 + '\t\t\t<<case 99>>')
    assert fbo.count('<<set $fallenangel to 0>>') == 1
    fbo = fbo.replace('<<set $fallenangel to 0>>',
                      '<<toggleTransform>>\n\t\t\t\t<<set $fallenangel to 0>>')

    # --- fallenDescend: clear every conflicting part before the demon set ---
    fd = widget_block(ref, 'fallenDescend')
    assert fd.count('\t<<set $transformationParts.fallenAngel.halo to "disabled">>') == 1
    fd = fd.replace('\t<<set $transformationParts.fallenAngel.halo to "disabled">>',
                    '\t/* BJX pack: 先清掉所有神圣/鸟类翅膀与尾巴，避免叠加 */\n'
                    '\t<<clearhalo>><<clearwings>><<cleartail>>\n'
                    '\t<<set $transformationParts.fallenAngel.halo to "disabled">>')
    assert fd.count('\t<<set $transformationParts.demon.wings to "default">>') == 1
    fd = fd.replace('\t<<set $transformationParts.demon.wings to "default">>',
                    '\t<<set $hastail to "true">>\n'
                    '\t<<set $transformationParts.demon.wings to "default">>')

    out = ('/* BJX pack: 猎人线 + 堕天线补丁。fallenButNotOut / fallenDescend\n'
           '   以 0.5 原文为底（保留 $timeMessages 与 classic 翅膀变体），只插入\n'
           '   BJX 分支；fallenstart / hunter* 为 BJX 独有。 */\n'
           ':: BJX TF Divine [widget]\n\n')
    out += '\n\n'.join(hunter) + '\n\n' + fbo + '\n\n' + fd + '\n'

    assert passages(out) == ['BJX TF Divine [widget]'], passages(out)
    for n in ('fallenstart', 'hunterstart', 'hunterTransform', 'hunterButNotOut',
              'fallenButNotOut', 'fallenDescend'):
        assert out.count('widget "%s"' % n) == 1, n
    assert out.count('BJX pack: 混沌线') == 1
    assert '<<clearwings>>' in out and '<<set $hastail to "true">>' in out
    assert '$transformdisable' not in out
    write('bjx-tf-divine.twee', out)


def main():
    gen_animals()
    gen_core()
    gen_divine()
    print('ALL TF CHECKS PASSED')


if __name__ == '__main__':
    main()
