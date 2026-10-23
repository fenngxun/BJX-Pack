# -*- coding: utf-8 -*-
"""street events 组生成器（BJX 0.4.3.3 -> DoL 0.5.10.12 ModLoader pack）。

独立验证版：输出写到本脚本同目录的 _verify_street/ 下（不写 TWE，不改
build_pack.py）。正式接线时由 build_pack.py 以完全相同的文本写入
work/bjx-pack/tweeFileList（merge 文件直接进；hooks 靠 tweeFileList 顺序 +
passage 同名整段覆盖生效，与 gen_old_sewers 同机制）。

产出两个 twee 文件：

1. bjx-street-events.twee (merge, 4 passages, 全部来自 BJX 新文件
   overworld-town/loc-street/events-bjx.twee):
        :: Raccoons              浣熊群遭遇战主循环（beast 战斗 +
                                combatTrain 连战; 高潮/逃跑/继续三出口）
        :: Raccoons Ejaculation  高潮分流（combatTrain 有余则换下一只,
                                否则 -> Raccoons End）
        :: Raccoon Escape        敌方受创退场（passage 名为单数 Raccoon,
                                BJX 原文如此, 照搬不修正）
        :: Raccoons End          战斗收尾（五种 wounded/ejaculated 组合
                                描述 + clotheson/endcombat/
                                destinationeventend）
   merge cleanup: 零翻译。所依赖宏（beastCombatInit/beastTrainGenerate/
   combatTrainAdvance/beastejaculation/beastwound/stateman/actionsman/
   effectsman/beastsplural/beasttype/alarmstate/beast/destinationeventend）
   与变量（$enemyno/$enemyarousal/$enemyarousalmax/$enemyhealth/
   $combatTrain/$enemywounded/$enemyejaculated/$molestationstart）均为
   0.5 原生, 脚本内逐一断言。
   孤儿备注: BJX 全源码无任何入口链接指向这 4 个 passage（前会话侦察确
   认, 本脚本复核 0.4.3.3 基线/0.5/pack 均无同名）。照常移植（与 BJX 行
   为一致, 内容可用）, 激活需仿 forestraccoon 补触发 widget —— 由主会
   话后续决定, 本组不补入口。

2. bjx-street-events-hooks.twee (0.5 原版 loc-street/events.twee 全文 +
   3 处 BJX patch):
        S1     Street Ex Unlock 撬锁链接: Unlock the basement door ->
               打开地下室门锁 + link payload 内 <<set
               $skulduggeryhands to 1>>（同 sewers 组 E1/E2 模式）
        S2     Street Box Open 撬锁链接: Try to open it (0:05) ->
               尝试打开它 (0:05) + 同上 set（BJX 将 set 置于 payload 内）
        S3     Street Van 段 Just wait 链接之后插入 ghost 穿门逃跑块
               （$options.bjx_eventTF and ($ghost ?? 0) gte 1 ->
               Ghost Van Escape; 块从 BJX 北极星块按行切片, $ghost 读
               取点按本项目惯例加 ?? 0 防御）

   BJX 对 0.4.3.3 loc-street/events.twee 实际共 5 处改动, 经与 0.5 比对
   后另两处不落地（侦察结论称 0 patch, 实测非零, 已按验证要求处理）:
        - Time.daystate -> Time.dayState 大小写修正（High Public Pants
          Down Still 2）: 0.5 已原生修复（0.5 events.twee:404 同段已是
          dayState）, 无需 patch
        - Monster Tower Fly 门控 harpy/birdFly -> bjx_animal 鸟/龙翅膀
          扩展: 0.5 将 Monster Tower 整体迁至 loc-monster-tower/main.twee
          （0.5:58 门控已改为 harpy/birdFly/!$plucked）, 目标内容不在
          loc-street/events.twee 内, 超出本组范围, 留待主会话决定
        - 第 5 处为 966 行纯缩进变化, 无实质, 忽略

依赖（0.5/pack 侧脚本内断言）: <<skulduggerydifficulty>>（0.5
skill-difficulties）、Ghost Van Escape passage（pack
bjx-busstation-events.twee, busstation 组已移植）、$options.bjx_eventTF
与 $ghostIn（pack 已有文件大量使用）。$skulduggeryhands 为 BJX 独有变量
（0.5 无读取点, BJX skill-difficulties 读取且 bjx_stealhand 选项门控）,
写入无害, 与 sewers 组先例保持一致。

3. bjx-street-fly-hooks.twee (飞行系统组, 0.5 原版 14 个街头文件全文 +
   各插一处 <<flywait>> 起飞入口, 共 14 处):
        barb/cliff/connudatus/danube/domus/elk/exposed/harvest/high/mer/
        nightingale/oxford/starfish/wolf
   落点为 BJX 原位置: Travel 链接区的 <<buswait>> 块之后、<<loiter>> 之前;
   守卫照搬 BJX（$options.bjx_animal + bird/dragon 翅膀）。因本文件同时是
   loc-street 的唯一生成器, 飞行组不再另出街头产物（避免同一 passage 被
   两个产物定义); gen_fly.py 只 import build_fly_street_hooks() 做清点与
   交叉校验。
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
PACK = os.path.join(ROOT, 'work', 'bjx-pack', 'tweeFileList')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_street')

STREET_PSG = ['Raccoons', 'Raccoons Ejaculation', 'Raccoon Escape',
              'Raccoons End']

# 飞行系统（BJX flywait）在 14 个街头 page 的起飞入口。守卫、缩进全部
# 沿用 BJX 原文语义, 只把落点对齐到 0.5 的 <<buswait>> / <<loiter>> 之间。
STREET_FLY_FILES = ['barb', 'cliff', 'connudatus', 'danube', 'domus', 'elk',
                    'exposed', 'harvest', 'high', 'mer', 'nightingale',
                    'oxford', 'starfish', 'wolf']

FLY_GATE = ('<<if $options.bjx_animal and '
            '($transformationParts.bird.wings isnot "disabled" and '
            '$birdFly gte 1 or $transformationParts.dragon.wings isnot '
            '"disabled")>>')


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


def read_dir_twee(path):
    """Concatenate every .twee under path (recursive) for widget asserts."""
    chunks = []
    for base, _dirs, files in os.walk(path):
        for fn in sorted(files):
            if fn.endswith('.twee'):
                chunks.append(read(os.path.join(base, fn)))
    return '\n'.join(chunks)


# ---------------------------------------------------------------- events
def gen_events():
    src = read(os.path.join(BJX, 'overworld-town', 'loc-street',
                            'events-bjx.twee'))
    ps = [l[3:] for l in src.split('\n') if l.startswith(':: ')]
    assert ps == STREET_PSG, ps
    # merge cleanup: 零翻译 —— 断言所有需翻译的旧变量/标记都不出现
    for bad in ('$skinColor', '$weather', '$tentacledisable',
                '$swarmdisable', 'Time.daystate', '北极星'):
        assert bad not in src, bad
    # 0.5 原生依赖断言（base-combat / base-system / loc-bus）
    native = read_dir_twee(os.path.join(REF, 'base-combat')) + \
        read_dir_twee(os.path.join(REF, 'base-system')) + \
        read(os.path.join(REF, 'overworld-town', 'loc-bus', 'widgets.twee'))
    for w in ('beastCombatInit', 'beastTrainGenerate', 'combatTrainAdvance',
              'beastejaculation', 'beastwound', 'stateman', 'actionsman',
              'effectsman', 'beastsplural', 'beasttype', 'alarmstate',
              'beast', 'destinationeventend'):
        assert ('<<widget "%s">>' % w) in native, w
    out = ('/* BJX pack: BJX loc-street/events-bjx.twee merged '
           '(4 passages).\n'
           '   Orphan passages: no inbound links anywhere in the BJX '
           'source;\n'
           '   kept for parity/content, activation needs a trigger widget\n'
           '   (see group report). Zero translation needed - all macros\n'
           '   and combat variables are native to 0.5. */\n' + src)
    write('bjx-street-events.twee', out)


# ---------------------------------------------------------------- hooks
def gen_hooks():
    src = read(os.path.join(REF, 'overworld-town', 'loc-street',
                            'events.twee'))
    lines = src.split('\n')

    # S1: Street Ex Unlock pick-lock link -> BJX Chinese form.
    old = ('<<link [[Unlock the basement door|Street Ex Unlock]]>>'
           '<</link>><<skulduggerydifficulty>>')
    assert src.count(old) == 1
    new = ('<<link [[打开地下室门锁|Street Ex Unlock]]>>'
           '<<set $skulduggeryhands to 1>>'
           '<</link>><<skulduggerydifficulty>>')
    i = find_line(lines, old)
    lines[i] = lines[i].replace(old, new)

    # S2: Street Box Open pick-lock link -> BJX Chinese form
    # (set inside the link payload, matching the BJX source).
    old = ('<<link [[Try to open it (0:05)|Street Box Open]]>><<pass 5>>'
           '<</link>><<skulduggerydifficulty>><<crime "thievery">>')
    assert src.count(old) == 1
    new = ('<<link [[尝试打开它 (0:05)|Street Box Open]]>><<pass 5>>'
           '<<set $skulduggeryhands to 1>>'
           '<</link>><<skulduggerydifficulty>><<crime "thievery">>')
    i = find_line(lines, old)
    lines[i] = lines[i].replace(old, new)

    # S3: ghost walk-through escape inserted after the Street Van
    # "Just wait" link. Block sliced from the BJX 北极星 block;
    # $ghost read guarded per house style.
    bjx = read(os.path.join(BJX, 'overworld-town', 'loc-street',
                            'events.twee')).split('\n')
    bi = find_line(bjx, '$options.bjx_eventTF and $ghost gte 1')
    ei = find_line(bjx, '/* 北极星 */', bi)
    block = [l.replace('$ghost gte 1', '($ghost ?? 0) gte 1')
             for l in bjx[bi:ei]]
    assert block[-1].strip() == '<</if>>'
    assert 'Ghost Van Escape' in ''.join(block)
    i = find_line(lines, 'Just wait (1:00)|Street Van Journey')
    assert lines[i + 1].strip() == '<br>'
    lines[i + 2:i + 2] = ['\t/* BJX pack: ghost walk-through escape */'] \
        + block

    # S4: 0.5.12.13 的 <<bhis>> / <<bHe>> / <<bhe>>（base-system/text.twee:660+）
    # 直接读 $NPCList[_na].monster，没有空值保护：$enemyno 为 0 时 _na = -1，
    # 或 $NPCList 为空，就会抛
    #   TypeError: Cannot read properties of undefined (reading 'monster')
    # 并把这串红字留在正文里（玩家 2026-10-23 在 Street Follow Sex Finish 踩到）。
    # 同组两个 passage 开头兜底一张 baseNPC（无 monster 字段 -> widget 走 else
    # 分支输出 "its"，文本可用）。
    guard = ('<<if !$NPCList or !$NPCList[0]>>'
             '<<set $NPCList to [clone(setup.baseNPC)]>><</if>>')
    for pname in ('Street Follow Sex Finish', 'Street Follow Pet'):
        # 不能复用 find_line：它做子串匹配，会先命中
        # `<<link [[Next|Street Follow Sex Finish]]>>` 这类引用行。
        # 也不假设标题下一行就是 <<set $outside>>：0.5.10.12 与 0.5.12.13
        # 的段落头部格式不同（后者中间夹空行）。直接贴标题插即可。
        gi = next(i for i, l in enumerate(lines)
                  if l.strip() == ':: ' + pname)
        lines[gi + 1:gi + 1] = [guard]

    out = '\n'.join(lines)
    out = ('/* BJX pack: vanilla 0.5 overworld-town/loc-street/events.twee'
           ' + BJX street insertions. */\n' + out)
    verify_hooks(out, src)
    write('bjx-street-events-hooks.twee', out)

def verify_hooks(out, vanilla):
    assert out.count('打开地下室门锁') == 1
    assert out.count('尝试打开它 (0:05)') == 1
    assert out.count('<<set $skulduggeryhands to 1>>') == 2
    assert 'Unlock the basement door' not in out
    assert 'Try to open it (0:05)' not in out
    assert out.count('Ghost Van Escape') == 1
    assert out.count('($ghost ?? 0) gte 1') == 1
    assert out.count('$options.bjx_eventTF') == 1
    # S4: 两个 passage 各一张 baseNPC 兜底
    assert out.count('<<set $NPCList to [clone(setup.baseNPC)]>>') == 2
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert len(out) > len(vanilla)
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')
    print('street-hooks verify OK: %d passages, +%d chars' %
          (len(ops), len(out) - len(vanilla)))


# ---------------------------------------------------------------- fly hooks
def fly_block(ind):
    return (ind + '/* BJX pack: 起飞入口（BJX flywait） */\n'
            + ind + FLY_GATE + '\n'
            + ind + '\t<<flywait>>\n'
            + ind + '<</if>>\n')


def build_fly_street_hooks():
    """14 个 0.5 街头文件全量 + 各插一处 <<flywait>>。

    BJX 的落点固定为「Travel 链接区末尾, <<loiter>> 之前」: 原文结构是
        {ind}<<if $exposed lte 0>>
        {ind}\t<<buswait>>
        {ind}<</if>>
        {ind}/* 北极星模组 */
        {ind}<<if $options.bjx_animal and (...)>>
        {ind}\t<<flywait>>
        {ind}<</if>>
        {ind}<<loiter>>
    0.5 保留了同样的 buswait / loiter 相邻结构（仅行号不同）, 因此用
    「buswait 行 + 上一级 if + </if> + loiter」四行整块做锚点; 缩进由
    buswait 行实测 tab 前缀推定, 不靠肉眼（HANDOFF §6.4）。返回
    (合并文本, [(文件, passage 名), ...]), 不落盘 —— gen_fly.py 复用它
    做清点/交叉校验, 本脚本的 gen_fly_hooks() 才写产物。
    """
    chunks = []
    report = []
    for name in STREET_FLY_FILES:
        rel = 'overworld-town/loc-street/%s.twee' % name
        vanilla = read(os.path.join(REF, rel))
        lines = vanilla.split('\n')
        idx = [i for i, l in enumerate(lines) if '<<buswait>>' in l]
        assert len(idx) == 1, '%s: buswait x%d' % (rel, len(idx))
        i = idx[0]
        line = lines[i]
        ind = line[:len(line) - len(line.lstrip('\t'))]
        assert ind.endswith('\t') and line == ind + '<<buswait>>', repr(line)
        ind_if = ind[:-1]
        anchor = (ind_if + '<<if $exposed lte 0>>\n'
                  + ind + '<<buswait>>\n'
                  + ind_if + '<</if>>\n'
                  + ind_if + '<<loiter>>')
        assert vanilla.count(anchor) == 1, \
            '%s: buswait/loiter anchor not unique' % rel

        block = fly_block(ind_if)
        out = vanilla.replace(
            anchor, anchor.replace(ind_if + '<<loiter>>', '')
            + block + ind_if + '<<loiter>>')

        vps, ops = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')], \
                   [l[3:] for l in out.split('\n') if l.startswith(':: ')]
        assert vps == ops, '%s: passage order changed' % rel
        assert out.count('<<flywait>>') == 1, rel
        assert out.count(FLY_GATE) == 1, rel
        assert len(out) - len(vanilla) == len(block), rel
        assert out.count('<<if') - vanilla.count('<<if') == 1, rel
        assert out.count('<</if>>') - vanilla.count('<</if>>') == 1, rel
        chunks.append(out)
        report.append((name + '.twee', vps[0]))

    # 14 个文件的 passage 拼在一起后不得重名（SugarCube 后定义覆盖前定义）。
    names = []
    for c in chunks:
        names.extend([l[3:].split('[')[0].strip()
                      for l in c.split('\n') if l.startswith(':: ')])
    assert len(names) == len(set(names)), 'duplicate passage across street files'
    return ''.join(chunks), report


def gen_fly_hooks():
    """bjx-street-fly-hooks.twee: 街头 14 处起飞入口（0.5 全文为底）。"""
    src, report = build_fly_street_hooks()
    verify_fly_hooks(src, report)
    out = ('/* BJX pack: 飞行系统 - vanilla 0.5 loc-street full-file patches,\n'
           '   one takeoff entry per page (14 total).\n'
           '   Guard verbatim from BJX: $options.bjx_animal (seeded true by\n'
           '   inject_early.js) + bird/dragon wings. Entry sits between the\n'
           '   <<buswait>> block and <<loiter>> (BJX original position). */\n'
           + src.lstrip('\n'))
    write('bjx-street-fly-hooks.twee', out)


def verify_fly_hooks(out, report):
    assert len(report) == len(STREET_FLY_FILES)
    assert out.count('<<flywait>>') == len(STREET_FLY_FILES)
    assert out.count(FLY_GATE) == len(STREET_FLY_FILES)
    assert out.count('起飞入口') == len(STREET_FLY_FILES)
    # 每处插入都在 loiter 之前一行, 且紧邻起飞块的 <</if>>。
    for i, l in enumerate(out.split('\n')):
        if '<<flywait>>' in l:
            assert out.split('\n')[i + 1].endswith('<</if>>')
            assert out.split('\n')[i + 2].endswith('<<loiter>>')
    print('street-fly verify OK: %d entries in %d files' %
          (len(report), len(report)))


# ---------------------------------------------------------------- cross
def cross_check():
    """The 4 merged passages must not collide with any 0.5 loc-street
    passage nor with anything already shipped in the pack."""
    ev = read(os.path.join(OUT, 'bjx-street-events.twee'))
    new_ps = [l[3:].split('[')[0].strip()
              for l in ev.split('\n') if l.startswith(':: ')]
    assert new_ps == STREET_PSG, new_ps
    known = set()
    street = os.path.join(REF, 'overworld-town', 'loc-street')
    for fn in os.listdir(street):
        if fn.endswith('.twee'):
            for l in read(os.path.join(street, fn)).split('\n'):
                if l.startswith(':: '):
                    known.add(l[3:].split('[')[0].strip())
    for fn in os.listdir(PACK):
        # skip our own previous output: the build now regenerates in place
        # (no fresh dir), so the last run's copy is still present and would
        # self-match every new passage name.
        if fn.endswith('.twee') and fn != 'bjx-street-events.twee':
            for l in read(os.path.join(PACK, fn)).split('\n'):
                if l.startswith(':: '):
                    known.add(l[3:].split('[')[0].strip())
    clash = [p for p in new_ps if p in known]
    assert not clash, 'passage name clash: %s' % clash
    # pack already ships Raccoons Love/Rape + Forest Raccoon lines - none
    # of them may equal our four names (checked above via the full set)
    print('cross-check OK: 4 new passages, no collisions with 0.5/pack')


def main():
    gen_events()
    gen_hooks()
    gen_fly_hooks()
    cross_check()
    print('ALL STREET CHECKS PASSED')


if __name__ == '__main__':
    main()