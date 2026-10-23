# 待实施改动清单（2026-10-23）

> ✅ **9 项已全部实施并交付（2026-10-23）**，dev 与发布包双绿（62/62 + 36/36 + 22/22）。
> 实施细节与验证见 `work/HANDOFF.md` §8.15；本文件保留作改动依据存档。

> 本文件汇总本次会话讨论过的**全部待改内容**，按“现象 → 根因 → 改哪里 → 怎么改 → 怎么验”组织。
> 所有行号以当前工作区为准（DoL 0.5.12.13 Lyra / bjx-pack 1.4.0）。
> **构建产物禁止手改**：`work/bjx-pack/tweeFileList/*` 由 `build_pack.py` 生成，`mod/*.adapted.mod.zip` 由 `b2_adapt.py` 生成。

## 0. 总览

| # | 模块 | 主要落点 | 类型 | 难度 |
|---|---|---|---|---|
| 1 | 吸收精华对异种族失效 | `physicalAdjustments.twee:571` + `bjx-hunter.twee:4-21` | 计数口径 | ★★ |
| 2 | 骑自行车算运动 | `b2_adapt.py` → DoLSims `MarketSims.twee` | 批量替换 | ★★ |
| 3 | 猎手每 30 点升一级 | `genparts/gen_hunter.py:174/180-188/312` | 改常量 | ★ |
| 4 | 农场一键收获失效 | `genparts/gen_tending.py:288` | 重写 payload | ★★ |
| 5 | 再来一发改战后独立页面 | `gen_hunter.py` + `inject_early.js` | 新功能 | ★★★ |
| 6 | 催眠 D+ 永久卡关 | `b2_adapt.py` → DoLSims `Temple Hypno Sims.txt` | 改 1 个变量 | ★ |
| 7 | 催眠 500 级提示误导 | `b2_adapt.py` → DoLSims `librarySims.twee:1500` | 拆分支 | ★ |
| 8 | 胚胎吸收判定失效（`_hits=0`） | `gen_hunter.py` → `:: BJX Embryo Absorb` | 重写判定 | ★★ |
| 9 | 药房药品后加说明 | `b2_adapt.py` → i.Candy `printer.js` | 加 1 行 | ★ |

建议实施顺序：**3 → 1 → 4 → 6 → 7 → 8 → 9 → 2 → 5**（先小后大，5 最后做）。

---

## 1. 吸收精华对异种族失效

### 现象
与兽类/异种战斗后被内射，不触发“你吸收了性爱的精华，压力、创伤与疼痛都减轻了”。

### 根因
计数只发生在 `<<internalejac>>` 里（`bjx-hunter.twee:4-7`，条件 `$demon gte 6 or $demonhunter gte 6` 时 `$demonabsorb += 1`），而 `internalejac` 只在下列路径被调用：

- `vaginalejacstat`（`base-system/widgets.twee:1030`）
- `analejacstat`（`:1034`）
- `oralejacstat`（`:1038`）
- `struggle.twee` 14 处、`tentacle-action/adv.twee` 12 处（直接调用）

**不计数**的：`bottomejacstat`(1054/1062)、`thighejacstat`、`faceejacstat`、`chestejacstat`、`handejacstat`、`feetejacstat`、`tummyejacstat`、`vaginalentranceejacstat`、`penileejacstat` 等。

兽类射精 `beastejaculation`（`base-combat/ejaculation/ejaculation.twee:2489+`）里 8 处 `bottomejacstat`、8 处 `thighejacstat`、6 处 `vaginalentranceejacstat` 全都不计数；只有真正插入肛门（`:215` 附近）和阴道的那两支会调用 `analejacstat` / `vaginalejacstat`。所以体感是“只有人类才算”。

### 改法
把 `+1` 从 `internalejac` 移到 `<<creampie>>`——它是所有“体内射精”的公共出口（`base-system/physicalAdjustments.twee:571`）：

```twee
<<widget "creampie">>
	<<if _args[0] and _args[1]>>
		<<set $sexStats.creampie[_args[0]][_args[1]]++>>
	<</if>>
	/* BJX: 体内射精统一计数（含兽类/触手） */
	<<if $demon gte 6 or $demonhunter gte 6>>
		<<set $demonabsorb += 1>>
	<</if>>
	<<set $internalejac to 1>>
<</widget>>
```

同时把 `bjx-hunter.twee:4-7` 的 `+1` 删掉（否则双计）。

### 额外：非战斗分支
`bjx-hunter.twee:12-21` 的 `$combat isnot 1` 分支只减创伤、只打印英文提示，中文文案永远不会出现。建议抽一个 `<<bjxAbsorbHeal>>` widget（把 `:652-685` 的百分比恢复逻辑放进去），两处都调用。

### 验证
- 与野兽（狼/狗）肛交被内射 → 战斗结束出现中文提示、压力/创伤下降
- 与人类肛交 → 仍然只触发一次（不能翻倍）
- 触手战 → 行为不变

---

## 2. 骑自行车算运动

### 来源
自行车不是原版内容，来自 **DoLSims** 模组：

- `game/overworld-town/loc-market/MarketSims.twee`：`:: Bicycle Shop Sims`（£3000，`$BicycleSims = 1`）+ `:: Bicycle Sims 1` ~ `13`（按出发地分的 13 个场景，每个 12 个目的地）
- `game/overworld-town/loc-farmers-centre/Farm BikeSims Farm.twee`：农场骑行 2 个场景

### 现状
目的地链接只消耗时间：

```twee
<<link [[前往商业街(购物中心) (0:06)|High Street]]>><<pass 6>><</link>>
```

### 改法
在每个目的地链接的 `<<pass N>>` 后插入锻炼结算，N 就是骑行分钟数：

```twee
<<pass 6>><<physique 2>><<tiredness 2>><</link>>
```

换算规则：`K = max(1, floor(N / 3))`（3 分钟 1 点，12 分钟 4 点）。

### 落点
`work/b2_adapt.py` 的 `FIXES["DoLSims.mod.zip"]`（约 813 行）加规则，用正则批量处理 `MarketSims.twee` 与 `Farm BikeSims Farm.twee`：

```
匹配：<<pass (\d+)>>(?=</link>)
替换：<<pass \1>><<physique K>><<tiredness K>>
```

注意：
- 只处理 `Bicycle Sims *` 与 `Farm BikeSims Farm *` 两个 passage 内，别误伤同文件其它 `<<pass>>`
- 幂等：替换前先判断是否已含 `<<physique`
- 该文件有 157 处 `<<pass 数字>>`，必须用脚本，不要手改

### 验证
- 骑 3 分钟 → 疲劳/体质各 +1；12 分钟 → +4
- 骑完看角色面板 `$physique` 增长
- 农场骑行同样生效

---

## 3. 猎手每 30 点升一级

### 改法
`work/genparts/gen_hunter.py`：

| 行 | 现状 | 改成 |
|---|---|---|
| `:174` | `Math.min(360, ...)` | `Math.min(120, ...)` |
| `:180` 注释 | `2→3(90)、3→4(180)、5→6(360)` | `2→3(30)、3→4(60)、5→6(120)` |
| `:181` | `gte 90` | `gte 30` |
| `:184` | `gte 180` | `gte 60` |
| `:187` | `gte 360` | `gte 120` |
| `:312` | `Math.min(360, ...)` | `Math.min(120, ...)` |

4→5 仍然只能走医院（£10000），单场 +9 上限不变。

### 验证
- 作弊面板设 `$hunterbuild = 29`，再得 1 点 → 3 级
- `= 59` → 4 级
- `= 119` → 6 级
- 4 级不会自动跳 5 级

---

## 4. 农场一键收获失效

### 现象
点「收获全部」只过时间，作物没收。

### 位置
- 生成物：`work/bjx-pack/tweeFileList/bjx-tending-bjx.twee:317`
- **真正要改**：`work/genparts/gen_tending.py:288`

### 根因
payload 里 `<<pass N>>` 之后重新 filter `$plots[location]`，再遍历临时数组 `$_plotsToHarvest`；一旦 `$plots` 的 key 与 `_location` 不一致、或 pass 期间农场状态被刷新，filter 得到空数组 → 点击无效果。单块版（`:314` / `gen_tending.py:281`）因为按索引重新取 `$plots[loc][idx]`，所以不受影响。

### 改法
不要用字符串拼 `<<link>>`，改成真实块，并且**先收集索引**：

```twee
<<link "收获全部 (" + _time + ")">>
	<<set _idxList to []>>
	<<for _i to 0; _i lt $plots[_location].length; _i++>>
		<<if $plots[_location][_i].stage gte 5>><<run _idxList.push(_i)>><</if>>
	<</for>>
	<<pass _totalTimeToHarvest>>
	<<for _i range _idxList>>
		<<set _bed to $plots[_location][_i]>>
		<<if _bed and _bed.stage gte 5>>
			<<tending_harvest _bed>><<clear_plot _bed>>
		<</if>>
	<</for>>
<</link>>
```

要点：
- 索引用 `_idxList` 固定，避免对象引用在 `clear_plot` 后失效
- `clear_plot` 后 `stage` 归 0，二次校验防重复收获
- 保持 `<<pass>>` 在收获前（时间先走）

### 验证
- 一块地种满、多块成熟 → 点「收获全部」→ 背包 `$foodstuff` 增加、田地清空
- 只有 1 块成熟时仍走单块分支
- 雷米来袭时间不足时仍拦截

---

## 5. 「再来一发」改为战后独立页面

### 现状问题
现在是脚部动作 `pleaseagain`（入口 `bjx-combat-actions-hooks.twee:1093`，结算 `bjx-combat-effects-hooks.twee:2636`），依赖 `againfail`（`setupMidOrgasm`，`bjx-hunter.twee:118`），要过诱惑判定、失败直接判死，且藏在脚部列表里。

### 新结构

**① 快照**（`endcombat` 顶部，`bjx-hunter.twee:641`，必须在 `$combat to 0`（`:845`）之前）：

```twee
<<if $demon gte 6 and $pleaseagain isnot 1 and $enemyejaculated gte 1 and $enemyhealth gt 0>>
	<<set $bjxAgainNPC to clone($NPCList)>>
	<<set $bjxAgainNames to clone($npc)>>
	<<set $bjxAgainType to $enemytype>>
	<<set $bjxAgainNo to $enemynomax>>
	<<set $bjxAgainHP to Math.max(1, Math.round($enemyhealth * 0.5))>>
	<<set $bjxAgainMax to $enemyarousalmax>>
	<<set $bjxAgainPassage to $passage>>
	<<set $bjxAgainOffer to 1>>
<</if>>
```

**② 战后注入入口**（`inject_early.js`，复用 `:1750` 的 embryo 注入写法）：
`$bjxAgainOffer is 1` 时追加「再来一发？」链接，同时把页面上第一个 `a.link-internal` 的 `data-passage` 存进 `$bjxAgainNext`。

**③ 新 passage**：

```twee
:: BJX Please Again
你还没有满足。对方已经瘫软，但恶魔的身体不肯放它走。
<<link [[再来一发|BJX Please Again Go]]>>
<<link [[算了|$bjxAgainNext]]>>
```

**④ 恢复战斗**：

```twee
:: BJX Please Again Go
<<set $NPCList to clone($bjxAgainNPC)>>
<<set $npc to clone($bjxAgainNames)>>
<<set $enemytype to $bjxAgainType>>
<<set $enemynomax to $bjxAgainNo>>
<<set $enemyhealth to $bjxAgainHP>>
<<set $enemyarousalmax to $bjxAgainMax>>
<<set $enemyarousal to 0>>
<<set $combat to 1>>
<<set $finish to 0>>
<<set $againfail to false>>
<<set $pleaseagain to 1>>
<<goto $bjxAgainPassage>>
```

**⑤ 旧入口处理**：`bjx-combat-actions-hooks.twee:1093` 的脚部动作建议删掉，或加 `$pleaseagain` 反向条件只在没走过新流程时显示。

### 风险
- 敌人可能已被 `defeatnpc` 移除 → 快照条件加 `$enemyhealth gt 0`
- `$turnCount`/`$rng`/`$orgasmcount`/`$combat_tentacle_record` 等累计值需要一并快照或重置
- 部分结局的 Next 不是 `data-passage` → 需要 fallback（建议回 `High Street` 之类安全点）
- `$pleaseagain` 在**进入页面时**就置 1，防止反复进出刷次数

### 验证
- 打赢一场非自愿战斗 → 出现「再来一发？」→ 点进去有独立页面
- 选「再来一发」→ 回到战斗、敌人半血、可继续
- 选「算了」→ 正常离开，不重复结算
- 同一场战斗第二次结束不再出现入口

---

## 6. 催眠 D+ 永久卡关

### 根因
DoLSims 的神殿解锁剧情条件写成了调试变量：

```twee
$scenePassages isnot undefined and $scenePassages.includes("TempleConfessorIntro")
```

`$scenePassages` 只在 `base-debug/scene-viewer.twee` 里写入，正常游玩永远是 `undefined` → 剧情永不触发 → `$SchoolHypnoPermissionSims` 永远拿不到 → `librarySims.twee:1487` 的研习上限锁在 300。

### 改法
`work/b2_adapt.py` 的 `FIXES["DoLSims.mod.zip"]`（约 813 行）加：

```python
("game/overworld-town/loc-temple/Temple Hypno Sims.txt",
 '$scenePassages isnot undefined and $scenePassages.includes("TempleConfessorIntro")',
 '$temple_confessor_intro'),
```

改完效果：`$temple_confessor_intro`（`confess.twee:4335` 设置的真剧情 flag）为真、且催眠 ≥300 时，进神殿触发两司祭 → 主教剧情 → 许可到手（1 或 2）。

### 验证
- `V.temple_confessor_intro = true`、`V.hypnoSims = 300` → 进神殿 → 司祭出现
- 走完对话 → `V.SchoolHypnoPermissionSims >= 1`
- 回图书馆 → 研习链接可点，能过 300

---

## 7. 催眠 500 级提示误导

### 现象
练到上限时显示“后续内容尚未更新”，但实际是“没许可 / 练满了”两种不同状态。

### 位置
DoLSims `game/overworld-town/loc-library/librarySims.twee:1500-1501`

### 改法
把单个 `<<else>>` 拆成两段：

```twee
<<elseif $hypnoSims lt 500>>
	<<ind>><span class="link-internal macro-link noclickSims">研习无形之术 (1:00)<<note "+ + 疲劳" "black">><<note "- - 纯洁" "black">><<note "+ 世界软腐化" "black">></span><<note "你还没有得到神殿的许可，暂时无法继续研习。" "grey">>
<<else>>
	<<ind>><span class="link-internal macro-link noclickSims">研习无形之术 (1:00)<<note "+ + 疲劳" "black">><<note "- - 纯洁" "black">><<note "+ 世界软腐化" "black">></span><<note "你感觉某种神圣的东西阻碍了你，目前已无法研习无形之术。" "grey">>
```

同样加进 `FIXES["DoLSims.mod.zip"]`。

### 说明
DoLSims 的催眠**只实现到 C+（500）**：全模组唯一涨点来源是 `librarySims.twee:1489` 的 `<<hypnoUpSims 15>>`，上限写死 500；B/B+/A/A+/S 只有等级文案，没有实现。所以 ≥500 的“剧情锁”提示是符合现状的。

### 验证
- 300~499 无许可 → 显示“还没有得到神殿的许可”
- ≥500 → 显示“某种神圣的东西阻碍了你”

---

## 8. 胚胎吸收判定失效（`_hits=0`）

### 现象
玩家**已经知道**自己怀孕（链接能正常出现、能点进 `BJX Embryo Absorb`），但页面打印“你按了按小腹，那里什么也没有。”——说明 `_hits` 没有累加。

### 根因
`bjx-hunter.twee:1248` 的判定用了「`<<for>>` + 三元 + 临时对象引用」：

```twee
<<for _slot to 0; _slot lt 2; _slot++>>
	<<set _key to _slot is 0 ? "vagina" : "anus">>   ← TwineScript 的 is 放进三元容易解析失败
	<<set _p to $sexStats[_key].pregnancy>>           ← _key 为 undefined 时取到空
	<<if _p and _p.type>>
```

`_key` 一旦是 `undefined`，`$sexStats[undefined]` 就是空，`_hits` 永远是 0，于是走到“什么也没有”。

### 改法
去掉循环、三元和临时引用，两段平铺直接访问，并用 `type or fetus.length` 双条件判定：

```twee
<<set _hits to 0>>
<<if $sexStats.vagina.pregnancy.type or $sexStats.vagina.pregnancy.fetus.length gt 0>>
	<<set _hits += 1>>
	<<set $sexStats.vagina.pregnancy.fetus to []>>
	<<set $sexStats.vagina.pregnancy.type to null>>
	<<set $sexStats.vagina.pregnancy.awareOf to null>>
	<<set $sexStats.vagina.pregnancy.awareOfMultiple to null>>
	<<set $sexStats.vagina.pregnancy.awareOfDetails to null>>
	<<set $sexStats.vagina.pregnancy.potentialFathers to []>>
	<<set $sexStats.vagina.pregnancy.timer to null>>
	<<set $sexStats.vagina.pregnancy.timerEnd to null>>
	<<set $sexStats.vagina.pregnancy.waterBreaking to false>>
	<<set $sexStats.vagina.pregnancy.waterBreakingTimer to null>>
	<<if $sexStats.vagina.pregnancy.motherStatus is 2>><<set $sexStats.vagina.pregnancy.motherStatus to 1>><</if>>
<</if>>
<<if $sexStats.anus.pregnancy.type or $sexStats.anus.pregnancy.fetus.length gt 0>>
	<<set _hits += 1>>
	（同样 12 个字段，换成 anus）
<</if>>
```

后面的 `<<if _hits is 0>> … <<else>>` 奖励结算保持原样。

### 落点
`work/genparts/gen_hunter.py` 里生成 `:: BJX Embryo Absorb` 的段落（生成物 `bjx-hunter.twee:1248`）。

### 验证
- 已知怀孕 + 进厕所 → 点「吸收腹中的胚胎」→ 不再出现“什么也没有”，怀孕清空、淫乱 +20、进度 +40、7 天免疫生效
- 未怀孕时进去 → 仍显示“什么也没有”

> 注：注入侧的 `playerAwareTheyArePregnant()` 检查是**正常的**（链接确实出现了），不要改它。

---

## 9. 药房药品后加简短说明

### 现状
医院药房列表只显示「名称 + 规格 + 价格」，例如「羟色胺(20粒/瓶)」。而 `drugItems.js` 里每条药**本来就有 `info` 中文字段**（如“具有放松和提振心情的作用”），只是没渲染出来。

### 改法
`i.Candy` 的 `0Scripts/3_systems/printer.js` → `pharmacy(itemId, diff)`，在 tag 判断链（pill/liquid/cream/inject）之后加一行：

```js
linkname += ` —— ${lanSwitch(drug.info)}`;
```

效果：

> 羟色胺(20粒/瓶) —— 具有放松和提振心情的作用
> 褪黑素(30粒/瓶) —— 能帮助睡眠以及消减压力
> KY肛用润滑液(200ml瓶装) —— 灌肠用润滑油，保持肠道湿滑

### 落点
`work/b2_adapt.py` 的 `FIXES["i.Candy..."]` 加替换规则（锚点：`else {\n            linkname = name;\n        }` 之后）。

### 验证
- 进医院药房 → 六种常规药与 KY 后面都带中文说明
- 英文语言下显示英文 `info`

---

## 10. 执行顺序与命令

```bash
# 3（猎手门槛）—— 改 gen_hunter.py 后
cd work && DOL_REF=dol-0.5.12.13-target python build_pack.py

# 1（吸收计数）、4（一键收获）、5（再来一发）—— 改 twee 生成器后同样走 build_pack
cd work && DOL_REF=dol-0.5.12.13-target python build_pack.py

# 2、6、7（第三方 mod）—— 改 b2_adapt.py 后
cd work && python b2_adapt.py

# 统一重新注入 + 回归
cd work && DOL_HOST=".../game/DoL-ModLoader-0.5.12.13-lyra/Degrees of Lewdity.html" python update_mod_inject.py
cd work && node run_tests.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
# 猎手专项
cd work && node cdp_hunter.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
```

## 11. 风险与回滚

| 风险 | 说明 | 应对 |
|---|---|---|
| 双重计数 | 1 的改动同时保留了 `internalejac` 的 +1 | 改完 grep `demonabsorb +=` 应只剩 `creampie` 一处 |
| 自行车批量替换误伤 | `MarketSims.twee` 有 157 处 `<<pass>>` | 限定 passage 范围 + 幂等判断 |
| 再来一发状态不完整 | `$NPCList` 还原后 rng/回合计数串 | 先在调试模式跑一遍完整战斗 |
| DoLSims 升级后规则失配 | `.txt` 替换片段可能重写 | `b2_adapt.py` 未命中会报错，留意日志 |
| 另一智能体同时在改 | `update_mod_inject.py` 会重写 HTML | 改动前确认没有并发构建 |
| 胚胎判定改完仍为空 | 可能怀孕对象是 parasite（`type === "parasite"`） | 先看 `type`，寄生虫走原版移除流程 |
| 药房说明挤行 | 部分 `info` 较长（如神经优化片） | 必要时截到 20 字以内 |

回滚：twee 侧改生成器后重跑即恢复；第三方 mod 侧删掉 `FIXES` 条目重跑 `b2_adapt.py`。
