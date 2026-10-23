# 代码质量评估报告 — BJX-Pack（2026-10-23）

> 一次性审查产物，不进交接档案主链路。结论摘要已索引到 `work/HANDOFF.md` §0。
> 审查范围：`work/` 下全部 Python 与 mjs 构建/测试脚本（301 文件 / 45351 行），不含 `Dol-BJX-Ex-main/` 上游源码与 `refs/` 原版树。

---

## 0. 结论摘要

**总分 6.9 / 10 —— 工程纪律 A 级，模块边界 C 级。**

> **处理状态（2026-10-23 15:20 更新）**：三条 P0 + 两条 P2 已修复并验证，见 §6。
> 当前质量分估 **7.8**。剩余待办：`_tweeio.py` 公共 helper（P1-2）、`cdp_pack.mjs` 拆 steps（P1-3）、专项测试断言统一（P1-4）。

这是一个「自校验和文档做得比绝大多数商业项目都狠，但代码组织还停留在脚本堆」的项目。
它不是「质量差」，而是**质量分布极不均匀**：防错机制（804 条 assert、锚点唯一性校验、幂等重放）是顶级水准；而模块划分、单一真相源、配置管理几乎为零。技术债不是散落的，是**集中在 6 个孤儿脚本和 1 个 2782 行的巨石文件里**，清理成本可控。

| 维度 | 评分 | 一句话依据 |
|---|---|---|
| 健壮性 / 自校验 | **8.5** | 804 条 assert + 122 条构建断言；锚点 `count==1` 铁律；全流程幂等 |
| 文档 / 可交接性 | **9.0** | HANDOFF 841 行 + AGENTS 硬规则 + 每个生成器头部写明「为什么这么改」 |
| 测试设计 | **7.5** | 474 条断言 / 62 步、专项 46 项、耗时从 200s 优化到 58s；但黑盒文本断言脆弱 |
| 架构 / 模块化 | **6.0** | 生成器模式正确，但 `build_pack.py` 单文件 2782 行、43 个函数全内联 |
| 可维护性（去重） | **5.5** | 跨文件 1386 处 8 行重复块；6 个孤儿脚本约 1574 行与主构建重复 |
| 配置 / 发布管理 | **5.5** | 默认路径全部停留在 1.3.0；无依赖清单；mod 版本号与整合包不同步 |
| 仓库卫生 | **4.0** | `work/` 1.4GB、483 个顶层条目、72 个一次性诊断脚本、无 git |

---

## 1. 量化基线

```
语法健康度       Python 146 文件 / 0 报错     mjs 155 文件 / 0 报错
代码规模         work/ 下 301 脚本 / 45351 行（含一次性脚本约 5900 行）
生产脚本占比     生成器 32 (10930 行) / 流水线 17 (5720 行) / 测试 30 (8447 行)
                适配 76 (9506 行) / 诊断+探针+临时 72 (5958 行)
自校验强度       build_pack 122 assert，genparts 合计 804 assert，44/146 脚本含 assert
测试强度         62 步 / 474 条 check（平均 7.6 条/步），专项猎手 46 项
覆盖广度         回归 goto 84 个 passage / pack 3752 passage ≈ 2.2%（入口级，非功能级）
注释密度         # 注释 6.7%，但 docstring 覆盖极高（每个生成器头部 10–30 行设计说明）
重复代码         跨文件 8 行重复块 1386 处，最密集：build_pack ↔ _wiring_3h 536 处
依赖管理         无 requirements.txt / package.json；依赖靠 AGENTS.md 口口相传
```

---

## 2. 亮点（这些是真本事，别在重构时弄丢）

### 2.1 锚点唯一性 + 存在性双断言，把「静默失配」变成「构建失败」
`gen_hunter.py:41,51,61` 的 `widget_body / replace_line / insert_before_line` 三个 helper，每个都 `assert count == 1`。
这是本项目最重要的工程决策：twee 补丁的失败模式是「不报错、只是没生效」，而 assert 把它变成硬失败。804 条 assert 意味着**上游改一个空格，构建就红**，而不是等玩家发现功能没了。

### 2.2 「从上游整段抽取再改」的生成范式
`gen_hunter.py:12-13` 写明：*「从 0.5.12.13 源码整段抽 widget 再改（gen_market_sell 范式），上游改了这个 widget 会自动跟过来，不会像手抄那样静默漂移」*。
对比「手抄一段 twee 进模板」的做法，这个范式把上游升级成本从「人工 diff 全量」降到「重跑构建看 assert」。`build_pack.py:27-47` 的 `gen_compat()` 同理（直接从 vanilla 抽 `npcincr` 再改白名单）。

### 2.3 全流程幂等 + 陈旧产物剪枝
`build_pack.py:2708-2717` 用 `mtime < build_start - 2` 剪掉本轮没重写的 twee。所有生成器都是「覆盖写」而非「增量改」，所以重复跑结果稳定。这让「重建一次看看」成为零风险操作，是敢频繁迭代的前提。

### 2.4 测试性能是被当作工程问题处理的
HANDOFF §5.1 记录了 200.3s → 58s 的完整账：147 处 `sleep` 改 `settle`（页面内 MutationObserver）−117s、日志从百万次同步写盘改一次性落盘 −20s。`cdp_pack.mjs:216-219` 的 `newConsoleErrors()` 每次读完即清空，注释直接写清「原来靠 cursor 索引，一轮 100 万行常驻内存 = 108MB/run」。
**大多数团队会让回归跑 3 分钟然后没人跑。这里把测试速度当产品需求做了。**

### 2.5 文档即架构，且明确分工
`AGENTS.md` 只放硬规则/命令/断言铁律（每会话注入，必须短），`HANDOFF.md` 放状态/坑/方法论（841 行，可查不可背）。这个分层是对的——很多项目的 AGENTS.md 堆成 2000 行，最后谁也不读。

---

## 3. 问题清单

### P0 — 会造成「改了但没生效」或「发错包」

**P0-1　同一生成逻辑存在 2–3 份物理副本，其中 3 组已 100% 相同、1 组已漂移**

| 函数 | build_pack.py 内联 | genparts 独立脚本 | 相似度 | 构建实际用哪份 |
|---|---|---|---|---|
| `gen_landfill_hooks` (233 行) | ✅ 生效 | `gen_landfill.py` | **100.0%** | 内联 |
| `gen_churchyard_hooks` (51 行) | ✅ 生效 | `gen_churchyard.py` | **100.0%** | 内联 |
| `gen_busstation_hooks` (90 行) | ✅ 生效 | `gen_busstation.py` | **100.0%** | 内联 |
| `gen_lake_underwater_hooks` (240 行) | ✅ 生效 | `_wiring_3h.py` 94.2% / `gen_lake_underwater.py` 91.5% | **已漂移 6–9%** | 内联 |
| `gen_old_sewers_*` | ✅ 生效 | `gen_old_sewers.py` | 高重复 | 内联 |

`build_pack.py:2628-2641` 调的是**同文件内**的定义；`genparts/` 里这 5 个脚本**不在** 2k 的 subprocess 列表（`build_pack.py:2645-2657` 的 25 个名字里没有它们），产物写到 `_verify_*` 目录也不会被复制。
→ **结论：这 5 个脚本（1574 行）是孤儿。任何人改 `genparts/gen_landfill.py` 以为修好了，重跑构建产物一个字都不会变。** 而 lake_underwater 三份已漂移 6–9%，说明历史上确实发生过「改一份忘另两份」。

> 修复建议（半天）：删掉 5 个孤儿脚本，或反向操作——把 build_pack 内联的 5 组搬进 genparts、加入 2k 列表。**二选一，不要留两份。** 删除前先 `python build_pack.py` 跑一次，确认 `stale twee pruned` 列表里没有对应产物（因为内联版还在，不会有）。

**P0-2　发布脚本默认路径全部停留在 1.3.0，1.4.0 只能靠环境变量**

- `make_dist.py:32`　`PACK_ZIP` 硬编码 `bjx-pack-1.3.0.mod.zip`，**且没有环境变量出口**（其余 3 个路径都有 `DOL_DEV/DOL_I18N/DOL_OUT`）。
- `make_dist.py:39`　`OUT_HTML` 默认 `bjx-整合包-1.3.0-开箱即玩/`
- `make_zip.py:12`　`SRC` 默认 `bjx-整合包-1.3.0-开箱即玩/`
- `build_pack.py:2743`　写进 `boot.json` 的 `"version": "1.3.0"`

现在能出 1.4.0 是因为每次都在命令行显式传了 `DOL_OUT`。**谁直接跑 `python make_zip.py`，会把磁盘上残留的 1.3.0 目录重新打成 `bjx-整合包-1.3.0-开箱即玩.zip`，而且 exit 0 全绿。**
另外 `boot.json` 版本号 1.3.0 意味着玩家在 mod 列表里看到的 bjx-pack 版本是 1.3.0，与整合包 1.4.0 不一致。

> 修复建议（1 小时）：把版本号提到单一常量（如 `work/version.py` 或环境变量 `BJX_VER` 默认 1.4.0），4 处路径与 `boot.json` 全部从它派生；`make_zip.py` 加 `assert os.path.exists(SRC)` 与「目录名含版本号且版本号匹配」的校验。

**P0-3　无 git，`work/` 1.4GB 里混着源码、产物、日志、图片**

`ls -d .git` → 不存在。483 个顶层条目、195 个 `.log/.txt/_*` 临时文件、72 个一次性诊断脚本（`_probe*/`、`diag_*`、`_chk_*.png`）。
没有版本控制的直接后果：**「哪个版本的双绿是可信的」只能靠 HANDOFF 文字描述**；任何一次误删或误改都无法回溯。对 3745 passage 的移植项目，这是最大的单点风险。

> 修复建议（半天）：`git init` + `.gitignore`（`work/bjx-pack/`、`work/genparts/_verify_*/`、`*.log`、`*.zip`、`game/`、`refs/`、`bjx-整合包-*/`），只纳入生成器 + 测试 + 文档。仓库体积能压到 10MB 以内。**这是投入产出比最高的一项。**

### P1 — 可维护性

**P1-1　`build_pack.py` 是 2782 行巨石，43 个函数 0 死代码但全部内联**
内联的 5 组函数（landfill 235 行 / lake_underwater 242 行 / churchyard / busstation / sewers 系列约 700 行）本应和另外 25 个生成器一样待在 `genparts/`。`build_pack.py:2643` 的注释已经写明分裂原因：*「Unlike 2j these stay as standalone genparts scripts (their read/write/find_line/main helpers would collide if inlined)」*——**这是个假问题**：helper 冲突的正确解法是抽公共模块，而不是把 700 行内联回主脚本。

**P1-2　`read` / `write` / `find_line` / `main` 在每个生成器里复制粘贴**
`read` 在 20 个脚本里各定义一次，`write` 在 15 个，`find_line` 在 8 个（`gen_bird/gen_deepseadive/gen_maths/gen_old_sewers/gen_special_npcs/gen_street/gen_temple/_wiring_3h`）。
代价不是行数，是**语义漂移**：有的 `read` 用 `newline=''`，有的不用（`build_pack.py:2475` vs `gen_hunter.py:35`），CRLF 处理不一致正是 HANDOFF §6.12 记录过的坑。

> 修复建议（2 小时）：新建 `work/genparts/_tweeio.py`（`read/write/find_line/widget_body/replace_line/insert_before_line`），生成器 `from _tweeio import *`。重复块能从 1386 降到 300 以下。

**P1-3　`cdp_pack.mjs` 单函数 2700 行（`main` 从 L175 到 L2892）**
62 个步骤全部顺序写在 `main` 里。虽然 `step()` helper（L214-260）把断言/截图/错误收集封装得不错（474 条 check 全部走它），但：
- 步骤之间靠**隐式共享状态**串联（变量、TF 状态、钱），改中间一步会污染后面所有步骤；
- `ONLY=` 局部回归能绕过这个问题的原因是「前置三步永远跑」，但这只是缓解。

> 修复建议（1–2 天，不急）：把每步抽成 `steps/xxx.mjs` 导出 `{name, run(ctx)}`，`main` 只做编排。**注意：HANDOFF §5.1 明确写了「分片并行需要逐步验证切错边界会变成假红」，所以这属于纯结构性重构，必须行为零变化。**

**P1-4　断言体系不统一**
`cdp_pack.mjs` 474 条 `check()`；`cdp_hunter.mjs` 和 `cdp_real3.mjs` **0 条**——它们自己实现了一套 `PASS/FAIL` 打印（`cdp_hunter.mjs:82`），失败判定逻辑与主回归不同源。专项测试是发版闸门的一部分（46 项），却和主回归用两套标准，容易出现「主回归红/专项绿」的解释成本。

### P2 — 卫生与一致性

| 项 | 证据 | 建议 |
|---|---|---|
| 重复 passage 只告警不失败 | `build_pack.py:2765-2771` `if bad: print(...)` 无 assert | 改成 `assert not bad`（同 pack 内撞名 = 后加载覆盖 = 静默丢内容，与 §4.4 铁律冲突） |
| 产物无哈希校验 | 全流程无 `hashlib`；测试是黑盒跑已注入 HTML | `update_mod_inject.py` 落盘时写 `build-manifest.json`（pack zip sha256 + twee 文件数 + passage 数），测试启动时比对 |
| `strip_json5` 911 行单函数 | `b2_adapt.py` | 若是数据驱动的 token 分支，用表驱动拆；若是状态机，至少拆 `parse_value/parse_array/parse_object` |
| 硬编码 `ROOT` 与 Chrome 路径 | 各脚本 `ROOT = r'C:\Users\79403\Desktop\dol'`；`cdp_*.mjs` `CHROME` 绝对路径 | 统一从 `os.environ.get('DOL_ROOT', ...)` + `shutil.which('chrome')` 兜底；换机/换用户目录才不用改 30 个文件 |
| 无依赖清单 | 无 requirements.txt / package.json | 实测只有标准库 + 内置 Chrome，**其实可以写一份 3 行 requirements.txt 明确「零第三方依赖」**，这本身就是质量声明 |
| 注释密度 6.7% | 但 docstring 极详尽 | 不是问题，列出仅为说明「别用注释率衡量这个项目」 |

---

## 4. 改进路线（按 ROI 排序）

| 优先级 | 动作 | 成本 | 收益 |
|---|---|---|---|
| 1 | `git init` + `.gitignore`，首次提交生成器/测试/文档 | 半天 | 从「无法回溯」到「可回滚」，一切重构的前提 |
| 2 | 删 5 个孤儿生成器（或反向合并），消除双真相源 | 半天 | 消除「改了没生效」类 bug 的根源；lake 三份漂移已实证 |
| 3 | 版本号单一常量 + `make_zip` 路径校验 | 1 小时 | 消除发错包风险；`boot.json` 版本对得上 |
| 4 | 抽 `_tweeio.py` 公共 helper | 2 小时 | 重复块 1386 → <300；CRLF 语义统一 |
| 5 | 重复 passage 检查改 assert + 产物 manifest 哈希 | 2 小时 | 构建期发现撞名；测试与产物绑定，杜绝「测旧 HTML」 |
| 6 | `cdp_pack.mjs` 拆 steps/（纯结构重构） | 1–2 天 | 单步可独立跑、可读性；**发版前别做** |
| 7 | 统一专项测试断言到 `check()` 体系 | 半天 | 闸门标准一致 |

**不建议做的**：
- 不要为了「减少文件数」把 genparts 再塞回 build_pack（当前 25 个独立脚本 + subprocess 的模式是对的，隔离了 helper 命名空间）；
- 不要引入 pytest/构建框架——这套脚本的价值在于「直接 `python xxx.py` 就能跑」，加框架会抬高每次迭代的门槛；
- 不要动 `settle()`/日志裁剪那套性能优化，它是这个项目最值钱的隐性资产。

---

## 5. 一句话总评

**这个项目的代码质量不是「写得漂亮」，而是「错不了」——804 条断言、幂等构建、锚点校验，把移植项目最容易出的「静默失配」堵死了。它的短板全部在「同一件事有多个副本」和「配置散落在脚本里」：5 个孤儿生成器、4 处过期版本号、20 份 `read()`。好消息是这些债集中、边界清楚、清理不需要理解业务逻辑——先花一天做 git + 删孤儿，质量分能从 6.9 上到 7.8。**

---

## 6. 处理记录（2026-10-23 15:20）

| 项 | 动作 | 验证 |
|---|---|---|
| P0-1 孤儿生成器 | `git rm` 7 个文件（5 个孤儿 gen + `_wiring_3h.py` + `wire_3h_into_build.py`，2313 行） | 删除前后 140 个 twee **逐字节零差异**；`genparts` 25 生成器 = 构建调用 25 个 |
| P0-2 版本号 | 新增 `work/bjx_version.py`；boot.json / zip 名 / make_dist 三路径 / make_zip 目录名全部派生；`update_mod_inject` 宿主默认改 0.5.12.13 | 不传任何环境变量跑 `update_mod_inject.py` → 45 条目正常；`boot.json` version=1.4.0 |
| P0-3 无 git | `git init` + `.gitignore`（排除 game/refs/mod/Dol-BJX、bjx-pack 产物、Chrome profile、图包备份、测试截图）；基线 `38db343` | 402 文件入库，`.git` 体积可接受 |
| P2 重复 passage | `print` 告警 → `assert not bad` | 当前 0 重复，构建通过 |
| P2 stale 误剪 | `gen_statistics()` 移到 prune 之前 | 日志从 `stale pruned: 1` 变 `stale pruned: 0` |
| 发布命令 | AGENTS.md / HANDOFF §3 简化为 `python make_dist.py && python make_zip.py`；HANDOFF §3 宿主路径改 0.5.12.13 | — |

**回归**：重建 → 注入 → `run_tests.mjs` 双绿 **62/62 + 22/22**（首次跑出现一次 `special-npc-bjx` 假红，重跑即绿；原因是该步 120 次同步 `Engine.play` 循环对并发负载敏感，属已知测试脆弱点，未改动）。

**未做（按报告 §4 排序留在待办）**：`_tweeio.py` 抽公共 helper、`cdp_pack.mjs` 拆 steps、专项测试断言统一。
