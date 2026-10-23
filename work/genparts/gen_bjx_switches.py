# -*- coding: utf-8 -*-
"""BJX 小修开关 · P1a（gen_bjx_switches.py）

Standalone verification copy: output goes to _verify_bjx_switches/ next to
this script; it never touches work/bjx-pack/. When wired into build_pack.py
the same text is written to TWE (same pattern as gen_ghost_shops.py).

第一批落地的死开关（其余见 work/AUDIT-porting-gaps.md §7）：

  * bjx_clothes   —— 解锁 over_head / over_upper / over_lower 三个衣柜栏位。
                    0.5 的 <<wardrobeLinks>> 把这三栏写死 `disabled: !$debug`
                    （base-clothing/wardrobes.twee），本脚本把它换成
                    `!$debug and !$options.bjx_clothes`。
                    做法：从 0.5 原文**抽取整个 widget** 再改一行，不整文件
                    覆盖（wardrobes.twee 里有几十个 passage，整文件覆盖会把
                    别的 mod 对它的补丁全部挤掉）。

Anchor policy: the three slot lines are one contiguous block; the anchor is
the first line of that block and must occur exactly once in the file.

Version notes:
  * BJX 原版把这三栏挂在 $options.bjx_clothes 上（0.4.3.3 的 wardrobes.twee），
    0.5 改成了 $debug 门控，所以这里是"把 0.5 的门换成 BJX 的门"，不是新增功能。
  * 不做任何变量翻译：只读 $options.bjx_clothes 与 $debug，都是 0.5 已有变量。
"""

import os
import re

ROOT = r'C:\Users\79403\Desktop\dol'
REF = os.path.join(ROOT, 'refs',
                   os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '_verify_bjx_switches')

GUARD = '<<widget "wardrobeLinks">>'
ANCHOR = "\t\t{ id: 'over_head', label: 'Over Head', disabled: !$debug },"

# bjx_crimewipe: the police-computer "Install a Wiper" branch only shows once
# crime >= 1000; BJX lets it show regardless. Same widget + anchor on
# 0.5.10.12 and 0.5.12.13.
POLICE_FILE = os.path.join('overworld-town', 'loc-police', 'widgets.twee')
POLICE_WIDGET = 'police_computer_action'
POLICE_ANCHOR = '\t<<elseif crimeSumCurrent() gte 1000>>\n\t\tOptions:'

# bjx_stealhand: add a hand-skill bonus to the steal difficulty formula in
# both <<leftstealnew>> and <<rightstealnew>> (0.5 base-combat/actions-hands).
# (The BJX <<skulduggerycheck>> half depends on $skulduggeryhands, removed in
# 0.5, so it is intentionally not ported - see HANDOFF 4.2.)
STEAL_FILE = os.path.join('base-combat', 'actions-hands.twee')
STEAL_WIDGETS = ('leftstealnew', 'rightstealnew')
STEAL_OLD = '- $enemytrust + $enemyanger) * $stealdifficulty>>'
STEAL_NEW = ('- $enemytrust + $enemyanger - '
             '($options.bjx_stealhand ? $handskill / 5 : 0)) * '
             '$stealdifficulty>>')

# bjx_averymoney: double the cash Avery hands out (BJX wraps each payment
# expression in `* ($options.bjx_averymoney ? 2 : 1)`). The 19 sites live in 10
# passages of special-avery/main.twee; the pack does not otherwise touch that
# file, so we re-declare just those passages (same list on both 0.5 versions).
AVERY_FILE = os.path.join('overworld-town', 'special-avery', 'main.twee')
AVERY_PASSAGES = {
    'Avery Hotel Morning', 'Avery Hotel Kiss', 'Avery Hotel Kiss Refuse',
    'Avery Hotel Trauma End', 'Avery Hotel Trauma End Mansion',
    'Avery Hotel Early End', 'Avery Date 4', 'Avery Date 5',
    'Avery Date Strip', 'Avery Date Sex Finish',
}
AVERY_OLD = 'C.npc.Avery.love * 10 + $endear * 10 + 10'
AVERY_NEW = ('(C.npc.Avery.love * 10 + $endear * 10 + 10) '
             '* ($options.bjx_averymoney ? 2 : 1)')


def read(path):
    return open(path, encoding='utf-8', newline='').read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8', newline='\n').write(text)


def extract_widget(text, name):
    """(start, end) offsets of <<widget "name">> ... <</widget>>, or raise."""
    head = '<<widget "%s">>' % name
    i = text.find(head)
    assert i >= 0, 'widget not found: ' + name
    j = text.find('\n<</widget>>', i)
    assert j > 0, 'widget end not found: ' + name
    return i, j + len('\n<</widget>>')


def main():
    src = read(os.path.join(REF, 'base-clothing', 'wardrobes.twee'))
    assert src.count(ANCHOR) == 1, 'wardrobeLinks anchor not unique'
    assert src.count(GUARD) == 1, 'wardrobeLinks declared more than once'

    start, end = extract_widget(src, 'wardrobeLinks')
    body = src[start:end]

    old = "\t\t{ id: 'over_head', label: 'Over Head', disabled: !$debug },"
    new = ("\t\t{ id: 'over_head', label: 'Over Head', "
           "disabled: !$debug and !$options.bjx_clothes },")
    assert body.count(old) == 1
    body = body.replace(old, new)
    for slot in ('over_upper', 'over_lower'):
        o = "\t\t{ id: '%s', label: 'Over %s', disabled: !$debug }," % (
            slot, slot.split('_')[1].capitalize())
        n = ("\t\t{ id: '%s', label: 'Over %s', "
             "disabled: !$debug and !$options.bjx_clothes }," % (
                 slot, slot.split('_')[1].capitalize()))
        assert body.count(o) == 1, 'anchor not unique: ' + slot
        body = body.replace(o, n)

    # --- bjx_crimewipe: police computer "Install a Wiper" unlock ---
    pol = read(os.path.join(REF, POLICE_FILE))
    assert pol.count('<<widget "%s">>' % POLICE_WIDGET) == 1, \
        'police_computer_action not unique'
    assert pol.count(POLICE_ANCHOR) == 1, 'crimewipe anchor not unique'
    ps, pe = extract_widget(pol, POLICE_WIDGET)
    pbody = pol[ps:pe]
    pbody = pbody.replace(
        POLICE_ANCHOR,
        '\t<<elseif crimeSumCurrent() gte 1000 or $options.bjx_crimewipe>>'
        '\n\t\tOptions:')
    assert pbody.count('$options.bjx_crimewipe') == 1, pbody

    out = ('/* BJX pack: 0.5 base-clothing/wardrobes.twee <<wardrobeLinks>> '
           '+ bjx_clothes 解锁三栏。 */\n' + body + '\n'
           '\n/* BJX pack: 0.5 loc-police/widgets.twee '
           '<<police_computer_action>> + bjx_crimewipe 免高犯罪解锁。 */\n'
           + pbody + '\n')
    assert '\r' not in out, 'CRLF leaked'
    assert out.count('$options.bjx_clothes') == 3, out
    assert out.count('disabled: !$debug }') == 0, 'unguarded slot left'
    assert out.count('$options.bjx_crimewipe') == 1, out
    write(os.path.join(OUT, 'bjx-switches.twee'), out)
    print('bjx-switches.twee written (%d bytes)' % len(out.encode('utf-8')))
    print('  wardrobeLinks re-declared, 3 slots gated on bjx_clothes')
    print('  police_computer_action re-declared, +bjx_crimewipe')

    # --- bjx_stealhand: hand-skill bonus on the steal difficulty ---
    ah = read(os.path.join(REF, STEAL_FILE))
    steal = []
    for w in STEAL_WIDGETS:
        s, e = extract_widget(ah, w)
        wb = ah[s:e]
        assert wb.count(STEAL_OLD) == 1, '%s formula: %d' % (w, wb.count(STEAL_OLD))
        wb = wb.replace(STEAL_OLD, STEAL_NEW)
        assert wb.count('$options.bjx_stealhand') == 1, wb
        steal.append(wb)
    sout = ('/* BJX pack: 0.5 base-combat/actions-hands.twee '
            '<<leftstealnew>>/<<rightstealnew>> + bjx_stealhand '
            '手技加成偷窃判定。 */\n' + '\n'.join(steal) + '\n')
    assert '\r' not in sout, 'CRLF leaked'
    assert sout.count('$options.bjx_stealhand') == 2, sout
    write(os.path.join(OUT, 'bjx-switches-steal.twee'), sout)
    print('bjx-switches-steal.twee written (%d bytes)'
          % len(sout.encode('utf-8')))
    print('  leftstealnew/rightstealnew re-declared, +bjx_stealhand')

    # --- bjx_averymoney: double Avery's pay-outs ---
    av = read(os.path.join(REF, AVERY_FILE))
    total = av.count(AVERY_OLD)
    assert total > 0, 'averymoney expression not found'
    blocks = re.split(r'(?m)^(?=:: )', av)
    kept = []
    got = 0
    for b in blocks:
        m = re.match(r':: ([^\n\[]+)', b)
        if m and m.group(1).strip() in AVERY_PASSAGES:
            b2 = b.replace(AVERY_OLD, AVERY_NEW)
            assert b2 != b, 'no substitution in ' + m.group(1)
            got += b2.count(AVERY_NEW)
            kept.append(b2)
    assert got == total, 'averymoney sites: %d != %d' % (got, total)
    aout = ('/* BJX pack: 0.5 special-avery/main.twee Avery pay-out passages '
            '+ bjx_averymoney 给钱翻倍（%d 处）。 */\n' % got + ''.join(kept))
    if not aout.endswith('\n'):
        aout += '\n'
    assert '\r' not in aout, 'CRLF leaked'
    assert aout.count('$options.bjx_averymoney') == total, aout
    write(os.path.join(OUT, 'bjx-switches-avery.twee'), aout)
    print('bjx-switches-avery.twee written (%d bytes)'
          % len(aout.encode('utf-8')))
    print('  %d Avery pay-out passages re-declared, +bjx_averymoney (%d sites)'
          % (len(kept), got))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
