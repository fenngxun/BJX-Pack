# -*- coding: utf-8 -*-
"""deepseadive 组生成器（BJX 0.4.3.3 -> DoL 0.5.10.12 ModLoader pack）。

独立验证版：输出写到本脚本同目录的 _verify_deepseadive/ 下（不写 TWE，
不改 build_pack.py）。正式接线时由 build_pack.py 以完全相同的文本写入
work/bjx-pack/tweeFileList。

产出三个 twee 文件：

1. bjx-sea-dive-widgets.twee (widget 定义文件, 单个 [widget] passage,
   boot 即注册; 全部宏调用都在 widget 体内, 无 passage 级裸调用):
        <<widget "eventsdeepseadive">>   深潜遭遇随机分发器:
                random(1,96): lte 20 sea1 / 30 sea4 / 40 seavore /
                50 sea5 / 60 seatentacles / 80 seaB1 / 90 sea_struggle /
                96 sea_eye（较原版 eventsdeepsea 去掉 sea3/sea6/
                seaflotsam/sea_chest, 换入 seaB1 鱼群）
        <<widget "seaB1">>            鱼群围圈 -> [[继续|Sea Swarm]]
                                      （passage 已在 pack
                                      bjx-sea-swarm.twee）
        <<widget "seadiveeventend">>  深潜事件出口: [[继续|Sea Dive]]
                                      （passage 已在 pack
                                      bjx-sea-reef.twee:26）
        <<widget "destinationeventend">>  0.5 loc-bus/widgets.twee:106 的
                                      原版定义整段重定义 + <<case
                                      "seadive">><<seadiveeventend>>（插在
                                      lakebus case 之后、default 之前）。
                                      widget 重名覆盖模式（pack 后加载整段
                                      覆盖, 本项目先例）。BJX 源对应改动为
                                      loc-bus/widgets.twee:196 一处北极星
                                      块, busstation 组未覆盖, 由本组补齐
   三 widget 均为 0.5 不存在的新名字（0.5 loc-sea/loc-bus widgets 零同名,
   脚本断言）; 零变量翻译（无 $swarmdisable/$tentacledisable/$weather/
   $skinColor, 分发器用局部 _dangerevent）。北极星块全部从 BJX
   loc-sea/widgets.twee 按行切片提取（零手抄）。
   激活链: pack bjx-sea-reef.twee:34 的 <<eventsdeepseadive>>（此前
   静默空转）自此有定义; 深潜事件结束经 destinationeventend 的 seadive
   case 返回 Sea Dive。

2. bjx-sea-dive-main-hooks.twee (0.5 原版 loc-sea/main.twee 全文 + 3 处
   BJX 入口 patch, 均在 Sea passage):
        M1     $sea lte 50 段: 城镇描述 <</if>> 与 <<physique>> 之间插入
               '<br><br>远处的水面上闪烁着四色的光芒。'（BJX 0.4.3.3
               main.twee:573 后北极星块）
        M2     同段 $sea gte 40 分支 Swim further out (difficulty 300)
               之后插入 '游向四色光芒 (0:10) -> Sea Reef'（带
               swimmingdifficulty 1 300 检定; BJX main.twee:589 后块）
        M3     $sea lte 99 段 $sea gte 90 分支 Swim further out
               (difficulty 400) 之后插入 '潜水 (0:10) -> Sea Dive'
               （set $phase to 0; BJX main.twee:630 后块）
   M1-M3 全部从 BJX main.twee 北极星块按行切片提取（零手抄）。0.5 的
   Sea passage 较 0.4.3.3 新增 $sea is 0 / lte 20 两段, BJX 插入所在的
   lte 50 / lte 99 两段结构一一对应, 位置语义不变。

3. bjx-sea-dive-events-hooks.twee (0.5 原版 loc-sea/events.twee 全文 +
   4 处 BJX patch):
        E1     Sea Tentacles 开头删除 '<<if $location isnot "sea">>
               <<location "sea">><</if>>'（深潜触发时保持 seadive 地点,
               不被拉回海面; BJX 0.4.3.3 events.twee:497 对应删除）
        E2     Sea Struggle End 出口 '<<link [[Next|Sea]]>><<set
               $eventskip to 1>><</link>>' -> <<destinationeventend>>
        E3     Sea Eye 出口同上
        E4     Sea Eye Refuse 出口同上
   E2-E4 使 sea_struggle / sea_eye 链事件结束后经 destinationeventend
   的 seadive case 返回 Sea Dive。0.5 同款出口共 6 处, BJX 只改这 3 处
   （Boat Molestation Finish / Sea Chest Leave / Sea Chest Open 三处
   保持 0.5 原样）; 966 行纯缩进差异忽略。

依赖（脚本内断言）: sea1/sea4/seavore/sea5/seatentacles/sea_struggle/
sea_eye widget（0.5 loc-sea/widgets.twee 原生）、Sea Reef / Sea Dive /
Sea Swarm / Sea Swarm Finish passage（pack bjx-sea-reef.twee /
bjx-sea-swarm.twee）、destinationeventend 与 endevent（0.5
loc-bus/widgets.twee / base-combat/end.twee）。
潜水氧气机制（<<underwater>>/<<loxygen>>/<<oxygenrecovery>>）为 0.5
原生（Rocks Dive 同款）, 由已移植的 bjx-sea-reef.twee 使用, 本组
产物不涉及。BJX sea widgets.twee 除三 widget 北极星块外与 0.4.3.3
基线零差异（diff 验证）, 故无需 patch 0.5 原版 sea widgets。
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
PACK = os.path.join(ROOT, 'work', 'bjx-pack', 'tweeFileList')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '_verify_deepseadive')

HDR = '/* BJX pack: vanilla 0.5 {src} + BJX deepseadive insertions. */\n'


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def write(name, text):
    os.makedirs(OUT, exist_ok=True)
    if not text.endswith('\n'):
        text += '\n'
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print('%s: %d lines written' % (name, len(text.splitlines())))


def find_line(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    raise AssertionError('line not found: ' + needle[:60])


def find_passage(lines, name):
    for i, l in enumerate(lines):
        if l.rstrip() == name:
            return i
    raise AssertionError('passage not found: ' + name)


def widget_block(lines, name):
    """Slice a full `<<widget "name">>` ... `<</widget>>` definition."""
    si = find_line(lines, '<<widget "%s">>' % name)
    ei = find_line(lines, '<</widget>>', si)
    assert ei - si < 60, name
    return lines[si:ei + 1]


# ---------------------------------------------------------------- widgets
def gen_widgets():
    bjx = read(os.path.join(BJX, 'overworld-town', 'loc-sea',
                            'widgets.twee')).split('\n')
    sea_w = read(os.path.join(REF, 'overworld-town', 'loc-sea',
                              'widgets.twee'))
    bus_w = read(os.path.join(REF, 'overworld-town', 'loc-bus',
                              'widgets.twee'))

    w1 = widget_block(bjx, 'eventsdeepseadive')
    w2 = widget_block(bjx, 'seaB1')
    w3 = widget_block(bjx, 'seadiveeventend')
    # dispatcher table sanity
    joined = ''.join(w1)
    for callee in ('sea1', 'sea4', 'seavore', 'sea5', 'seatentacles',
                   'seaB1', 'sea_struggle', 'sea_eye'):
        assert ('<<%s>>' % callee) in joined, callee
    assert '[[继续|Sea Swarm]]' in ''.join(w2)
    assert '[[继续|Sea Dive]]' in ''.join(w3)
    # zero translation needed
    for bad in ('$skinColor', '$weather', '$tentacledisable',
                '$swarmdisable'):
        for w in (w1, w2, w3):
            assert bad not in ''.join(w), bad
    # the three widget names must not exist anywhere in 0.5
    for n in ('eventsdeepseadive', 'seaB1', 'seadiveeventend'):
        assert ('<<widget "%s">>' % n) not in sea_w, n
        assert ('<<widget "%s">>' % n) not in bus_w, n
    # dispatcher callees exist natively in 0.5 sea widgets
    for n in ('sea1', 'sea4', 'seavore', 'sea5', 'seatentacles',
              'sea_struggle', 'sea_eye'):
        assert ('<<widget "%s">>' % n) in sea_w, n
    # destinationeventend override: 0.5 loc-bus definition + seadive case
    assert bus_w.count('seadive') == 0
    de = widget_block(bus_w.split('\n'), 'destinationeventend')
    li = find_line(de, '<<case "lakebus">>')
    assert de[li].strip() == '<<case "lakebus">><<lakeeventend>>'
    de = (de[:li + 1] + ['\t\t<<case "seadive">><<seadiveeventend>>'] +
          de[li + 1:])
    # pack passage dependencies
    reef = read(os.path.join(PACK, 'bjx-sea-reef.twee'))
    swarm = read(os.path.join(PACK, 'bjx-sea-swarm.twee'))
    for p in (':: Sea Reef', ':: Sea Dive'):
        assert any(l.rstrip() == p for l in reef.split('\n')), p
    for p in (':: Sea Swarm', ':: Sea Swarm Finish'):
        assert any(l.rstrip() == p for l in swarm.split('\n')), p
    assert '<<eventsdeepseadive>>' in reef

    out = '\n'.join(
        ['/* BJX pack: BJX deepseadive widgets, verbatim 北极星 blocks */',
         '/* from loc-sea/widgets.twee + destinationeventend override  */',
         '/* (0.5 loc-bus/widgets.twee definition + seadive case).     */',
         ':: Widgets Sea Dive BJX [widget]', ''] +
        w1 + [''] + w2 + [''] + w3 + [''] + de)
    verify_widgets(out)
    write('bjx-sea-dive-widgets.twee', out)


def verify_widgets(out):
    assert out.count('<<widget "') == 4
    assert out.count('<</widget>>') == 4
    assert out.count('<<case "seadive">>') == 1
    assert out.count('<<case "lakebus">>') == 1
    # [widget] passages render at boot: every content line must live
    # inside a widget body (no bare macro calls at passage level).
    depth = 0
    for l in out.split('\n'):
        s = l.strip()
        if not s or s.startswith('/*') or s.startswith('::'):
            continue
        if s.startswith('<<widget '):
            assert depth == 0, 'nested widget: ' + s[:60]
            depth = 1
        elif s == '<</widget>>':
            assert depth == 1, 'unbalanced </widget>'
            depth = 0
        else:
            assert depth == 1, 'bare macro outside widget body: ' + s[:60]
    assert depth == 0
    print('sea-dive-widgets verify OK: 4 widget definitions, '
          'all macro calls inside widget bodies')


# ------------------------------------------------------------- main hooks
def gen_main_hooks():
    src = read(os.path.join(REF, 'overworld-town', 'loc-sea', 'main.twee'))
    bjx = read(os.path.join(BJX, 'overworld-town', 'loc-sea',
                            'main.twee')).split('\n')
    lines = src.split('\n')

    assert src.count('<<elseif $sea lte 50>>') == 1
    i50 = find_line(lines, '<<elseif $sea lte 50>>')

    # M1: 四色光芒 sighting text between the town description <</if>>
    # and <<physique>> in the $sea lte 50 branch.
    bi = find_line(bjx, '远处的水面上闪烁着四色的光芒')
    assert bjx[bi - 1].strip() == '<br><br>'
    m1 = ['\t/* BJX pack: 四色光芒 sighting */'] + bjx[bi - 1:bi + 1]
    j = find_line(lines, '<<physique>>', i50)
    assert j - i50 < 20
    assert lines[j - 1].strip() == '<</if>>'
    lines[j:j] = m1

    # M2: 游向四色光芒 -> Sea Reef link inside the $sea gte 40 sub-branch
    # of the lte 50 branch (link carries swimmingdifficulty 1 300).
    bi = find_line(bjx, '游向四色光芒')
    assert 'Sea Reef' in bjx[bi]
    assert '<<swimmingdifficulty 1 300>>' in bjx[bi]
    assert bjx[bi + 1].strip() == '<br>'
    m2 = ['\t\t\t\t/* BJX pack: 四色光芒入口 */'] + bjx[bi:bi + 2]
    j = find_line(lines, '<<if $sea gte 40>>', i50)
    assert j - i50 < 30
    k = find_line(lines, '<br>', j)
    assert k - j <= 2
    assert 'swimmingdifficulty 1 300' in lines[k - 1]
    lines[k + 1:k + 1] = m2

    # M3: 潜水 -> Sea Dive link inside the $sea gte 90 sub-branch of the
    # lte 99 branch (after the difficulty-400 Swim further out link).
    anchor = '<<gtiredness>><<swimmingdifficulty 1 400>>'
    assert src.count(anchor) == 1
    bi = find_line(bjx, '潜水 (0:10)')
    assert '[[潜水 (0:10)|Sea Dive]]' in bjx[bi]
    assert '<<set $phase to 0>>' in bjx[bi]
    assert bjx[bi + 1].strip() == '<br>'
    m3 = ['\t\t\t\t/* BJX pack: 深潜入口 */'] + bjx[bi:bi + 2]
    j = find_line(lines, anchor)
    assert lines[j + 1].strip() == '<br>'
    lines[j + 2:j + 2] = m3

    out = '\n'.join(lines)
    out = HDR.format(src='overworld-town/loc-sea/main.twee') + out
    verify_main_hooks(out, src)
    write('bjx-sea-dive-main-hooks.twee', out)


def verify_main_hooks(out, vanilla):
    assert out.count('远处的水面上闪烁着四色的光芒') == 1
    assert out.count('游向四色光芒') == 1
    assert out.count('[[潜水 (0:10)|Sea Dive]]') == 1
    assert out.count('Sea Reef') == 1
    # the dispatcher call lives in the pack reef file, not in vanilla main
    assert out.count('<<eventsdeepseadive>>') == 0
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert len(out) > len(vanilla)
    assert out.count('<<link') - vanilla.count('<<link') == 2
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')
    print('sea-dive-main-hooks verify OK: %d passages, +%d chars' %
          (len(ops), len(out) - len(vanilla)))


# ----------------------------------------------------------- events hooks
def gen_events_hooks():
    src = read(os.path.join(REF, 'overworld-town', 'loc-sea', 'events.twee'))
    lines = src.split('\n')

    # E1: Sea Tentacles - drop the location reset so events triggered
    # from Sea Dive keep the "seadive" location.
    i = find_passage(lines, ':: Sea Tentacles')
    j = find_line(lines, '<<if $location isnot "sea">>', i)
    assert j - i <= 3
    assert lines[j].rstrip() == \
        '<<if $location isnot "sea">><<location "sea">><</if>>'
    lines[j:j + 1] = [
        '/* BJX pack: BJX drops the location reset here so events '
        'triggered from Sea Dive keep the "seadive" location */']

    # E2-E4: exits of the sea_struggle / sea_eye chains hand control back
    # to destinationeventend (returns to Sea Dive when $bus is "seadive").
    for pname in (':: Sea Struggle End', ':: Sea Eye',
                  ':: Sea Eye Refuse'):
        i = find_passage(lines, pname)
        j = find_line(
            lines,
            '<<link [[Next|Sea]]>><<set $eventskip to 1>><</link>>', i)
        assert j - i <= 20, pname
        lines[j:j + 1] = [
            '/* BJX pack: exit via destinationeventend '
            '(returns to Sea Dive when diving) */',
            '<<destinationeventend>>']

    out = '\n'.join(lines)
    out = HDR.format(src='overworld-town/loc-sea/events.twee') + out
    verify_events_hooks(out, src)
    write('bjx-sea-dive-events-hooks.twee', out)


def verify_events_hooks(out, vanilla):
    link = '<<link [[Next|Sea]]>><<set $eventskip to 1>><</link>>'
    assert out.count('<<destinationeventend>>') - \
        vanilla.count('<<destinationeventend>>') == 3
    assert out.count(link) == vanilla.count(link) - 3
    assert out.count('<<if $location isnot "sea">>') == \
        vanilla.count('<<if $location isnot "sea">>') - 1
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')
    print('sea-dive-events-hooks verify OK: %d passages, '
          '1 reset dropped, 3 exits rerouted' % len(ops))


# ---------------------------------------------------------------- cross
def cross_check():
    """Sea Reef / Sea Dive / Sea Swarm are pack-only passages; make sure
    0.5 loc-sea does not define any of them (would fight our hooks)."""
    for f in ('main.twee', 'events.twee', 'widgets.twee'):
        txt = read(os.path.join(REF, 'overworld-town', 'loc-sea', f))
        for ps in (':: Sea Reef', ':: Sea Dive', ':: Sea Swarm'):
            assert not any(l.rstrip() == ps
                           for l in txt.split('\n')), (f, ps)
    print('cross-check OK: Sea Reef/Sea Dive/Sea Swarm are pack-only, '
          'no 0.5 collisions')


def main():
    gen_widgets()
    gen_main_hooks()
    gen_events_hooks()
    cross_check()
    print('ALL DEEPSEADIVE CHECKS PASSED')


if __name__ == '__main__':
    main()