# -*- coding: utf-8 -*-
"""temple 组生成器（BJX 0.4.3.3 -> DoL 0.5.10.12 ModLoader pack）。

独立验证版：输出写到本脚本同目录的 _verify_temple/ 下（不写 TWE，不改
build_pack.py）。正式接线时由 build_pack.py 以完全相同的文本写入
work/bjx-pack/tweeFileList（hooks 靠 tweeFileList 顺序 + passage 同名
整段覆盖生效，与 gen_old_sewers / gen_churchyard 同机制）。

产出四个 twee 文件：

1. bjx-temple-events.twee (merge, 4 passages, 来自 BJX 新文件
   overworld-town/loc-temple/main-bjx.twee + science-project-bjx.twee):
        :: Jordan Slime Inquiry     玩家是史莱姆时向约旦问询（湖畔废墟
                                    /血月仪式提示, -> lake 组 TF 线索）
        :: Jordan Slime Inquiry 2   接触基座恢复人类后的回报（劝告血月
                                    别去废墟）
        :: Temple Ghost             驱魔任务中枢（$exorcism 0/2 两段,
                                    说好了 -> $exorcism to 1 / 再想想 ->
                                    $exorcism to 2; 驱魔仪式本体在 ghost
                                    组, 本组只挂入口）
        :: Temple Lichen Ghost      幽灵体穿墙直取塔顶地衣（BJX TF 捷径）
   merge cleanup: $exorcism 相等比较读取点 -> ($exorcism ?? 0) 防御
   （undefined is 0 为 false 会让两段全不显示）; $ghost gte 1 保持
   verbatim（gte 比较 undefined -> false, 语义正确, churchyard/
   busstation/landfill 同款先例）; Temple Lichen Ghost 补
   <<wearProp "lichen" "pink">>（0.5 把拿地衣的 Help/Lock/Climb 三路
   都改成了挂 prop, Ghost 是并列第四路, 缺了会拿不到 prop）。

2. bjx-temple-main-hooks.twee (0.5 原版 loc-temple/main.twee 全文 +
   6 处 BJX patch):
        T1  Temple: 睡着的 Sydney 旁插"偷偷安装贞操带/贞操笼"双链接
            （$skulduggerydifficulty 800 + <<pass 30>>, C.npc.Sydney.
            chastity/penis 判断, 链接文本内嵌 <<nnpc_him "Sydney">>
            —— 0.5 Wake 链接同款官方写法; 目标 passage Temple Sydney
            Chastity 在 sydney 组, 见 TODO）
        T2  Temple: Plate 事件 Steal 链接 -> 偷窃 + $skulduggeryhands
            （set 放 <</link>> 后渲染期, sewers E1/E2 写法）
        T3  Temple Jordan: numberOfEarSlime() 块后插 slime/ghost 四链接
            （<<askicon>> -> <<socialiseicon "ask">>; BJX 的两个
            $onemoreslime/$exorcism undefined-init 块删除, 读取点改
            ?? 0 防御; $slime/$onemoreslime ?? 0 per sewers 先例）
        T4  Temple Jordan: 宽恕入口三分支 -> BJX 六分支（fallenangel
            2-4 请求宽恕 / bjx_divine 买赎罪券拿"永恒救赎" / 非
            divine 买赎罪券移除特质 / 付不起 x2 / 赎罪还不够; BJX
            链接里的 <<set $money -= 1000000>> 删除——0.5 把扣款挪
            到了 Temple Buy Forgiveness 入口 -> BF1 的链接里, 照抄
            会双扣; BJX 加的 <<garousal>> 保留; <<fallenangel>>/
            <<note>> 0.5 宏存在）
        T5  Temple Buy Forgiveness 5: 三行裸 set -> $options.bjx_divine
            if/else（divine: fallenangel 5 + halo default + wings
            fallenplus; else: 0.5 原值 1/disabled/disabled;
            transformationParts.fallenAngel 键与 "fallenplus" 值在
            0.5 canvasmodel-img.js 原生支持）
        T6  Temple Slime: 放弃 BJX 整段替换（0.5 加了 Gwylan 短期援助
            新线 + $gwylanJordanSlime 设置, 整替会砍掉）, 改为两段
            局部插入: 感染变史莱姆记载段（紫色世界变体, TF 线索）
            插在 blood moon 祭坛段后; 下水道残留警告段插在沉湖段后,
            0.5 的 Gwylan 段原样保留
    侦察结论里的"幻觉段（0.5 已改 $rng gte 51）"在 BJX temple 三文件
    中无对应插入物——BJX 全部插入已按中文行 + 北极星标记穷尽扫描
    （main 19 行 / prayer 1 行 / science 3 行, 全部落入上述 T1-T6 +
    P1 + S1/S2）; 0.5 的 $rng gte 51 段在 events.twee（Temple
    Donations）与 garden.twee, 这些文件 BJX 未携带未修改, 保持 0.5
    原文即满足"以 0.5 文本为底"。

3. bjx-temple-prayer-hooks.twee (0.5 原版 loc-temple/prayer.twee 全文
   + 1 处 patch):
        P1  Temple Prayer: Holy Embrace 链接 -> BJX 中文块
            （放开心神, 拥抱这一切; $options.bjx_greengod 分支让
            awareness 反向 -12 / <<llawareness>>; 非 greengod 保持
            0.5 行为 +12 / <<ggawareness>>, 两宏 0.5 text.js 原生）

4. bjx-temple-science-hooks.twee (0.5 原版 loc-temple/science-project.twee
   全文 + 2 处 patch):
        S1  Temple Lichen: Pick the lock -> 撬锁 + $skulduggeryhands
            （保留 0.5 pcAreArmsBound 门控与 <<lockicon "pick">> 前缀,
            set 放 link 外渲染期 per sewers E1/E2）
        S2  Temple Lichen: Climb 链接后插幽灵穿门入口
            （$options.bjx_eventTF and $ghost gte 1 verbatim per
            churchyard h2 先例; $ghostIn reset/set 结构保留; 目标
            Temple Lichen Ghost 在本组 merge 文件内）

北极星块内容全部从 BJX 源文件按标记行切片提取（零手抄）, 块内做
变量翻译: $NPCName[$NPCNameList.indexOf("Sydney")].xxx ->
C.npc.Sydney.xxx（pronouns.him 拼接 -> 内嵌 <<nnpc_him "Sydney">>）;
$slime gt 0 -> ($slime ?? 0) gt 0; $onemoreslime is 0/1 ->
($onemoreslime ?? 0) is 0/1; $exorcism is 0/2 -> ($exorcism ?? 0)
is 0/2; $ghost gte 1 / $options.bjx_eventTF / $options.bjx_divine /
$options.bjx_greengod 保持 verbatim（gte 比较 truthy 检查时
undefined 均按预期取 false, 见 churchyard h1/h2 政策注记）。

依赖（0.5 侧均已确认）: <<socialiseicon "ask">>（base-system/
images.twee:1434）、<<lockicon "pick">>（images.twee:335）、
<<fallenangel>>（base-system/text.twee:4852）、<<llawareness>>/
<<ggawareness>>（base-system/text.js statDisplay.create）、
<<note>>、<<garousal>>、<<wearProp>>、<<nnpc_him "Sydney">>
（text.twee:5649）、C.npc.Sydney.chastity{penis,vagina,anus} 与
.penis（npcNamed.twee:302 + base-system/named-npcs.twee
initnpcgendersingle）、$specialTransform、$transformationParts.
fallenAngel + "fallenplus"（canvasmodel-img.js:405）、
numberOfEarSlime()、$forgiveintro、$fallenangel、$gwylanJordanSlime
（0.5 原生）、$options.bjx_eventTF（inject_early.js seed）。

跨组依赖 TODO（不阻断）:
  - Temple Sydney Chastity 链接目标 passage 在 sydney 组
    （BJX special-sydney/temple-bjx.twee）
  - $skulduggeryhands 消费点 = BJX skill-difficulties hook（主会话接线）
  - $options.bjx_divine / $options.bjx_greengod 未被 inject_early.js
    seed; undefined 按 false 走 else 分支 = 0.5 默认行为, 语义安全;
    若主会话想要 divine/greengod 开关需补 seed
  - 驱魔仪式本体（$exorcism to 1 之后的进展）在 ghost 组
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_temple')


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


def retab(block):
    """Normalise leading whitespace to tabs (4 columns per level). BJX
    blocks mix tabs and spaces; the 0.5 hosts are pure-tab."""
    out = []
    for l in block:
        stripped = l.lstrip(' \t')
        if not stripped:
            out.append('')
            continue
        lead = l[:len(l) - len(stripped)]
        depth = len(lead.expandtabs(4)) // 4
        out.append('\t' * depth + stripped)
    return out


HDR = '/* BJX pack: vanilla 0.5 {src} + BJX temple insertions. */\n'


# ---------------------------------------------------------------- events
def gen_events():
    src = read(os.path.join(BJX, 'overworld-town', 'loc-temple',
                            'main-bjx.twee'))
    pairs = [
        # $exorcism equal-comparisons must be ?? 0 guarded: BJX expects
        # undefined ("never started the exorcism thread") to show the
        # first branch, but `undefined is 0` compares false.
        ('<<if $ghost gte 1 and $exorcism is 0>>',
         '<<if $ghost gte 1 and ($exorcism ?? 0) is 0>>'),
        ('<<elseif $ghost gte 1 and $exorcism is 2>>',
         '<<elseif $ghost gte 1 and ($exorcism ?? 0) is 2>>'),
    ]
    for old, new in pairs:
        assert src.count(old) == 1, 'main-bjx cleanup missing: ' + old
        src = src.replace(old, new)
    assert src.count('<<set $exorcism to 1>>') == 1
    assert src.count('<<set $exorcism to 2>>') == 1
    assert '<<askicon>>' not in src and '<<lockpickicon>>' not in src

    lichen = read(os.path.join(BJX, 'overworld-town', 'loc-temple',
                               'science-project-bjx.twee'))
    # 0.5 turns every lichen pickup route (Help/Lock/Climb) into a
    # wearProp; the Ghost shortcut is the parallel fourth route.
    anchor = ('<<set $outside to 0>><<set $location to "temple">>'
              '<<temple_effects>><<effects>>')
    assert lichen.count(anchor) == 1
    lichen = lichen.replace(anchor, anchor + '\n<<wearProp "lichen" "pink">>')

    merged = src.rstrip('\n') + '\n\n' + lichen
    ps = [l[3:].split('[')[0].strip()
          for l in merged.split('\n') if l.startswith(':: ')]
    assert ps == ['Jordan Slime Inquiry', 'Jordan Slime Inquiry 2',
                  'Temple Ghost', 'Temple Lichen Ghost'], ps
    assert merged.count('($exorcism ?? 0)') == 2
    assert merged.count('<<wearProp "lichen" "pink">>') == 1
    out = ('/* BJX pack: BJX temple additions (Jordan slime inquiries,\n'
           '   Temple Ghost exorcism hub, Temple Lichen Ghost wraith\n'
           '   shortcut) merged with 0.5 translations. */\n' + merged)
    write('bjx-temple-events.twee', out)
    print('events merge OK: %d passages %s' % (len(ps), ps))


# ------------------------------------------------------------- main hooks
def gen_main_hooks():
    src = read(os.path.join(REF, 'overworld-town', 'loc-temple', 'main.twee'))
    bjx = read(os.path.join(BJX, 'overworld-town', 'loc-temple', 'main.twee'))
    lines = src.split('\n')
    bjx_lines = bjx.split('\n')

    # T1: sneak a chastity device onto the sleeping Sydney (after the
    # Wake link, inside the "late for school" branch).
    bi = find_line(bjx_lines, '<<set $skulduggerydifficulty to 800>>')
    ei = find_line(bjx_lines, '/* 北极星 */', bi)
    t1 = retab(bjx_lines[bi:ei])
    for old, new in [
        ('"偷偷给" + $NPCName[$NPCNameList.indexOf("Sydney")].pronouns.him + "安装贞操带"',
         '偷偷给<<nnpc_him "Sydney">>安装贞操带'),
        ('"偷偷给" + $NPCName[$NPCNameList.indexOf("Sydney")].pronouns.him + "安装贞操笼"',
         '偷偷给<<nnpc_him "Sydney">>安装贞操笼'),
    ]:
        assert sum(1 for l in t1 if old in l) == 1, 'T1 link missing: ' + old
        t1 = [l.replace(old, new) for l in t1]
    t1 = [l.replace('$NPCName[$NPCNameList.indexOf("Sydney")].', 'C.npc.Sydney.')
          for l in t1]
    assert not any('NPCName' in l for l in t1)
    assert sum(1 for l in t1 if 'Temple Sydney Chastity' in l) == 2
    i = find_line(lines, 'Wake <<nnpc_him "Sydney">>|Temple Sydney Wakeup')
    assert lines[i + 1].strip() == '<br>'
    lines[i + 2:i + 2] = (
        ['\t\t\t\t/* BJX pack: sneak a chastity device onto the sleeping',
         '\t\t\t\t   Sydney (target passage Temple Sydney Chastity comes',
         '\t\t\t\t   with the sydney group; C.npc fields are 0.5-native). */']
        + t1)
    print('T1 sydney chastity links: OK (2 links, +%d lines)' % len(t1))

    # T2: plate Steal link -> 偷窃 + $skulduggeryhands (render-time set
    # after </link>, sewers E1/E2 style).
    i = find_line(lines, '[[Steal|Temple Plate Steal]]')
    assert '<<crimeUp 5 "petty">>' in lines[i]
    assert '<<set $skulduggeryhands' not in lines[i]
    lines[i] = lines[i].replace('[[Steal|', '[[偷窃|')
    lines[i] = lines[i].replace(
        '<</link>><<crime "petty">>',
        '<</link>><<set $skulduggeryhands to 1>><<crime "petty">>')
    print('T2 plate steal: OK')

    # T3: four slime/ghost inquiry links after the ear-slime block.
    # Start at the first real link if: the two BJX undefined-init blocks
    # ($onemoreslime/$exorcism) are dropped, read sites get ?? 0 guards
    # instead (same effect, less boot noise).
    bi = find_line(bjx_lines, '<<if $slime gt 0 and $onemoreslime is 0>>')
    ei = find_line(bjx_lines, '/* 北极星 */', bi)
    t3 = retab(bjx_lines[bi:ei])
    joined3 = '\n'.join(t3)
    assert joined3.count('<</if>>') == 4 and joined3.count('<<if ') == 4, t3
    for old, new, want in [
        ('<<askicon>>', '<<socialiseicon "ask">>', 4),
        ('<<if $slime gt 0 and $onemoreslime is 0>>',
         '<<if ($slime ?? 0) gt 0 and ($onemoreslime ?? 0) is 0>>', 1),
        ('<<if $slime gt 0 and $onemoreslime is 1>>',
         '<<if ($slime ?? 0) gt 0 and ($onemoreslime ?? 0) is 1>>', 1),
        ('<<if $ghost gte 1 and $exorcism is 0>>',
         '<<if $ghost gte 1 and ($exorcism ?? 0) is 0>>', 1),
        ('<<if $ghost gte 1 and $exorcism is 2>>',
         '<<if $ghost gte 1 and ($exorcism ?? 0) is 2>>', 1),
    ]:
        got = sum(1 for l in t3 if old in l)
        assert got == want, 'T3 missing (%d/%d): %s' % (got, want, old)
        t3 = [l.replace(old, new) for l in t3]
    i = find_line(lines, '<<if numberOfEarSlime()>>')
    k = find_line(lines, '<</if>>', i)
    assert k - i == 3, 'ear slime block shape changed'
    lines[k + 1:k + 1] = (
        ['\t/* BJX pack: slime/ghost inquiry links (Jordan Slime Inquiry',
         '\t   1/2 + Temple Ghost come with this pack\'s events file). */']
        + t3)
    print('T3 slime/ghost inquiry links: OK (4 links, +%d lines)' % len(t3))

    # T4: forgiveness entry fork, 0.5 3-branch -> BJX 6-branch. The BJX
    # link-side money deduction is dropped: 0.5 moved the £10,000 charge
    # into the Temple Buy Forgiveness entry -> BF1 link.
    bi = find_line(bjx_lines, '<<if $forgiveintro isnot 1 and '
                              '$fallenangel gte 2 and $fallenangel lte 4>>')
    ei = find_line(bjx_lines, '/* 北极星 */', bi)
    t4 = retab(bjx_lines[bi:ei])
    t4 = [l.replace('<<trauma 6>><<set $money -= 1000000>>', '<<trauma 6>>')
          for l in t4]
    assert not any('$money -=' in l for l in t4)
    assert sum(1 for l in t4 if '买赎罪券' in l) == 2
    i = find_line(lines, '<<if $forgiveintro isnot 1 and $fallenangel gte 2>>')
    k = find_line(lines, '<</if>>', i)
    assert k - i == 9, 'forgiveness block shape changed'
    lines[i:k + 1] = (
        ['\t/* BJX pack: staged forgiveness entry (BJX splits the fork by',
         '\t   fallenangel level and the bjx_divine setting; the £10,000',
         '\t   charge stays where 0.5 put it, inside the Buy Forgiveness',
         '\t   entry link). */'] + t4)
    print('T4 forgiveness fork: OK (6 branches, +%d lines)' % len(t4))

    # T5: Buy Forgiveness 5 epilogue, 0.5's three bare sets -> BJX
    # bjx_divine if/else.
    bi = find_line(bjx_lines, '<<if $options.bjx_divine>>')
    ei = find_line(bjx_lines, '/* 北极星 */', bi)
    t5 = retab(bjx_lines[bi:ei])
    assert any('fallenplus' in l for l in t5)
    assert any('<<set $fallenangel to 5>>' in l for l in t5)
    i = find_line(lines, '<<set $fallenangel to 1>>')
    assert 'specialTransform' in lines[i]
    assert 'halo to "disabled"' in lines[i + 1]
    assert 'wings to "disabled"' in lines[i + 2]
    lines[i:i + 3] = (
        ['/* BJX pack: divine route keeps the fallen angel transformation',
         '   (halo default / wings fallenplus are 0.5-native values). */']
        + t5)
    print('T5 buy forgiveness 5 divine fork: OK')

    # T6: Temple Slime - two BJX-only lore paragraphs inserted locally,
    # the 0.5 Gwylan route stays untouched.
    i = find_line(lines, 'blood moon.</i>"')
    assert lines[i + 1].strip() == '<br><br>' and lines[i + 2].strip() == ''
    bi = find_line(bjx_lines, '一望无际的紫色世界')
    lines[i + 3:i + 3] = (
        ['/* BJX pack: BJX slime-TF lore (infection through repeated',
         '   torment, purple-world variant hint). */',
         bjx_lines[bi], '<br><br>', ''])
    i = find_line(lines, 'the ruin is... tainted."')
    assert lines[i + 1].strip() == '<br><br>' and lines[i + 2].strip() == ''
    bi = find_line(bjx_lines, '只有<span class="green">下水道</span>')
    lines[i + 3:i + 3] = (
        ['/* BJX pack: BJX sewer-residue warning. */',
         bjx_lines[bi], '<br><br>', ''])
    print('T6 temple slime lore inserts: OK (2 paragraphs)')

    out = '\n'.join(lines)
    out = HDR.format(src='loc-temple/main.twee') + out
    verify_main_hooks(out, src)
    write('bjx-temple-main-hooks.twee', out)


def verify_main_hooks(out, vanilla):
    assert out.count('偷偷给') == 2
    assert out.count('C.npc.Sydney.chastity') == 2  # vagina + penis, one if
    assert out.count('C.npc.Sydney.penis isnot "none"') == 1
    assert out.count('<<nnpc_him "Sydney">>安装贞操带') == 1
    assert out.count('<<nnpc_him "Sydney">>安装贞操笼') == 1
    # 2 links + 1 TODO comment (target passage lives in the sydney group)
    assert out.count('Temple Sydney Chastity') == 3
    assert out.count('<<set $skulduggerydifficulty to 800>>') == 1
    assert out.count('[[偷窃|Temple Plate Steal]]') == 1
    assert out.count('<<set $skulduggeryhands to 1>>') == 1
    assert '[[Steal|Temple Plate Steal]]' not in out
    for mark in ('询问你的史莱姆状态', '报告你的史莱姆状态',
                 '询问你的幽灵状态', '决定清除幽灵状态'):
        assert out.count(mark) == 1, mark
    assert out.count('<<socialiseicon "ask">>') == \
        vanilla.count('<<socialiseicon "ask">>') + 4
    assert out.count('请求宽恕') == 1
    assert out.count('买赎罪券') == 2
    assert out.count('你付不起宽恕的代价。') == 2
    assert out.count('你的赎罪还不够。') == 1
    assert out.count('$options.bjx_divine') == 4  # T4 x3 + T5 x1
    assert '$money -= 1000000' not in out
    assert out.count('<<garousal>>') == vanilla.count('<<garousal>>') + 2
    assert out.count('<<set $fallenangel to 5>>') == 1
    assert out.count('fallenplus') == 2  # 1 code + 1 doc comment
    assert out.count('<<set $fallenangel to 1>>') == 1
    assert out.count('一望无际的紫色世界') == 1
    assert out.count('只有<span class="green">下水道</span>') == 1
    # the 0.5 Gwylan route survives the local-insert policy
    assert out.count('<<nnpc_He "Gwylan">>') == 1
    assert out.count('<<set $gwylanJordanSlime to true>>') == 1
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert len(out) > len(vanilla)
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')
    assert out.count('<<link') - vanilla.count('<<link') == \
        out.count('<</link>>') - vanilla.count('<</link>>')
    print('main-hooks verify OK: %d passages, +%d chars' %
          (len(ops), len(out) - len(vanilla)))


# ----------------------------------------------------------- prayer hooks
def gen_prayer_hooks():
    src = read(os.path.join(REF, 'overworld-town', 'loc-temple',
                            'prayer.twee'))
    bjx = read(os.path.join(BJX, 'overworld-town', 'loc-temple',
                            'prayer.twee'))
    lines = src.split('\n')
    bjx_lines = bjx.split('\n')

    # P1: Holy Embrace link -> BJX greengod-aware Chinese block.
    bi = find_line(bjx_lines, '<<link [[放开心神，拥抱这一切|Temple Prayer Holy Embrace]]>>')
    ei = find_line(bjx_lines, '/* 北极星 */', bi)
    p1 = retab(bjx_lines[bi:ei])
    assert sum(1 for l in p1 if '$options.bjx_greengod' in l) == 2
    assert any('<<awareness -12>>' in l for l in p1)
    assert any('<<awareness 12>>' in l for l in p1)
    assert any('<<llawareness>>' in l for l in p1)
    assert any('<<ggawareness>>' in l for l in p1)
    i = find_line(lines, '<<link [[Embrace|Temple Prayer Holy Embrace]]>>')
    assert '<<awareness 12>>' in lines[i]
    lines[i:i + 1] = (
        ['\t/* BJX pack: green-god mode inverts the awareness shift. */']
        + p1)
    print('P1 holy embrace greengod fork: OK (+%d lines)' % len(p1))

    out = '\n'.join(lines)
    out = HDR.format(src='loc-temple/prayer.twee') + out
    verify_prayer_hooks(out, src)
    write('bjx-temple-prayer-hooks.twee', out)


def verify_prayer_hooks(out, vanilla):
    assert out.count('放开心神，拥抱这一切') == 1
    assert '[[Embrace|Temple Prayer Holy Embrace]]' not in out
    assert out.count('$options.bjx_greengod') == 2
    assert out.count('<<awareness -12>>') == 1
    assert out.count('<<llawareness>>') == 1
    assert out.count('<<ggawareness>>') == 1
    assert out.count('<<purity 12>>') == 1
    assert out.count('Snap out of it|Temple Prayer Holy Snap') == 1
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')
    print('prayer-hooks verify OK: %d passages, +%d chars' %
          (len(ops), len(out) - len(vanilla)))


# --------------------------------------------------------- science hooks
def gen_science_hooks():
    src = read(os.path.join(REF, 'overworld-town', 'loc-temple',
                            'science-project.twee'))
    bjx = read(os.path.join(BJX, 'overworld-town', 'loc-temple',
                            'science-project.twee'))
    lines = src.split('\n')
    bjx_lines = bjx.split('\n')

    # S1: pick-lock link -> 撬锁 + $skulduggeryhands, keeping the 0.5
    # pcAreArmsBound gate and lockicon "pick" prefix.
    i = find_line(lines, 'Pick the lock|Temple Lichen Lock')
    assert '<<lockicon "pick">>' in lines[i]
    assert lines[i].count('<<skulduggerydifficulty>>') == 1
    lines[i] = lines[i].replace('[[Pick the lock|', '[[撬锁|')
    lines[i] = lines[i].replace(
        '<</link>><<skulduggerydifficulty>>',
        '<</link>><<set $skulduggeryhands to 1>><<skulduggerydifficulty>>')
    print('S1 lichen pick-lock: OK')

    # S2: wraith pass-through entry after the Climb link.
    bi = find_line(bjx_lines, '<<set $ghostIn to false>>')
    ei = find_line(bjx_lines, '/* 北极星 */', bi)
    s2 = bjx_lines[bi:ei]
    assert any('穿越 (0:01)|Temple Lichen Ghost' in l for l in s2)
    assert any('<<if $options.bjx_eventTF and $ghost gte 1>>' in l for l in s2)
    i = find_line(lines, '<<gathletics>>')
    assert 'Climb|Temple Lichen Climb' in lines[i]
    assert lines[i + 1].strip() == '<br>'
    lines[i + 2:i + 2] = (
        ['/* BJX pack: BJX wraith-TF pass-through entry ($ghost from the',
         '   TF chain; $options.bjx_eventTF seeded by inject_early.js;',
         '   $ghostIn is consumed by the compound / homes entry checks). */']
        + s2)
    print('S2 lichen wraith pass-through: OK (+%d lines)' % len(s2))

    out = '\n'.join(lines)
    out = HDR.format(src='loc-temple/science-project.twee') + out
    verify_science_hooks(out, src)
    write('bjx-temple-science-hooks.twee', out)


def verify_science_hooks(out, vanilla):
    assert out.count('[[撬锁|Temple Lichen Lock]]') == 1
    assert 'Pick the lock|Temple Lichen Lock' not in out
    assert out.count('<<set $skulduggeryhands to 1>>') == 1
    assert out.count('pcAreArmsBound("both")') == \
        vanilla.count('pcAreArmsBound("both")')
    assert out.count('穿越 (0:01)|Temple Lichen Ghost') == 1
    assert out.count('<<if $options.bjx_eventTF and $ghost gte 1>>') == 1
    assert out.count('<<set $ghostIn to false>>') == 1
    assert out.count('<<set $ghostIn to true>>') == 1
    assert out.count('<<wearProp "lichen" "pink">>') == \
        vanilla.count('<<wearProp "lichen" "pink">>')
    vps = [l[3:] for l in vanilla.split('\n') if l.startswith(':: ')]
    ops = [l[3:] for l in out.split('\n') if l.startswith(':: ')]
    assert vps == ops, 'passage name/order must stay identical to 0.5'
    assert out.count('<<if') - vanilla.count('<<if') == \
        out.count('<</if>>') - vanilla.count('<</if>>')
    print('science-hooks verify OK: %d passages, +%d chars' %
          (len(ops), len(out) - len(vanilla)))


# ---------------------------------------------------------------- cross
def cross_check():
    """The 4 new passages must not collide with any 0.5 temple passage."""
    ev = read(os.path.join(OUT, 'bjx-temple-events.twee'))
    new_ps = [l[3:].split('[')[0].strip()
              for l in ev.split('\n') if l.startswith(':: ')]
    assert len(new_ps) == 4, new_ps
    known = set()
    tdir = os.path.join(REF, 'overworld-town', 'loc-temple')
    for fn in sorted(os.listdir(tdir)):
        if fn.endswith('.twee'):
            for l in read(os.path.join(tdir, fn)).split('\n'):
                if l.startswith(':: '):
                    known.add(l[3:].split('[')[0].strip())
    clash = [p for p in new_ps if p in known]
    assert not clash, 'passage name clash with 0.5: %s' % clash
    print('cross-check OK: 4 new passages, no collisions with %d known '
          '0.5 temple passages' % len(known))


def main():
    gen_events()
    gen_main_hooks()
    gen_prayer_hooks()
    gen_science_hooks()
    cross_check()
    print('ALL TEMPLE CHECKS PASSED')


if __name__ == '__main__':
    main()