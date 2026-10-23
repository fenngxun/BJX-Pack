# -*- coding: utf-8 -*-
"""ghost shop pass-through group generator (BJX 0.4.3.3 -> DoL 0.5.10.12).

Standalone verification copy: output goes to _verify_ghost_shops/ next to
this script; it never touches work/bjx-pack/. When wired into build_pack.py
the same text is written to TWE (same pattern as gen_busstation.py).

BJX adds a wraith pass-through to the closed-shop lock passages under
overworld-town/. Nine source files, ten insertion points:

  source file (BJX)                    passage                      -> target
  loc-shop/clothing.twee               Clothing Shop Sneak          -> Clothing Shop
  loc-shop/cosmetics.twee              Cosmetics Lock               -> Cosmetics Store
  loc-shop/hairDressers.twee           Hairdressers Lock            -> Hairdressers
  loc-shop/main.twee                   Shopping Centre Entrance
                                       Sneak                        -> High Street
                                       Shopping Centre Sneak        -> Shopping Centre
  loc-shop/petShop.twee                Pet Shop Lock                -> Pet Shop
  loc-shop/tailor.twee                 Tailor Shop Sneak            -> Tailor Shop
  loc-shop/tattoo.twee                 Tattoo Parlour Lock          -> Tattoo Parlour
  loc-shop/toyShop.twee                Toy Shop Lock                -> Toy Shop
  loc-adultshop/intro.twee             Adult Shop Closed            -> Adult Shop

Every insertion is the bus-station block verbatim:

    /* BJX pack: ghost pass-through */
    <<set $ghostIn to false>>
    <<if $options.bjx_eventTF and $ghost gte 1>>
        <span class ='wraith'>只要你集中精力，就能穿越这扇门。</span>
        <br>
        <<link [[穿越 (0:01)|TARGET]]>><<pass 1>><<set $ghostIn to true>><</link>>
        <br>
    <</if>>

The guard matches bjx-busstation-hooks.twee byte for byte, so the link stays
silent until the ghost transformation group lands ($ghost stays 0;
inject_early.js seeds $options.bjx_eventTF). BJX writes
<<set $ghostIn to true>><<pass 1>> inside the link payload; this generator
normalises to <<pass 1>><<set $ghostIn to true>> to match the bus-station
product exactly (both orders are behaviourally identical).

Anchor policy: the top-level Leave link alone is ambiguous in every one of
these files (the shop-interior passage repeats the same Leave icon at a
nested indentation). Each anchor therefore starts at the column-0 <</if>>
that closes the lock block and spans the blank line plus the column-0 Leave
link; all nine anchors were repr()-checked and assert count == 1. The
adult-shop anchor is the four-line red block at the end of the file (the
0.5 intro.twee has no Leave link there).

Version notes:
  * loc-adultshop/intro.twee still exists in 0.5 with the same
    ':: Adult Shop Closed' passage, so no file/passage rename is needed.
    The separate 0.5 ':: Adult Shop Lock' (adultshop.twee) is the daytime
    shop-front lock, a different passage - not a target.
  * Link targets are resolved against the real 0.5 corpus at generation
    time (every .twee under REF), so a renamed passage fails loudly.
  * No variable translation applies: the block only reads $options.bjx_eventTF
    and $ghost (BJX-only, undefined compares false) and writes $ghostIn
    (BJX-only, no 0.5 collision). $bestialitydisable / $statdisable do not
    appear in the inserted text.
  * Everything else in the BJX copies of these files (pcAreArmsBound,
    <<lockicon "pick">>, <<wearProp>>, dangerEvent rework) is vanilla
    0.4.3.3 -> 0.5 evolution and is intentionally NOT ported; the 0.5 file
    is the base and only the pass-through block is inserted.
"""

import os

ROOT = r'C:\Users\79403\Desktop\dol'
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '_verify_ghost_shops')

GUARD = '<<if $options.bjx_eventTF and $ghost gte 1>>'

# BJX 小修开关 · P1a：裁缝店缝纫机展示柜。0.5 把它锁在 $debug 里
# （`<<if $sewingKit isnot 1 and $debug is 1>>`，出现两次），BJX 改成
# $options.bjx_sewmachine 可选解锁。这里只对 tailor 的产物做后处理，
# 每个锚点在 0.5 原文里必须唯一命中 2 次。
SEWMACHINE_FIX = [
    ('<<if $sewingKit isnot 1 and $debug is 1>>',
     '<<if $sewingKit isnot 1 and ($debug is 1 or $options.bjx_sewmachine)>>'),
]

# (BJX source path, output name, [(passage, anchor, pass-through target)])
JOBS = [
    ('overworld-town/loc-shop/clothing.twee',
     'bjx-ghost-shop-clothing.twee', [
         ('Clothing Shop Sneak',
          '<</if>>\n\n<<getouticon>><<link [[Leave|Shopping Centre Top]]>><</link>>\n',
          'Clothing Shop'),
     ]),
    ('overworld-town/loc-shop/cosmetics.twee',
     'bjx-ghost-shop-cosmetics.twee', [
         ('Cosmetics Lock',
          '<</if>>\n\n<<getouticon>><<link [[Leave|Shopping Centre Top]]>><</link>>\n',
          'Cosmetics Store'),
     ]),
    ('overworld-town/loc-shop/hairDressers.twee',
     'bjx-ghost-shop-hairdressers.twee', [
         ('Hairdressers Lock',
          '<</if>>\n<<getouticon>><<link [[Leave|Shopping Centre]]>><</link>>\n',
          'Hairdressers'),
     ]),
    ('overworld-town/loc-shop/main.twee',
     'bjx-ghost-shop-main.twee', [
         ('Shopping Centre Entrance Sneak',
          '<</if>>\n\n<<shopicon>><<link [[Leave|Shopping Centre]]>><</link>>\n',
          'High Street'),
         ('Shopping Centre Sneak',
          '<</if>>\n\n<<getouticon>><<link [[Leave|High Street]]>><</link>>\n',
          'Shopping Centre'),
     ]),
    ('overworld-town/loc-shop/petShop.twee',
     'bjx-ghost-shop-petshop.twee', [
         ('Pet Shop Lock',
          '<</if>>\n<<getouticon>><<link [[Leave|Shopping Centre]]>><</link>>\n',
          'Pet Shop'),
     ]),
    ('overworld-town/loc-shop/tailor.twee',
     'bjx-ghost-shop-tailor.twee', [
         ('Tailor Shop Sneak',
          '<</if>>\n\n<<getouticon>><<link [[Leave|Shopping Centre Top]]>><<endevent>><</link>>\n',
          'Tailor Shop'),
     ]),
    ('overworld-town/loc-shop/tattoo.twee',
     'bjx-ghost-shop-tattoo.twee', [
         ('Tattoo Parlour Lock',
          '<</if>>\n\n<<getouticon>><<link [[Leave|Shopping Centre]]>><</link>>\n',
          'Tattoo Parlour'),
     ]),
    ('overworld-town/loc-shop/toyShop.twee',
     'bjx-ghost-shop-toyshop.twee', [
         ('Toy Shop Lock',
          '<</if>>\n\n<<getouticon>><<link [[Leave|Shopping Centre Top]]>><</link>>\n',
          'Toy Shop'),
     ]),
    ('overworld-town/loc-adultshop/intro.twee',
     'bjx-ghost-shop-adultshop.twee', [
         ('Adult Shop Closed',
          '\t<span class="red">The lock looks beyond your ability to pick.</span>\n'
          '\t<<skulduggeryrequired>>\n'
          '\t<br><br>\n'
          '<</if>>\n\n',
          'Adult Shop'),
     ]),
]


# 0.5 把「卖旧衣服」那条链接注释掉了（Tailor Monthly Discard passage 本身是齐的，
# 衣柜里的 discard 回收箱分支也在）。BJX 的 $options.bjx_sellcloth 开关就是给它用的，
# 这里把注释拆掉并挂上开关。0.5 没有 <<askicon>>（只有 <<baskicon>>），
# 用邻近那条 repair 链接同款的 <<socialiseicon "ask">> 保持一致。
POST_FIX = {
    'bjx-ghost-shop-tailor.twee': [(
        '\t\t\t\t/*<<link [[Ask how much they offer for old clothes|Tailor Monthly Discard]]>><</link>>*/',
        '\t\t\t\t/* BJX pack: 出售旧衣服（$options.bjx_sellcloth 打开才显示） */\n'
        '\t\t\t\t<<if $options.bjx_sellcloth>>\n'
        '\t\t\t\t\t<<socialiseicon "ask">><<link [[Ask how much they offer for old clothes|Tailor Monthly Discard]]>><</link>>\n'
        '\t\t\t\t<</if>>',
    ), (
        # 0.5 的 Tailor Monthly Discard 有上游 bug：getClothingCost 在 0.5 是
        # (item, slot) 两参，这里只传了 item，而 slot 被错塞进 Math.floor 的
        # 第二个实参——`_label` 为 undefined → setup.clothes[undefined] 抛
        # TypeError，衣柜里每件可卖衣服报一次。这才是 0.5 把入口链接注释掉的
        # 真实原因（passage 本身没跟着 0.4->0.5 改完）。BJX 那行是正确写法。
        "Math.floor(getClothingCost(_items[_i]) * (_items[_i].integrity / "
        "clothingData(_label,_items[_i],'integrity_max')) / 3,_label)",
        "Math.floor(getClothingCost(_items[_i], _label) * (_items[_i].integrity / "
        "clothingData(_label,_items[_i],'integrity_max')) / 3)",
    )],
}


def read(path):
    return open(path, encoding='utf-8', newline='').read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8', newline='\n').write(text)


def passage_names(text):
    return [l[3:].split('[')[0].strip()
            for l in text.split('\n') if l.startswith(':: ')]


def passage_span(text, name):
    """(start, end) offsets of the named passage body, or raise."""
    heads = []
    pos = 0
    for line in text.split('\n'):
        if line.startswith(':: '):
            heads.append((pos, line[3:].split('[')[0].strip()))
        pos += len(line) + 1
    for i, (start, n) in enumerate(heads):
        if n == name:
            return start, (heads[i + 1][0] if i + 1 < len(heads) else len(text))
    raise AssertionError('passage not found: ' + name)


def ghost_block(target):
    return ('/* BJX pack: ghost pass-through */\n'
            '<<set $ghostIn to false>>\n'
            + GUARD + '\n'
            "\t<span class ='wraith'>只要你集中精力，就能穿越这扇门。</span>\n"
            '\t<br>\n'
            '\t<<link [[穿越 (0:01)|' + target + ']]>><<pass 1>>'
            '<<set $ghostIn to true>><</link>>\n'
            '\t<br>\n'
            '<</if>>\n')


def target_index():
    """Every passage name in the 0.5 corpus (link targets must resolve)."""
    names = set()
    for dirpath, _, files in os.walk(REF):
        for f in files:
            if f.endswith('.twee'):
                names.update(passage_names(read(os.path.join(dirpath, f))))
    return names


def main():
    known = target_index()
    total = 0
    rows = []
    for rel, out_name, jobs in JOBS:
        src = read(os.path.join(REF, rel.replace('/', os.sep)))
        ops = passage_names(src)
        txt = src
        for passage, anchor, target in jobs:
            assert target in known, '%s: target passage missing in 0.5: %s' % (
                out_name, target)
            assert txt.count(anchor) == 1, '%s: anchor not unique in %s' % (
                out_name, passage)
            start, end = passage_span(txt, passage)
            assert start < txt.index(anchor) < end, (
                '%s: anchor not inside %s' % (out_name, passage))
            txt = txt.replace(anchor, anchor + ghost_block(target))
        for old, new in POST_FIX.get(out_name, []):
            assert txt.count(old) == 1, '%s: post-fix anchor not unique: %r' % (
                out_name, old[:60])
            txt = txt.replace(old, new)
        vps = passage_names(txt)
        assert vps == ops, '%s: passage list/order changed' % out_name
        n = len(jobs)
        assert txt.count('<<set $ghostIn to false>>') == n, out_name
        assert txt.count('<<set $ghostIn to true>>') == n, out_name
        assert txt.count(GUARD) == n, out_name
        if out_name == 'bjx-ghost-shop-tailor.twee':
            for old, new in SEWMACHINE_FIX:
                assert txt.count(old) == 2, '%s: %d hits (expect 2)' % (
                    out_name, txt.count(old))
                txt = txt.replace(old, new)
            assert txt.count('$options.bjx_sewmachine') == 2, out_name
        out = ('/* BJX pack: vanilla 0.5 %s + %d ghost pass-through%s. */\n'
               % (rel, n, '' if n == 1 else 's') + txt)
        if not out.endswith('\n'):
            out += '\n'
        assert '\r' not in out, out_name + ': CRLF leaked'
        write(os.path.join(OUT, out_name), out)
        total += n
        rows.append((out_name, n, ', '.join(p for p, _, _ in jobs)))
        print('%-34s %d  %s' % (out_name, n, rows[-1][2]))

    print('-' * 60)
    print('files: %d, insertions: %d, skipped: 0' % (len(JOBS), total))
    print('passage order/name self-check: %d/%d OK' % (len(JOBS), len(JOBS)))
    print('targets resolved against 0.5 corpus: %d/%d OK' % (total, total))
    print('output: ' + OUT)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
