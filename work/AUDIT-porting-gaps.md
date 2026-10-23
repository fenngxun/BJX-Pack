# 全项目移植缺口审计（2026-10-22）

> 口径：把 `Dol-BJX-Ex-main/源码/` 与 `work/bjx-pack/`、`work/*_adapt.py` 逐项对照。
> 结论先行：**主回归双绿 ≠ 功能齐全**。目前已知有 3 类缺口：BJX 死开关 13 个、BJX 场景约 30 处、第三方 mod 约 54 条补丁被剔除。

---

## 0. 结论摘要

| 类别 | 数量 | 严重度 | 说明 |
|---|---|---|---|
| BJX 设置开关「有开关、无实现」 | **13**（已修 6） | 高 | 玩家打开等于没开，最伤信任；剩 7（含 3 个"不可直接移植"）见 §1 |
| BJX 独有场景未移植 | **约 30 处** | 中 | 阴毛系统、咖啡季节饮品、宠物店买卖等 |
| 第三方 mod 补丁被剔除 | **约 54 条** | 中 | B1 6 条 / B4 41 条 / B5 7 条 |
| i.Candy 时间系统 | 1 套 | 低 | `TimeEvent('onThread')` 未启用 |

---

## 1. BJX 死开关（最优先修）

**判定方法**：`bjx-options-bjx.twee` 里定义了 21 个 `$options.bjx_*`，逐个在全包（排除选项文件本身）里数消费点。**消费点 = 0 即为死开关**。

> **2026-10-22 更新**：下表「现状」已按实际落地刷新，细节见 HANDOFF §8.14。scan 要覆盖 `tweeFileList` **和** `scriptFileList_inject_early`（robinincome/doglovenodown 落在 JS 里）。

| 开关 | 界面文案 | 原版实现规模 | 现状 |
|---|---|---|---|
| `bjx_health` | 显示敌人数值 | 4 文件 | ❌ 0（未做） |
| `bjx_smallup` | 小体型强化 | 2 文件 | ❌ **不可直接移植**（`enemytrustgain` widget 在 0.5 已重构掉） |
| `bjx_noenduredmg` | 关闭寸止伤害 | 2 文件 | ❌ **不可直接移植**（`$enemyoverarousal` 0.5 无） |
| `bjx_endlessagain` | 无限战斗续杯 | 2 文件 | ❌ **不可直接移植**（`againfail`/`$enemyarousalmax -= 200` 0.5 无） |
| `bjx_clothes` | 解锁衣服栏位 | 7 文件 | ✅ `bjx-switches.twee` |
| `bjx_sewmachine` | 解锁商店缝纫机 | 2 文件 | ✅ `bjx-ghost-shop-tailor.twee` |
| `bjx_magicpreg` | 解锁魔法怀孕 | 4 文件 | ❌ 0（未做） |
| `bjx_robinincome` | 罗宾收入改自信×40 | 2 文件 | ✅ `inject_early.js` |
| `bjx_averymoney` | 艾弗里给钱翻倍 | 2 文件 | ✅ `bjx-switches-avery.twee`（重声明 10 个 passage / 19 处） |
| `bjx_goodstudent` | 好学生按需上课 | 2 文件 | ❌ 0（未做，最难） |
| `bjx_doglovenodown` | 狗舍好感不每日降 | 2 文件 | ✅ `inject_early.js` |
| `bjx_crimewipe` | 犯罪擦除无需高犯罪 | 2 文件 | ✅ `bjx-switches.twee` |
| `bjx_stealhand` | 手技加成偷窃 | 3 文件 | ✅ `bjx-switches-steal.twee`（`skulduggeryhands` 那半故意不移植，§4.2） |
| `bjx_x` | （无文案，checkbox autocheck 占位） | — | 可忽略 |

**正常工作的开关**：`bjx_animal`(65)、`bjx_eventTF`(71)、`bjx_antiques`(15)、`bjx_divine`(8)、`bjx_greengod`(3)、`bjx_sellcloth`(2)、`bjx_sellproduce`(2)。

### 最容易先修的三个

1. **`bjx_clothes`（解锁衣服栏位）** —— 0.5 已经有三栏，只是衣柜 UI 里写死 `disabled: !$debug`（见 `work/b5_adapt.py:48-50`）。把 `!$debug` 换成 `!$options.bjx_clothes` 就完事，一行改动，7 个文件的引用主要是 UI。
2. **`bjx_sewmachine`（解锁缝纫机）** —— 0.5 的裁缝店入口写死 `<<if $sewingKit isnot 1 and $debug is 1>>`，改成 `$debug is 1 or $options.bjx_sewmachine` 即可。
3. **`bjx_robinincome` / `bjx_averymoney` / `bjx_doglovenodown` / `bjx_crimewipe`** —— 都是"改一个数/加一个条件"级别，各 2 个文件，适合批量做。

`bjx_goodstudent`（好学生按需上课）和 `bjx_magicpreg`（纹身怀孕）逻辑最重，建议单独排期。

---

## 2. BJX 独有场景缺口

**方法**：解析三方 passage 名集合，取 `BJX 独有 = BJX − 0.5 原版`，再看哪些不在包里。

```
BJX passage 6149 / 0.5 原版 15433 / 包 3721
BJX 独有 522 → 包内缺 91
```

91 里要扣掉误报和调试内容：

- **41 条是博物馆**（`loc-museum`）→ **误报**，包里用 `bjx-museum-antiques/widgets/talk` 重写了，passage 名不同。
- 5 条 `base-debug/test demon-bjx` → 调试场景，不需要。
- 8 条是 `Widgets * Img` / `Widgets Effects` / `Feats` / `stat-changes` 这类**整表重声明**，包里走 JS 补偿，不算缺。

**真正缺的（约 30 处）**：

| 模块 | 缺失内容 | 数量 |
|---|---|---|
| 阴毛系统 | `Shave clean / pubis / balls / strip / trim`、`Dye pubic hair`（家里一套 + 农场一套） | 19 |
| 咖啡馆 | `Cafe Fruit Salad`、四季 Ale（春/夏/秋/冬） | 5 |
| 下水道 | `Sewers Rats`、`Sewers Rats Pretend` | 2 |
| 宠物店 | `Pet Shop Dog Buy`、`Pet Shop Cat Buy` | 2 |
| 精神病院 | `Asylum Hypnosis Resist` | 1 |
| Danube 住宅 | `Danube House Work` | 1 |
| 森林 | `Forest Coop Rescue` | 1 |
| 模板 | `special-templates / Robin` | 1 |

**阴毛系统是最大的一块**（19 条），也是玩家感知最强的——0.5 只有基础修剪，BJX 扩了造型和染色。

---

## 3. 第三方 mod 的已知未生效项

这些 mod **能加载、回归双绿**，但补丁没有全部落地（记录在 HANDOFF §8.2 / §8.3）：

| 批次 | mod | 剔除量 | 原因 |
|---|---|---|---|
| B1 | 12+2 个（DefrockMod、cummilk、WhitneyExpansion 等） | 20 条规则里**剔 6 条** | 锚点在 0.5 不存在 |
| B4 | Remy Love Mod 1.0.0 | 75 条里**剔 41 条** | 正文是汉化版，锚点对不上；只留 34 条 |
| B5 | MEE 露出拓展 1.0.5 | **剔 7 条** ReplacePatcher | `window.mee?.calmStatModifier()` 拿到 undefined → NaN 污染 pain/stress/arousal |
| B6 | i.Candy | 1 套时间系统 | `TimeEvent('onThread')` 未启用 → 药物/饥渴/口袋功能停摆（§8.8） |

**B4 的 41 条是最大的一笔**：等于 Remy Love 的七成补丁没生效，只是不报错。要补得重做锚点匹配（按中文正文重写），工作量大。

**B5 的 7 条是主动剔除**，不是能力不足——留着会算坏数值，属于正确取舍。

---

## 4. 优先级建议

| 优先级 | 项 | 理由 |
|---|---|---|
| P0 | 13 个死开关 | 玩家点开没反应，最伤体验；其中 5 个是"改一行"级别 |
| P1 | 阴毛系统 19 条 | 感知强、独立、不牵扯战斗 |
| P2 | 咖啡/宠物店/下水道/精神病院等 11 条 | 零散小内容，可打包做 |
| P3 | B4 的 41 条锚点 | 工作量大、收益不确定，建议最后 |
| P4 | i.Candy onThread | 会打乱回归随机流，动了要重跑全部测试 |

---

## 5. 复现方法（下次审计直接用）

```bash
# 死开关扫描
cd work/bjx-pack/tweeFileList
grep -oE '\$options\.bjx_[a-zA-Z_]+' bjx-options-bjx.twee | sort -u | sed 's/\$options\.//' > /tmp/opts.txt
cd .. && for o in $(cat /tmp/opts.txt); do \
  n=$(grep -r "$o" --include=*.twee --include=*.js . | grep -v bjx-options-bjx.twee | wc -l); \
  printf "%-20s %s\n" "$o" "$n"; done | sort -k2 -n
```

```python
# 场景覆盖率（在仓库根跑）
import os, re
def names(root):
    s = {}
    for dp, _, fs in os.walk(root):
        for f in fs:
            if not f.endswith('.twee'): continue
            p = os.path.join(dp, f)
            t = open(p, encoding='utf-8', errors='ignore').read()
            for m in re.finditer(r'(?m)^::\s*([^\[]+?)\s*(?:\[[^\]]*\])?\s*$', t):
                s.setdefault(m.group(1).strip(), os.path.relpath(p, root))
    return s
B = names('Dol-BJX-Ex-main/源码'); V = names('refs/dol-0.5.10.12-target/game'); P = names('work/bjx-pack/tweeFileList')
miss = {k: v for k, v in B.items() if k not in V and k not in P}
print(len(miss))
```

> 注意：passage 名可能被重写（博物馆就是），所以结果要人工过一遍再定性。

---

## 6. 一句话总结

恶魔线是"骨架移植、血肉没进"，而整个项目层面还有 **13 个开关是空的、约 30 处场景没搬、54 条第三方补丁被剔**。这些都不影响回归双绿——因为测试测的是"不报错"，不是"功能在"。

---

## 7. 全量移植可行性评估（2026-10-22）

**结论：能全做，但要分 6 批；其中 3 项建议放弃。**

### 7.1 13 个死开关按难度分档

| 档 | 开关 | 原版改法 | 本仓库落点 |
|---|---|---|---|
| **A · 一行级（5）** | `robinincome` | `time.js:355` 一行：`robinmoney += dom*40 - 300` | inject_early 每日钩子 |
| | `doglovenodown` | `time.js:518` 加 `if (!option)` | 同上 |
| | `crimewipe` | `police/widgets.twee:49` 条件里加 `or $options.bjx_crimewipe` | 重声明小 widget |
| | `sewmachine` | `tailor.twee` 两处 `$debug is 1` → `or $options.bjx_sewmachine` | 重声明（已有 ghost 生成器可挂） |
| | `averymoney` | `special-avery/main.twee` 三处 `* (option ? 2 : 1)` | 重声明 passage 或 DOM 补丁 |
| **B · 小钩子（4）** | `stealhand` | `actions-hands.twee` 两条难度公式 + `skill-difficulties.twee:243` | 重声明小 widget |
| | `smallup` | `widgets.twee:501/509` 两处信任/愤怒修正 | 重声明小 widget |
| | `noenduredmg` | `actions-hands.twee:1313` 一个条件 | 重声明 |
| | `endlessagain` | `effects.twee:2559/2584` 两个条件 | 重声明（该 widget 可能较大，需评估） |
| **C · 系统级（4）** | `clothes` | 0.5 衣柜 `wardrobes.twee:501` 是 `disabled: !$debug`，换成 `!$options.bjx_clothes` | 重声明 `wardrobeLinks` |
| | `health` | 战斗 UI 显示血量/性奋/愤怒/信任（4 处） | 重声明 state/widgets 片段 |
| | `magicpreg` | `pregnancy.js:148` + `pregnancyTypes.js:29/145` 的纹身判定 | 需包 JS 宏，逻辑在函数内部，**中等风险** |
| | `goodstudent` | `time.js:1532-1534` 逃课判定 | time.js 无宏可包，**要改构建期注入或复制函数**，最高风险 |

### 7.2 场景缺口难度

| 项 | 数量 | 难度 | 说明 |
|---|---|---|---|
| 阴毛系统 | 19 | 中 | 内容自包含；入口要在家里浴室/农场插链接（DOM 注入或重声明） |
| 咖啡馆四季饮品 | 5 | 低 | 菜单加项 + 一次数值效果 |
| 下水道老鼠 | 2 | 低 | 单场景事件 |
| 精神病院催眠抵抗 | 1 | 低 | 单判定 |
| Danube 工作 / 森林合作救援 / Robin 模板 | 3 | 低 | 各一条 passage |
| 宠物店买卖 | 2 | **高** | 涉及宠物系统（注册、槽位、日常），不是加两条 passage 能了事 |

### 7.3 第三方 mod

| 项 | 结论 |
|---|---|
| B1 的 6 条 | 可补，锚点重写即可 |
| B4 的 41 条 | **可补但性价比最低**：中文正文逐条重锚，每条都要回归验证；建议只补玩家可感知的（数值/开关类） |
| B5 的 7 条 | **不要补**：`window.mee?.calmStatModifier()` 会返回 undefined，NaN 污染 pain/stress/arousal |
| i.Candy `onThread` | **不要补**：会打乱回归随机流，动了要重跑全部测试且结果不可复现 |

### 7.4 建议路线图

| 批次 | 内容 | 预估 | 风险 |
|---|---|---|---|
| **P1** | A 档 5 个 + B 档 4 个（共 9 个开关） | 1 轮 | 低 |
| **P2** | 恶魔猎手重做（SPEC 已有） | 2 轮 | 中 |
| **P3** | 阴毛系统 19 条 | 1~2 轮 | 中 |
| **P4** | C 档 4 个开关（clothes/health 先做，magicpreg/goodstudent 后做） | 1~2 轮 | 中~高 |
| **P5** | 零散场景 11 条（咖啡/老鼠/精神病院/Danube/森林/Robin） | 1 轮 | 低 |
| **P6** | 宠物店买卖 | 1 轮 | 高 |
| — | B4 锚点按价值筛补 | 2~3 轮 | 中 |
| — | B5 / i.Candy | **不做** | — |

### 7.5 硬约束

1. 每批改完必须 `build_pack.py → update_mod_inject.py → run_tests.mjs`，回归 88s，是主要时间成本。
2. 所有新开关**默认关闭**，否则会改变现有玩家的数值平衡（尤其 `smallup` / `endlessagain` / `magicpreg`）。
3. 新变量一律 `?? 0` 兜底，避免老存档炸。
4. `goodstudent` 要动 `time.js`，而 time.js 没有宏可包——要么改构建期字符串替换（须幂等+唯一片段），要么整函数复制重写。**这是全项目最难的一项。**
