# -*- coding: utf-8 -*-
"""衣柜「一键修复所有衣物」生成器。

需求（2026-10-22）：持有缝纫机（裁缝店 £1000 购买的 `$sewingKit`）时，
在衣柜页面一键把所有衣物 integrity 补满，并 +5 家务。

0.5 原版只有 `Repair (0:05 per piece)` 逐件修；这里新增一个独立 passage，
由 inject_early.js 在衣柜页注入入口（条件同原版：sewingKit=1 且在家里）。

实现要点：
  - 衣柜分 slot 存成 `$wardrobes[$wardrobe_location][slot] = [item, ...]`，
    对象里还有 name/unlocked/space 等非数组字段，必须 Array.isArray 过滤。
  - **同时修身上穿的 `$worn`**：玩家理解里的「所有衣服」包含当前装备；
    只修衣柜会出现「明明有破损却提示没得修」。
  - 满耐久优先用 item.integrity_max（衣物自带），缺失才回退
    `clothingData(slot, item, "integrity_max")`（原版同款）。
  - `<<housekeeping 2.5>>` = +5（该 widget 内部 ×2）。
  - `<<pass 30>>` 推进半小时（原版单件 5 分钟，一次修全部收 30 分钟）。

输出：_verify_wardrobe_repair/bjx-wardrobe-repair.twee
"""

import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_verify_wardrobe_repair')
OUT_NAME = 'bjx-wardrobe-repair.twee'

TWEE = '''/* BJX-Pack: 衣柜一键修复（生成器 genparts/gen_wardrobe_repair.py，勿手改） */
:: BJX Wardrobe Repair All [exitCheckBypass]
<<effects>>
<<set _n to 0>>
<<set _w to $wardrobes[$wardrobe_location]>>
<<if _w>>
	<<for _slot, _arr range _w>>
		<<if Array.isArray(_arr)>>
			<<for _it range _arr>>
				<<if _it and typeof _it is "object" and _it.integrity isnot undefined>>
					<<set _max to _it.integrity_max>>
					<<if !_max>><<set _max to clothingData(_slot, _it, "integrity_max")>><</if>>
					<<if _max and _it.integrity lt _max>>
						<<set _it.integrity to _max>>
						<<set _n++>>
					<</if>>
				<</if>>
			<</for>>
		<</if>>
	<</for>>
<</if>>
/* 身上穿着的也一起修 */
<<for _wslot, _worn range $worn>>
	<<if _worn and typeof _worn is "object" and _worn.integrity isnot undefined>>
		<<set _max to _worn.integrity_max>>
		<<if !_max>><<set _max to clothingData(_wslot, _worn, "integrity_max")>><</if>>
		<<if _max and _worn.integrity lt _max>>
			<<set _worn.integrity to _max>>
			<<set _n++>>
		<</if>>
	<</if>>
<</for>>
<<if _n gt 0>>
	你踩动缝纫机，把所有破损的衣物都补好了，一共 <<print _n>> 件。
	<<housekeeping 2.5>>
	<<pass 30>>
<<else>>
	衣柜里和身上的衣物都完好无损，没什么可补的。
<</if>>
<br><br>
<<link [[返回|$bjxRepairReturn]]>><</link>>
'''


def main():
    os.makedirs(OUT, exist_ok=True)
    for token in ('<<set _w to $wardrobes[$wardrobe_location]>>', 'range $worn',
                  'clothingData', 'housekeeping 2.5', '<<set _n++>>'):
        assert token in TWEE, 'missing ' + token
    assert TWEE.count(':: ') == 1
    p = os.path.join(OUT, OUT_NAME)
    open(p, 'w', encoding='utf-8', newline='\n').write(TWEE)
    print('wrote %s (%d bytes)' % (p, len(TWEE.encode('utf-8'))))


if __name__ == '__main__':
    main()
