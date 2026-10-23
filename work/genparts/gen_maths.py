# -*- coding: utf-8 -*-
"""maths 组生成器（BJX 0.4.3.3 -> DoL 0.5.10.12 ModLoader pack）。

独立验证版：输出写到本脚本同目录的 _verify_maths/ 下（不写 TWE，不改
build_pack.py）。正式接线时由 build_pack.py 以完全相同的文本写入
work/bjx-pack/tweeFileList（hooks 文件是 0.5 全文 + BJX patch，靠
tweeFileList 顺序 + passage 同名整段覆盖生效，与 gen_old_sewers 同机制）。

产出三个 twee 文件：

1. bjx-maths-project-events.twee (merge, 7 passages, 全部来自 BJX 新文件
   loc-school/maths-project-bjx.twee) —— lakehouse 数模项目遭遇线:
        :: Maths Project Void Lake                 致幻坠湖遇狼 (beastNEWinit)
        :: Maths Project Void Lake Rape            狼战循环
        :: Maths Project Void Lake Rape Finish     狼战收尾 -> Lake Shore
        :: Maths Project Endure Lake House         卧床忍耐 -> Lake House Bedroom
        :: Maths Project Outside Lake House        出门遇狼
        :: Maths Project Outside Lake House Rape   狼战循环
        :: Maths Project Outside Rape Lake House Finish  狼战收尾 -> Lake Shore
   merge cleanup: `<<if $monster is 1 or $bestialitydisable is "f">>` ->
   `<<if ($monster ?? 0) is 1 or $settings.bestialityEnabled>>`
   （$monster 在 0.5 已废弃, ingame.js:3063 改由 settings 计算, 防御读取;
   $bestialitydisable is "f" 是铁律 2 的标准映射）。其余变量/宏
   （$exposed/$molestationstart/$enemytrust/$enemyarousal/$enemyno/
   _combatend/<<beastNEWinit>>/<<beastCombatInit>>/<<genitals_are>>/
   <<nexttext>> 等）0.5 侧均已确认存在。

2. bjx-maths-project-hooks.twee (0.5 原版 loc-school/maths-project.twee
   全文 + 6 处 BJX patch, 块内容全部从 BJX 修改型文件的北极星标记对之间
   切片提取, 零手抄):
        P1  Maths Project: home Stop 分支后插 lakehouse elseif
            （停止|Lake House Bedroom; BJX 块尾的 <br> 丢弃——0.5 把
            每分支的 <br> 提到了 if 外, 对齐 0.5 结构）
        P2  Maths Project Work 结尾: home Next|Bedroom 后插 lakehouse
            elseif（停止|Lake House Bedroom, BJX 原文即用 停止）
        P3  Maths Project Stim 催情线: home 块后插 lakehouse elseif
            （忍受 (4:00)|Maths Project Endure Lake House + 出门|
            Maths Project Outside Lake House）
        P4  Maths Project Stim 致幻线: 两段英文整替 BJX 中文段 + Next
            链接改 lakehouse 分流（继续|Maths Project Void Lake）。
            0.5 差异适配三处: (a) 第一段中文内补 <<elseif $location is
            "avery_mansion">>书房, 保住 0.5 的 the study 措辞（BJX 整段
            替换会丢）; (b) $bus 判断保留 0.5 版本 home or avery_mansion
            -> residential（BJX 未改这行, 0.4.3.3 基线只有 home）;
            (c) elseif 行自身的 $rng gte 51 保持 0.5（BJX 基线 50,
            但 BJX 没改这行, 不在标记块内）
        P5  Maths Project Stim Robin 线结尾: home Next|Bedroom 后插
            lakehouse elseif（继续|Lake House Bedroom）
        P6  Stim Dealer: Steal stimulant 链接改 偷兴奋剂 +
            <<set $skulduggeryhands to 1>>（与 sewers 组撬锁 patch 同款）
   P2/P5 同构锚点（if home -> Next|Bedroom / elseif mansion -> Next|
   Mansion Study）按缩进深度区分: 1-tab if 是 Work 结尾, 2-tab if 是
   Robin 线结尾。

3. bjx-maths-events-hooks.twee (0.5 原版 loc-school/classes/
   maths-events.twee 全文 + 1 处 patch):
        E1  Maths Whitney Undies Show: Try to trick Whitney 链接改
            试着骗过惠特尼 + <<set $skulduggeryhands to 1>>

跨组依赖（cross_check 只报告不 assert）: P1/P2/P5 与 merge 文件的链接
目标 Lake House Bedroom、以及 $location is "lakehouse" 的赋值点, 全在
BJX 独有的 loc-lakehouse-bjx/（4 个文件, 未移植, 主会话排期）; Lake Shore
为 0.5 原生（overworld-forest/loc-lake/main.twee:1）。
"""

import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_maths')


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def write(name, text):
    os.makedirs(OUT, exist_ok=True)
    if not text.endswith('\n'):
        text += '\n'
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print(f'{name}: {len(text.splitlines())} lines written')


def find_line(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    raise AssertionError('line not found: ' + needle[:60])


def marked_blocks(lines):
    """Extract the content between each /* 北极星模组 */ ... /* 北极星 */
    marker pair of a BJX modified file (marker lines dropped)."""
    out, cur = [], None
    for l in lines:
        s = l.strip()
        if s == '/* 北极星模组 */':
            assert cur is None, 'nested marker open'
            cur = []
        elif s == '/* 北极星 */':
            assert cur is not None, 'marker close without open'
            out.append(cur)
            cur = None
        elif cur is not None:
            cur.append(l)
    assert cur is None, 'unclosed marker'
    return out


# ---------------------------------------------------------------- events
def gen_events():
    src = read(os.path.join(BJX, 'overworld-town', 'loc-school',
                            'maths-project-bjx.twee'))
    pairs = [
        ('<<if $monster is 1 or $bestialitydisable is "f">>',
         '<<if ($monster ?? 0) is 1 or $settings.bestialityEnabled>>'),
    ]
    for old, new in pairs:
        assert src.count(old) == 1, 'events cleanup source missing: ' + old
        src = src.replace(old, new)
    assert '$bestialitydisable' not in src
    assert '[[继续|Lake Shore]]' in src
    assert '<<beastNEWinit 1 wolf>>' in src
    out = ('/* BJX pack: BJX maths-project-bjx.twee merged (7 passages)\n'
           '   with 0.5 translations. */\n' + src)
    ps = [l[3:].split('[')[0].strip()
          for l in out.split('\n') if l.startswith(':: ')]
    assert len(ps) == 7, ps
    print('merge passages: ' + ' / '.join(ps))
    write('bjx-maths-project-events.twee', out)
    return ps


# ---------------------------------------------------------- project hooks
def gen_project_hooks():
    src = read(os.path.join(REF, 'overworld-town', 'loc-school',
                            'maths-project.twee'))
    bjx = read(os.path.join(BJX, 'overworld-town', 'loc-school',
                            'maths-project.twee'))
    lines = src.split('\n')
    blocks = marked_blocks(bjx.split('\n'))
    assert len(blocks) == 6, 'expected 6 marked blocks, got %d' % len(blocks)
    p1, p2, p3, p4, p5, p6 = blocks

    # P1: Maths Project - lakehouse stop link. Drop the BJX trailing <br>:
    # 0.5 hoisted the per-branch <br> out of the if chain.
    assert '[[停止|Lake House Bedroom]]' in ''.join(p1)
    assert p1[0].strip() == '<<elseif $location is "lakehouse">>'
    assert p1[-1].strip() == '<br>'
    p1 = p1[:-1]
    i = find_line(lines, '<<getouticon>><<link [[Stop|Bedroom]]>><</link>>')
    assert lines[i + 1].startswith('<<elseif $location is "avery_mansion">>')
    lines[i + 1:i + 1] = ['/* BJX pack: lakehouse stop link */'] + p1
    print('P1 OK: Maths Project lakehouse stop elseif')

    # P2 + P5: the two `Next|Bedroom` links that open a home branch.
    # Distinguished by indent depth: 1-tab if (Work end) vs 2-tab if
    # (Stim robin line). Insert deepest first so indexes stay valid.
    assert '[[停止|Lake House Bedroom]]' in ''.join(p2)
    assert '[[继续|Lake House Bedroom]]' in ''.join(p5)
    targets = []
    for i, l in enumerate(lines):
        if '<<link [[Next|Bedroom]]>><</link>>' in l and \
                lines[i - 1].strip() == '<<if $location is "home">>':
            targets.append((i, len(l) - len(l.lstrip('\t'))))
    assert len(targets) == 2, targets
    assert [d for _, d in targets] == [2, 3], targets
    for i, depth in sorted(targets, reverse=True):
        if depth == 2:
            block = ['/* BJX pack: lakehouse next link (work end) */'] + p2
        else:
            block = ['/* BJX pack: lakehouse next link (robin line) */'] + p5
        assert lines[i + 1].strip() == \
            '<<elseif $location is "avery_mansion">>'
        lines[i + 1:i + 1] = block
    print('P2 OK: Maths Project Work lakehouse stop elseif')
    print('P5 OK: Maths Project Stim robin-line lakehouse next elseif')

    # P3: Stim aphrodisiac line - lakehouse endure/go-outside branch,
    # spliced in front of the avery_mansion elseif.
    assert '[[忍受 (4:00)|Maths Project Endure Lake House]]' in ''.join(p3)
    assert '[[出门|Maths Project Outside Lake House]]' in ''.join(p3)
    assert p3[0].strip() == '<<elseif $location is "lakehouse">>'
    i = find_line(lines, '[[Go outside|Maths Project Outside Home]]')
    assert lines[i + 1].strip() == '<br>'
    assert lines[i + 2].strip() == '<<elseif $location is "avery_mansion">>'
    lines[i + 2:i + 2] = ['/* BJX pack: lakehouse endure/go-outside */'] + p3
    print('P3 OK: Maths Project Stim lakehouse endure/outside elseif')

    # P4: Stim hallucination line - two paragraphs -> BJX Chinese, plus a
    # lakehouse fork on the Next link.
    assert 'Maths Project Void Lake' in ''.join(p4)
    assert '你坐下来欣赏自己的成果' in ''.join(p4)
    # (a) keep the 0.5 avery_mansion wording BJX's rewrite would drop
    n = 0
    for k, l in enumerate(p4):
        if '你的房间<<else>>图书馆' in l:
            p4[k] = l.replace(
                '你的房间<<else>>图书馆',
                '你的房间<<elseif $location is "avery_mansion">>书房'
                '<<else>>图书馆')
            n += 1
    assert n == 1, 'P4 mansion wording patch failed'
    # (b) keep the 0.5 $bus guard (home or avery_mansion -> residential)
    n = 0
    for k, l in enumerate(p4):
        if l.strip() == '<<if $location is "home">>':
            p4[k] = l.replace('<<if $location is "home">>',
                              '<<if $location is "home" or '
                              '$location is "avery_mansion">>')
            n += 1
    assert n == 1, 'P4 bus guard patch failed'
    i = find_line(lines, '<<elseif $mathsstimused is 3 or $mathsstimused '
                         'gte 4 and $rng gte 51>>')
    j = find_line(lines, '<<elseif $mathsstimrobin isnot 1', i + 1)
    seg = '\n'.join(lines[i + 1:j])
    assert 'concentrated hallucinogen' in seg
    assert '[[Next|Maths Project Void]]' in seg
    assert '<<set $bus to "residential">>' in seg
    lines[i + 1:j] = ['/* BJX pack: hallucination scene -> BJX Chinese + '
                      'lakehouse fork */'] + p4
    print('P4 OK: Maths Project Stim hallucination scene BJX rewrite '
          '+ lakehouse fork (mansion wording + bus guard kept 0.5)')

    # P6: Stim Dealer steal link -> BJX wording + skulduggeryhands.
    assert len(p6) == 1 and '[[偷兴奋剂|Stim Dealer Steal]]' in p6[0]
    old = ('<<link [[Steal stimulant|Stim Dealer Steal]]>><</link>>'
           '<<skulduggerydifficulty>>')
    assert src.count(old) == 1
    i = find_line(lines, old)
    assert lines[i].strip() == old
    lines[i] = p6[0]
    print('P6 OK: Stim Dealer steal link BJX rewrite')

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 loc-school/maths-project.twee + BJX '
           'insertions. */\n' + out)

    verify_project_hooks(out, src)
    write('bjx-maths-project-hooks.twee', out)


def verify_project_hooks(out, vanilla):
    assert out.count('<<elseif $location is "lakehouse">>') == 4  # P1/P2/P3/P5
    assert out.count('<<if $location is "lakehouse">>') == 1      # P4 next fork
    assert out.count('$location is "home" or $location is "lakehouse">') == 2
    assert out.count('Lake House Bedroom') == 3
    assert out.count('Maths Project Endure Lake House') == 1
    assert out.count('Maths Project Outside Lake House') == 1
    assert out.count('[[继续|Maths Project Void Lake]]') == 1
    assert out.count('书房') == 1
    # P4 keeps the 0.5 $bus guard; 2 more untouched copies live in the
    # Endure/Outside Home passages -> count must match vanilla (3)
    assert out.count('<<set $bus to "residential">>') == \
        vanilla.count('<<set $bus to "residential">>')
    assert out.count('$rng gte 51') == 1
    assert out.count('[[偷兴奋剂|Stim Dealer Steal]]') == 1
    assert out.count('<<set $skulduggeryhands to 1>>') == 1
    assert 'Steal stimulant' not in out
    # code-level count (the /* BJX pack: ... */ patch comments also mention
    # "lakehouse"; only $location checks are counted): P1/P2/P3/P5 elseif
    # + P4 two inline or-guards + P4 next-fork if
    assert out.count('$location is "lakehouse"') == \
        vanilla.count('$location is "lakehouse"') + 7
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert len(out) > len(vanilla)
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')
    print('project-hooks verify OK: %d passages, +%d chars' %
          (len(ops), len(out) - len(vanilla)))


# ----------------------------------------------------------- events hooks
def gen_events_hooks():
    src = read(os.path.join(REF, 'overworld-town', 'loc-school', 'classes',
                            'maths-events.twee'))
    bjx = read(os.path.join(BJX, 'overworld-town', 'loc-school', 'classes',
                            'maths-events.twee'))
    lines = src.split('\n')
    blocks = marked_blocks(bjx.split('\n'))
    assert len(blocks) == 1, 'expected 1 marked block, got %d' % len(blocks)
    e1 = blocks[0]
    assert len(e1) == 1 and '[[试着骗过惠特尼|Maths Whitney Undies Trick]]' \
        in e1[0]
    old = ('<<link [[Try to trick Whitney|Maths Whitney Undies Trick]]>>'
           '<</link>><<skulduggerydifficulty>>')
    assert src.count(old) == 1
    i = find_line(lines, old)
    assert lines[i].strip() == old
    lines[i] = e1[0]
    print('E1 OK: Maths Whitney Undies Show trick link BJX rewrite')
    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 loc-school/classes/maths-events.twee '
           '+ BJX insertions. */\n' + out)
    verify_events_hooks(out, src)
    write('bjx-maths-events-hooks.twee', out)


def verify_events_hooks(out, vanilla):
    assert out.count('[[试着骗过惠特尼|Maths Whitney Undies Trick]]') == 1
    assert out.count('<<set $skulduggeryhands to 1>>') == 1
    assert 'Try to trick Whitney' not in out
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert len(out) > len(vanilla)
    print('events-hooks verify OK: %d passages, +%d chars' %
          (len(ops), len(out) - len(vanilla)))


# ---------------------------------------------------------------- cross
def cross_check(new_ps):
    """The 7 new passages must not collide with any 0.5 passage, and the
    pack's own link targets must be provided by the merge file. The
    Lake House Bedroom / lakehouse-location dependency on the unported
    loc-lakehouse-bjx/ group is reported, not asserted."""
    known = set()
    for dirpath, _, files in os.walk(REF):
        for fn in files:
            if fn.endswith('.twee'):
                for l in read(os.path.join(dirpath, fn)).split('\n'):
                    if l.startswith(':: '):
                        known.add(l[3:].split('[')[0].strip())
    clash = [p for p in new_ps if p in known]
    assert not clash, 'passage name clash with 0.5: %s' % clash
    ev = read(os.path.join(OUT, 'bjx-maths-project-events.twee'))
    ev_ps = {l[3:].split('[')[0].strip()
             for l in ev.split('\n') if l.startswith(':: ')}
    hooks = read(os.path.join(OUT, 'bjx-maths-project-hooks.twee'))
    # the three lakehouse entry points: linked by the hooks file, defined
    # by the merge file
    for target in ('Maths Project Endure Lake House',
                   'Maths Project Outside Lake House',
                   'Maths Project Void Lake'):
        assert target in ev_ps, 'merge file must provide ' + target
        assert target in hooks, 'hooks file must link to ' + target
    # the deeper passages are only reached from inside the merge file
    for target in ('Maths Project Void Lake Rape',
                   'Maths Project Void Lake Rape Finish',
                   'Maths Project Outside Lake House Rape',
                   'Maths Project Outside Rape Lake House Finish'):
        assert target in ev_ps, 'merge file must provide ' + target
    # merge-internal link closure: every [[..|target]] must resolve to a
    # merge passage, a 0.5 passage, or the cross-group Lake House Bedroom

    dangling = set()
    for m in re.finditer(r'\[\[[^\]|]+\|([^\]]+)\]\]', ev):
        t = m.group(1).strip()
        if t not in ev_ps and t not in known:
            dangling.add(t)
    assert dangling == {'Lake House Bedroom'}, dangling
    assert 'Lake House Bedroom' in hooks
    # 0.5 has no Lake House: provided by BJX loc-lakehouse-bjx/ (unported)
    assert 'Lake House Bedroom' not in known
    assert 'Lake Shore' in known
    print('cross-check OK: 7 new passages unique in 0.5, link closure holds')
    print('TODO (cross-group): Lake House Bedroom passages + the writers '
          'that set $location to "lakehouse" live in BJX '
          'overworld-forest/loc-lakehouse-bjx/ (4 files, not yet ported); '
          'maths hooks degrade gracefully until that group lands.')


def main():
    ps = gen_events()
    gen_project_hooks()
    gen_events_hooks()
    cross_check(ps)
    print('ALL MATHS CHECKS PASSED')


if __name__ == '__main__':
    main()