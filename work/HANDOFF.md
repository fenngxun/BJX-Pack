# BJX-Pack 移植项目交接文档

> 全项目**唯一**交接档案。写于 2026-10-19，最后更新 **2026-10-23（TODO 9 项 + P2 摄魂之眼交付）**。
> 精简原则：**只留「现在要用的」和「重做会疼的」**。已完成批次的逐条过程叙述已删除——完成度看 §8.1，连「重做会不会疼」都谈不上的细节不值得占版面。
> 行动规则在根目录 `AGENTS.md`（IDE 每会话自动注入）。

## 0. 状态速览（接手先看这里）

| 项 | 值 |
|---|---|
| 版本 | **v1.4.0 定版 + 2026-10-23 增量（0.5.12.13 Lyra 宿主）** |
| dev HTML | 45 条目 / 83.3MB（21 builtin + TweeReplacer head + bjx-pack + 21 个第三方 mod） |
| bjx-pack | **138 twee / 3745 passage** |
| 发布包 | `bjx-整合包-1.4.0-开箱即玩/` 46 条目 / 97.5MB；zip **130.2MB / 33592 文件** |
| 主回归 | **62/62**（dev 与发布包同名双绿） |
| 第三方冒烟 | dev **22/22**、发布包 **22/22** |
| 汉化 | 发布包 bjx-pack **passage 含中文 99.1%**（烘焙 33455 条 / 83 文件） |
| 专项 | 猎手 **46/46**（含 P2 摄魂之眼 + TODO 任务 1/5 + 真实打赢断言）、真实场景 `cdp_real3` **3/3**（dev 与发布包）、吸收恢复 1/1、衣柜出售 **9/9**、衣柜修复 5/5、特质 1/1 |

**已知遗留（6 条，只列索引）**
1. 魅魔「诱惑」`demonseduce`（要动 `actions-speech.twee` 巨型 widget）→ §8.16（摄魂之眼「催眠」2026-10-23 已移植）。
2. i.Candy `TimeEvent('onThread')` 时间系统未启用（药物/饥渴/口袋），补了会打乱回归随机流 → §8.8。
3. 偷书 journal 只显示最近一本；`time.js` 每日 `crimeUp` 仍 +1（不影响多本功能）→ §8.7。
4. 改存档名时控制台报 `startsWith` TypeError（位置与修法都有，未实施）→ §8.9。
5. **场景缺口收窄**：阴毛系统 / 咖啡馆四季饮品 / 精神病院催眠抵抗在 0.5.12.13 **已内置**（AUDIT 旧结论是误报）；真正缺的是宠物店买卖 2 条（需宠物系统，高难度）、下水道老鼠 2 条、Danube House Work 1 条、森林救援 1 条。
6. **第三方补丁剔除**：B1 6 条 / B4 41 条 / B5 7 条（B5 主动剔除，勿补）→ `work/AUDIT-porting-gaps.md` §3。

**代码质量审查（2026-10-23，已处理）**：结论 6.9/10，详见 `work/CODE-REVIEW-2026-10-23.md`。已修三条 P0：
①**孤儿生成器已删**（`genparts/` 下 landfill/churchyard/busstation/lake_underwater/old_sewers 五个脚本 + `_wiring_3h.py` + `wire_3h_into_build.py`，共 2313 行；它们与 `build_pack.py` 内联版重复且构建不调用）。删除前后 twee 产物 **140 文件逐字节零差异**，现在 `genparts` 25 个生成器 = 构建调用的 25 个。**注意：改生成逻辑只改 `build_pack.py` 内联版或那 25 个脚本，别再去 genparts 找这五组**。
②**版本号已单一化**：新增 `work/bjx_version.py`（`VERSION` 默认 1.4.0，`BJX_VERSION` 可覆盖），`boot.json` / pack zip 名 / `make_dist` 三路径 / `make_zip` 目录名全部派生，`make_dist` 默认基座已对齐 0.5.12.13。发版直接 `python make_dist.py && python make_zip.py`，不再需要手传环境变量。
③**已建 git**（`38db343` 基线 / `e14cef9` 本次修复），产物与外部输入在 `.gitignore` 排除。
另修：重复 passage 改 assert、`gen_statistics` 移到 prune 前（消除每轮 `stale pruned: 1`）。验证：重建幂等 + 注入 45 条目 + 回归双绿 62/62 + 22/22。

**可发现性（2026-10-23，同日追加）**：症状是「改代码大量时间花在找东西」——实测查一个符号 4 处命中里 3 处是产物。三件套解决：
1. 根目录 `.ignore`：ripgrep/Grep 默认跳过 `bjx-pack/tweeFileList`、`genparts/_verify_*`、发布包、图包备份等产物（git 仍看 `.gitignore`，互不影响）。
2. `work/find.py`：一条命令从「我记得有个…」到「改这个文件这一行」。`python work/find.py "Robin Raccoon"` → 产物 twee + `genparts/gen_special_npcs.py` + 职责；`--text` 搜源码、`--js` 搜 inject_early、`--file` 反查产物。
3. `work/CODE-MAP.md` + `code-map.json`（`gen_code_map.py` 生成，**build_pack 末尾自动刷新**，不入库、缺失时 find.py 自动补建）：140 twee → 生产者:行 全覆盖（0 未解析），3752 passage 全量反查，inject_early.js 50 个函数索引，8 个多源产物按构建顺序标注生效者。
> 新增生成器/产物后不用手动维护任何索引——重跑构建即可。**别手写「目录说明」类文档**，它会腐化。

**接手三步**
1. `cd work && node run_tests.mjs "http://127.0.0.1:8766/..."`（**先退 360**）复核双绿，~88s。
2. 要改内容：改生成脚本 → `build_pack.py` → **`update_mod_inject.py`** → 重跑回归（漏第三步测的是旧 HTML）。
3. 要发版：`make_dist.py && make_zip.py`。

## 1. 项目一句话

把北极星扩展 BJX（`Dol-BJX-Ex-main`，基于 DoL 0.4.3.3 的中文魔改版）的全部模块，移植到 **DoL 0.5.10.12 ModLoader polyfill 版**，合成单一 mod **bjx-pack**，再叠加 21 个第三方 mod，产出「开箱即玩」整合包。

成品 HTML 113.1MB / 46 条目 = dev polyfill 内置 mod ＋ 汉化烘焙后的 bjx-pack ＋ 末尾 ModI18N；`img/` 与 dev 同一份。

**汉化怎么进的包**（两个必须先懂的坑）：
1. ModI18N 只作用于**原版** passage，bjx-pack 里 1993/3717 条照抄 0.4.3.3 的英文段落它翻不到 → `make_dist.py` 用官方词典（TypeBInputStoryScript，按 pN 分组，`len(f)≥12`，逐字 replace）把译文**烘焙进 pack 的 twee**（79/131 文件命中、32683 条），passage 含中文率 79.4% → 98.7%。
2. **不要把汉化打到 dev polyfill HTML 上**，否则 `cdp_pack.mjs` 的英文文本断言全废。

## 2. 目录地图（只列会用的）

| 路径 | 说明 |
|---|---|
| `Dol-BJX-Ex-main/源码/` | BJX 改动集源码（0.4.3.3 基）。**不是完整游戏**：309 文件 = 249 改 + 59 新增 |
| `refs/dol-0.4.3.3-baseline/game/`、`refs/dol-0.5.10.12-target/game/` | 两侧原版完整源码树（diff 基线 / 移植宿主） |
| `work/bjx_version.py` | **版本号唯一真相源**：`VERSION`（默认 1.4.0）→ boot.json / zip 名 / 发布目录名 |
| `work/CODE-MAP.md` / `code-map.json` / `find.py` | **代码地图与定位工具**（自动生成）：产物 twee → 生产者:行 → passage 全量反查。改代码第一步 `python work/find.py "<关键词>"`；构建时自动刷新，勿手改 |
| `work/build_pack.py` | **构建主脚本**：merge + genparts 接线 + skinColor 全局翻译 + boot.json + 重名校验。全幂等 |
| `work/update_mod_inject.py` | 打 `bjx-pack-<版本>.mod.zip` + HTML 二进制注入（路径 B） |
| `work/genparts/` | 各模块 twee 生成脚本（`gen_*.py`），**产物不要手改** |
| `work/bjx-pack/scriptFileList_inject_early/inject_early.js` | JS 侧补偿（TF 键/发色/肤色/画布图层/门与入口注入） |
| `work/cdp_pack.mjs` / `cdp_mods_smoke.mjs` | 62 步主回归 / 22 步第三方冒烟 |
| `work/b2_adapt.py`、`b4_adapt.py`、`b5_adapt.py`… | 第三方适配包生成（改过必须重跑 + 重注入） |
| `work/sync_icandy_images.py`、`gen_icandy_missing_icons.py`、`pngutil.py` | i.Candy 图片同步（见 §8.7） |
| `work/make_dist.py` / `make_zip.py` | 发布包（汉化烘焙）/ 打 zip |
| `refs/icandy-imagepack/` | i.Candy 官方图包落库（376 文件，事实源） |
| `refs/coverage_check.py` / `widget_check.py` | 覆盖度与撞车盘点 |
| `work/tools/chrome131/` | Chrome for Testing 131 备用 |

## 3. 构建与验证流水线

```bash
# 0. 先退 360 安全卫士（否则 CDP 被内核拦截挂起）
# 1. 起服务器（端口必须 8766；宿主已迁 0.5.12.13 Lyra）
cd game/DoL-ModLoader-0.5.12.13-lyra && python -m http.server 8766 &

cd work && DOL_REF=dol-0.5.12.13-target python build_pack.py   # 2. 重建 pack（幂等，~20s）
cd work && python update_mod_inject.py   # 3. 注入 HTML（★ 重建后必跑；DOL_HOST 已默认 0.5.12.13）

cd work && node run_tests.mjs "http://127.0.0.1:8766/Degrees%20of%20Lewdity.html"        # 4. 两套并行 ~64s
# 排障时单独跑：cdp_mods_smoke.mjs（22 步 ~24s）/ cdp_pack.mjs（62 步 ~61s）

cd work && python make_dist.py && python make_zip.py  # 5. 发布包（版本号见 bjx_version.py）
```

> **版本号只有一个真相源**：`work/bjx_version.py` 的 `VERSION`（默认 1.4.0，`BJX_VERSION=1.5.0` 可临时覆盖）。
> `boot.json`、pack zip 名、发布目录名、`make_dist`/`make_zip` 默认路径全部从它派生——发版前只改这一处。
> `update_mod_inject.py` 的 `DOL_HOST` / `DOL_MODDIR` 默认值也已对齐 0.5.12.13，换宿主时才需要传。

> **关键：测试加载的是「已注入 mod 的 HTML」，不是 `work/bjx-pack/`。** 重建 pack ≠ 浏览器可见，v0.5.0 曾因此空跑一整轮。
> 注入前会剥旧注入再写新 zip，耗时 1–2 分钟。

## 4. 移植方法论（新组照抄）

### 4.1 twee 三策略
1. **新增 passage**：BJX 文件直接 merge（变量翻译后）
2. **改原版调度器**：**0.5 全文为底 + 追加 patch**（vanilla 分支留 0.5 语义，bjx 分支留 BJX 语义）
3. **页面挂载**：小改动走 `inject_early.js` 的 `onDomChanged` 按 passage 名注入，或 gen 脚本锚点插入

### 4.2 变量翻译表（0.4.3.3 → 0.5）
| BJX（旧） | 0.5（新） |
|---|---|
| `$bestialitydisable is "f"` | `$settings.bestialityEnabled` |
| `$statdisable is "f"` | `!$settings.blindStatsEnabled` |
| `$skinColor.natural` | `Skin.color.natural`（JS 对象；build_pack 2z 步全局翻译 + assert 无残留） |
| `$skulduggeryhands` / `$slimedisable` | 0.5 已移除，pack 零引用 |
| BJX 独有变量（`$ghost/$basement/$raccoon`） | 保留，读时 `($x ?? 0)` 防御 |
| `$NPCName[…].name` 中文名 | `C.npc["中文名"]`（inject_early 以中文名注册） |

### 4.3 JS 侧补偿（`inject_early.js`）
- `ensureBjxTfKeys()`：transformationParts 补 8 键（slime/ghost/mushroom/dragon/bee/raccoon/dog/spider）。**0.5 新游戏直接 set 缺失键子属性会 TypeError**
- `ensureHairColours()`：push `setup.colours.hair` **必须同步 `hair_map` + 补 `blendMode:"hard-light"`**（buildColourMap 只在启动跑）
- `ensureSkinColours()`：9 个 BJX 肤色（从 colours.js skin_gradients 转格式）
- `ensureFeats()` / `ensureLoveAlias()` / 画布图层与入口注入，见各函数注释

### 4.4 两条铁律
- **widget 重名**：后加载的 pack 定义直接覆盖（SugarCube 机制），蚁岛 `parasiteinit` 是此先例
- **beastattribute 索引必须 `_t.indexOf(name)`**，不能用 `$BeastList.indexOf`——`_t` 15 项含 snake，`indexOf("ant")=14` 会命中 snake 槽

## 5. 测试断言铁律

- 文本断言**一律浏览器内 `probe()` 求值**：`returnByValue` 传 12K+ 中文字符串会**内容损坏**（S43 四轮定位），页面内 `indexOf` 只回小 JSON `{hit, ctx}`
- 链接断言用 `data-passage`（`targets()` helper），点击剥 `(N) ` 编号前缀
- 渲染期变量三段式：`setVars → goto → clickLink`
- **随机事件钉死**：goto 前 `setVars({eventskip:1, allure:0, rng:1, …})`；**`<<pass>>` 会在点击时重置 eventskip + danger 重掷**（S53 flaky 根因），同 passage 多轮 goto 每次全量重设
- 数值断言用范围（`ar>=2900&&ar<=3010`）；重页面在 waitPassage 后再 `settle(2000)`
- 技能判定预设极大值；`dancedifficulty` 读 `V.danceskill`
- **feat 断言前清 `V.objectVersion.test = 0`**（time.js:1208 反作弊锁，属性名 `\x` 转义，grep 搜不到）
- CDP `Runtime.evaluate` 的 expression **一律写单行**（多行必 SyntaxError: Unexpected end of input）
- **渲染等待用 `settle(ms)` 不用 `sleep(ms)`**（2026-10-21 改造）：`settle` 在页面内挂 MutationObserver，`#passages` 静默 60ms 即返回（只花 1 次求值、等待期间不抢主线程），`ms` 是原 sleep 值的**上限**。`waitPassage` 轮询 90ms。**新写步骤别再用写死 sleep 等渲染**；只有「等弹窗/等时间系统/等截图」这类非 passage 场景才用 sleep
- 每步耗时已打进 report 和 console（`PASS xxx (1.2s)` + 末尾 `elapsed=`），变慢先看这一步是不是在等超时
- **局部回归**：`ONLY=casey,hive` 只跑名字命中的步骤（前置 boot / age-gate / debug-start-school 永远跑），末尾会打印 `skipped=N（不是完整回归）`。改完某个模块先跑局部，发版前再跑完整 62 步
- **别把 `[log]` 级控制台消息塞进数组/写盘**：一轮 100 万条，同步 `appendFileSync` 曾让日志涨到 108MB 并把回归拖慢 20s。现在只留 warn/error/EXC，收尾一次落盘（~68KB）

### 5.1 回归耗时账（2026-10-21，200.3s → 58s）

| 手段 | 收益 |
|---|---|
| `sleep(800~1200)` → `settle()`（147 处） | −117s |
| `settle` 从 Node 端轮询改为页面内 MutationObserver | −6s，求值次数 1922→1590 |
| 控制台日志：百万次同步写盘 → 只留 warn/error/EXC 一次落盘 | −20s，日志 108MB→68KB |
| boot 轮询 2000→500ms、waitPassage 350→90ms、age-gate 改轮询 | −3s |

剩余 58s 的构成：**boot 17s**（100MB HTML 解析 + 22 个 mod 解 base64，传输只占 0.26s）＋ **真实渲染等待 ~26s**（1427 次求值，平均 17ms/次，等的是游戏渲染 passage 本身）＋ settle 11s ＋ 截图 3.4s。
`cdp_pack.mjs` 的环境开关：`PROFILE=1` 打分类耗时、`ONLY=xxx` 局部回归、`TRACE=1` 打每步时间戳、`SHOTS=0` 跳过截图（省 3.4s，正式跑别关）。
已验证无效的方向：老版 headless（Chrome 155 已移除）、停 rAF（只省 2.3s 且截图变旧）、放开 `--disable-gpu`（噪声级）、换更快的静态服务器（传输本来就不是瓶颈）。
还想再快只能**分片并行**（多个 Chrome 各跑一段 + 各自前置），但 62 步之间有状态依赖（TF 状态、Taylor 链条、钱），切错边界会变成假红——需要逐步验证，不是改个参数的事。

## 6. 踩坑实录（重做会疼的 20 条）

1. **拼接 payload 行尾缺 `>` 会主线程死锁**（S33，29 轮定位）：`"…>" +` 漏一个 `>` → Wikifier 合并求值 → SyntaxError → `delete window.ironmanFlag` 被跳过 → 0.5 死循环。**铁律：`grep -rnE '>[^>]" \+$'`**
2. **CDP 大字符串损坏** → 见 §5 probe
3. **feats 反作弊混淆** → 见 §5
4. **锚点缩进/标签**：写锚点前必须 `repr()` 核对字节；0.5 闭合是 `<</switch>>`（两个 `<`），漏一个静默不匹配 → `assert count==1`
5. **edit 误删邻段**：大文件多处相似代码 edit 后必须 grep 验证关键断言仍按序存在
6. **ev 模板 `\n` 双重转义**：单引号代码串内禁用 `\n`，拆行用 `String.fromCharCode(10)`
7. **`clone()` 不是页面全局**（v0.5.0）：`BJXTEST.run` 把异常吞成 `EXC:` → 换装静默失败 → PC 裸体 → `$exposed>0` 把入口全隐藏。用 `JSON.parse(JSON.stringify())`，且 **`clothesIndex(slot, item)` 收物品对象不是名字**
8. **`$saveVersions` 缺失 → 每个 passage 重跑 `<<backComp>>`** → 版本迁移分支炸。测试补 `V.saveVersions=[StartConfig.version]; V.objectVersion=V.objectVersion||{}`
9. **`$args` → `_args`**：0.4.3.3 是 `$args[0]`，0.5 是 `_args[0]`（`<<if>>` 先求值，只在 case 99 暴露）
10. **widget 参数按空格切分**：`<<transform bee -($x ?? 1)>>` 会把 `-($x` 当参数 → NaN。表达式参数用反引号
11. **`<<earnFeat "X">>` 要求 `setup.feats` 先有 X**，否则 TypeError → 新增兽化线前先 `ensureFeats()`
12. **CRLF 全家桶**：插入 twee 统一 CRLF；Python 文本模式读写大 HTML 会破坏 CRLF（已改二进制）；Twee2Passage 的 m 模式 `$` 只认 `\n`
13. **导航后 V 被 clone 替换**：`Engine.play` → `State.push`，装在 V 上的 defineProperty trap 失效 → 诊断写入要在不导航的动作前重装
14. **Barb Street 一次性 bridge 事件**：`$town_projects.bridge is 1` 时整页只剩 `[[Next|…]]`，挡住街道链接 → 测试要允许点 Next 重进（最多 3 轮）
15. **渲染期 difficulty 宏**：`<<link>>` 里的 `<</physiquedifficulty>>` 在渲染时执行，测试必须 goto 前预设技能值
16. **`Math.clamp(undefined)` 造 NaN → 整页「Corrupted variables」**：`window.scanNaNs(V)` 直接给变量路径树，是最快入口
17. **`afterInjectEarlyLoad` 里 `await` 弹窗 = boot 挂死**：headless 永不 resolve，日志特征是最后一个 `inject start` 没有 `end`
18. **0.4 专属 setup 数组会中断 user script**：`setup.modTattoos.push(…)` 在 0.5 无此容器 → 改 `(setup.X = setup.X || []).push(…)` 惰性化
19. **第三方报错堆栈只给 eval 偏移**：按 `boot.json` 的 `scriptFileList` **在该 mod 内**累加脚本长度定位文件，再减起点得文件内偏移（不是全局拼接）
20. **龙化前置锁（玩法规则）**：`$bjx_dragonUnlock` 为 false 时非龙物种 build 达 100 才解锁，`<<transform dragon 正数>>` 被拒且 build 不累积（负数衰减不受限）；解锁检测三处 + 作弊面板 build 步进器属显式作弊不拦

**死锁诊断方法论**：同步 XHR 打点是唯一可靠手段（页面 POST 到 127.0.0.1:8767，Node 内嵌 collector）；死循环中 console.log / CDP 事件会丢。wrap 层级 `Macro.get(name).handler` / `createShadowWrapper` / `Engine.play` / `Wikifier.wikifyEval`。0.5 脚本在 polyfill 模块作用域，函数不挂 window。模板 `work/diag_shave.mjs`。

## 7. 已知良性噪声（勿误判为 bug）

- 主菜单动画 `Image decode failed`（缺图）
- Monster Tower 的 `reading 'horses'`（`<<effects>>` 内部，不中断渲染）
- 无 NPC 上下文的 `<<person>>` 冒烟报错
- 中文插入链接偶现「双份」（第二份 parent 无 class），`clickLink` 取第一个正常

## 8. 历史与现状

### 8.1 移植完成度（一周目盘点的结论，全部已闭环）

| 板块 | 状态 |
|---|---|
| BJX 59 个新增文件 | 全部移植（16 个新地点/NPC 模块） |
| 新增 passage | 40 个进 pack（曾缺 `Fly`，v0.5.0 补齐） |
| widget | 包内 489 个定义零未定义引用；BJX 专属宏 99 个浏览器内全绿（`work/probe_macros.mjs`） |
| ghost 穿门 | 核心 13 处 + 外围 23 处（shop 9 + civic 14） |
| Docks / 飞行 / optionsmods / 农场 tending | 全部完成（`gen_fly.py`、`gen_options_bjx.py`、`gen_tending.py`） |
| 15 条兽化线 | 完成：`xxxTransform` + `toggleTransform` + 7 个 `clear*` + 11 形态文本 + 衰减/落地/清理（`gen_tf_animals.py`） |
| 画布 TF 渲染层 | 完成，17 种 `img/transformations/`（114 图）+ 36 个运行时图层，**不改游戏 JS** |
| 战斗杂项 | 古董双武器动作 + 3 效果处理器 + 龙息；虫群尾/灵体化已结案 |
| 作弊面板 | 全文重声明 + 堕天使/恶魔猎手/事件转化/15 条 build 步进器 |
| Chimera's Blessing | 收编（森林巨石→献祭→命名→三卵），仅修 4 处 + 8 个世界入口注入 |
| 有意排除 | 沼泽扩展（与 0.5 撞车）、0.4 旧档迁移、base-debug 工具、BJX 敌人侧能量系统 |

### 8.2 第三方 mod 收编总表（B1–B6，全部双绿）

| 批次 | 内容 | 关键动作 |
|---|---|---|
| B1（12+2） | NoAutoReBuyTrash、Eden.Fence.Rescue、DefrockMod、More.Love.Interests、TimeHourglass、钓鱼人生、cummilk、Sydney.Bare.Study、日落伊甸园、WhitneyExpansion、Wraith'sReflection、ReOverfits ＋ AveryOrphanageNote、自建 TweeReplacer | `patch_mod_rules.py` 幂等手术 20 条规则（14 重锚 + 6 剔除） |
| B2（6） | Terraria Expand、DomRobin、BabyHawk、DoLSims、猫咖出租屋、i.Candy | 四类兼容层（TimeEvent / SF shim / getMod 静默 / `$args→_args`） |
| B3 | Sydney.Dialogue.Expansion v1.7 | **级联重锚**（同 passage 多 mod 补丁的标准解法） |
| B4 | Remy Love Mod 1.0.0 | 正文是汉化版 → 75 条里 41 条剔除，34 条零错误 |
| B5 | MEE 露出拓展 1.0.5 | 前置把 TweeReplacer 升 **1.2.0**（加 `all`）；剔除 7 条 ReplacePatcher |
| B6 | i.Candy + Robot 2.4.4.2.3 | SF shim 全套 + 9 个 NamedNPC 注册时机修复 |

**注入顺序**：`modDataValueZipList` **头部**放 TweeReplacer（`"b64",` 形态），**尾部**放 `bjx-pack → 12 extra → B2 → …`（`,"b64"` 形态）。TweeReplacer 必须在头部：内置 `ModdedClothesAddon` / `TweeReplacerLinker` 声明依赖它，顺序检查不过会报 `not satisfies order` 并让回归 boot FAIL。

### 8.3 批次坑速查

- **patch_zip 类脚本 FIX 分支必须 `kept.append(p)`**，漏了规则静默消失还「假绿」61/61；每条手术规则都要正向断言注入文本可见
- **TweeReplacer 1.0.0 只换第一处**（不支持 `all`），1.2.0 才全换；断言按精确计数
- **replaceFile 重标记模式**：断言必须正向验证注入标记，不能断言原锚点消失
- **widget passage 运行时不在 Story**：`Story.get('Widgets X')` 返回 84 字节占位文本，必须用 `modUtils.getPassageData(name).content`
- **锚点核对必须三源**：运行时 body 覆盖序 = 宿主 < bjx-pack < mod 自身 twee（`b2_anchor3.py`）
- **唯一权威判据是组件自己的 `console.error`**，不是静态锚点核对、也不是「findString 不存在 = 已替换」的探针（假阳性）
- **`{optionalBefore} not satisfies version` 是良性**（head 故意留 1.0.0），已进两个测试脚本的 BENIGN 白名单
- **B4 让 boot 变慢是误判**：真因是 360 的 `ZhuDongFangYu.exe`（同配置移除 B4 仍 152s）
- **MEE 的 7 条 ReplacePatcher 必须剔除**：`mod *= window.mee?.calmStatModifier()` 拿到 undefined → NaN 把 pain/stress/arousal 全算坏
- **i.Candy 的 9 个 NPC 注册是「时机」问题不是队列问题**：`:passagedisplay` 只在标题页跑一次 → `npcBootLoop()` 500ms 轮询 + 包 `npcNamed` handler 贴回字段
- **SF shim 已够用，不需要真 Simple Frameworks**：`lanSwitch` / `getLan` / `SelectCase` / 插槽宏 / `.has()` / `ensureTvar()`（`$tvar` 0.5 根本没有）

### 8.4 发布包汉化烘焙的三层兜底

烘焙进 twee 后，第三方 mod 的英文锚点会消失 → 规则**静默失效**（dev 全绿、发布包少 7 处注入，以前从没发现）。`make_dist.py` 按序兜底：
1. `DIST_RULE_REANCHOR`：显式重锚表（半句 + 宏这类词典拼不上的）
2. **词典翻译 `findString`**：`replace` 里出现的原 findString 同步换译文，否则把英文贴回去
3. `build_label_map`：**按 passage 分组**取「同目标 passage 的英/中标签」配对（同一个 `Next` 在不同段落译不同，全局表会挑错）

结果：发布包冒烟 15/22 → **22/22**。另新增 `modList.json`（内容 `[]`）消掉 `Unexpected token '<'`。

### 8.5 控制台警告清零

第三方冒烟 22 步：**74615 条 / 40 类 → 0 条 / 0 类**。两条还值得记：
- 先做**日志增量**再统计（日志曾是跨运行 `appendFileSync` 累积，据此误判过补丁无效）
- `CacheRecord.replaceMerge() duplicate name`（73878 条）→ `update_mod_inject.py` 的 `LOADER_PATCHES` 换成 `replaceMergeSC2DataInfoCacheForce`（同逻辑 noWarnning=true）

### 8.6 Lyra 高清图包（0.5.12.13）：**试装后判定不可直接替换，已回退**

`DoL-0.5.12.13-Lyra-1.0.1a-besc-hikari-ucb-1004.1.zip` 是**整游戏**，美化本体就是 `img/` 整树替换（33,082 文件 / 125MB）。2026-10-22 实际试装过一轮，结论：

**能对上的部分**
- 与宿主同路径 18,045 个（宿主 img 共 18,759，剩 714 个是 i.Candy/猫咖/mod 图，不受影响）。
- 其中**内容真的不同**的只有 **9,563 个，全在角色画布**（body/clothes/hair/face/sex/bodywriting/transformations）；`img/misc`、`img/ui` 那 3,346 个里只有 10 个不同——**Lyra 基本只重画角色，不重画场景/UI**。

**为什么不能直接用**
1. 精灵图格子数变了。宿主 `img/body/base-head.png` 是 256×128 = 2 格（每格一个头）；Lyra 是 512×256 = 同宽比，但**每个变体里塞了「正常头 + 特写头」两张**。0.5.10.12 的 renderer（`rescaleImageToCanvasHeight` + `drawImage(img, 0,0,256,256, 0,0,256,256)`，见 HTML 内明文）按「半张图 = 一个变体」取格，于是把特写头一起画到角色右边。
2. 实测症状：角色本体渲染正确且更精细，但画布右侧多出一个「特写脸」框；`img/face/default/default/iris.png` 在 Lyra 里干脆是一张**草莓手机框**（不是虹膜），于是又多一个手机。单独回退 iris 只是把手机换成特写脸，说明整组脸/身体图层布局都不同。
3. 中途试过给 renderer 加「高度是目标 2 倍就按高度缩放」的补丁（`LOADER_PATCHES`），**没用**——问题不在缩放，在取格位置。补丁已撤除。

**已回退，当前是原图**：`work/lyra_backup/`（34MB / 17,854 个文件，写一次不再覆盖）是全量原图备份，`sync_lyra_images.py` 幂等，随时可重放；回退后抽样 800 个文件 0 差异，回归 61/61 + 冒烟 22/22。

**要继续做的话，三条路（按代价排）**
1. **只取 DOM 素材**：`LYRA_DIRS=img/misc,img/ui python sync_lyra_images.py`。零风险，但实测只有 10 个文件不同，几乎没有美化效果。
2. **改 renderer 的取格逻辑**（中等）：需要拿到 0.5.12.13 的 renderer 源码对比 `srcW/srcX` 算法，再按「2x 素材」分支取格。改的是基座 HTML 的明文 JS，可走 `LOADER_PATCHES` 幂等替换，但必须逐图层验证（角色/战斗/特写/服装破损四类）。
3. **升级宿主到 0.5.12.13**（大）：等于整个移植基线换版，bjx-pack 的 131 个 twee 和 21 个第三方适配全部要重跑回归。

### 8.7 i.Candy 图片（官方图包，2026-10-21 落地）

- 作者把素材单独发在 `github.com/emicoto/DOLMods` → `i Candy and Robot ImagePack` **v1.6.0**，已落库 `refs/icandy-imagepack/`（376 文件 / 1.4MB）。**物品图 30×30（280 张）、货架横幅 180×30（4 张）**，另有 `img/misc/` 76 张地点图、`img/action/` 15 张动作图标（宿主原本这两个目录都没有）。
- 规格依据：`.shopitemicon` 内容盒 30×30、`#shopbanner{height:30px}` 且 `<img>` 无 CSS 约束；`tabSwitch()` 按 `innerWidth*0.7/200` 重复 → 作者预期横幅约 200×30。
- 别名层（不做就继续 404）：`collection` ← `gacha/`、`cigarettes` ← `cigarette`、`mayonaise` ← `mayonnaise`、`sandwichbread` ← `sandwichBread`、`schoolbag*.jpg` 其实是 PNG 且要裁 32→30。
- 官方仍缺 7 张 → `gen_icandy_missing_icons.py` 手绘 30×30：`spray` / `fizzy` / `ketamine` / `salt` / `soysauce` / `body_none` / `hole_none`。
- **脚本链**：`gen_icandy_missing_icons.py` → `sync_icandy_images.py`（写到 dev + 发布包，自带三条断言：图标 30×30 / 横幅 180×30 / 运行时 168 条路径全覆盖）。旧的 `gen_icandy_item_icons.py` 已改成转发壳子。
- **改图不需要重注入 HTML**（图片是 `img/` 静态文件，不进 mod zip、不进注入链）；只改图时 `make_zip.py` 就够。
- 验证：四架 12/13/8/6 张全加载、`natural = 渲染 = 180×30 / 30×30`；专项 7/7、主回归 61/61；截图在 `work/shots/`（`work/shot_daiso.mjs` 生成）。
- 遗留：`img/ui/{devotion,humanity,emotional,desire}` 8 张仍缺，只在 `npcSetup.js` 定义、全仓库无引用，死配置。

### 8.8 挂起：i.Candy `onThread` 时间系统

`timeProcess.js` 顶层 `new TimeEvent('onThread')` 靠 BabyHawk 的 `TIME_SHIM` 顶住，但 shim 只支持 onMin/onHour → 药物/饥渴/口袋时间系统**实际未运行**。曾补过 onThread（含 `window.passedSec`），会让 `timeProcess.js` 的 `window.random(100)` 开始消耗随机流、打乱回归确定性，已回退。要启用须同时把回归的森林步骤显式钉死 `forest` / `eventskip`。

### 8.9 挂起：改存档名的 `startsWith` TypeError

- 现象：改存档名时控制台报 `TypeError: … (reading 'startsWith')`，栈顶 `HTMLDocument.<anonymous>`（jQuery `$(document).on`）。只脏控制台，不影响功能。
- 位置：numberify 的 keydown 处理器，dist HTML 第 995760 行（38 万字符巨行）col 377119：`if(ev.code.startsWith("Shift"))…`。该区块共 **4 处**（keydown×2 / keyup×2）。
- 为什么 `code` 是 undefined：jQuery 3.7.1 **确实**代理 `code`（`addProp` 含 `code:!0`），getter 是 `this.originalEvent ? … : undefined` → 只有**合成事件**才拿得到 undefined；真实按键必为字符串。源头没找到（明文 grep 无、怀疑在 base64 的 mod zip 里）。
- 修法（约 20 分钟）：4 处改 `(ev.code||"").startsWith(`，在 `make_dist.py` / `update_mod_inject.py` 对基座 HTML 做**带上下文的唯一片段替换**、保持幂等。**别手改 dist HTML**。
- 验证：重注入 → 重建 → 61 步回归 + 手动走一遍改名流程（console 0 错误）。

### 8.10 猫咖出租屋（Cattery）CG 空白（2026-10-22 修）

两处**叠加**的原因，只修一处仍然白屏：

1. **图片不在磁盘**：新版 `game/cafeFunction.js` 用 `new Image(); img.src = "img/misc/cafeCG/<场景>/<图层>.png"` 直接走 HTTP，不走 mod zip 的 `requestImageBySrc`（旧版 `cafeFunction (old).js` 才走）。mod zip 里的图在 polyfill 构建里不落盘 → 全 404。
   → `work/sync_cattery_images.py` 把 `mod/Cattery1.1.8.2.for.dol0.5.10.adapted.mod.zip` 的 `img/` 全量同步到 dev + 发布包（73 张 = 5 场景 × 8 图层 + 32 图标）。**改图不用重注入 HTML**。
2. **widget 里的 `<script>` 被 shim 删掉**：`_b2_compat_sf.js` 的 `wikify()` 原来一律 `jQuery(div).find('script').remove()`（为 Terraria 的按钮脚本消文本污染）。而 cafeCG 的脚本才是功能本体——`createCafePC()` 就在里面调。
   → 改成：先摘脚本存文本 → **div 插入宿主 DOM 之后**再按白名单 `SCRIPT_RUN = { cafeCG: 1 }` 执行（带 `var V = window.V || SugarCube.State.variables` 兜底）。必须插完再跑，因为脚本靠「id 命名访问」拿容器（`window.cafeCG === div`），脱离文档时是 undefined，`createCafePC` 第一行就抛错。

验证：`Pc House` 页 `#cafeCG canvas` = 300×200，非透明像素 60000/60000（全幅）；`img/misc/cafeCG/*` HTTP 200；主回归 61/61 + 冒烟 22/22。
改了 `b2_adapt.py` 的 `SF_SHIM` 就要 `python b2_adapt.py && python update_mod_inject.py`（SF shim 是 6 个 B2 mod 共用的）。

### 8.11 两个「死开关」：出售旧衣服 / 摆摊声望（2026-10-22 接活）

`$options.bjx_sellcloth`、`$options.bjx_sellproduce` 在 pack 里只有 checkbox、**没有消费点**，打开等于没开。补齐：

**① 出售旧衣服（`bjx_sellcloth`）**
0.5 的 `:: Tailor Monthly Discard` passage 和衣柜 discard 回收箱分支都是齐的，唯独 `tailor.twee` 里入口链接被注释掉。原因不是没做完——是**那个 passage 本身有上游 bug**：
```
Math.floor(getClothingCost(_items[_i]) * (...) / 3, _label)   ← 0.5 现状
```
0.5 的 `getClothingCost` 是 `(item, slot)` 两参，这里只传了 item，`slot` 被错塞进 `Math.floor` 的第二实参 → `setup.clothes[undefined]` 抛 TypeError，**衣柜里每件可卖衣服报一次**（实测 7 件 7 个错误块）。BJX 原版那行是对的。
→ `gen_ghost_shops.py` 的 `POST_FIX` 两条：① 拆注释并挂 `<<if $options.bjx_sellcloth>>`（图标用 0.5 的 `<<socialiseicon "ask">>`，0.5 没有 `<<askicon>>`）；② 把 `getClothingCost` 修成 `(item, _label)`。

**② 摆摊声望（`bjx_sellproduce`）**
0.5 的 `stall_sell` widget 结尾是固定 `<<famebusiness 1>>`。BJX 按 `$enemytrust` 分 6 档（10/3/1/0/-3/-10）。`$enemytrust` 在 0.5 里存在（`stall_trust` widget 在用），阈值可原样搬。
→ 新增 `genparts/gen_market_sell.py`：从 0.5 源码抽出 `stall_sell` 全文重声明（gen_swarm 范式），只换结尾那一行；`build_pack.py` 接线 `_verify_market_sell`，batch 3i 断言 80→**81**。
注意 0.5 的 `famebusiness` 写的是 `$fame.business` 且 clamp 在 **0..2000**，所以负档实际是「掉到 0」，不会变负数——和 0.5 的名声设计一致，不算 bug。

**验证**：开关开→链接出现 / 关→不出现 / 点进去 `Tailor Monthly Discard` 0 错误块；摆摊信任 60→`$fame.business +10`、-40→0、开关关→+1。主回归 61/61 + 冒烟 22/22。

### 8.12 恶魔猎手重做（2026-10-22 设计定稿，**未动代码**）

**完整实现规格见 `work/SPEC-hunter-rework.md`**（数值表、变量、每个挂点的文件:行、代码骨架、验收清单都在里面）。这里只记结论：

- BJX 原线（禁欲 14 天 + `$daynoabsorb` + `hunterbuild` 0~100）在包里是**死代码**：每日驱动没移植，只能靠作弊面板变 2 级后卡死。
- 重做方案：**魅魔满级（demon 6）立即转猎手 2 级**；点数只来自**非自愿战斗**（内射 +3 / 高潮 +1 / 单场 ≤9）；门槛 90/180/**医院**/360；减免 20→30/45/60/75/**90%**（只作用于被施加的 stress/trauma/自控，**不碰玩家攻击力**）；主动行动夺回自控（+8~+24，每场 ≤120）；腐蚀改非致命（留 1 血）；「继续索取」每场 1 次（半自动）；魅魔怀孕可在 4 处厕所吸收胚胎（淫乱 +20 / 进度 +40 / 7 天免疫 / 状态回 90% / 耳史莱姆 `corruption` +30）。
- 关键约束：`$promiscuity` 上限是 **100**（不能写 +100）；史莱姆「堕落」是 `$earSlime.corruption` 不是 `growth`；`stress`/`trauma`/`effectsman`/`man`/`demonTransform` 只能包宏 handler，不能重声明。
- 尚未落地：摄魂之眼（5 级催眠动作）、魅魔「诱惑」`demonseduce`——都要动巨型 widget，列为 P2。（「再来一发」做成可选行动已于 2026-10-22 完成，见 §8.16 补全段。）
- **移植缺口全表见 SPEC 附录 A**（2026-10-22 审计）：BJX 源里 37 个文件提到 `demonhunter`，包里只有 6 个。**腐蚀实际在 `hunterhotfluid` widget（可击杀，真凶），不在 `tentacle_skin`**；猎手高潮回状态（-5 pain/-50 trauma/-100 stress）、被内射惩罚、意志抵抗高潮、三条特质全部缺失。

## 8.13 迁移到 0.5.12.13（暂停中，地基就绪，23/25 生成器已通过）

目标：把宿主从 0.5.10.12 换成 Lyra 包里的 **0.5.12.13 + ModLoader + 高清美术**，一次性解决 §8.6 的美化不兼容。

### 可行性结论（先量化再动手）

| 指标 | 数值 |
|---|---|
| 0.5.10.12 passage | 15,433 |
| 0.5.12.13 passage | 16,087 |
| **完全相同** | **14,196（92%）** |
| 有改动 | 1,225（7.9%） |
| 仅旧版 / 仅新版 | 12 / 666 |
| bjx-pack 覆盖的 passage | 3,721 |
| ├ 落在改动区（要重锚） | **229** |
| ├ 新版未变（可直接用） | 2,999 |
| └ 纯新增（无冲突） | 493 |
| 与新版新增撞车 | **0** |

**结论：补丁级升级，不是重写。** 另外 Lyra 那个 HTML **自带 ModLoader**（263 处引用、`modDataValueZipList` 在），可以直接当新宿主，不必另找 polyfill。

### 已完成（4 项，全部幂等可重放）

1. **新宿主目录** `game/DoL-ModLoader-0.5.12.13-lyra/`：Lyra 的 HTML（79MB，含 ModLoader + 美术）+ 解包的 `img/`（**33,081 文件 / 193MB**）。旧 dev 目录**一个字节没动**。
2. **源码树还原** `refs/dol-0.5.12.13-target/game/`：`work/migrate_0512_src.py` 从 HTML 的 `<tw-passagedata>` 逐 passage 取回原始 twee，沿用 0.5.10.12 的文件划分，新增 666 条写进 `_new/zz-0512-new.twee`。产出 **603 文件 / 16,087 passage**，校验通过。
3. **源码树路径可切换**：`work/` 下 28 个 py 的 `'dol-0.5.10.12-target'` 改为 `os.environ.get('DOL_REF', 'dol-0.5.10.12-target')`。`DOL_REF=dol-0.5.12.13-target` 整套切过去，**默认行为不变**。
4. **注入锚点已验证**：新 HTML 里 `window.modDataValueZipList = [`、`replaceMergeSC2DataInfoCache)(`、preWarm decode 三处都在，`update_mod_inject.py` 的思路可复用。

### 两个已解决的坑

**① 还原源码树必须保留 passage 之间的空行分隔。**
原版 twee 里 passage 之间是 `...<</if>>\n\n:: Next`，文件末尾也带空行；genparts 的**大量锚点跨这个空行**（例：`'...\n<</if>>\n\n'`）。第一版还原用 `'\n'.join()` 把它们粘掉了，`gen_ghost_shops` 直接报「Adult Shop 锚点不唯一」。
→ 改成 `'\n\n'.join(buf) + '\n\n'` 后立刻通过。**这是还原问题，不是上游改动。**

**② 还原树里没有 JS 文件。**
`gen_fly.py` 断言 `Macro.add("icon")` 等三个宏在原生 JS 里存在，但 HTML 还原只能拿回 twee。
→ 改成「只在真的读到 `.js` 时才做这三条断言」（`HAS_JS[0]` 开关）。

### 生成器清单（25 个）

**通过 23 个**：actions_tail、bird、busstation、cheats_bjx、chimera、churchyard、deepseadive、energy、fly、ghost_civic、ghost_shops、landfill、market_sell、maths、monstertower、old_sewers、olive_hook、options_bjx、special_npcs、stolen_books、street、swarm、temple、tf_animals。

**仍失败 2 个**：

| 脚本 | 报错 | 已查明的情况 |
|---|---|---|
| `gen_lake_underwater.py` | `P4 tentacle epilogue anchor not unique` | 锚点所在段在 0.5.12.13 改了：`:: Lake Ruin Sit Tentacles` 后面那个空行被上游删掉了（该段落其他文本没变），锚点按新版去掉空行即可。`Lake Ruin Sit Tentacles Finish` 新版也比旧版短，改锚点时要连它一起核对 |
| `gen_tending.py` | `BASE_WIDGETS` 列表不匹配 | 农场 tending widget 组新版是 18 个：plots_init、add_plot、clear_plot、display_quality、display_plot、tendingWaterPlot、tendingWaterAllDryBeds、tendingPlantSeedsOptions、tendingTillOptions、plot_effects、tending_harvest、tending_pick、tending_give、tending_season_notice、updatePlants、updateFoodstuffVariables、foodstuffReport、harvestText。按这个列表更新脚本里的 `BASE_WIDGETS` |

**另外 `build_pack.py` 自身的 inline 生成器** `gen_landfill_widgets()` 也断：`W1 trash_1 anchor not unique`。

### 已完成（2026-10-22 续，全部幂等）

1. **3 个失败锚点已修**（均为「上游真改」，写法改成**双版自适应**，0.5.10.12 默认输出不变）：
   - `gen_lake_underwater.py` P4：0.5.12.13 给 `Lake Ruin Plinth` 链接加了 `<<set $wraith.timer = -50>>`；build_pack **内联版同名函数**也要同步改（1976 行处，两份）。
   - `gen_tending.py`：`updateFoodstuffKey` → `updateFoodstuffVariables` + 新增 `foodstuffReport`/`harvestText`（18 个 widget）；`plot_effects` 的 harvest 行尾多 `<<harvestText>>`；`greenthumb` 与 `tendingYieldModifier` 之间多一行 `<!-- … -->`。
   - `build_pack.py` `gen_landfill_widgets()`：W1 锚点里 Seduce 分支缩进 +1 tab、`<<promiscuous1>>`→`<<promiscuous2>>`。
2. **额外发现**：`gen_swarm.py` 上一轮被**只改成新版锚点**（p4 含 0.5.12.13 新增的 `_br`），把默认线弄挂了 → 已改成双版自适应（`br_line`）。
3. **`DOL_REF=dol-0.5.12.13-target python build_pack.py` 全通过**（133 twee / 3721 passage）；默认线同样通过（134 twee，含新开关文件）。
4. 副产：`_diag_0512.py`（逐文件 diff 新旧源树，判断「还原问题 vs 上游真改」）。

### 下一步（按顺序）

3. 21 个第三方 mod 重锚（`b2/b4/b5/b6_adapt.py` + `patch_mod_rules.py`，约 200 条规则）。
4. 回归 61 步按新 passage 调整（预计 5–15 步），然后 `make_dist.py`（汉化烘焙要对着新 twee 重跑）+ `make_zip.py`。

### 给下次动手的两个提示

* **锚点失效时先分清是「还原问题」还是「上游真的改了」**：本次 5 个失败里，2 个是还原问题（空行分隔、没有 JS），3 个是上游真改。判断方法：把同一锚点在 `refs/dol-0.5.10.12-target` 和 `refs/dol-0.5.12.13-target` 里各 count 一次，两边都≠1 才是还原问题。
* **passage 头格式**：0.5.10.12 树里 `:: 名` 后直接接正文的有 13,564 处、带空行的只有 1,869 处，所以还原出来的「无空行」是多数派、正确；`Lake Ruin Sit Tentacles` 那种带空行的是少数派。

### 当前状态（重要）

**旧版完好可用**：`work/bjx-pack` 默认线重建通过（**134 twee**），dev HTML 与 `img/` 未改，回归 **61/61 + 冒烟 22/22 双绿**。新宿主在独立目录，两条线互不干扰——迁移没推完也不影响现有版本。

### 8.14 死开关移植进度（P1，见 `AUDIT-porting-gaps.md` §7.4）

P1 的 9 个开关，**已落地 6 个**（前 4 个在前几轮，后 2 个在本次）：

| 开关 | 落点 | 状态 |
|---|---|---|
| `bjx_clothes` | `gen_bjx_switches.py` → `bjx-switches.twee`（重声明 `wardrobeLinks`，三栏门控换成 `!$debug and !$options.bjx_clothes`） | ✅ |
| `bjx_sewmachine` | `gen_ghost_shops.py` POST_FIX（tailor 两处 `$debug is 1 or $options.bjx_sewmachine`） | ✅ |
| `bjx_robinincome` | `inject_early.js` 每日钩子（`robinmoney += dom*40-300`） | ✅ |
| `bjx_doglovenodown` | `inject_early.js` 每日钩子（门控 `stray_happiness`） | ✅ |
| `bjx_crimewipe` | `gen_bjx_switches.py` → `bjx-switches.twee`（重声明 `police_computer_action`，`crimeSumCurrent() gte 1000 or $options.bjx_crimewipe`） | ✅ 本次 |
| `bjx_stealhand` | `gen_bjx_switches.py` → `bjx-switches-steal.twee`（重声明 `leftstealnew`/`rightstealnew`，难度公式加 `- ($options.bjx_stealhand ? $handskill / 5 : 0)`） | ✅ 本次 |
| `bjx_averymoney` | 需重声明 `special-avery/main.twee` 里含 `(C.npc.Avery.love*10 + $endear*10 + 10)` 的 passage（19 处，整文件 223 passage） | ⏳ 可做 |
| `bjx_smallup` / `bjx_noenduredmg` / `bjx_endlessagain` | **不可直接移植** | ❌ |

**为什么后 3 个直接移植不了**：BJX 是 0.4.3.3 魔改，`smallup` 靠 `enemytrustgain`/`enemyangerloss` widget、`noenduredmg` 靠 `$enemyoverarousal`、`endlessagain` 靠 `$enemyarousalmax -= 200`——**这些 widget/变量在 0.5 已重构掉**（0.5 全仓 `enemytrustgain`/`enemyoverarousal`/`againfail` 零命中，0.4.3.3 baseline 也没有，是 BJX 自造）。要落地必须①从 BJX 移植对应 widget ②再在 0.5 找等价调用点（trust/anger 现散在 `bodywriting.twee`/`beast.twee` 内联，overarousal 机制也换过）——属重新设计，单独排期。

> `bjx_stealhand` 的 `<<skulduggerycheck>>` 那一半依赖 `$skulduggeryhands`（0.5 已移除），**故意不移植**（§4.2）；难度公式那一半已等效实现手技加成。
| `bjx_averymoney` | `gen_bjx_switches.py` → `bjx-switches-avery.twee`（重声明 special-avery/main.twee 10 个付钱 passage，19 处 `* ($options.bjx_averymoney ? 2 : 1)`） | ✅ 本次（§8.15） |

> `gen_bjx_switches.py` 已接 `DOL_REF`，产出 `bjx-switches.twee`（clothes+crimewipe）/`bjx-switches-steal.twee`（stealhand）/`bjx-switches-avery.twee`（averymoney）两版均通过；`build_pack.py` 的 batch 3i 断言 **82→84**。

### 8.15 迁移到 0.5.12.13 完成（2026-10-22）——新宿主双绿 + 发布包

**结果**：0.5.12.13（Lyra 高清美化版）宿主上主回归 **61/61**、第三方冒烟 **22/22**、发布包同名双绿。**135 twee / 3731 passage**。

**宿主**：`game/DoL-ModLoader-0.5.12.13-lyra/`（83MB HTML + 33,564 张 Lyra 高清图，含 ModI18N/I18n\* 内置汉化 + Lyra 美化 mod）。
- `update_mod_inject.py` 新增 `DOL_HOST`（宿主 HTML 路径）与 `DOL_KEEP_I18N`（保留内置 i18n）。
- **dev 默认丢 i18n**（丢 ModI18N/I18n\*）→ 基座回英文，与 bjx-pack 中文共存，英文断言不变。
- i18n 若要保留**必须放数组末尾**（旧 make_dist 同款）；放中间会让第三方 findString 先被翻译而失配（冒烟 22→16）。

**§8.13 第3步"21 mod 重锚"实际结论**：新宿主上**无需大规模重锚**，仅 3 处随 0.5.12.13 重构失配，已修：
- TimeHourglass `Ocean Breeze`：`<<passoutshop>>` → `<<passoutshop "cafe">>`（`patch_mod_rules.py` 版本自适应，读 `DOL_REF`）。
- Remy Love 2 条（`Pregnancy Birth Hospital 2/5`）→ `b4_adapt.py` 条件剔除（新宿主 43 条）。
- 其余是**框架级噪声**（DependenceChecker / AddonPluginManager / ReplacePatcher 文件探测 / ModOrderContainer），mods 面向旧 ModLoader、不影响功能 → 已进 `cdp_pack.mjs`/`cdp_mods_smoke.mjs` 的 BENIGN 白名单。

**测试适配**（中文宿主相关）：age-gate（门控按钮汉化→localStorage 兜底）、debug-start-school（中文开局链接）、新增 `clickToPassage`（`data-passage` 语言无关点击）、`clickLink` 中英同义表、若干断言兼容中文。

**发布包**：`bjx-整合包-1.4.0-开箱即玩/` + `.zip`（116.6MB / 33,570 文件）。`make_zip.py` 支持 `DOL_DIST_SRC`。

**⚠️ 本轮最大坑（务必记住）**：一开始把新宿主起在 **8767**，但该端口被**旧 1.3.0 发布包**的服务器占着（Content-Length 118MB ≠ 新宿主的 83MB），"新宿主双绿"其实是旧发布包。**判定服务器是否在服务目标：`curl -sI` 比 Content-Length，或 `md5sum` 对文件**（新宿主 HTML = 83,234,793 字节；旧发布包 = 118,576,401）。真新宿主用 **8790**。

**遗留（新宿主）**：
1. **发布包全汉语已完成**（2026-10-22，§8.16）：`make_dist.py` 已参数化（DOL_DEV/DOL_I18N/DOL_OUT），用宿主内置 ModI18N 词典把 bjx-pack 烘成中文，passage 覆盖率 **99.1%**；第三方 mod 用 `mod_i18n/` 的中文锚点版本注入。发布包双绿。
2. `smallup`/`noenduredmg`/`endlessagain` 仍不可移植（0.5 机制重构，§8.14）。
3. 场景缺口：阴毛/咖啡/精神病院经核对**已内置**，AUDIT 旧结论是误报；真正剩余见 §0 遗留 5。

### 8.16 恶魔猎手/魅魔 P0 + 1.4.0 汉化（2026-10-22）

**猎手/魅魔**（`genparts/gen_hunter.py` → `bjx-hunter.twee`，136 twee / 3736 passage）：

| 项 | 落点 | 验证 |
|---|---|---|
| 点数（内射 +3 / 高潮 +1 / 单场 ≤9） | 重声明 `internalejac` / `orgasmcount` + 新 widget `bjxHunterGain` | 4 次 +3 只到 9 |
| 升级 90/180/医院/360 | `bjxHunterCheckRank`；`hunterbuild` clamp 改 0~360（`build_pack.py` 的 hunter 分支） | 89→3 级 / 179→4 级 / 4 级不自动升 5 / 359→6 级 |
| 阶段减免 50/60/70/80/95% | `controlloss` 的 -25 改 `-Math.round(25*(1-bjxHunterReduction()))`；`stress`/`trauma` 包 handler 只缩放正数（含迎合/`<<submission>>` 走 `<<stress 20 10>>` 的路径） | 表 `[0,50,60,70,80,95]`；soft=0 |
| 自控夺回 8~24/场 ≤120 | `effectsman` 包装 + `combatinit` 每场重置 | 专项已验 |
| 非致命腐蚀 | `hunterhotfluid` 搬入，三处扣血 `Math.max(1,...)`，删 `defeatnpc` | 50 血吃 300 伤害 → 停在 1 |
| 续杯卡位 + 「再来一发」/「贪婪索取」 | **2026-10-22 改版**：`setupMidOrgasm` 改 BJX 原版 `againfail` 语义（敌人冲顶被卡住、当回合不行动）；动作生成在 `gen_actions_tail.py` p7/p8（`feetActions` 插「再来一发」(pleaseagain)/「贪婪索取」(forceagain) + 难度 case）；结算在 e2（`effectsman` 插诱惑/体能判定，成功续杯 max-200/arousal 归 0，失败 finish=1）；`man` gate 在 `inject_early.js` | `cdp_hunter.mjs` 9-11b 共 7 断言 |
| 满级即转 | `demonTransform` 包装：demon≥6 且 hunter<2 → demonhunter=2 | demon=6 → 2 级 |
| 高潮回状态 + 体液灼伤 | `orgasm` 重声明，插 `-5 pain/-50 trauma/-100 stress` + `<<hunterhotfluid 2>>` | 渲染命中 |
| 内射结算 | **2026-10-22 二次平衡**：痛苦惩罚已删；按等级比例恢复——猎手 2/3/4/5/6 级 = 10/15/20/25/30%，恶魔 6 级固定 10%（压力/创伤/疼痛各 ×(1-比例)），任何战斗都生效；`internalejac` 的计数门也放宽到 `demonhunter gte 6` | `cdp_heal.mjs`：900/900/850/800/750/700 |
| 意志抵抗 | `willpowerorgasm` 加 `and $demonhunter lte 5` | — |
| 6 级免锁 | `man` 包装：hunter≥6 → `orgasmdown=0` | — |
| 特质显示 | `bjxInjectTraits` DOM 注入：「恶魔猎手 Lv.N」带当前减免/自控/点数/进度与下一阶段说明，另列摄魂之眼·百练之躯·魅魔欲望（标注解锁等级） | `cdp_traits.mjs` 1/1 |
| 敌人数值 | `bjxInjectEnemyStats`（`$options.bjx_health`） | — |

专项脚本 `work/cdp_hunter.mjs`：**15/15**（2026-10-22 扩到 15 断言）。关键坑：`window.Macro` / `window.State` 在 0.5.12.13 上是 undefined，必须走 `window.SugarCube.Macro` / `.State`（`bjxWrapMacro` 已兼容）。

**魅魔「再来一发」补全（2026-10-22，玩家反馈「功能没实现」）**：

首版只写了 `setupMidOrgasm` 的自动分支（敌人 arousal 压回 max-1），但 BJX 原版机制是**玩家在脚部动作列表里主动选「再来一发」**——动作生成（`feetActions`）和结算（`effectsman`）两块根本没移植，等于只做了个壳。此次按 BJX 原版忠实还原：

- **卡位**（`gen_hunter.py`）：`setupMidOrgasm` 重写为 `!$againfail and (bjx_divine+ demon6 or bjx_animal+dragon6) and 满arousal` → `enemyarousal=max-1; againfail=true`。渲染顺序是精妙的：`feetActions`（先生成动作，看到满 arousal）→ `setupMidOrgasm`（压 arousal 破坏 `_combatend` 条件）→ 同帧完成，战斗不自动结束。
- **动作**（`gen_actions_tail.py` p7/p8）：`feetActions` 的 `<<set _feetaction["Rest"]>>` 后插「再来一发」/「贪婪索取」（各自门控 divine+demon6 / animal+dragon6 + 满 arousal）；`feetactionDifficulty` 加两个 case 标签。
- **结算**（e2，锚 `feetaction is "rest"` 块后）：pleaseagain 走 `ejaculation`+`seductioncheck`（难度 `10000 - max*10`），成功 → `againfail=false; max-=200（除非 bjx_endlessagain）; arousal=0; submission 10`；失败 → `finish=1; max=0`。forceagain 走 `physiquedifficulty`，成功另回满敌人血量 + `brat 10`。
- **gate**（`inject_early.js`）：`man` 包装加 `if (W.againfail) return`（BJX 原版 `<<if $finish isnot 1 and !$againfail>>` 等价）；`combatinit` 重置加 `againfail=false`。

**测试坑**：全量套件里 `basement-caught-cage` 稳挂——`tentacle-plains-gates` 残留的 `dragon:6 + bjx_animal:1` 与该步的 `enemyarousal 9999>=max` 叠加触发卡位，破坏 `_combatend`。这是**预期游戏行为**（6 级 TF 玩家战斗不自动结束须续杯），修法是该步开头清 TF 状态（`dragon/fox/demon/againfail` 归零），符合「每次 goto 前完整重设状态」铁律。**合成渲染 `<<ejaculation>>` 需完整 NPC 上下文会报错，文本断言改以状态变化为准**（againfail 转 false + max 降 200）。

验证：dev 三套全绿（cdp_pack 61/61 + cdp_mods_smoke 22/22 + cdp_hunter 15/15）。**发布包（dist）尚未重烘**，下次发版跑 `make_dist.py && make_zip.py` 时自动带上。

**1.4.0 汉化**（发布包 = 0.5.12.13 全汉语）：
```bash
# 1. dev HTML 复制成发布基座，注入中文锚点版第三方 mod（mod_i18n/）
cp "game/DoL-ModLoader-0.5.12.13-lyra/Degrees of Lewdity.html" work/dist_base_0512.html
cd work && DOL_HOST=.../dist_base_0512.html DOL_MODDIR=.../mod_i18n python update_mod_inject.py
# 2. 烘 bjx-pack + 追加宿主 ModI18N（必须在数组末尾）
DOL_DEV=.../dist_base_0512.html DOL_I18N=.../mod/_hosti18n/ModI18N.zip \
DOL_OUT=.../bjx-整合包-1.4.0-开箱即玩/Degrees of Lewdity.html python make_dist.py
# 3. 补 BJX 服饰立绘（已把 0.5.12.13 / 1.4.0 加进 TARGETS）
python sync_bjx_clothes_img.py
# 4. 回归 + 打包
DOL_DIST_SRC=.../bjx-整合包-1.4.0-开箱即玩 python make_zip.py
```
结果：蒸馏 136 twee / 82 命中 / **33272 条**；发布包 46 条目 / 102.1MB、zip 130.0MB；dev + 发布包各 61/61 + 22/22。**1.4.0 之前缺 22 张 BJX 服饰图，已补**。

**启动日志 7 error 判读（2026-10-22）**：

| 日志 | 性质 | 处置 |
|---|---|---|
| `DependenceChecker(Cheat-Lyra) need TweeReplacer ^1.6.0 / find 1.3.0` ×2 | **真问题**：Lyra 自带作弊面板被依赖检查拦下，整块不加载 | `update_mod_inject.relax_lyra_deps()` 清空其 `dependenceInfo`。它 7 条规则只用 `findString/findRegex/replace/all`，1.3.0 全支持；dev + 发布包重建后双绿 |
| `AddonPluginManager.registerMod() not found [I18nTweeReplacer] on DefrockMod` | 框架噪声：新 ModLoader 的 addon 注册协议变了，只影响该 mod 的 i18n addon | 不处理（BENIGN） |
| `ReplacePatcher cannot find file: pregnancy.js` ×2、`cannot find 'from': parasiteProgressDay` | **真损失但不可修**：0.5.12.13 把 JS 内联进 HTML，ReplacePatcher 按文件路径找不到；TimeHourglass / Remy Love 的怀孕、寄生虫 JS 补丁未生效 | 不处理（要修得让 ReplacePatcher 支持内联 JS） |
| `ConflictChecker optionalBefore not satisfies: TweeReplacerLinker before I18nTweeReplacer` | 顺序噪声：i18n 故意放数组末尾（放中间会让第三方英文锚点先被翻译而失配） | 不处理（BENIGN） |

后三类已在 `cdp_pack.mjs` / `cdp_mods_smoke.mjs` 的 BENIGN 白名单里；第一类修完 dev 与发布包各 **61/61 + 22/22**。

**汉化漏翻修复：宏骨架匹配（2026-10-22）**

`bjx-switches-avery.twee` 这类生成器产物把开关表达式插进了整句（`* ($options.bjx_averymoney ? 2 : 1)`），与词典 `f` 的宏内容不同 → 整句 `f in body` 必然失配 → 整段英文（玩家看到「他 opens 他 heavy 皮夹」这种半中半英）。`make_dist.py` 新增 `build_macro_index()` / `translate_line_macro()`：把 `<<...>>` 抽象成占位符比骨架，命中后用**本行的宏**逐个替换译文里的宏。本次多烘 3 条，avery 的「翻找着现金 / 我请客」已变中文。

> **⚠️ 首版踩坑（已修）**：一开始允许任意宏内容不同、按位置替换，结果把
> `<</silently>><<print _text_output>><</widget>>` 换成了
> `<</widget>><<print …>><</silently>>`，发布包 boot 直接炸（`child tag <</silently>>
> outside of its parent macro`，272s 后 `game did not boot`，dev 却是绿的）。
> 现在 **只允许 `<<print>>` 内容不同，其余宏必须逐字相等**；命中数从 17 降到 3，
> 这才是真实收益。改烘焙规则后必须验一遍 `bjx-olive-hooks.twee` 的 pinchHe/pinchHis 三行。

**衣柜一键修复（2026-10-22）**

`genparts/gen_wardrobe_repair.py` → `bjx-wardrobe-repair.twee`（137 twee / 3737 passage）：

- 入口：`inject_early.bjxInjectRepairAll()`，条件同原版单件修补（`$sewingKit=1` + `$location is "home"`），只在 `Wardrobe` passage 底部注入「一键修复所有衣物 (0:30)」。
- 效果：遍历 `$wardrobes[$wardrobe_location]` 的所有 slot 数组，`integrity = clothingData(slot, item, "integrity_max")`；`<<housekeeping 2.5>>`（该 widget 内部 ×2 → **+5**）；`<<pass 30>>`。
- 专项 `cdp_repair.mjs`：**5/5**（无缝纫机不显示 / 有则显示 / 修满 / 家务 +5）。
- 坑：新游戏裸跳 `Wardrobe` 会因 `$clothingShop` / `$farm_tower_gua` 未初始化而报错，测试必须直接用真实 `setup.clothes` 模板造物品、直接进修复 passage。

**玩家反馈三连修（2026-10-22 15:40）**：

| 报错 | 根因 | 修法 |
|---|---|---|
| `Unexpected value for the function "control" … "-Math.round(25"` | `<<combatcontrol>>` 的参数**按空格分词**，`-Math.round(25 * (1 - …))` 被截成 `-Math.round(25` | 表达式用反引号包：`` <<combatcontrol `-Math.round(25 * (1 - bjxHunterReduction()))`>> ``（gen_hunter.py） |
| `<<cummilk>>: Cannot read properties of undefined (reading 'cummilk')` | 0.5.12.13 **新存档不初始化 `$plants`**（只有老存档迁移里有），cummilk mod 直接读 `$plants["cummilk"]` | `VAR_DEFAULTS` 加 `plants: {}`；农场首次用到会覆盖，和 0.5 自身行为一致 |
| `Error [Pinch Widgets]: child tag <</silently>> outside of its parent macro` | 上一版宏骨架烘焙把 `<</silently>><<print>>…<</widget>>` 重排（已修，见上） | 用户看到的弹窗来自**修复前的旧包**；当前 1.4.0 的 bootlog 已无此错 |

**花园「收获全部」崩溃（2026-10-22 15:50）**：

`bjx-tending-bjx.twee` 的收获全部链接里写的是
`<<set $_plotsToHarvest to ($plots["x"] ?? []).filter(plot => plot.stage >= 5)>>`。
SugarCube 的 `<<set>>` 解析这种「空值合并 + 箭头函数」会抛
`TypeError: Cannot read properties`，`$_plotsToHarvest` 保持 undefined，
紧接着 `<<for range undefined>>` 报 `unsupported range expression type: undefined`。
→ 改成 `<<set $_plotsToHarvest to []>>` + `<<if $plots and $plots["x"]>>` +
`filter(function(p){return p.stage >= 5;})`（gen_tending.py）。
**教训：`<<set>>` 里别把 `??` 和箭头函数叠在一起用；先置默认值再在 if 里赋值。**

**一键修复补强（2026-10-22 15:50）**：只遍历衣柜会出现「明明有破损却说没得修」——
玩家穿着的那件不在 `$wardrobes` 里。现在同时遍历 `$worn`，并且满耐久优先读
`item.integrity_max`（缺失才回退 `clothingData`）。专项改成「4 个衣柜栏位 + 身上 1 件」，
**5/5**。

**荒原汉堡摊「钱不够」（2026-10-22 16:15）**：

`bjx-farm.twee` 的 `Moor Food Stand` 用 `<<if $money gte 5000 and $moorburger lt 1>>`，
但 `$moorburger` **只在购买时被 set，从没初始化**。SugarCube 里 `undefined lt 1` 是
`false` → 菜单分支永远不进，玩家永远看到「你的钱不够」。
→ `VAR_DEFAULTS` 补 `moorburger: 0`。专项 `cdp_food.mjs` **3/3**（有钱没吃过→菜单 /
吃过→已吃过 / 没钱→钱不够）。

顺手扫出同类模式（只在 `<<set>>` 里出现、却拿 `lt` 比较，undefined 恒 false）：
`policemolestation`（街头搜身阶段链）、`robindebtevent`（罗宾债务冷却）—— 一并补 0。
**排查手法**：`grep -rhoE '\$[a-zA-Z_][a-zA-Z0-9_]* lt [0-9]+\b'` 后逐个确认是否初始化。

**DoLSims 书籍特质独立分组（2026-10-22 17:12）**：

玩家反馈「特质里看不到模拟人生的书籍特质，原本应该有」。根因：mod 自带
`game/overworld-town/loc-library/LibraryTraitsSims.txt`（完整定义：武器特质 / 书籍特质 /
催眠特质，含名称、颜色、`has` 条件、功能说明），但它挂在 0.4 的 traits 结构上；
0.5.12.13 的 `traits` 换成 `_traitLists` 数组后这份片段没人接，玩家只能去图书馆
「遗忘之书」看。

→ `bjxInjectTraits()` 里新增 `SIMS_BOOK_TRAITS`（10 条：命运之轮 / 无限制格斗 /
量子速读法 / 恐虐·奸奇·纳垢·色孽·帝皇注视 / 无形之术 / 置闰五行），按原版定义
**单独建一个 `.traitList` 分组**（标题「书籍特质（模拟人生）」），每条带功能说明，
未解封的显示「(未生效)」。变量不存在时整组不出现。

专项 `cdp_traits.mjs`：标题 / 生效项 / 未生效项 / 说明文本 / BJX 条目不混入，**1/1**。

**新增开关：敌人性奋增长放缓（2026-10-22 16:58）**：

BJX 选项页（小修组）新增 `$options.bjx_slowarousal`，默认关。开启后战斗初始化时把
`$enemyarousalmax` **翻倍**（500 → 1000），等效涨满速度减半；不动任何公式、不写存档。

- 落点：`gen_options_bjx.py` 的 SWITCHES + `inject_early` 里包
  `combatinit` / `maninit` / `beastCombatInit` 三个宏。
- 幂等：用 `W.bjxSlowArousalApplied === 当前 max` 做标记，combatinit 与 maninit
  双触发也只翻一次。
- 专项 `cdp_arousal.mjs`：关 → 500 / 开 → 1000 / 再初始化仍 1000，**PASS**。

### 8.17 缝纫店出售重做 + 猎手数值二改（2026-10-22 晚）

**① 衣柜「出售」模式 + 出售箱预览**（`genparts/gen_wardrobe_sale.py` → `bjx-wardrobe-sale.twee`）

原版出售箱只能「一键全卖」，且 `Wardrobe Sale Crate` 的两个批量链接（`Add outfits and send` / `Add all items and send`）里前者多余。现在：

- **选项行加「出售」**：`wardrobeClothingOptions` 在「剪开套装 (0:10)」后并列插入 `<<radiobutton "$wardrobeOption" "sell">>`，门控 `$tailorMonthlyService is "discard"`（只在缝纫店预约生效时出现）；预约结束时自动退回 `wear`。
- **逐件挑货**：`wardrobewear` 加 `sell` 分支，点一件＝放进/取出出售箱（打 `item._bjxSaleCrate` 标记，**不删除、不耗时**）；套装只能点主件（副件提示点主件）。
- **箱子预览**：衣柜出售箱区块列出箱内衣物名 + 预计金额；删除 `Add outfits and send`（修复箱保留）。
- **结算**：`Wardrobe Sale Crate` / `Result` 重声明，`$crateContents is "selected"` 只卖箱内标记件；价值统一改 `tailorClothingCost`（**显示值 = 实付值**，原版预览用 `getClothingCost` 与结算不一致）。
- 生成器读 `refs/$DOL_REF`（0.5.10.12/0.5.12.13 双线均可重放），`build_pack.py` batch 3i 计数 86→**87**。
- 专项 `cdp_wardrobe_sale.mjs`：**9/9**（radio 出现且位置正确 / 无 Add outfits / 空箱提示 / 放入标记 / 预览列名与金额 / 结算删件 / 到账）。

**② 猎手数值二改**（玩家反馈「迎合时压力创伤还是太高、吸收精华回得太少」）

| 项 | 旧 | 新 |
|---|---|---|
| 非自愿战斗减免 | 恶魔 20%、猎手 30/45/60/75/90% | 恶魔 **50%**、猎手 **50/60/70/80/95%** |
| 被内射恢复（stress/trauma/pain ×(1-r)） | 恶魔 5%、猎手 7/9/11/13/15% | 恶魔 **10%**、猎手 **10/15/20/25/30%** |

- 减免落点 `inject_early.js`，包 `stress` / `trauma` / **`combattrauma`** 三个宏，另包 **`violence`**（它直接 `<<set $stress +=>>`，绕过宏）。`orgasm` 里三处 `$stress += 100` 也改成按减免计算。
- 「再来一发」/「贪婪索取」在 `$againfail` 为 true 时**仍然显示**（`setupMidOrgasm` 会把 arousal 压到 max-1，旧条件只看满 arousal → 动作只出现一回合，错过就永久消失）。
- `controlloss` 改成 `-Math.round(25*(1-r)*10)/10`（`combatcontrol` 内部 ×10），50% → 失 125 / 95% → 失 13，不再被整数取整吃掉。
- 吸收精华额外补自控：`$control += controlmax × _bjxHeal`（恶魔/2 级 +100，6 级 +300）。
- `cdp_hunter.mjs` 断言：`<<stress 20 10>>` 6 级 → 10 / 2 级 → 100 / 自愿 → 200；`<<combattrauma 10>>` → 0.75/3.75/7.5；`violence 5` → 1/13/25；`controlloss` → 987/875/750。**20/20**。
- `cdp_heal.mjs` 期望：stress 900/900/850/800/750/700，control 100/100/150/200/250/300。

### 8.15 2026-10-23 增量：TODO 9 项 + P2 摄魂之眼 + 续杯报错 + xray 左移（**全部双绿交付**）

**背景**：`work/TODO-changes.md` 汇集了 9 项待改（吸收计数 / 自行车锻炼 / 猎手门槛 / 一键收获 / 再来一发独立页 / 催眠触发变量 / 催眠 500 文案 / 胚胎吸收判定 / 药房药品说明），本轮全部实施；另修了 `MultiCanvasModel already exists` 报错与战斗 xray 视窗布局。

**twee 侧（`genparts/`）**
- **吸收计数（任务 1）**：计数从 `internalejac` 移到 `<<creampie>>`（所有体内射精的公共出口，兽类 `bottomejacstat`/`thighejacstat` 也走它）。`gen_hunter.py` 新增 `gen_creampie()`（覆盖宿主 passage `Widgets creampie`）；恢复逻辑抽成公共 widget `bjxAbsorbHeal`，`endcombat` 与 `internalejac` 非战斗分支都调它（中文提示 + 百分比恢复 + 补自控）。
- **猎手门槛（任务 3）**：`gen_hunter.py` 上限 360→120、2→3(30)/3→4(60)/5→6(120)；4→5 仍走医院。`cdp_hunter` 旧断言（89/179/359、cap 360）同步改为 29/59/119、cap 120。
- **一键收获（任务 4）**：`gen_tending.py` 的「收获全部」payload 改为「先收集成熟地块索引 `_idxList` → `<<pass>>` → 按索引逐块收获 + 二次 `stage gte 5` 校验」，不再用点击时重 filter。
- **胚胎吸收（任务 8）**：`gen_hunter.py` 的 `:: BJX Embryo Absorb` 判定去掉 `<<for>>`+三元+临时引用（`_key` 为 undefined 时 `$sexStats[undefined]` 取空 → `_hits` 恒 0），改平铺直访 vagina/anus 两段 + `type or fetus.length` 双条件。
- **P2 摄魂之眼（催眠）**：`gen_hunter.py` 新增 `gen_speak()`（覆盖 `Widgets Actions Speak`，非自愿分支挂「催眠」动作）、`gen_traits()`（覆盖 `Traits`，加「摄魂之眼」条目）；`setupMidOrgasm` 加催眠高潮封锁 + `enemyoverarousal` 记账（`?? 0` 兜底）；`endcombat` 归零 `demonhunterhypnosis`；`gen_actions_tail.py` 的 `effects` 加催眠结算块（台词 + 置位）。
- **再来一发独立页（任务 5）**：`endcombat` **最开头**（任何 unset/清零之前）快照 `$NPCList/$npc/$enemytype/$enemynomax/$enemyhealth×0.5/$enemyarousalmax/$passage` → `$bjxAgainOffer=1`；新 passage `:: BJX Please Again` / `:: BJX Please Again Go`（还原快照 + `<<goto $bjxAgainPassage>>` + `$pleaseagain=1`）；脚部旧入口加 `$pleaseagain isnot 1` 反向条件。
- **续杯双 animateCombat**：`gen_actions_tail.py` 续杯块调 `<<ejaculation>>` 前后临时关/恢复 `$options.combatImages`（0.5 的 ejaculation 结尾自带 `<<animateCombat>>`，与同页 `actionsman` 撞 key `combatMain`）。

**inject_early.js**
- 新增 `window.bjxInjectPleaseAgain`：`$bjxAgainOffer===1` 时在战后页追加「再来一发？」（展示即清 offer 防重复）；「算了」落点取页面第一个 `a.link-internal[data-passage]`，取不到兜底 `High Street`。`onDomChanged` 调用。

**第三方 mod（`b2_adapt.py`）**
- **任务 6**：DoLSims `Temple Hypno Sims.txt` 的 `$scenePassages…includes("TempleConfessorIntro")` → `$temple_confessor_intro`（2 处，replaceAll）——`$scenePassages` 只在 base-debug 写入，正常游玩永远 undefined 导致许可拿不到、研习卡 300。
- **任务 7**：DoLSims `librarySims.twee` 研习上限的单个 `<<else>>` 拆成 `<<elseif $hypnoSims lt 500>>`（无许可）/`<<else>>`（已练满）两段文案。
- **任务 9**：i.Candy `printer.js` 药房 `linkname` 后追加 `if (drug.info) linkname += \` —— ${lanSwitch(drug.info)}\``。
- **任务 2**：新增 `apply_bicycle(data)`（正则级、passage 范围限定）：`MarketSims.twee` 的 `:: Bicycle Sims N` 内 `<<pass K>>(?=<</link>>)` → `<<pass K>><<physique ⌊K/3⌋>><<tiredness ⌊K/3⌋>>`（+156 处；**注意闭合标签是 `<</link>>` 双 `<`**）；`Farm BikeSims Farm.twee` 无 `<<pass>>`，改在抵达页 `<<effects>>` 后补 `<<physique 3>><<tiredness 3>>`。

**xray 左移 + 续杯报错**
- `style/bjx-combat-xray-left.css`（新）挂 `styleFileList`（boot.json + `update_mod_inject.build_zip` 两处清单都加了该字段）：`.combat-grid.d-grid` 的 grid 从「主画布下方横排三个 xray 视窗」改为「左侧竖排一列 + 主画布右侧」，窄屏回退原布局。
- `MultiCanvasModel already exists` 根因：魅魔/龙 6 级足部续杯在 `effectsman` 里调 `<<ejaculation>>`，0.5 的 ejaculation 结尾自带 `<<animateCombat>>`，与同页 `actionsman` 的第二次 animateCombat 撞 key。

**验证**
- `cdp_hunter.mjs` 扩到 **36/36**：P2 摄魂之眼 7 步（动作生成/一次性/等级门控/结算/高潮封锁/endcombat 归零/**战斗真实页面玩家旅程**）+ 任务 1 三步（creampie 计数 / internalejac 不再计数 / bjxAbsorbHeal 共用）+ 任务 5 五步（passage 注册 / 快照 / 一次性守卫 / 还原 / 战后注入入口）。
- `cdp_pack.mjs` 新增 `hunter-hypnosis` 步骤（traits 面板 + Street Dogs 真实战斗内选催眠结算 → **62/62**）；第三方冒烟 **22/22**（dolsims-patch / icandy-patch 含在内）。
- **dev 与发布包双绿 62/62 + 36/36 + 22/22**（`make_dist` 烘焙 33455 条 / 97.5MB；`make_zip` 130.2MB）。
- 合成环境三个坑（记录备查）：① 单独调 `<<speak>>` 前需 `<<set _mouthaction to {}>>`（0.5 由 `actionsGeneration` 初始化）；② 合成 effectsman 需给足 6 个 `$NPCList`（0.5 effectsman 尾部有 6 行裸 `[0..5].intro` set）；③ `<</link>>` 是双 `<` 前瞻别写单 `<`。

### 8.16 2026-10-23 玩家反馈「没实现」的二次修复

**第一层根因：产物与源码脱节（最要命）**
`gen_hunter.py` / `inject_early.js` 在 **09:34** 被改，但 `bjx-hunter.twee` 停在 02:57、dev HTML 停在 03:02、发布包停在 03:25 —— 玩家玩的整包**缺一整轮修复**。判断方法就是比时间戳：生成脚本 > 产物 = 一定漏跑构建。

**第二层根因：再来一发在真实打赢时不触发（真 bug）**
- `endcombat` 快照条件写的是 `$enemyhealth gt 0`，但 DoL 用 `$enemyhealth lte 0` 判胜利（`end.twee:4`）→ 真实打赢时血量是 0，**快照永不生成，入口彻底消失**。
- 改成 `$NPCList and $NPCList.length gte 1`（判敌人在场，`end.twee:590` 证实战斗结束后 NPCList 仍在）；血量改 `Math.max(50, Math.round(($enemyhealthmax || 500) * 0.5))`，避免打赢后只回 1 点血。
- `:: BJX Please Again` 去掉 `<<set $outside to 0>>`（会把室外地点清成室内，返回后地点错乱）；「算了」加 `$bjxAgainNext` 空值 fallback 到 `High Street`。

**测试盲区（为什么之前会"假绿"）**
原 `cdp_hunter` 的 `pleaseagain-snapshot` 用 `enemyhealth = 200` 造状态，和真实"打赢"正好相反。新增 `pleaseagain-real-defeat-snapshot`（`enemyhealth = 0`）断言，36→**37 项**。
新增 `work/cdp_real3.mjs`（真实路径三连）：真实怀孕对象跑 `BJX Embryo Absorb`、真实打赢跑快照、真读 `Bicycle Sims 1` passage 源码数 `<<physique>>`。dev 与发布包各 3/3。

**三项功能的实测结论（2026-10-23 10:18）**
| 功能 | 状态 | 证据 |
|---|---|---|
| 吸收胚胎 | ✅ 已修复 | 真实 `pregnancy{type:"human",fetus:[1]}` → 不再走"什么也没有"，fetus=0 / type=null / 淫乱+20 |
| 再来一发 | ✅ 已修 | 真实 `enemyhealth=0` 也生成快照（`$bjxAgainHP=250`），入口注入 + 还原均通 |
| 自行车锻炼 | ✅ 本来就有 | `Bicycle Sims 1` passage 12 处 `<<pass N>><<physique K>><<tiredness K>>`；提示汉化为「你得到了锻炼。」 |

> 自行车"没显示"的真相：功能在 02:32 的 adapted zip 里就有，但玩家包更旧；且提示是页面顶部的金色小字「你得到了锻炼。」，体质上限 6000 时骑 3 分钟只 +10（0.17%），属性面板几乎看不出来。

**验证**：dev `62/62 + 37/37 + 22/22`；发布包 97.4MB real3 `3/3`；zip 已重打。

#### 8.16.1 玩家二次反馈（同日晚些时候）

**① 猎手面板仍显示旧门槛 —— 又一处分叉源**
`gen_hunter.py` 的 `bjxHunterCheckRank` 已改成 30/60/120，但**特质面板文案在 `inject_early.js` 的 `BJX_TRAITS` 里另抄了一份硬编码**（`prog cap 360`、`进度 90/180/360`）。面板是玩家唯一能看见门槛的地方，所以"看着像没改"。
→ 已同步为 `prog cap 120`、`30/60/120`，并把"疲惫"写进恢复说明。
**教训：门槛常量至少有 3 份拷贝**（`gen_hunter.py` 检查、`inject_early.js` 面板、`cdp_hunter.mjs` 断言），改一处必须 grep 全库。

**② 吸收不回疲惫**
`bjxAbsorbHeal` 只降 `$stress/$trauma/$pain`，`bjxHunterRestore`（胚胎）同理。两处都补了 `$tiredness` 同比例削减，文案加"疲惫"。

**③ `<<bhis>>` / `<<bHe>>` 报 `Cannot read properties of undefined (reading 'monster')`**
根因在**宿主** `base-system/text.twee:660+`：两个 widget 直接写 `$NPCList[_na].monster`，没有空值保护。`$enemyno=0` 时 `_na=-1`，或 `$NPCList` 为空，就抛异常并把红字留在正文（玩家在 `:: Street Follow Sex Finish` 踩到）。
→ `gen_street.py` 新增 **S4**：给 `Street Follow Sex Finish` / `Street Follow Pet` 开头各插一条
`<<if !$NPCList or !$NPCList[0]>><<set $NPCList to [clone(setup.baseNPC)]>><</if>>`
（baseNPC 无 `monster` 字段 → widget 走 else 分支输出 "its"，文本可用）。
> 同类风险仍在：任何 `<<bhis>>` 且 NPCList 为空的 passage 都会崩。彻底方案是覆盖 `bhe/bHe/bhis` 加 optional chaining，留作后续。

**④ 自行车"看不见"的最终结论**
`Bicycle Sims 1` passage 实测 12 处 `<<pass N>><<physique K>><<tiredness K>>`，数值**确实会加**。
但 `<<physique>>` 的输出（"你得到了锻炼。"）写在 `<<link>>` 的 payload 里——跳转时被丢弃，**玩家看不到任何文字**。加上体质上限 6000、骑 3 分钟只 +10（0.17%），面板上也几乎无感。
→ 未改数值（原版海滩排球 30 分钟也才 +1 点，骑行 3 分钟 +1 已快 10 倍）；如需"看得见"应调换算或加 athletics，待玩家定。

**⑤ 并发跑 CDP 会假红**
同时开 `run_tests` 与 `cdp_hunter` 时，冒烟报 `livestock-field-render` 失败（goto 没生效、停在 Street Dogs）。单独重跑 **22/22 全绿**。以后一次只跑一套。

#### 8.16.2 「吸收胚胎」彻底重做：0.5.12.13 换了怀孕系统

**根因（这次是架构级的）**
0.5.12.13 不再用 `$sexStats.vagina.pregnancy` 作为真相来源，改成 `V.pregnancies[pregnancyId]`：

```js
playerIsPregnant()          = currentBodyPregnancies().length > 0
playerAwareTheyArePregnant()= currentBodyPregnancies().some(p => knowsPregnancy(p.pregnancyId, "pc"))
getActivePregnancies("pc")  // 唯一可信来源
clearPregnancyRecord(id)    // record.carrier = CLEARED_PREGNANCY
```

`$sexStats.vagina.pregnancy` 只是 0.4 兼容残留 —— **往里面塞 `fetus` 不会让 `playerIsPregnant()` 变真**（实测 `fetusLen=1` 时 `isPreg:false`）。所以旧 passage 永远走"什么也没有"。

**新实现**（`gen_hunter.py` 的 `EMBRYO`）
```twee
<<set _pregs to (typeof window.getActivePregnancies === "function" ? window.getActivePregnancies("pc") : [])>>
<<if _pregs and _pregs.length gt 0>>
	<<for _p range _pregs>>
		<<run window.clearPregnancyRecord(_p.pregnancyId)>>
		<<set _hits += 1>>
	<</for>>
<</if>>
```
再保留原有的 `$sexStats.vagina/anus.pregnancy` 清理（老存档兼容，两套都清不会漏）。
清完后补 `menstruationCycleState()` 让月经状态从 "pregnant" 复位。

**入口放宽**（`inject_early.js`）
`bjxInjectEmbryoLink` 原来只认 `$demon >= 6`（魅魔），纯猎手路线永远看不到「吸收腹中的胚胎」。
→ 改为 `$demon >= 6 or $demonhunter >= 2`。

**验证**（端到端，不是造状态）
`getActivePregnancies("pc")` 从 1 → 0、`playerIsPregnant()` true→false、淫乱 +20、正文不出现"什么也没有"。
固化为 `cdp_hunter` 第 38 项 `embryo-new-pregnancy-system`（造真实 record + 打 `awareOfPregnancy` 标记 + 跑 passage）。
> 注：`createPregnancy("pc","human",{...})` 在本项目里会报 `unknown donor species "undefined"`（签名是 `createPregnancy(carrier, carrierSpecies, donorSpecies, opts)`），但 record 已经被 push 进去，测试直接用它造数据即可。

**验证**：dev `62/62 + 38/38 + 22/22`；发布包已重出。

#### 8.16.3 野兽代词 widget 从根上覆盖 + 再来一发入口改正文

**① `<<bhis>>`/`<<bHe>>` 的 `monster of undefined` 不是个别 passage 的问题**
玩家第二次报错停在 `:: Residential Dog Ejaculation` 的 `<<beastejaculation>>` 里，说明**宿主 7 个 `b*` 代词 widget 全都有这个洞**（`base-system/text.twee:653-850`）：
```twee
<<set _na to $enemyno-1>>            ← $enemyno=0 时 _na=-1
<<if $NPCList[_na].monster is "monster">>   ← 直接抛 TypeError
```
→ `gen_hunter.py` 新增 `SAFE_PRONOUNS`：用**同名 widget 覆盖** `bhe/bhis/bhers/bhim/bhimself/bhes/bboy`，只加
`<<set _bjxNpc to ($NPCList and $NPCList[_na]) ? $NPCList[_na] : null>>` 与负索引归零，性别判定逐字保持原样（大写版 `bHe` 等内部调小写版，自动继承）。
空表时退化为 `it/its/beast`，不再抛错。

**② 这个报错正是「再来一发不出现」的元凶之一**
`<<beastejaculation>>` 里 widget 一崩，**后面那句 `$enemyejaculated += 1` 就不执行**（`ejaculation.twee:2491`），而 endcombat 快照条件正是 `$enemyejaculated gte 1` —— 链条断了，永远进不了快照。

**③ 战后入口从 DOM 注入改成 passage 正文**
实测 `bjxInjectPleaseAgain` 确实跑过（`$bjxAgainNext` 都写进去了），但 `#bjx-again-link` 查不到：SugarCube 在同一轮还会重渲染，append 的节点被清掉，而 `$bjxAgainOffer` 已被它清零 → 正文里的 `<<if>>` 也取到 0。
→ 改成在 `endcombat` 尾部直接写 `[[再来一发？|BJX Please Again]]`；`inject_early.js` 不再调用 `bjxInjectPleaseAgain`（函数保留备查）；快照里补 `$bjxAgainNext to "High Street"` 兜底，避免「算了」跳到 undefined。

**④ 门槛放宽到猎手**
快照条件 `$demon gte 6` → `($demon gte 6 or $demonhunter gte 2)`。纯猎手路线（demon=0）以前永远没有入口，和胚胎吸收是同一个毛病。

**⑤ 测试环境两个坑（备查）**
- `<<endcombat>>` 在 detached div 里渲染会连带 `<<endevent>>`/`<<endnpc>>` 崩（`reading 'trust'`、`Cannot convert undefined or null to object`），需要完整事件上下文 + **6 个 NPC 槽**（`V.NPCList` 只给 1 个就崩）。所以第 26 项改为对入口模板做单元渲染（offer=1 出链接 / offer=0 不出），而不是整段 endcombat。
- headless 无战斗画布时 `<<animateCombat>>` 必报错，属环境噪声，断言只查 `monster` 关键字与计数。

**验证**：dev `62/62 + 40/40 + 22/22`。

#### 8.16.5 三种特殊转化整组还原 + 完全转化监控（2026-10-23 下午）

**背景**：玩家反复指出"史莱姆肯定有加强"，逐个查证后发现 **0.4→0.5 移植时漏了三整块**。而且 `refs/` 里没有 BJX 原版——真正路径是**根目录 `Dol-BJX-Ex-main/`**（`dol星扩.html` + `源码/`），搜原版必须 `html.unescape` 解码。

**① 疼痛减免（特质「坚不可摧」）—— 已还原 + 实测**
原版在 `violence` 里：`$slime is 1/2 → _painMod *= 0.6`、`is 3 → *= 0.2`。
→ 接进 `bjxWrapMacro("violence")` 的 pain 分支。实测 1/2 级 60%、3 级 20%（`slime-pain-resist`）。
**坑**：纯史莱姆时 `scale===1`，不能用 `scale<1` 当总开关，stress 与 pain 必须各自判。

**② 窒息免疫（特质「粘液身体」）—— 已还原 + 实测**
0.5 把缺氧重写成 `<<oxygen -N>>`，所以包 `oxygen` 宏：史莱姆时负增量归零（`slime-no-asphyxia`）。

**③ 16 条特质整组缺失 —— 已补进面板**
史莱姆 6（冲击吸收/滑溜溜/粘液身体/腐蚀/感性粘液/坚不可摧）、蘑菇 5（孢子信息素/夜猫子/保护伞/真菌绽放/无尽成长）、幽灵 5（灵体化/纯灵体/冰灵体/炎灵体/深海之躯），条件与原版逐条对齐，写进 `BJX_TRAITS`。

**④ 完全转化 → 巨石呼唤 + 写日志**
`bjxFullTfCheck`（19 种动物）挂在 `transformationStateUpdate` 末尾；首次满级时正文补「森林深处的那块巨石，好像有某种存在正在吸引你」，并通过 `bjxLog` 追加到 DoL 原生「北极星记录」分页（`$journalNotes`，零侵入）。

**⑤ 还没还原的**
| 项 | 原版 | 状态 |
|---|---|---|
| 冰灵体寒冷免压力 | `_stress_mod *= 0.0` | 0.5 无该变量，需另找钩子 |
| 炎灵体炎热免疲劳 | `_tiredness_mod -= 2` | 同上 |
| 挣脱/挣扎/游泳豁免 | 11 处 `or $slime gt 0` | 已补 1 |
| 战后自愈 | `$pain -20` + wash | 待接 |
| 蘑菇 `_defence = 0` | `<<mushroomtfcheck>>` | 待查 |
| 深海之躯 | `$ghost is 4` | 待接 |

**验证**：dev `62/62 + 46/46 + 22/22`；发布包已重出。

#### 8.16.4 摄魂之眼加强 + 奇美拉改成收集式（2026-10-23 晚些时候）

**① 摄魂之眼（5 级）三处改动**
1. **90% 减伤**：`bjxHunterReduction()` 在 `$demonhunterhypnosis is 1` 时直接返回 **0.9**（盖过等级减免）。它已经被 `controlloss`（自控损失 -25）和 `orgasm`（连高潮 +100 压力）两处引用，所以这两条链立刻吃到 ×0.1。
2. **每天一次**：动作生成条件加 `($bjxHypnosisDay ?? -1) isnot Math.floor(Time.date.timeStamp / 86400)`；结算时写 `$bjxHypnosisDay`。战斗中仍靠 `$demonhunterhypnosis` 保证每场只用一次。
3. **面板数值修正**：`BJX_TRAITS` 写的是 `[30,45,60,75,90]`，而 `bjxHunterReduction()` 实际返回 `50/60/70/80/95`——**面板一直在骗人**。已同步为函数真值，催眠说明也写进条目。
> 未覆盖：`$pain` 的写入散落在 `violence` 等 widget 的 `$pain +=`，没有统一入口，没有强改。创伤同理（`combattrauma` 走独立 widget）。

**② 奇美拉：任务链改成「收集式」**
动物变形共 **19 种**（原版 5：wolf/cat/cow/harpy/fox；北极星新增 14：raccoon/bee/sheep/deer/bear/dragon/lizard/dolphin/dog/fish/horse/spider/pig/frog）。

原 mod 走「冥想 5 种 → 命名 → 三个蛋任务 → 才能叠加」，而且完全不认识北极星那 14 种。现在：
- 巨石（`:: Chimera Statue`）直接按**实际满级状态**判定可献上的形态（wolf `$wolfgirl>=6`、cat `$cat>=10`、其余 `$<name>>=6`）
- 「献上」= 写进 `$chimeraCollected` 并**清掉该形态**（`<<<name>Transform 99>>`），只清这一种
- 槽位阶梯：收集 **3→2、6→3、10→4、15→5、19→全部 19**
- 已收集的形态随时勾选/取消（`$chimeraInherit`），「同调」= `<<chimeraClear>>` + 逐个 `<<<name>Transform 1..14>>`（先把 `$<name>build` 拉 100，逐级推进比抄 parts 稳）
- 只管动物，不碰天使/恶魔/堕天使/蘑菇

**实现落点**：`gen_chimera.py` 新增 `ANIMALS` 表 + `gen_boulder()` / `gen_widgets()`，输出 `bjx-chimera_boulder.twee` / `bjx-chimera_boulderwidgets.twee`；原 `chimera.twee` **整个不再输出**（它只有 `:: Chimera Statue` 一个 passage，同时输出会触发 pack 的 duplicate passage 检查）。
新 widget：`chimeraName`（19 种中文名）、`chimeraCollect`（献上）、`chimeraToggle`（勾选，用 filter 不用不存在的 `.delete()`）、`chimeraApply`（同调）。

**③ `build_pack.py` 的文件数断言改成下限**
`assert copied_3i == 87` 是硬编码，加两个文件就崩，而且**崩了不写 boot.json**——表现为「产物文件在 tweeFileList 里但 boot.json 不列它」，运行时等于没加载（这次卡了一轮）。改成 `>= 88`。

**验证**：`cdp_chimera.mjs` **6/6**（passage 覆盖、槽位阶梯、三种可献上、收集、双形态同调、名字映射）；猎手专项 **42/42**（新增 `hypnosis-90-reduction`、`hypnosis-daily-gate`）；主回归 62/62 + 冒烟 22/22。

## 9. 交付方式
- **路径 A（推荐）**：用户在 ModLoader GUI 导入 `work/bjx-pack-1.3.0.mod.zip`（addModIndexDB + overwriteModIndexDBModList + reload 全链路已验证），另需 `ModI18N-0.5.10.12-chs-1.0.8a.mod.zip`（13MB）
- **路径 B**：`python work/update_mod_inject.py` 把 mod 预注入 HTML（二进制安全读写）
- **路径 C**：直接发 `bjx-整合包-1.3.0-开箱即玩.zip`（解压即玩，玩家侧无 360 干扰）
- 8766 根已部署 `img/` 目录：canvas 走 zip、DOM `img` 走 HTTP 两通路

## 10. 环境注意

- **win32 + bash**，命令链用 `&&`；PowerShell 的 `-Command` 参数用单引号包裹
- **360 安全卫士必须退出**才能跑 CDP（内核拦截，连 `--dump-dom` 都挂起）
- **服务器端口 8766**（8765 常被占；PowerShell `Start-Process` 起的服务不工作）
- 系统 Chrome 155 可用（360 退出后），备用 `work/tools/chrome131/`
- **无 Pillow**：PNG 处理用 `work/pngutil.py`（纯 Python），别装 PIL
- **无 git**：删除/覆盖不可回退，改大文件前先想清楚

## 11. 接手后第一件事

```bash
cd work && node run_tests.mjs "http://127.0.0.1:8766/Degrees%20of%20Lewdity.html"   # 期望「双绿」，~88s
```

两连绿说明环境没漂，再动别的。若 boot 超过 150s，先看 360 在不在跑（§10），别怀疑 mod。

**什么时候必须跑**（别白跑，也别漏跑）：

| 改动 | 主回归 62 步 | 第三方冒烟 22 步 |
|---|---|---|
| twee / genparts 生成脚本 / `inject_early.js` / `build_pack.py` | 必跑 | 建议跑（注入顺序可能受影响） |
| `b2/b4/b5/b6_adapt.py`、`patch_mod_rules.py` | 必跑 | 必跑 |
| `update_mod_inject.py` 的 LOADER_PATCHES | 必跑 | 必跑 |
| `make_dist.py`（汉化烘焙 / 重锚） | dev 不用 | **必须跑发布包那套**（烘焙会让英文锚点消失，dev 绿不代表发布包绿，§8.4） |
| 只改 `img/` 图片（i.Candy 等） | 不用 | 不用（`make_zip.py` 即可，§8.7） |
| 只改文档 / 只读代码 / 只改 `.md` | 不用 | 不用 |
