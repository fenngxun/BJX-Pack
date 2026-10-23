# -*- coding: utf-8 -*-
"""解锁学校图书馆的偷书上限：一次可以偷多本，被动学习按已偷书目逐本叠加。

背景
----
0.5 原版把偷书限制成「一次只能持有一本」：
  * loc-school/widgets.twee 的 bookRentalOptions 里
    `<<if $studyBooks.stolen is "none">>` 是总门槛，
    提示文本 "You can only carry one stolen book at a time."；
  * loc-school/library.twee 的 `:: Book Rental Return Stolen` 直接把
    `$studyBooks.stolen` 置 "none"。
因为整个下游体系都把 `$studyBooks.stolen` 当「当前那一本」的字符串读：
journal.twee / police/widgets.twee / special-sydney/main.twee /
special-olive.twee / forestshop/widgets.twee / time.js（每日 crimeUp）。

方案
----
不动 `$studyBooks.stolen` 的类型与语义（仍是「最近一本」，兼容所有下游），
另立 `$studyBooks.stolenList` 数组作为「未归还的已偷书目」真源：

  a. 全量重声明 <<widget "bookRentalOptions">>
     - 惰性初始化 stolenList（undefined → []；老档若 stolen 不是 "none"
       则把这一本并入）；
     - 每次进入时把刚偷到的书同步进列表（偷书分支末尾本来就会调用本
       widget，$bookStolen 由 time.js 每日消费清零，无需改大 passage）；
     - 外部没收（警察 / Sydney 自首 / Leighton 收书）原版只把 stolen 置
       "none"，这里弹出列表末项，维持 stolen = 列表末项 的不变量；
     - 已偷书每本渲染一条归还链接（Book Rental Return Stolen，
       按书种设 $phase 1..6），文本沿用原版措辞；
     - 删除单本上限门槛与提示文本；
     - 各书偷/租链接改用列表判断（已偷过或已租着该书则不显示）。
  b. 全量重声明 <<widget "passiveStudy">>
     - rented 按原逻辑 +6；
     - stolenList 每一项各 +6（保留 no_star 与 $statFreeze 判断；
       列表缺失时回退单本 stolen）。
  c. 全量覆盖 `:: Book Rental Return Stolen`
     - 用 $phase(1..6) 定位要还的书（无 phase 或不在列表时回退最近一本）；
     - 从 stolenList 移除该本，`$studyBooks.stolen` 回填剩余最后一本或
       "none"；
     - 原叙述分支（bookStolenKnown 三段、Sydney 在场/不在、absent 离场）
       与 `<<set $bookStolenKnown += 1>>` / `<<unset $sydneyStolenKnown>>`
       等副作用原样保留。

产物
----
work/bjx-pack/tweeFileList/bjx-stolen-books.twee（由 build_pack.py 的
genparts 子进程直接写入 TWE，与 gen_statistics 同模式；也可单独运行本脚本
幂等重建）。换行统一 CRLF。
"""

import io
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GAME = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
SRC_SCHOOL_WIDGETS = os.path.join(GAME, 'overworld-town', 'loc-school',
                                  'widgets.twee')
SRC_LIBRARY = os.path.join(GAME, 'overworld-town', 'loc-school', 'library.twee')
SRC_BASE_WIDGETS = os.path.join(GAME, 'base-system', 'widgets.twee')
OUT = os.path.join(ROOT, 'work', 'bjx-pack', 'tweeFileList',
                   'bjx-stolen-books.twee')

# 书种顺序与原版 library.twee 的 _books 一致，下标 +1 即 $phase
BOOKS = ['science', 'maths', 'English', 'history', 'Raul and Janet', 'Pinch']
# vanilla passiveStudy 只给这 4 门学科加成（Raul/Pinch 无被动）
PASSIVE = [('science', 'scienceskill'), ('maths', 'mathsskill'),
           ('English', 'englishskill'), ('history', 'historyskill')]


def read(path):
    return io.open(path, encoding='utf-8', newline='').read()


def ext_widget(text, name, srcname):
    """按 widget 名截出整段定义（含 <</widget>>）。定义必须唯一。"""
    head = '<<widget "%s">>' % name
    assert text.count(head) == 1, \
        '%s: <<widget "%s">> 出现 %d 次（期望 1）' % (srcname, name,
                                                  text.count(head))
    start = text.index(head)
    end = text.index('<</widget>>', start) + len('<</widget>>')
    return text[start:end]


def ext_passage(text, name, srcname):
    """按 passage 名截出整段（含 `:: 名` 头行，到下一个 passage 头或文件尾）。"""
    head = ':: %s\n' % name
    assert text.count(head) == 1, \
        '%s: passage "%s" 出现 %d 次（期望 1）' % (srcname, name,
                                               text.count(head))
    start = text.index(head)
    body_start = start + len(head)
    m = re.search(r'(?m)^:: ', text[body_start:])
    end = body_start + m.start() if m else len(text)
    return text[start:end]


def one_sub(text, old, new, label):
    """单次替换（期望恰好出现一次），返回新文本。"""
    n = text.count(old)
    assert n == 1, '%s: 锚点出现 %d 次（期望 1）' % (label, n)
    return text.replace(old, new, 1)


def build_book_rental(text):
    """a. 全量重声明 bookRentalOptions。"""
    block = ext_widget(text, 'bookRentalOptions', 'loc-school/widgets.twee')

    # 1) 初始化同时建列表 + 惰性迁移老档 + 刚偷到的那本入列
    block = one_sub(
        block,
        '\t\t<<set $studyBooks.stolen to "none">>\n\t<</if>>',
        '\t\t<<set $studyBooks.stolen to "none">>\n'
        '\t\t<<set $studyBooks.stolenList to []>>\n'
        '\t<</if>>\n'
        '\t/* 未归还的已偷书目真源；老档只有单本 $studyBooks.stolen，先并入 */\n'
        '\t<<if $studyBooks.stolenList is undefined>>\n'
        '\t\t<<set $studyBooks.stolenList to []>>\n'
        '\t\t<<if $studyBooks.stolen isnot undefined and $studyBooks.stolen isnot "none">>\n'
        '\t\t\t<<set $studyBooks.stolenList.push($studyBooks.stolen)>>\n'
        '\t\t<</if>>\n'
        '\t<</if>>\n'
        '\t/* 外部没收（警察 / Sydney 自首 / Leighton 收书）原版直接把\n'
        '\t   $studyBooks.stolen 置 "none"，等于拿走了「当前那一本」，\n'
        '\t   即列表末项：弹出以维持 stolen = 列表末项 的不变量 */\n'
        '\t<<if $studyBooks.stolenList.length gt 0 and $studyBooks.stolen is "none">>\n'
        '\t\t<<set $studyBooks.stolenList.pop()>>\n'
        '\t\t<<set $studyBooks.stolen to ($studyBooks.stolenList.length gt 0 ? $studyBooks.stolenList[$studyBooks.stolenList.length - 1] : "none")>>\n'
        '\t<</if>>\n'
        '\t/* 偷书分支末尾会把 $bookStolen 置 1（time.js 每日消费后删除）：\n'
        '\t   把刚到手的那本同步进未归还列表，大 passage 无需改动 */\n'
        '\t<<if $bookStolen is 1 and $studyBooks.stolen isnot "none" and !$studyBooks.stolenList.includes($studyBooks.stolen)>>\n'
        '\t\t<<set $studyBooks.stolenList.push($studyBooks.stolen)>>\n'
        '\t<</if>>',
        'bookRentalOptions 初始化')

    # 2) 归还偷书的 switch 换成逐本渲染
    start = block.index('\t<<switch $studyBooks.stolen>>\n')
    end = block.index('\t<</switch>>\n', start) + len('\t<</switch>>\n')
    old_switch = block[start:end]
    assert 'Return your stolen' in old_switch, '归还 switch 锚点不对'
    assert '`Return your stolen ${$studyBooks.stolen} textbook`' in old_switch
    new_switch = ''
    for idx, book in enumerate(BOOKS, 1):
        if book == 'Raul and Janet':
            label = 'Return your stolen copy of "Raul and Janet"'
        elif book == 'Pinch':
            label = 'Return the olive-coloured book'
        else:
            label = 'Return your stolen %s textbook' % book
        new_switch += (
            '\t<<if $studyBooks.stolenList.includes("%s")>>\n'
            '\t\t<<schoolicon "library">>'
            '<<link [[%s|Book Rental Return Stolen]]>><<set $phase to %d>><</link>>\n'
            '\t\t<br>\n'
            '\t<</if>>\n' % (book, label, idx))
    block = block[:start] + new_switch + block[end:]

    # 3) Sydney 在场分支（租书）：stolen isnot 书 → 列表不含该书
    for book in BOOKS[:4]:
        block = one_sub(block,
                        '$studyBooks.stolen isnot "%s"' % book,
                        '!$studyBooks.stolenList.includes("%s")' % book,
                        '租书条件 %s' % book)
    block = one_sub(block,
                    '$studyBooks.stolen isnot "Raul and Janet"',
                    '!$studyBooks.stolenList.includes("Raul and Janet")',
                    '租书条件 Raul and Janet')

    # 4) 偷书分支 Pinch：原版只看 stolen，这里补上 rented 判断
    pat = re.compile(r'\$studyBooks\.stolen isnot "Pinch"(>>\n\t*<<oliveicon>>'
                     r'<<link \[\[Steal)')
    block, n = pat.subn(r'$studyBooks.rented isnot "Pinch" and '
                        r'!$studyBooks.stolenList.includes("Pinch")\1', block)
    assert n == 1, '偷书分支 Pinch 条件锚点出现 %d 次（期望 1）' % n

    # 5) 剩下的 Pinch 条件（租书分支）同样改列表判断
    block = one_sub(block,
                    '$studyBooks.stolen isnot "Pinch"',
                    '!$studyBooks.stolenList.includes("Pinch")',
                    '租书条件 Pinch')

    # 6) 偷书分支：rented isnot 书 → 同时排除已偷
    for book in BOOKS[:4]:
        block = one_sub(
            block,
            '$studyBooks.rented isnot "%s"' % book,
            '$studyBooks.rented isnot "%s" and '
            '!$studyBooks.stolenList.includes("%s")' % (book, book),
            '偷书条件 %s' % book)
    block = one_sub(block,
                    '$studyBooks.rented isnot "Raul and Janet"',
                    '$studyBooks.rented isnot "Raul and Janet" and '
                    '!$studyBooks.stolenList.includes("Raul and Janet")',
                    '偷书条件 Raul and Janet')

    # 7) 删掉「一次只能拿一本」总门槛与提示文本
    block, n = re.subn(r'\n\t+<<if \$studyBooks\.stolen is "none">>\n', '\n',
                       block)
    assert n == 1, '单本上限门槛锚点出现 %d 次（期望 1）' % n
    block, n = re.subn(r'\n\t+<<else>>\n'
                       r'\t+You can only carry one stolen book at a time\.\n'
                       r'\t+<br>\n\t+<</if>>', '', block)
    assert n == 1, '单本上限提示锚点出现 %d 次（期望 1）' % n

    return block


def build_passive(text):
    """b. 全量重声明 passiveStudy。"""
    block = ext_widget(text, 'passiveStudy', 'base-system/widgets.twee')

    start = block.index('\t\t<<switch $studyBooks.stolen>>\n')
    end = block.index('\t\t<</switch>>\n', start) + len('\t\t<</switch>>\n')
    old_switch = block[start:end]
    assert '<<scienceskill 6 "no_star">>' in old_switch, '被动 switch 锚点不对'
    assert old_switch.count('<<case') == 4, '被动 switch 书种数应为 4'

    new_part = ('\t\t/* 偷来的书按「未归还书目」逐本叠加；列表缺失时回退'
                '最近一本 */\n'
                '\t\t<<if $studyBooks.stolenList isnot undefined>>\n'
                '\t\t\t<<set _bjxStolenBooks to $studyBooks.stolenList>>\n'
                '\t\t<<elseif $studyBooks.stolen isnot undefined and '
                '$studyBooks.stolen isnot "none">>\n'
                '\t\t\t<<set _bjxStolenBooks to [$studyBooks.stolen]>>\n'
                '\t\t<<else>>\n'
                '\t\t\t<<set _bjxStolenBooks to []>>\n'
                '\t\t<</if>>\n')
    for book, macro in PASSIVE:
        new_part += ('\t\t<<if _bjxStolenBooks.includes("%s")>>'
                     '<<%s 6 "no_star">><</if>>\n' % (book, macro))
    block = block[:start] + new_part + block[end:]
    return block


def build_return_passage(text):
    """c. 全量覆盖 :: Book Rental Return Stolen。"""
    passage = ext_passage(text, 'Book Rental Return Stolen', 'library.twee')
    head = ':: Book Rental Return Stolen\n'
    body = passage[len(head):]

    anchor = '<<sydneySchedule>><<run statusCheck("Sydney")>>\n'
    helper = anchor + (
        '/* BJX：$phase(1..6) 定位要还的那本；缺省或不在列表时回退最近一本 */\n'
        '<<set _bjxBooks to ["science", "maths", "English", "history", '
        '"Raul and Janet", "Pinch"]>>\n'
        '<<if $studyBooks.stolenList is undefined>>\n'
        '\t<<set $studyBooks.stolenList to []>>\n'
        '\t<<if $studyBooks.stolen isnot undefined and $studyBooks.stolen isnot "none">>\n'
        '\t\t<<set $studyBooks.stolenList.push($studyBooks.stolen)>>\n'
        '\t<</if>>\n'
        '<</if>>\n'
        '<<set _bjxReturn to $studyBooks.stolen>>\n'
        '<<if $phase gte 1 and $phase lte 6 and $studyBooks.stolenList.includes(_bjxBooks[$phase-1])>>\n'
        '\t<<set _bjxReturn to _bjxBooks[$phase-1]>>\n'
        '<</if>>\n'
        '<<if _bjxReturn isnot undefined and _bjxReturn isnot "none" and !$studyBooks.stolenList.includes(_bjxReturn)>>\n'
        '\t<<set $studyBooks.stolenList.push(_bjxReturn)>>\n'
        '<</if>>\n'
        '/* 从列表移除这一本（Array.delete 原地修改并返回被删项，不能赋值回去）；\n'
        '   $studyBooks.stolen 回填剩余最后一本或 "none" */\n'
        '<<run $studyBooks.stolenList.delete(_bjxReturn)>>\n'
        '<<set $studyBooks.stolen to ($studyBooks.stolenList.length gt 0 '
        '? $studyBooks.stolenList[$studyBooks.stolenList.length - 1] '
        ': "none")>>\n')
    body = one_sub(body, anchor, helper, 'Return Stolen 调度器锚点')

    # 展示分支改成按 _bjxReturn（要还的那一本）判断
    body = one_sub(body, '<<if $phase is 6>>', '<<if _bjxReturn is "Pinch">>',
                   'Return Stolen 展示分支 Pinch')
    body = one_sub(body, '<<elseif $phase is 5>>',
                   '<<elseif _bjxReturn is "Raul and Janet">>',
                   'Return Stolen 展示分支 Raul and Janet')
    body = one_sub(body,
                   '\t<<wearProp $studyBooks.stolen>>\n'
                   '\t$studyBooks.stolen textbook.',
                   '\t<<wearProp _bjxReturn>>\n\t_bjxReturn textbook.',
                   'Return Stolen 展示分支 普通教科书')

    # 原版的两处 stolen 置 "none" 已由上面的移出逻辑取代
    body, n = re.subn(r'\n\t+<<set \$studyBooks\.stolen to "none">>', '', body)
    assert n == 2, 'Return Stolen 旧 stolen 清零锚点出现 %d 次（期望 2）' % n

    return head + body


def main():
    school_widgets = read(SRC_SCHOOL_WIDGETS)
    library = read(SRC_LIBRARY)
    base_widgets = read(SRC_BASE_WIDGETS)

    rental = build_book_rental(school_widgets)
    passive = build_passive(base_widgets)
    passage = build_return_passage(library)

    out = ('/* BJX pack: 图书馆偷书上限解除 —— 可一次偷多本，被动学习按已偷书目\n'
           '   逐本叠加。$studyBooks.stolen 仍是「最近一本」字符串（journal /\n'
           '   police / sydney / olive / forestshop / time.js 都按单本读），\n'
           '   新增 $studyBooks.stolenList 数组作为未归还书目真源。\n'
           '   本文件同名后加载覆盖 bookRentalOptions / passiveStudy 两个\n'
           '   widget 与 :: Book Rental Return Stolen passage。 */\n'
           ':: BJX Stolen Books [widget]\n'
           '\n'
           '/* 北极星模组 */\n'
           + rental + '\n\n' + passive + '\n\n'
           + passage.rstrip('\n') + '\n'
           '/* 北极星 */\n')

    # ---- 自检 ----
    assert out.count('<<widget "bookRentalOptions">>') == 1
    assert out.count('<<widget "passiveStudy">>') == 1
    assert out.count(':: Book Rental Return Stolen\n') == 1
    assert 'You can only carry one stolen book at a time.' not in out
    assert '<<if $studyBooks.stolen is "none">>' not in out
    # 6 条归还链接，phase 1..6 各一次
    assert out.count('|Book Rental Return Stolen]]') == 6, \
        '归还链接数: %d' % out.count('|Book Rental Return Stolen]]')
    for idx in range(1, 7):
        assert ('<<set $phase to %d>><</link>>' % idx) in out
    # 租书/偷书各 6 条列表判断（每本一次）
    for book in BOOKS:
        assert out.count('!$studyBooks.stolenList.includes("%s")' % book) == 2, \
            '%s 的租/偷条件数不对: %d' % (
                book, out.count('!$studyBooks.stolenList.includes("%s")'
                                % book))
    # 被动 4 门各 +6，且 total 调用数与原版一致（除了改成列表逐本）
    for book, macro in PASSIVE:
        assert ('<<if _bjxStolenBooks.includes("%s")>><<%s 6 "no_star">>'
                '<</if>>' % (book, macro)) in out
    # 列表真源的写入点：widget 2 处（惰性迁移 + 偷书同步）+ 归还 passage 2 处
    # （惰性迁移 + 兜底补录），移出 1 处
    assert out.count('$studyBooks.stolenList.push(') == 4, \
        'stolenList.push 次数: %d' % out.count('$studyBooks.stolenList.push(')
    assert out.count('$studyBooks.stolenList.delete(_bjxReturn)') == 1
    assert out.count('$studyBooks.stolenList.pop()') == 1
    # 原版副作用必须还在
    assert out.count('<<set $bookStolenKnown += 1>>') == 1
    assert out.count('<<unset $sydneyStolenKnown>>') == 2
    assert out.count('<<set $bookStolenAbsent to 1>>') == 1
    assert out.count('<<clearNPC "pinch">>') == 1

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(out)

    # 换行自检：全文件 CRLF，无裸 LF
    raw = io.open(OUT, 'rb').read()
    assert raw.count(b'\n') == raw.count(b'\r\n'), '存在裸 LF'
    print('bjx-stolen-books.twee: %d lines / %d bytes (CRLF)'
          % (out.count('\n'), len(raw)))


if __name__ == '__main__':
    main()
