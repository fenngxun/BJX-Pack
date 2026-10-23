# -*- coding: utf-8 -*-
"""公共设施 / 撬锁点 ghost 穿门生成器（BJX 0.4.3.3 -> DoL 0.5.10.12 pack）。

独立验证版：只读 0.5 目标源码（refs/dol-0.5.10.12-target/game）与 BJX
源码（Dol-BJX-Ex-main/源码），输出写到本脚本同目录的 _verify_ghost_civic/
下（不写 TWE、不改 build_pack.py）。接线时 build_pack.py 直接把该目录的
.twee 复制进 tweeFileList（与 batch 3i 的 subprocess 模式一致）。

移植范围（17 个 0.5 目标文件 / 18 处穿门）：
  撬锁点 4 文件 4 处（BJX overworld-town/loc-*/skulduggery.twee）
    Danube House Lock      -> Danube House Sneak
    Docks Sneak Start      -> Docks Sneak Pick
    Domus House Lock       -> Domus House Sneak
    Flats Lock             -> Flats Sneak
  公共设施 13 文件 14 处
    Asylum Cell（睡房锁门分支） -> Asylum
    Arcade Lock            -> Arcade
    Ocean Breeze Lock      -> Ocean Breeze
    Prison Yard Door       -> Prison Beach
    School Locked          -> School Front Courtyard
    School Gate Exit       -> Oxford Street
    Spa Lock               -> Spa
    Strip Club Lock        -> Strip Club
    Elk Compound Central   -> Elk Compound Interior
    Dance Studio Lock      -> Dance Studio
    Pound Lock             -> Pound
    Pound Door             -> Pound Door Sneak
    Riding School Lock     -> Riding School
    Kylar Abduction Free Stairs -> Kylar Abduction Free Sneak

注：任务清单里的 `overworld-town/loc-asylum/main.twee` 在 BJX 源码树中实际
位于 `overworld-forest/loc-asylum/main.twee`（0.5 同路径），已按真实路径
读取；其余路径与清单一致。

做法（与 gen_busstation.py 同范式）：
  - 以 0.5 目标文件全文为底，仅在锚点前插入穿门块，不重写任何 vanilla
    文本（0.5 的 pcAreArmsBound / <<lockicon "pick">> / <<wearProp>> /
    dangerEvent 等演化和本组无关，全部保留）。
  - 锚点均取"该扇门自己的 Leave/后续链接行"（或跨越撬锁块到该行的唯一
    片段）。同一文件里裸 Leave 行有重复时（cafe 2 次、riding 3 次、
    compound 9 次、asylum 3 次）就向前扩到撬锁块/唯一正文行，保证
    assert txt.count(anchor) == 1。
  - 每个锚点先用 repr() 核对字节（0.5 目标全部 LF、制表符缩进），脚本内
    锚点用显式 '\t' 书写；插入后再次 assert 只多出预期数量的穿门块。
  - 块一律带 `<<set $ghostIn to false>>`（进入重置）+ 守卫
    `<<if $options.bjx_eventTF and $ghost gte 1>>` + 穿门链接内
    `<<set $ghostIn to true>>`。链接 payload 的宏顺序逐字保留 BJX 源
    （例如 docks 的 <<endevent>>、school/compound/kylar 的 set 在 pass 前）。
  - 变量翻译：本组零翻译。穿门块只用 $options.bjx_eventTF / $ghost /
    $ghostIn（BJX 独有，0.5 无同名，inject_early.js 已初始化
    bjx_eventTF），不涉及 $skinColor / $skulduggeryhands 等旧变量。
  - 链接目标名全部按 0.5 实际 passage 名（大小写敏感）逐一在整棵 0.5
    源码树里断言存在且唯一。
  - 幂等：每次从 refs 重新生成，输出 LF，passage 顺序与 0.5 完全一致
    （assert vps == ops），不产生 passage 重名（同批 17 个文件之间零重叠，
    与现有 pack 产物零重叠；扫描 pack 时排除本组自身 bjx-ghost-civic-*）。

不移植的 BJX 同文件改动（均属 0.4.3.3 -> 0.5 原版演化，或非穿门语义）：
  - 各撬锁页的 <<lockpickicon>>/<<getouticon>> 图标行、pcAreArmsBound
    分支、danube/domus/flats 的 $bus 设置差异 —— 0.5 已有等价实现。
  - Danube/Domus/Flats/Compound 的 `<<if $ghostIn>> 你成功地穿门而入
    <<else>> 你成功地撬开门锁...` 文案分支（BJX 在 Sneak/Interior 页加
    的"穿门"叙述）。本组按任务口径只插穿门链接块；该文案属于落地页
    flavor text，且 0.5 对应页无同名结构，记录为有意不移植（不影响功能，
    $ghostIn 在落地页仍为 true，无读取点不报错）。
  - Asylum 源块的 `<<elseif $options.bjx_eventTF and $asylumstate isnot
    "sleep" ...>>` 在 BJX 里是不可达死代码（外层已是 asylumstate is
    "sleep"）。移植时按任务统一守卫写成 `<<if $options.bjx_eventTF and
    $ghost gte 1>>`，落在睡房锁门分支 —— 这才是"门锁着，用 ghost 穿门"
    的原意，且与其它 17 处守卫一致。
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码')
PACK = os.path.join(ROOT, 'work', 'bjx-pack', 'tweeFileList')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '_verify_ghost_civic')

DEFAULT_PAYLOAD = '<<pass 1>><<set $ghostIn to true>>'


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


def ghost_block(target, indent='', payload=DEFAULT_PAYLOAD):
    """Standard pass-through block (bus-station template)."""
    return (indent + '/* BJX pack: ghost pass-through */\n'
            + indent + '<<set $ghostIn to false>>\n'
            + indent + '<<if $options.bjx_eventTF and $ghost gte 1>>\n'
            + indent + "\t<span class ='wraith'>只要你集中精力，就能穿越这扇门。</span>\n"
            + indent + '\t<br>\n'
            + indent + '\t<<link [[穿越 (0:01)|' + target + ']]>>'
            + payload + '<</link>>\n'
            + indent + '\t<br>\n'
            + indent + '<</if>>\n')


def passage_names(text):
    return [l[3:].strip() for l in text.split('\n') if l.startswith(':: ')]


def insert(src, head, tail, block, label):
    """Insert block between head and tail; anchor must be unique. The
    anchor must start at a line boundary (guards against swallowing an
    icon macro that 0.5 added in front of the link)."""
    anchor = head + tail
    n = src.count(anchor)
    assert n == 1, '%s anchor not unique (%d): %r' % (label, n, anchor)
    assert tail.endswith('\n'), label + ' tail must end a line'
    idx = src.find(anchor)
    assert idx == 0 or src[idx - 1] == '\n', \
        label + ' anchor does not start at a line boundary'
    return src.replace(anchor, head + block + tail)


def collect_pack_passages():
    """Passage names currently shipped in the pack (read-only), excluding
    this group's own outputs so the script stays idempotent when wired."""
    names = {}
    if not os.path.isdir(PACK):
        return names
    for fn in sorted(os.listdir(PACK)):
        if not fn.endswith('.twee') or fn.startswith('bjx-ghost-civic-'):
            continue
        for name in passage_names(read(os.path.join(PACK, fn))):
            names.setdefault(name, fn)
    return names


# (bjx source path, 0.5 target path, output name, [site dicts])
# site: head / tail split the unique anchor, block built from target+indent+
# payload. head is everything before the insertion point.
SITES = [
    # ---------------------------------------------------------- skulduggery
    dict(
        bjx='overworld-town/loc-danube-homes/skulduggery.twee',
        ref='overworld-town/loc-danube-homes/skulduggery.twee',
        out='bjx-ghost-civic-danube-houses.twee',
        site='Danube House Lock',
        target='Danube House Sneak',
        head='',
        tail='<<danubeicon>><<link [[Leave|Danube Street]]>><</link>>\n',
        indent='',
        payload=DEFAULT_PAYLOAD,
    ),
    dict(
        bjx='overworld-town/loc-docks/skulduggery.twee',
        ref='overworld-town/loc-docks/skulduggery.twee',
        out='bjx-ghost-civic-docks.twee',
        site='Docks Sneak Start',
        target='Docks Sneak Pick',
        head='',
        tail='<<getouticon>><<link [[Leave|Docks]]>><<endevent>>'
             '<<set $bus to "mer">><</link>>\n',
        indent='',
        # BJX keeps <<endevent>> between pass and the ghost flag.
        payload='<<pass 1>><<endevent>><<set $ghostIn to true>>',
    ),
    dict(
        bjx='overworld-town/loc-domus-homes/skulduggery.twee',
        ref='overworld-town/loc-domus-homes/skulduggery.twee',
        out='bjx-ghost-civic-domus-houses.twee',
        site='Domus House Lock',
        target='Domus House Sneak',
        head='',
        tail='<<domusicon>><<link [[Leave|Domus Street]]>><</link>>\n',
        indent='',
        payload=DEFAULT_PAYLOAD,
    ),
    dict(
        bjx='overworld-town/loc-flats/skulduggery.twee',
        ref='overworld-town/loc-flats/skulduggery.twee',
        out='bjx-ghost-civic-flats.twee',
        site='Flats Lock',
        target='Flats Sneak',
        head='',
        tail='<<getouticon>><<link [[Leave|Flats]]>><</link>>\n',
        indent='',
        payload=DEFAULT_PAYLOAD,
    ),
    # ------------------------------------------------------------- asylum
    dict(
        bjx='overworld-forest/loc-asylum/main.twee',
        ref='overworld-forest/loc-asylum/main.twee',
        out='bjx-ghost-civic-asylum.twee',
        site='Asylum Cell (sleep branch)',
        target='Asylum',
        # includes the unique "door is locked" line + bed/towel/wardrobe
        # blocks + the always-false Leave-if; insertion lands right before
        # the <br> that precedes the Settings link, matching BJX position.
        head='\tThe door is locked. You\'re supposed to be in bed.\n'
             '\t<br><br>\n'
             '\t<<roomoptions>>\n'
             '\t<<if Time.hour isnot 6>>\n'
             '\t\t<<asylumicon "bed">><<link [[Bed|Asylum Bed]]>><</link>>\n'
             '\t\t<br><br>\n'
             '\t<<else>>\n'
             '\t\tYou can\'t sleep until the alarm turns off.\n'
             '\t\t<br><br>\n'
             '\t<</if>>\n'
             '\t<<if $eden_asylum_window is 1 and Time.hour gte 22>>\n'
             '\t\tEden should be watching.\n'
             '\t\t<<if pcAreArmsBound("both")>>\n'
             '\t\t\tYou could throw a towel up to your window to signal '
             'your location, but you\'d need to unbind your arms first.\n'
             '\t\t\t<br>\n'
             '\t\t<<else>>\n'
             '\t\t\tYou could throw a towel up to your window to signal '
             'your location.\n'
             '\t\t\t<br>\n'
             '\t\t\t<<towelicon>><<link [[Throw towel|Eden Towel Throw]]>>'
             '<</link>>\n'
             '\t\t\t<br>\n'
             '\t\t<</if>>\n'
             '\t<</if>>\n'
             '\t<<if pcAreArmsBound("both")>>\n'
             '\t\tA padded cupboard containing your clothes protrudes from '
             'the wall, but you can\'t reach it with your arms bound.\n'
             '\t\t<br>\n'
             '\t<<else>>\n'
             '\t\tA padded cupboard containing your clothes protrudes from '
             'the wall.\n'
             '\t\t<br>\n'
             '\t\t<<asylumicon "wardrobe">><<link [[Open|Asylum Wardrobe]]>>'
             '<</link>>\n'
             '\t\t<br>\n'
             '\t<</if>>\n'
             '\t<<if $asylumstate isnot "sleep">>\n'
             '\t\t<br>\n'
             '\t\t<<getouticon>><<link [[Leave|Asylum]]>><</link>>\n'
             '\t\t<br>\n'
             '\t<</if>>\n',
        tail='\t<br>\n',
        indent='\t',
        payload=DEFAULT_PAYLOAD,
    ),
    # ------------------------------------------------------------- arcade
    dict(
        bjx='overworld-town/loc-arcade/main.twee',
        ref='overworld-town/loc-arcade/main.twee',
        out='bjx-ghost-civic-arcade.twee',
        site='Arcade Lock',
        target='Arcade',
        head='',
        tail='<<starfishicon>><<link [[Leave|Starfish Street]]>>'
             '<<set $eventskip to 1>><</link>>\n',
        indent='',
        payload=DEFAULT_PAYLOAD,
    ),
    # --------------------------------------------------------------- cafe
    dict(
        bjx='overworld-town/loc-cafe/main.twee',
        ref='overworld-town/loc-cafe/main.twee',
        out='bjx-ghost-civic-cafe.twee',
        site='Ocean Breeze Lock',
        target='Ocean Breeze',
        # Cliff Street Leave appears twice in this file (another passage),
        # so start at the unique Ocean Breeze pick line.
        head='\t\t<<lockicon "pick">><<link [[Pick it (0:10)|Ocean Breeze]]>>'
             '<<pass 10>><<crimeUp 5 "trespassing">><</link>>'
             '<<crime "trespassing">>\n'
             '\t\t<br>\n'
             '\t<</if>>\n'
             '<<else>>\n'
             '\t<span class="red">The lock looks beyond your ability to '
             'pick.</span><<skulduggeryrequired>>\n'
             '\t<br><br>\n'
             '<</if>>\n'
             '\n',
        tail='<<clifficon>><<link [[Leave|Cliff Street]]>><</link>>\n',
        indent='',
        payload=DEFAULT_PAYLOAD,
    ),
    # ------------------------------------------------------------- prison
    dict(
        bjx='overworld-town/loc-prison/main.twee',
        ref='overworld-town/loc-prison/main.twee',
        out='bjx-ghost-civic-prison.twee',
        site='Prison Yard Door',
        target='Prison Beach',
        # stays inside the no-key <<else>> branch: before the yard_key
        # <</if>>, after the skulduggery <</if>>.
        head='\t<</if>>\n',
        tail='<</if>>\n'
             '\n'
             '<<getouticon>><<link [[Leave|Prison Yard]]>><</link>>\n',
        indent='\t',
        payload=DEFAULT_PAYLOAD,
    ),
    # ------------------------------------------------------------- school
    dict(
        bjx='overworld-town/loc-school/main.twee',
        ref='overworld-town/loc-school/main.twee',
        out='bjx-ghost-civic-school.twee',
        site='School Locked',
        target='School Front Courtyard',
        head='',
        tail='<<getouticon>><<link [[Leave|Oxford Street]]>><</link>>\n',
        indent='',
        payload='<<set $ghostIn to true>><<pass 1>>',
    ),
    dict(
        bjx='overworld-town/loc-school/main.twee',
        ref='overworld-town/loc-school/main.twee',
        out='bjx-ghost-civic-school.twee',
        site='School Gate Exit',
        target='Oxford Street',
        head='',
        tail='<<getouticon>><<link [[Leave|School Front Courtyard]]>>'
             '<</link>>\n',
        indent='',
        payload='<<set $ghostIn to true>><<pass 1>>',
    ),
    # ---------------------------------------------------------------- spa
    dict(
        bjx='overworld-town/loc-spa/main.twee',
        ref='overworld-town/loc-spa/main.twee',
        out='bjx-ghost-civic-spa.twee',
        site='Spa Lock',
        target='Spa',
        head='',
        tail='<<getouticon>><<link [[Leave|Danube Street]]>><</link>>\n',
        indent='',
        payload='<<set $ghostIn to true>><<pass 1>>',
    ),
    # --------------------------------------------------------- strip club
    dict(
        bjx='overworld-town/loc-strip club/main.twee',
        ref='overworld-town/loc-strip club/main.twee',
        out='bjx-ghost-civic-strip-club.twee',
        site='Strip Club Lock',
        target='Strip Club',
        head='',
        tail='<<getouticon>><<link [[Leave|Connudatus Street]]>>'
             '<</link>>\n',
        indent='',
        payload='<<set $ghostIn to true>><<pass 1>>',
    ),
    # ------------------------------------------------------------ compound
    dict(
        bjx='overworld-town/loc-compound/main.twee',
        ref='overworld-town/loc-compound/main.twee',
        out='bjx-ghost-civic-compound.twee',
        site='Elk Compound Central',
        target='Elk Compound Interior',
        # Leave appears 9x; anchor from the unique Interior pick line all
        # the way through the phials block to the Leave line.
        head='\t\t<<lockicon "pick">><<link [[Break in (0:05)|'
             'Elk Compound Interior]]>><<pass 5>><<crimeUp 30 "trespassing">>'
             '<</link>><<ggcrime "trespassing">><<gsecurity>>\n'
             '\t\t<br>\n'
             '\t<</if>>\n'
             '<<else>>\n'
             '\t<span class="red">The lock looks beyond your ability to '
             'pick.</span>\n'
             '\t<<skulduggeryrequired>>\n'
             '\t<br><br>\n'
             '<</if>>\n'
             '<<if $phials_held gte 1>>\n'
             '\t<<if $compound.alarm gte 1>>\n'
             '\t\t<span class="blue">You\'ll need to wait for security to '
             'relax before making your delivery.</span>\n'
             '\t\t<br>\n'
             '\t<<else>>\n'
             '\t\t<<ind>><<link [[Ring the doorbell|'
             'Elk Compound Central Ring]]>><</link>>\n'
             '\t\t<br>\n'
             '\t<</if>>\n'
             '\n'
             '<</if>>\n',
        tail='<<getouticon>><<link [[Leave|Elk Compound]]>><</link>>\n',
        indent='',
        payload='<<set $ghostIn to true>><<pass 1>>',
    ),
    # -------------------------------------------------------- dance studio
    dict(
        bjx='overworld-town/loc-dance-studio/main.twee',
        ref='overworld-town/loc-dance-studio/main.twee',
        out='bjx-ghost-civic-dance-studio.twee',
        site='Dance Studio Lock',
        target='Dance Studio',
        head='',
        tail='<<getouticon>><<link [[Leave|Barb Street]]>><</link>>\n',
        indent='',
        payload=DEFAULT_PAYLOAD,
    ),
    # --------------------------------------------------------------- pound
    dict(
        bjx='overworld-town/loc-pound/main.twee',
        ref='overworld-town/loc-pound/main.twee',
        out='bjx-ghost-civic-pound.twee',
        site='Pound Lock',
        target='Pound',
        head='',
        tail='<<starfishicon>><<link [[Leave|Starfish Street]]>><</link>>\n',
        indent='',
        payload=DEFAULT_PAYLOAD,
    ),
    dict(
        bjx='overworld-town/loc-pound/abduction.twee',
        ref='overworld-town/loc-pound/abduction.twee',
        out='bjx-ghost-civic-pound-abduction.twee',
        site='Pound Door',
        target='Pound Door Sneak',
        head='',
        tail='<<link [[Try to force it open (1:00)|Pound Door Force]]>>'
             '<<pass 60>><<tiredness 12>><</link>><<ggtiredness>>\n',
        indent='',
        payload=DEFAULT_PAYLOAD,
    ),
    # -------------------------------------------------------------- riding
    dict(
        bjx='overworld-plains/loc-riding/main.twee',
        ref='overworld-plains/loc-riding/main.twee',
        out='bjx-ghost-civic-riding.twee',
        site='Riding School Lock',
        target='Riding School',
        # Farmland Leave appears 3x; start at the unique Riding pick line.
        head='\t\t<<lockicon "pick">><<link [[Pick it (0:10)|Riding School]]>>'
             '<<pass 10>><<crimeUp 20 "trespassing">><</link>>'
             '<<crime "trespassing">>\n'
             '\t\t<br>\n'
             '\t<</if>>\n'
             '<<else>>\n'
             '\t<span class="red">The lock looks beyond your ability to '
             'pick.</span><<skulduggeryrequired>>\n'
             '\t<br><br>\n'
             '<</if>>\n',
        tail='<<getouticon>><<link [[Leave|Farmland]]>><</link>>\n',
        indent='',
        payload=DEFAULT_PAYLOAD,
    ),
    # ------------------------------------------------------------- kylar
    dict(
        bjx='overworld-town/special-kylar/abduction.twee',
        ref='overworld-town/special-kylar/abduction.twee',
        out='bjx-ghost-civic-kylar-abduction.twee',
        site='Kylar Abduction Free Stairs',
        target='Kylar Abduction Free Sneak',
        head='',
        # 0.5 prefixes the Back link with <<getouticon>>; keep icon with
        # its link so the block cannot land mid-line.
        tail='<<getouticon>><<link [[Back away|Kylar Abduction Free Breeze]]>>'
             '<</link>>\n',
        indent='',
        payload='<<set $ghostIn to true>><<pass 1>>',
    ),
]

# 0.5 link targets verified to exist exactly once in the whole 0.5 tree.
LINK_TARGETS = [
    'Danube House Sneak', 'Docks Sneak Pick', 'Domus House Sneak',
    'Flats Sneak', 'Asylum', 'Arcade', 'Ocean Breeze', 'Prison Beach',
    'School Front Courtyard', 'Oxford Street', 'Spa', 'Strip Club',
    'Elk Compound Interior', 'Dance Studio', 'Pound', 'Pound Door Sneak',
    'Riding School', 'Kylar Abduction Free Sneak',
]


def check_targets():
    """Every link target must be a real, uniquely-named 0.5 passage."""
    found = {t: 0 for t in LINK_TARGETS}
    for base, _dirs, files in os.walk(REF):
        for fn in files:
            if not fn.endswith('.twee'):
                continue
            for name in passage_names(read(os.path.join(base, fn))):
                key = name.split(' [')[0].strip()
                if key in found:
                    found[key] += 1
    bad = {k: v for k, v in found.items() if v != 1}
    assert not bad, '0.5 link targets missing/ambiguous: %r' % bad


def build():
    check_targets()
    pack = collect_pack_passages()

    # group by output file (school has two sites)
    groups = {}
    for s in SITES:
        groups.setdefault(s['out'], []).append(s)

    rows = []
    all_passages = {}
    for out_name in sorted(groups):
        site_list = groups[out_name]
        vanilla = read(os.path.join(REF, site_list[0]['ref']))
        assert '$ghostIn' not in vanilla, \
            out_name + ': 0.5 base already contains $ghostIn (already ported?)'

        src = vanilla
        for s in site_list:
            bjx_path = os.path.join(BJX, s['bjx'])
            bjx = read(bjx_path)
            # source sanity: the BJX file really carries this pass-through
            assert '<<set $ghostIn to false>>' in bjx, s['bjx']
            assert ('穿越 (0:01)|' + s['target'] + ']]') in bjx, \
                s['bjx'] + ' -> ' + s['target']
            block = ghost_block(s['target'], s['indent'], s['payload'])
            src = insert(src, s['head'], s['tail'], block,
                         out_name + ' / ' + s['site'])

        # ---- per-file structural checks
        n = len(site_list)
        assert src.count('<<set $ghostIn to false>>') == n
        assert src.count('<<set $ghostIn to true>>') == n
        assert src.count('$options.bjx_eventTF and $ghost gte 1') == n
        assert src.count("class ='wraith'") == n
        assert src.count('\r') == 0, out_name + ': output must be LF'
        vps = passage_names(vanilla)
        ops = passage_names(src)
        assert vps == ops, out_name + ': passage name/order changed'
        for p in ops:
            assert p not in all_passages, \
                'duplicate passage across group: %s (%s / %s)' % (
                    p, all_passages.get(p), out_name)
            all_passages[p] = out_name
            assert p not in pack, \
                'passage collides with existing pack: %s (%s)' % (p, pack[p])

        header = ('/* BJX pack: vanilla 0.5 %s re-declared + %d ghost '
                  'pass-through(s); BJX source %s. */\n'
                  % (site_list[0]['ref'], n, site_list[0]['bjx']))
        write(out_name, header + src)
        rows.append((out_name, n, ', '.join(s['site'] for s in site_list)))

    print('\n=== ghost-civic per-file ===')
    for name, n, sites in rows:
        print('  %-38s %d  %s' % (name, n, sites))
    print('=== ghost-civic summary ===')
    print('files: %d' % len(rows))
    print('pass-throughs: %d' % sum(r[1] for r in rows))
    print('passages: %d unique, 0 collisions with existing pack' %
          len(all_passages))
    print('checks: LF only, vps == ops, anchors unique, placements in site')
    print('output: %s' % OUT)


if __name__ == '__main__':
    build()
