"""Wardrobe sale crate: per-item Sell mode + crate preview.

The wardrobe UI (Wear/Discard/Repair/Separate Outfits/Repeat) and the sale
crate live in the host's base-clothing/wardrobes.twee, not in bjx-pack.
This generator extracts the three widgets and the two crate passages from
the target source and re-declares them with:

  1. a "出售" radio in wardrobeClothingOptions (only while the tailor
     discard appointment is active);
  2. a sell branch in wardrobewear that toggles an item into the crate
     (no time cost, no immediate sale);
  3. a crate preview in the wardrobe widget (item names + payout), with the
     useless "Add outfits and send" link removed from the sale crate;
  4. sale crate passages honouring marked items, with the preview using
     tailorClothingCost (the payout function) so shown value == paid value.

Output is idempotent and copied by build_pack.py. Source is read from
refs/$DOL_REF (default dol-0.5.12.13-target).
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.dirname(HERE)
ROOT = os.path.dirname(WORK)
REF = os.environ.get('DOL_REF', 'dol-0.5.12.13-target')
SRC = os.path.join(ROOT, 'refs', REF, 'game', 'base-clothing', 'wardrobes.twee')
OUT = os.path.join(HERE, '_verify_wardrobe_sale')
OUT_NAME = 'bjx-wardrobe-sale.twee'


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def widget(text, name):
    head = '<<widget "%s">>' % name
    start = text.index(head)
    end = text.index('<</widget>>', start) + len('<</widget>>')
    return text[start:end]


def passage(text, name):
    head = ':: %s\n' % name
    start = text.index(head)
    nxt = text.find('\n:: ', start + len(head))
    return text[start:] if nxt < 0 else text[start:nxt + 1]


def gen_options(body):
    anchor = ('\t<label><<radiobutton "$wardrobeOption" "separateOutfits" autocheck>>'
              ' Separate Outfits (0:10)</label> |')
    assert body.count(anchor) == 1, 'separateOutfits anchor not unique'
    extra = ('\n\t<<if $tailorMonthlyService is "discard">>\n'
             '\t\t<label><<radiobutton "$wardrobeOption" "sell" autocheck>>出售</label> |\n'
             '\t<</if>>')
    body = body.replace(anchor, anchor + extra)
    # stale sell mode after the appointment ends
    reset_anchor = ('\t<<if $wardrobeRepeat isnot true or ($wardrobeOption is "repair"'
                    ' and $location isnot "home")>><<set $wardrobeOption to "wear">><</if>>')
    assert body.count(reset_anchor) == 1, 'option reset anchor not unique'
    body = body.replace(
        reset_anchor,
        reset_anchor + '\n\t<<if $wardrobeOption is "sell" and $tailorMonthlyService isnot "discard">>'
                       '<<set $wardrobeOption to "wear">><</if>>')
    assert '<<radiobutton "$wardrobeOption" "sell" autocheck>>出售' in body
    return body


def gen_wear(body):
    anchor = ('\t\t<<elseif $wardrobeOption is "transfer" and _wardrobeTransfer'
              ' isnot $wardrobe_location and _wardrobeTransfer isnot undefined>>\n')
    assert body.count(anchor) == 1, 'transfer anchor not unique'
    sell = '''\t\t<<elseif $wardrobeOption is "sell">>
\t\t\t<<if _item.outfitSecondary isnot undefined>>
\t\t\t\t这是套装的一部分，请点击套装主件出售整套。
\t\t\t<<else>>
\t\t\t\t<<set _bjxNewState to _item._bjxSaleCrate isnot true>>
\t\t\t\t<<set _item._bjxSaleCrate to _bjxNewState>>
\t\t\t\t<<for $_outfitSlot, $_outfitId range _outfitPieceIds>>
\t\t\t\t\t<<set _selectedWardrobe[$_outfitSlot][$_outfitId]._bjxSaleCrate to _bjxNewState>>
\t\t\t\t<</for>>
\t\t\t\t<<if _bjxNewState>>
\t\t\t\t\t你把<<print _item.name>>放进了出售箱。
\t\t\t\t<<else>>
\t\t\t\t\t你把<<print _item.name>>从出售箱里取了出来。
\t\t\t\t<</if>>
\t\t\t<</if>>
\t\t\t<br>
'''
    body = body.replace(anchor, sell + anchor)
    assert '<<elseif $wardrobeOption is "sell">>' in body
    return body


def gen_wardrobe(body):
    start = body.index('\t\t<<elseif $tailorMonthlyService is "discard">>')
    end = body.index('\t\t<</if>>\n\t\t<<if $wardrobeRepair is undefined>>', start)
    old = body[start:end]
    assert 'Add outfits and send' in old and 'Add all items and send' in old
    new = '''\t\t<<elseif $tailorMonthlyService is "discard">>
\t\t\t__Wardrobe Sale Crate__
\t\t\tThere is a small crate ready for sending clothes to be sold.
\t\t\t<br>
\t\t\t<<link [[Add all items and send|Wardrobe Sale Crate]]>>
\t\t\t\t<<set $wardrobeReturnLink to $passage>>
\t\t\t\t<<set $crateContents to "all">>
\t\t\t<</link>>
\t\t\t<br><br>
\t\t\t<<set _bjxCrateItems to []>>
\t\t\t<<set _bjxCrateValue to 0>>
\t\t\t<<for _bjxLabel, _bjxItems range $wardrobe>>
\t\t\t\t<<for _bjxI to 0; _bjxI lt _bjxItems.length; _bjxI++>>
\t\t\t\t\t<<if _bjxItems[_bjxI]._bjxSaleCrate is true>>
\t\t\t\t\t\t<<run _bjxCrateItems.push(_bjxItems[_bjxI].name)>>
\t\t\t\t\t\t<<if _bjxItems[_bjxI].outfitSecondary is undefined>>
\t\t\t\t\t\t\t<<set _bjxCrateValue += Math.floor(tailorClothingCost(_bjxItems[_bjxI], _bjxLabel) * (_bjxItems[_bjxI].integrity / clothingData(_bjxLabel, _bjxItems[_bjxI], 'integrity_max')) / 3)>>
\t\t\t\t\t\t<</if>>
\t\t\t\t\t<</if>>
\t\t\t\t<</for>>
\t\t\t<</for>>
\t\t\t<<if _bjxCrateItems.length gt 0>>
\t\t\t\t出售箱里：<<print formatList(_bjxCrateItems)>>。
\t\t\t\t<br>
\t\t\t\t预计可得 <<printmoney `_bjxCrateValue + 5000`>>。
\t\t\t\t<br>
\t\t\t\t<<link [[出售箱中的衣物|Wardrobe Sale Crate]]>>
\t\t\t\t\t<<set $wardrobeReturnLink to $passage>>
\t\t\t\t\t<<set $crateContents to "selected">>
\t\t\t\t<</link>>
\t\t\t\t<br>
\t\t\t<<else>>
\t\t\t\t出售箱是空的。选择上方的「出售」，再点击衣柜里的衣物放进箱子。
\t\t\t\t<br>
\t\t\t<</if>>
\t\t\t<br>
\t\t\t<<link [[Cancel the request|$passage]]>><<set $tailorMonthlyService to 1>><<bjxClearSaleCrate>><</link>>
\t\t\t<br><br>
'''
    body = body[:start] + new + body[end:]
    # repair crate keeps "Add outfits and send"; the sale crate must not.
    sale_start = body.index('\t\t<<elseif $tailorMonthlyService is "discard">>')
    sale_end = body.index('\t\t<</if>>\n\t\t<<if $wardrobeRepair is undefined>>', sale_start)
    assert 'Add outfits and send' not in body[sale_start:sale_end], 'sale crate still offers Add outfits'
    assert 'Add outfits and send' in body, 'repair crate lost its Add outfits link'
    return body


SALE_CRATE = ''':: Wardrobe Sale Crate
<<set _value to 0>>
<<if $crateContents is "selected">>
\t<<set _bjxNames to []>>
\t<<for _label, _items range $wardrobe>>
\t\t<<for _i to 0; _i lt _items.length; _i++>>
\t\t\t<<if _items[_i]._bjxSaleCrate is true>>
\t\t\t\t<<run _bjxNames.push(_items[_i].name)>>
\t\t\t\t<<if _items[_i].outfitSecondary is undefined>>
\t\t\t\t\t<<set _value += Math.floor(tailorClothingCost(_items[_i], _label) * (_items[_i].integrity / clothingData(_label, _items[_i], 'integrity_max')) / 3)>>
\t\t\t\t<</if>>
\t\t\t<</if>>
\t\t<</for>>
\t<</for>>
\tAre you prepared to sell the clothes in the crate?
\t<br><br>
\t<<if _bjxNames.length is 0>>
\t\tThe crate is empty.
\t<<else>>
\t\t<<print formatList(_bjxNames)>>.
\t<</if>>
<<else>>
\t<<set _bjxNames to []>>
\tAre you prepared to add all your clothes to the crate and send them to be sold? Might be best to go shopping shortly after.
\t<br><br>
\t<<for _label, _items range $wardrobe>>
\t\t<<for _i to 0; _i lt _items.length; _i++>>
\t\t\t<<if setup.clothes[_label][clothesIndex(_label, _items[_i])].shop.length is 0>><<continue>><</if>>
\t\t\t<<if _items[_i].outfitSecondary isnot undefined>><<continue>><</if>>
\t\t\t<<run _bjxNames.push(_items[_i].name)>>
\t\t\t<<set _value += Math.floor(tailorClothingCost(_items[_i], _label) * (_items[_i].integrity / clothingData(_label, _items[_i], 'integrity_max')) / 3)>>
\t\t<</for>>
\t<</for>>
\t<<if _bjxNames.length gt 0>>
\t\tYou are selling <<print formatList(_bjxNames)>>.
\t\t<br><br>
\t<</if>>
<</if>>
It will earn you <<printmoney `_value + 5000`>>.
<br><br>
<<link [[Yes|Wardrobe Sale Crate Result]]>><</link>>
<br>
<<link [[No|$wardrobeReturnLink]]>>
\t<<unset $wardrobeReturnLink>>
\t<<unset $crateContents>>
<</link>>
'''

SALE_RESULT = ''':: Wardrobe Sale Crate Result
<<set $tailorMonthlyService to 7>>
<<set _value to 0>>
<<if $crateContents is "selected">>
\t<<for _label, _items range $wardrobe>>
\t\t<<for _i to _items.length - 1; _i gte 0; _i-->>
\t\t\t<<if _items[_i]._bjxSaleCrate is true>>
\t\t\t\t<<if _items[_i].outfitSecondary is undefined>>
\t\t\t\t\t<<set _value += Math.floor(tailorClothingCost(_items[_i], _label) * (_items[_i].integrity / clothingData(_label, _items[_i], 'integrity_max')) / 3)>>
\t\t\t\t<</if>>
\t\t\t\t<<run $wardrobe[_label].deleteAt(_i)>>
\t\t\t<</if>>
\t\t<</for>>
\t<</for>>
<<else>>
\t<<for _label, _items range $wardrobe>>
\t\t<<for _i to _items.length - 1; _i gte 0; _i-->>
\t\t\t<<if setup.clothes[_label][clothesIndex(_label, _items[_i])].shop.length is 0>><<continue>><</if>>
\t\t\t<<if _items[_i].outfitSecondary isnot undefined>><<continue>><</if>>
\t\t\t<<set _value += Math.floor(tailorClothingCost(_items[_i], _label) * (_items[_i].integrity / clothingData(_label, _items[_i], 'integrity_max')) / 3)>>
\t\t\t<<run $wardrobe[_label].deleteAt(_i)>>
\t\t<</for>>
\t<</for>>
<</if>>
The driver takes the crate away, leaving <<printmoney `_value + 5000`>> in its place.
<<money `Math.floor(_value + 5000)` "tailor">>
<br><br>
<<link [[Continue|$wardrobeReturnLink]]>>
\t<<unset $wardrobeReturnLink>>
\t<<unset $crateContents>>
<</link>>
'''

CLEAR_WIDGET = '''<<widget "bjxClearSaleCrate">>
\t<<for _label, _items range $wardrobe>>
\t\t<<for _i to 0; _i lt _items.length; _i++>>
\t\t\t<<if _items[_i]._bjxSaleCrate isnot undefined>><<set _items[_i]._bjxSaleCrate to false>><</if>>
\t\t<</for>>
\t<</for>>
<</widget>>
'''


def main():
    src = read(SRC)
    opts = gen_options(widget(src, 'wardrobeClothingOptions'))
    wear = gen_wear(widget(src, 'wardrobewear'))
    ward = gen_wardrobe(widget(src, 'wardrobe'))

    out = ('/* BJX-Pack: 衣柜出售箱（生成器 genparts/gen_wardrobe_sale.py，勿手改） */\n'
           ':: Widgets Wardrobe Sale BJX [widget]\n'
           + CLEAR_WIDGET + '\n' + opts + '\n\n' + wear + '\n\n' + ward + '\n\n'
           + SALE_CRATE + '\n' + SALE_RESULT)
    assert out.count('<<widget "wardrobeClothingOptions">>') == 1
    assert out.count('<<widget "wardrobewear">>') == 1
    assert out.count('<<widget "wardrobe">>') == 1
    assert out.count(':: Wardrobe Sale Crate') == 2  # crate + result both start with it
    assert out.count('Add outfits and send') == 1  # only the repair crate keeps it

    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, OUT_NAME)
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('wrote %s (%d bytes, %d lines)' % (dst, len(out), out.count('\n') + 1))


if __name__ == '__main__':
    main()
