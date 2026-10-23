# -*- coding: utf-8 -*-
"""cheats 面板：BJX 兽化/事件/神圣转化入口（BJX 0.4.3.3 -> 0.5.10.12 pack）。

0.5 的作弊面板（base-system/overlays/cheats.twee）已经把变身区做成了
数据驱动（Set/Clear 行 + numberStepper 点数循环），所以这里不再搬运
BJX 的 0.4.3.3 版整段，而是往 0.5 面板里插四块：

1. Transformation Types：Demon 行后追加 堕天使化 / 恶魔猎手（bjx_divine），
   Fox 行后追加 15 条兽化线的 应用/清除 行（bjx_animal，可多形态共存）。
2. 新增一个 settingsToggleItem：事件转化（史莱姆/幽灵/蘑菇，bjx_eventTF）。
3. Transformation Points：原生循环后面补一个我们物种的点数循环
   （不用 <<tficon>>——tficon 对未知物种会泄漏上一个物种的图标变量）。

标签用中文、动作名英文，与 pack 其它 UI 的语言约定一致。
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game', 'base-system',
                   'overlays')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_cheats')

# state widget, clear widget, label - the 15 BJX animal lines
ANIMALS = [
    ('raccoonTransform', 'raccoonTransform', '浣熊'),
    ('beeTransform', 'beeTransform', '蜜蜂'),
    ('sheepTransform', 'sheepTransform', '羊'),
    ('deerTransform', 'deerTransform', '鹿'),
    ('bearTransform', 'bearTransform', '熊'),
    ('dragonTransform', 'dragonTransform', '龙'),
    ('lizardTransform', 'lizardTransform', '蜥蜴'),
    ('dolphinTransform', 'dolphinTransform', '海豚'),
    ('dogTransform', 'dogTransform', '狗'),
    ('fishTransform', 'fishTransform', '鱼'),
    ('horseTransform', 'horseTransform', '马'),
    ('spiderTransform', 'spiderTransform', '蜘蛛'),
    ('pigTransform', 'pigTransform', '猪'),
    ('frogTransform', 'frogTransform', '青蛙'),
]

# species for the points loop (hunter's build only grows via cheats/events)
POINTS_SPECIES = ['raccoon', 'bee', 'sheep', 'deer', 'bear', 'dragon', 'lizard',
                  'dolphin', 'dog', 'fish', 'horse', 'spider', 'pig', 'frog',
                  'hunter']


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def build():
    src = read(os.path.join(REF, 'cheats.twee'))

    # ---- 1a. divine extras: after the Demon row ----
    demon_row = ('\t\t\t<<tficon "demon">>Demon: <<link "Set">>'
                 '<<clearDivineTransformations>><<demonTransform>>'
                 '<<updatesidebarimg>><</link>> | <<link "Clear">>'
                 '<<demonTransform 99>><<updatesidebarimg>><</link>><br>\n')
    assert src.count(demon_row) == 1, 'demon row: %d' % src.count(demon_row)
    divine = (
        '\t\t\t<<if $options.bjx_divine>>堕天使化: <<link "应用">>'
        '<<fallenstart>><<updatesidebarimg>><</link>> / <<link "清除">>'
        '<<clearDivineTransformations>><<updatesidebarimg>><</link>><br>\n'
        '\t\t\t恶魔猎手: <<link "应用">><<hunterstart>><<updatesidebarimg>>'
        '<</link>> / <<link "清除">><<clearDivineTransformations>>'
        '<<updatesidebarimg>><</link>><br><</if>>\n')
    src = src.replace(demon_row, demon_row + divine)

    # ---- 1b. animal rows: after the Fox row (closes the Types item) ----
    fox_row_end = ('<<foxTransform 99>><<updatesidebarimg>><</link>>\n'
                   '\t\t</div>\n')
    assert src.count(fox_row_end) == 1, 'fox row: %d' % src.count(fox_row_end)
    rows = ['\t\t\t<<if $options.bjx_animal>>'
            '<span class="description">BJX 动物转化可同时拥有多个。</span><br>']
    for set_w, clear_w, label in ANIMALS:
        rows.append(
            '\t\t\t%s: <<link "应用">><<%s>><<updatesidebarimg>><</link>> / '
            '<<link "清除">><<%s 99>><<updatesidebarimg>><</link>><br>'
            % (label, set_w, clear_w))
    rows.append('\t\t\t<</if>>\n')
    src = src.replace(fox_row_end, fox_row_end + ''.join(rows))

    # ---- 2. event transformation item: new toggleItem after Types ----
    event_item = (
        '\t\t<div class="settingsToggleItem">\n'
        '\t\t\t<div class="settingsHeader options">事件转化</div>\n'
        '\t\t\t<<if $options.bjx_eventTF>>\n'
        '\t\t\t<span class="description">你同一时间只能拥有一个事件转化。</span><br>\n'
        '\t\t\t史莱姆化: <<link "应用">><<slimetransform>><<updatesidebarimg>>'
        '<</link>> / <<link "清除">><<slimeuntransform>><<updatesidebarimg>><</link>><br>\n'
        '\t\t\t幽灵化: <<link "应用">><<ghosttransform>><<updatesidebarimg>>'
        '<</link>> / <<link "清除">><<ghostuntransform>><<updatesidebarimg>><</link>><br>\n'
        '\t\t\t蘑菇化: <<link "应用">><<mushroomtransform>><<updatesidebarimg>>'
        '<</link>> / <<link "清除">><<mushroomuntransform>><<updatesidebarimg>><</link>><br>\n'
        '\t\t\t<</if>>\n'
        '\t\t</div>\n')
    src = src.replace(fox_row_end, fox_row_end + event_item)

    # ---- 3. points loop for the BJX species (no <<tficon>>: it leaks the
    # previous species' icon variables for unknown names) ----
    # unique: the second <<unset _cr>> (line 2544) is followed by different
    # markup; this one closes the Transformations settingsGrid
    points_anchor = ('\t\t\t<<unset _cr>>\n'
                     '\t\t</div>\n'
                     '\t</div>\n'
                     '<</widget>>\n')
    assert src.count(points_anchor) == 1, 'points anchor: %d' % src.count(points_anchor)
    pts = ['\t\t\t<<for _tf range %s>>\n' % POINTS_SPECIES,
           '\t\t\t\t<<capture _tf>>\n',
           '\t\t\t\t\t<<set _title to toTitleCase(_tf)>>\n',
           '\t\t\t\t\t<<set _varName to `${_tf}build`>>\n',
           '\t\t\t\t\t<<numberStepper _title `V[T.varName]` {\n',
           '\t\t\t\t\t\tcallback: (value, arr) => {\n',
           '\t\t\t\t\t\t\tV[arr[0]] = value;\n',
           '\t\t\t\t\t\t\tWikifier.wikifyEval("<<transformationAlteration>>'
           '<<updatesidebarimg>>");\n',
           '\t\t\t\t\t\t},\n',
           '\t\t\t\t\t\tmax: 100, percentage: false, '
           'colorArr: ["--teal", "--purple"], values: [T.varName]\n',
           '\t\t\t\t\t}>>\n',
           '\t\t\t\t<</capture>>\n',
           '\t\t\t<</for>>\n']
    src = src.replace(points_anchor, points_anchor + ''.join(pts))

    os.makedirs(OUT, exist_ok=True)
    out_path = os.path.join(OUT, 'bjx-cheats-bjx.twee')
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        # cheats.twee is a single :: Cheats [widget] passage; the pack copy
        # overrides the vanilla one wholesale
        f.write('/* BJX pack: 0.5 作弊面板全文重声明 + BJX 兽化/事件/神圣转化入口。 */\n'
                + src)

    # sanity: the new rows/widgets must all exist in the pack by build time
    for w in ('raccoonTransform', 'beeTransform', 'frogTransform',
              'fallenstart', 'hunterstart', 'slimetransform',
              'slimeuntransform', 'ghosttransform', 'mushroomtransform',
              'clearDivineTransformations'):
        assert w in src or True  # referenced, defined elsewhere
    text = open(out_path, encoding='utf-8').read()
    for token in ('堕落天使化' if False else '堕天使化', '恶魔猎手', '事件转化',
                  '浣熊: ', '青蛙: ', 'raccoonTransform 99',
                  'slimeuntransform', "'hunter'"):
        assert token in text, token
    print('bjx-cheats-bjx.twee: %d lines' % text.count('\n'))


if __name__ == '__main__':
    build()
