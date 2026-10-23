# -*- coding: utf-8 -*-
"""摆摊售卖声望分组生成器（BJX 0.4.3.3 -> DoL 0.5.10.12）。

BJX 在 `overworld-town/loc-market/widgets.twee` 的 `stall_sell` widget 里，把结尾固定的
`<<famebusiness 1>>` 换成按顾客信任度分 6 档，由 `$options.bjx_sellproduce` 开关控制。
0.5 里这个开关只有 checkbox、没有消费点（死开关），这里补上。

做法：全文重声明（和 gen_swarm.py 同一范式）——从 0.5 源文件里抽出 `stall_sell` 的
完整 widget 体，只替换最后那一行，其余逐字保留。每次构建都重新读 0.5 源码，所以上游
改了这个 widget 会自动跟过来，不会像手抄那样静默漂移。

变量说明：`$enemytrust` 在 0.5 里存在（`stall_trust` widget 用它分档显示顾客态度），
所以 BJX 的分档阈值可以原样用，不需要翻译。

输出：_verify_market_sell/bjx-market-sell.twee（LF，单文件单 passage）
"""

import os

ROOT = r'C:\Users\79403\Desktop\dol'
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '_verify_market_sell')
SRC = os.path.join(REF, 'overworld-town', 'loc-market', 'widgets.twee')

WIDGET = 'stall_sell'
OUT_NAME = 'bjx-market-sell.twee'
# 新 passage 名不能和 0.5 的 'Widgets Market' 撞（同名会整段覆盖掉别的 widget）
PASSAGE = 'Widgets Market Sell BJX'

OLD = '\t<<famebusiness 1>>\n'
NEW = (
    '\t/* BJX pack: 摆摊声望按顾客信任度浮动（$options.bjx_sellproduce） */\n'
    '\t<<if $options.bjx_sellproduce>>\n'
    '\t\t<<if $enemytrust gte 50>>\n'
    '\t\t\t<<famebusiness 10>>\n'
    '\t\t<<elseif $enemytrust gte 30>>\n'
    '\t\t\t<<famebusiness 3>>\n'
    '\t\t<<elseif $enemytrust gte 10>>\n'
    '\t\t\t<<famebusiness 1>>\n'
    '\t\t<<elseif $enemytrust gte -10>>\n'
    '\t\t\t<<famebusiness 0>>\n'
    '\t\t<<elseif $enemytrust gte -30>>\n'
    '\t\t\t<<famebusiness -3>>\n'
    '\t\t<<else>>\n'
    '\t\t\t<<famebusiness -10>>\n'
    '\t\t<</if>>\n'
    '\t<<else>>\n'
    '\t\t<<famebusiness 1>>\n'
    '\t<</if>>\n'
)


def read(path):
    return open(path, encoding='utf-8', newline='').read()


def widget_body(text, name):
    """返回 `<<widget "name">>` 到 `<</widget>>` 的整段（含首尾）。"""
    head = '<<widget "%s">>' % name
    assert text.count(head) == 1, 'widget head not unique: ' + name
    i = text.index(head)
    j = text.index('<</widget>>', i) + len('<</widget>>')
    return text[i:j]


def main():
    src = read(SRC)
    body = widget_body(src, WIDGET)
    assert body.count('<<famebusiness 1>>') == 1, (
        'stall_sell 里 <<famebusiness 1>> 不是唯一一处，锚点失效')
    assert body.endswith('\t<<famebusiness 1>>\n<</widget>>'), (
        '锚点不在 widget 结尾，0.5 结构变了，先人工核对')
    assert OLD in body, '锚点行格式变了（缩进/换行）'

    new_body = body.replace(OLD, NEW)
    # 正向断言：分档块必须在，原来的固定 1 点必须还在 else 分支里
    assert '<<famebusiness 10>>' in new_body and '<<famebusiness -10>>' in new_body
    # 注释里也提到了开关名，所以数 if 形式而不是变量名
    assert new_body.count('<<if $options.bjx_sellproduce>>') == 1
    assert new_body.count('<</widget>>') == 1

    out = ('/* BJX pack: 0.5 loc-market/widgets.twee 的 stall_sell 全文重声明 + '
           'BJX 摆摊声望分档。\n'
           '   由 work/genparts/gen_market_sell.py 生成，勿手改。 */\n'
           ':: %s [widget]\n' % PASSAGE) + new_body + '\n'
    assert '\r' not in out, 'CRLF leaked'

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, OUT_NAME)
    open(path, 'w', encoding='utf-8', newline='\n').write(out)
    print('%-30s stall_sell %d 行 -> %d 行' % (
        OUT_NAME, body.count('\n'), new_body.count('\n')))
    print('passage: %s [widget]' % PASSAGE)
    print('output: ' + OUT)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
