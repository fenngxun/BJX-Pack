# -*- coding: utf-8 -*-
"""BJX 选项菜单（optionsmods）生成器：0.4.3.3 -> DoL 0.5.10.12 pack。

独立验证版：只读 0.5 目标源码（refs/dol-0.5.10.12-target/game）与 BJX
源码（Dol-BJX-Ex-main/源码），输出写到本脚本同目录的 _verify_options/
下（不写 TWE、不改 build_pack.py）。接线时 build_pack.py 按批次把该目录
的 .twee 复制进 tweeFileList（与 3h/3i 的 subprocess 模式一致）。

源头：Dol-BJX-Ex-main/源码/base-system/overlays/options.twee:512-665
（`<<widget "optionsmods">>`，与 0.4.3.3 基线 diff 后唯一的 155 行新增块）。
0.5 的 options.twee 没有 optionsmods，也没有 titleOptions 里的 Mods 页签。

做法（沿用 gen_ghost_civic.py 的整文件 patch 范式）：
  - 以 0.5 options.twee 全文为底，只做两处唯一锚点插入：
      A. optionsgeneral 末尾（Restart Game 之前）插入 `<<optionsmods>>`
         调用 —— 这样开关挂在 General 页底部，无需改 overlay-replace.twee
         的 titleOptions 页签表（本组边界只允许改 options.twee）。
      B. optionstheme 定义之前插入 `<<widget "optionsmods">>` 定义。
  - 两处锚点都先用 repr() 核对字节（0.5 全 LF、制表符缩进），脚本内用
    显式 '\t' / '\n' 书写，assert count == 1。
  - 只改插入块，不重写任何 0.5 现有控件；0.5 的 settingsGrid /
    settingsHeader options / settingsToggleItem / <<checkbox>> /
    tooltip-anchor 写法全部照 0.5 options.twee 现有行抄（0.4.3.3 的
    settingsToggle + <mouse class="tooltip"> 已废弃，不照抄）。
  - 开关默认值取自 BJX 04-Variables/variables-start.twee:62-67：只有
    bjx_divine / bjx_animal / bjx_eventTF / bjx_antiques 默认 true。
    这 4 个用 `<<set $options.x to ($options.x ?? true)>>` 防御：0.5 的
    <<checkbox>> autocheck 遇到 undefined 会写成 false，等于把大改功能
    静默关掉（旧档或 inject_early 没种上时）。其余 16 个 undefined = 关，
    与 BJX 语义一致，不需要兜底；脚本表里同样按 `?? false` 记录。
  - 只给"尚无 UI"的开关做控件：扫描 pack 里是否已有
    `"$options.bjx_x"` 绑定（checkbox/radiobutton 的变量名带引号），
    已有的跳过并在表里标注。当前 pack 零个 bjx_ 控件（optionsmods
    从未移植），故 20 个全部新增。
  - 幂等：每次从 0.5 源码重新生成，输出 LF，passage 名称与顺序不变
    （assert vps == ops），0.5 原文里零个 bjx_（assert 无残留）。

任务书写"15 个开关"，实际 optionsmods 里是 20 个 checkbox（4 大改 +
16 小修），本脚本按 20 个全覆盖，清点表逐行列出，不丢开关。

已知边界（不改，只记录）：
  - 本块只写 $options，不读；pack 里已有 6 个开关被消费
    （bjx_eventTF/bjx_animal/bjx_antiques/bjx_divine/bjx_greengod/
    bjx_skin*），其余 14 个功能未移植，打了勾也不会有行为变化。
  - 0.5 的 gameStartOnly 会用字面量重建 $options（variables-start:20），
    bjx_* 不在其中；inject_early.js 的 ensureVars() 在每次 DOM 变更后
    补种 4 个大改开关，本 widget 再做一次同值兜底。
"""

import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
PACK = os.path.join(ROOT, 'work', 'bjx-pack', 'tweeFileList')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '_verify_options')
REL = 'base-system/overlays/options.twee'

# ---------------------------------------------------------------- switches
# (variable, default, group, label, tooltip)
# default 是 BJX variables-start.twee:62-67 的初值；未列出的键 undefined，
# 语义等于 false（BJX 全部控件都是 <<checkbox ... false true>>）。
SWITCHES = [
    # ---- 大改（BJX options.twee:516-547），默认开启
    ('bjx_divine', True, 'major', '神性转化大修',
     '添加混沌天使（堕天使进阶）、恶魔猎手（恶魔禁内射后异变）、天使恶魔转化增强。'),
    ('bjx_animal', True, 'major', '动物转化大修',
     '动物转化可共存，部位关联性合理化，添加多种新动物转化，原有动物转化增强。'),
    ('bjx_eventTF', True, 'major', '事件转化',
     '通过事件获得的半永久转化，包括：幽灵、史莱姆、蘑菇等。'),
    ('bjx_antiques', True, 'major', '古董大改',
     '新增多种新古董，部分古董转化为神器，增加特殊效果。'),
    # ---- 小修（BJX options.twee:548-663），默认关闭
    ('bjx_health', False, 'minor', '显示敌人数值',
     '战斗中显示对方具体数值，包括：血量、性奋、愤怒、信任等。'),
    ('bjx_slowarousal', False, 'minor', '敌人性奋增长放缓',
     '战斗开始时把敌方性奋上限翻倍，变相把涨满速度减半。只影响新开的战斗，不改存档。'),
    ('bjx_smallup', False, 'minor', '小体型强化',
     '体型越小，温顺与顺从动作的加信任和减愤怒效果越高。'),
    ('bjx_noenduredmg', False, 'minor', '关闭寸止伤害',
     '关闭寸止对敌人造成的伤害。'),
    ('bjx_endlessagain', False, 'minor', '无限战斗续杯',
     '战斗中途高潮不再减少敌方性奋上限。'),
    ('bjx_clothes', False, 'minor', '解锁衣服栏位',
     '解锁：外套上衣、外套下装、头套栏位。'),
    ('bjx_sewmachine', False, 'minor', '解锁商店缝纫机',
     '原版内容，该模组仅开放解锁。'),
    ('bjx_sellcloth', False, 'minor', '解锁出售衣服选项',
     '原版内容，该模组仅开放解锁。'),
    ('bjx_magicpreg', False, 'minor', '解锁魔法怀孕效果',
     '在耻部纹或写下怀孕类纹身，即可增加怀孕率甚至男性怀孕。'),
    ('bjx_robinincome', False, 'minor', '增加罗宾收入与自信相关',
     '原版的固定300，改为自信值的40倍。'),
    ('bjx_averymoney', False, 'minor', '艾弗里约会给钱翻倍',
     '罗宾都能给4000，艾弗里也不能太小气。'),
    ('bjx_greengod', False, 'minor', '拥抱绿色神明改为减性意识',
     '给天真无邪一个活路。'),
    ('bjx_goodstudent', False, 'minor', '好学生按需上课系统',
     '成绩足够优秀或者好感够高可以不受逃课惩罚。'),
    ('bjx_doglovenodown', False, 'minor', '狗舍好感不再每日下降',
     '并非是狗舍声望，而是好感。'),
    ('bjx_crimewipe', False, 'minor', '犯罪记录擦除无需高犯罪',
     '原版低于1000就不能擦除了。'),
    ('bjx_sellproduce', False, 'minor', '售卖声望调整',
     '工厂售卖声望改为250个一加，摆摊声望根据信任度浮动。'),
    ('bjx_stealhand', False, 'minor', '手技加成偷窃类诡术效果',
     '偷窃类的诡术判定增加20%手技加成。'),
]

GROUPS = [
    ('major', 'Mods · 北极星模组（大改）'),
    ('minor', 'Mods · 北极星模组（小修）'),
]

# ---------------------------------------------------------------- anchors
# repr 核对过（0.5 options.twee 全 LF，制表符缩进）：
#   A = '\t<<if $passage isnot "Start">>\n\t\t<br>\n\t\t<<button "Restart Game">>\n'
#   B = '\n<<widget "optionstheme">>\n'
# A 落在 optionsgeneral 末尾的 Restart Game 之前；B 落在 optionsgeneral
# 的 <</widget>> 之后、optionstheme 之前（不会插进 widget 内部）。
CALL_ANCHOR = '\t<<if $passage isnot "Start">>\n\t\t<br>\n\t\t<<button "Restart Game">>\n'
WIDGET_ANCHOR = '\n<<widget "optionstheme">>\n'


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def write(name, text):
    os.makedirs(OUT, exist_ok=True)
    if not text.endswith('\n'):
        text += '\n'
    with open(os.path.join(OUT, name), 'w', encoding='utf-8',
              newline='') as f:
        f.write(text)


def passage_names(text):
    return [l[3:].strip() for l in text.split('\n') if l.startswith(':: ')]


def insert(src, anchor, block, label):
    """Insert block before anchor; anchor must be unique and start at a
    line boundary (same discipline as gen_ghost_civic.insert)."""
    n = src.count(anchor)
    assert n == 1, '%s anchor not unique (%d): %r' % (label, n, anchor)
    idx = src.find(anchor)
    assert idx == 0 or src[idx - 1] == '\n', \
        label + ' anchor does not start at a line boundary'
    return src.replace(anchor, block + anchor)


def read_pack():
    """All pack twee text, read-only. Returns (text, ui_vars).

    The generator's own output (bjx-options-bjx.twee) is skipped: once the
    group is wired into build_pack.py, that file is part of the pack and
    would otherwise (a) trip the "already defines optionsmods" guard and
    (b) make every switch look like it already has a control, producing an
    empty widget on the next run.
    """
    chunks = []
    if os.path.isdir(PACK):
        for fn in sorted(os.listdir(PACK)):
            if fn.endswith('.twee') and fn != 'bjx-options-bjx.twee':
                chunks.append(read(os.path.join(PACK, fn)))
    text = ''.join(chunks)
    # A control binding is the quoted variable name, e.g.
    # <<checkbox "$options.bjx_animal" ...>> / <<radiobutton "$options.x" ...>>
    ui_vars = set(re.findall(r'"\$options\.(bjx_\w+)"', text))
    return text, ui_vars


def mods_widget(rows):
    """0.5-style optionsmods widget (grids + settingsToggleItem)."""
    out = []
    out.append('\n<<widget "optionsmods">>\n')
    out.append('\t/* BJX pack: 北极星模组开关（BJX 0.4.3.3 options.twee:513）。\n')
    out.append('\t   由 optionsgeneral 在 General 页底部调用；本组只改 options.twee，\n')
    out.append('\t   不新增 titleOptions 页签。大改四项 BJX 默认 true，这里用\n')
    out.append('\t   ($options.bjx_x ?? true) 兜底，避免 <<checkbox>> 的 autocheck\n')
    out.append('\t   把旧档的 undefined 写成 false。 */\n')
    for var, default, _group, _label, _tip in rows:
        if default:
            out.append('\t<<set $options.%s to ($options.%s ?? true)>>\n'
                       % (var, var))
    for group, title in GROUPS:
        out.append('\t<hr>\n')
        out.append('\t<div class="settingsGrid">\n')
        out.append('\t\t<div class="settingsHeader options">%s</div>\n'
                   % title)
        for var, _default, g, label, tip in rows:
            if g != group:
                continue
            out.append('\t\t<div class="settingsToggleItem">\n')
            out.append('\t\t\t<label>\n')
            out.append('\t\t\t\t<<checkbox "$options.%s" false true '
                       'autocheck>>\n' % var)
            out.append('\t\t\t\t%s\n' % label)
            out.append('\t\t\t</label>\n')
            out.append('\t\t\t<span class="tooltip-anchor linkBlue" '
                       'tooltip="%s">(?)</span>\n' % tip)
            out.append('\t\t</div>\n')
        out.append('\t</div>\n')
    out.append('<</widget>>\n')
    return ''.join(out)


def build():
    pack_text, ui_vars = read_pack()
    # 0.5 base must be pristine and must not already carry the widget
    vanilla = read(os.path.join(REF, REL))
    assert 'bjx_' not in vanilla, '0.5 options.twee already has bjx_ (patched?)'
    assert 'optionsmods' not in vanilla, \
        '0.5 options.twee already defines optionsmods'
    assert '\r' not in vanilla, '0.5 base must be LF'
    assert 'optionsmods' not in pack_text, \
        'pack already defines optionsmods (wiring would duplicate the widget)'

    # 已出现在 pack 的开关 / 已有 UI 的开关
    usage = {var: pack_text.count('$options.' + var)
             for var, _d, _g, _l, _t in SWITCHES}
    rows = [s for s in SWITCHES if s[0] not in ui_vars]
    skipped = [s[0] for s in SWITCHES if s[0] in ui_vars]

    # 锚点字节核对（tab / LF），并把 repr 打出来留证
    print('anchors (repr, count in 0.5 base):')
    print('  A %r  x%d' % (CALL_ANCHOR, vanilla.count(CALL_ANCHOR)))
    print('  B %r  x%d' % (WIDGET_ANCHOR, vanilla.count(WIDGET_ANCHOR)))
    assert CALL_ANCHOR.startswith('\t') and CALL_ANCHOR.endswith('\n')
    assert '\r' not in CALL_ANCHOR
    assert WIDGET_ANCHOR.startswith('\n') and WIDGET_ANCHOR.endswith('\n')
    assert '\r' not in WIDGET_ANCHOR

    src = vanilla
    src = insert(src, CALL_ANCHOR, '\t<<optionsmods>>\n\n',
                 'optionsgeneral call site')
    src = insert(src, WIDGET_ANCHOR, mods_widget(rows),
                 'optionsmods widget definition')

    # ---- structural checks
    for var, _d, _g, _l, _t in rows:
        assert src.count('<<checkbox "$options.%s"' % var) == 1, var
    assert src.count('<<optionsmods>>') == 1, 'call site must be unique'
    assert src.count('<<widget "optionsmods">>') == 1
    n_def_on = sum(1 for s in rows if s[1])
    assert src.count('?? true)>>') == n_def_on, 'default-on guards'
    assert src.count('class="settingsHeader options">Mods') == 2
    assert '\r' not in src, 'output must be LF'
    vps = passage_names(vanilla)
    ops = passage_names(src)
    assert vps == ops, 'passage name/order changed'
    assert src.startswith(vanilla[:200]), 'vanilla head must be untouched'

    header = ('/* BJX pack: vanilla 0.5 %s + optionsmods widget '
              '(BJX 0.4.3.3 options.twee:513-664); %d bjx_ switches, '
              '%d default on. */\n' % (REL, len(rows), n_def_on))
    write('bjx-options-bjx.twee', header + src)

    # ---- inventory table
    print('=== BJX options switches (%s:513) ===' % 'Dol-BJX-Ex-main/源码/base-system/overlays/options.twee')
    print('  #   %-20s %-8s %-6s %-8s %s'
          % ('variable', 'default', 'pack', 'UI', 'label'))
    for i, (var, default, _g, label, _t) in enumerate(SWITCHES, 1):
        ui = '跳过' if var in ui_vars else '新增'
        print('  %-3d %-20s %-8s %-6d %-8s %s'
              % (i, var, 'true' if default else 'false', usage[var], ui, label))

    print('=== options-bjx summary ===')
    print('switches: %d (4 默认开启 / %d 默认关闭), 控件新增 %d / 跳过 %d'
          % (len(SWITCHES), len(SWITCHES) - 4, len(rows), len(skipped)))
    print('placements: 2 (optionsgeneral 调用点 + optionsmods 定义)')
    print('passages: %d (%s), vps == ops' % (len(ops), ', '.join(ops)))
    print('checks: LF only, anchors unique, no bjx_ in 0.5 base, '
          'pack 未定义 optionsmods')
    print('pack 引用: %d/%d 个开关已被 pack 消费，其余仅有 UI 无行为'
          % (sum(1 for v in usage.values() if v), len(SWITCHES)))
    print('idempotent: 每次从 0.5 源码重建，输出字节稳定；接线时整文件复制进 pack')
    print('output: %s' % os.path.join(OUT, 'bjx-options-bjx.twee'))


if __name__ == '__main__':
    build()
