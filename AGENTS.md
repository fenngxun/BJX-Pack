# AGENTS.md — BJX-Pack 项目 AI 行动规则

本项目是 BJX 模组移植（DoL 0.4.3.3 → 0.5.10.12 ModLoader）。

> **本文件由 IDE 在每个会话自动注入，所以只放「硬规则 / 命令 / 断言铁律」这类每次都必须知道的东西。**
> 状态、目录地图、方法论、坑清单、缺口清单一律写 `work/HANDOFF.md`，**不要往这里堆**——堆了会挤占上下文，也必然和 HANDOFF 飘。
> 接手先读：`work/HANDOFF.md` 的 **§0 状态速览** + **§8 历史与现状**。

## 硬规则
- 全程简体中文回复（含推理）；代码/命令/标识符英文
- **改代码先定位，别乱翻**：`python work/find.py "<passage 名或关键词>"` → 直接给出「产物 twee + 生成器:行 + 职责」。索引 `work/CODE-MAP.md`（模块表/任务表/inject_early 函数索引）+ `work/code-map.json`（3752 passage 全量反查），构建时自动刷新
- **只改源，不改产物**：`work/bjx-pack/tweeFileList/`、`genparts/_verify_*/`、`bjx-整合包-*/` 都是生成物；根目录 `.ignore` 已让 ripgrep/Grep 默认跳过它们（要搜产物加 `--no-ignore`）
- 用户 DoL 任务习惯：先给模块拆分表（含难度星级）再动手
- 构建产物不要手改——改 `work/genparts/` 生成脚本或 `work/build_pack.py`，再重跑（全幂等）
- 注入 payload 字符串拼接后 `grep -rnE '>[^>]" \+$'` 查行尾单 `>`
- 改 twee 锚点前 `repr()` 核对字节；闭合标签 `<</switch>>` 两个 `<`
- 大文件多处相似代码 edit 后 grep 验证关键断言仍存在
- **报告/交底写进 `HANDOFF.md`，不另开平行文档**；写完顺手删掉被它取代的旧段落，别让文档越滚越长

## 常用命令
```bash
# 定位（改代码第一步；不用再 grep 半天）
python work/find.py "Robin Raccoon"        # passage -> 产物 -> 生成器:行
python work/find.py 依偎                    # passage 没命中会自动降级搜源码文本
python work/find.py --text bjxHunterGain    # 源码文本搜索（已跳过产物）
python work/find.py --js ensureFeats        # inject_early.js 函数与调用点
python work/find.py --file bjx-hunter       # 产物文件 -> 生产者
python work/find.py --list                  # 全部生成器与产物
# 重建代码地图（构建时已自动跑，独立改索引时用）
cd work && python gen_code_map.py

# 服务器（根目录 polyfill 目录下，端口必须 8766）
cd game/DoL-ModLoader-0.5.12.13-lyra && python -m http.server 8790 &
# 重建 pack（幂等）
cd work && DOL_REF=dol-0.5.12.13-target python build_pack.py
# 重新注入 HTML（测试加载的是注入后的 HTML，重建后必跑！）
cd work && DOL_HOST=".../game/DoL-ModLoader-0.5.12.13-lyra/Degrees of Lewdity.html" python update_mod_inject.py
# 第三方适配包（改过 b2_adapt.py / b4_adapt.py 时按需重跑）
cd work && python b2_adapt.py && python b4_adapt.py
# i.Candy 图片（官方图包 30x30 / 横幅 180x30；先补缺图再同步到 dev + 发布包，幂等）
cd work && python gen_icandy_missing_icons.py && python sync_icandy_images.py
# 猫咖出租屋 CG 图片（73 张；只改图不用重注入 HTML）
cd work && python sync_cattery_images.py
# 重新生成「开箱即玩」发布包（汉化烘焙 + ModI18N，再打 zip）
# 版本号/路径默认值全部来自 work/bjx_version.py（默认 1.4.0，可用 BJX_VERSION 覆盖），
# 默认基座 = work/dist_base_0512.html、I18N = mod/_hosti18n/ModI18N.zip
cd work && python make_dist.py && python make_zip.py
# 需要换版本/换基座时才传环境变量（DOL_DEV / DOL_I18N / DOL_OUT / DOL_PACK_ZIP / DOL_DIST_SRC）
# 猎手/魅魔专项（46 项）/ 真实场景三连（3 项）/ 衣柜出售专项（9 项）
cd work && node cdp_hunter.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
cd work && node cdp_real3.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
cd work && node cdp_wardrobe_sale.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
# 回归测试（两套并行，~62s；需先退出 360 安全卫士）
cd work && node run_tests.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
# 单独跑（排障时）：主回归 62 步 ~87s / 第三方冒烟 22 步 ~22s
cd work && node cdp_pack.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
cd work && node cdp_mods_smoke.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
# 只跑受影响的步骤（迭代期，~20-30s；发版前仍要跑完整 61 步）
cd work && ONLY=casey,hive node cdp_pack.mjs "http://127.0.0.1:8790/Degrees%20of%20Lewdity.html"
# 覆盖度盘点（继续移植时）
python refs/coverage_check.py && python refs/widget_check.py
```

## 当前状态（一句话，详见 HANDOFF §0）
v1.4.0 定版 + 2026-10-23 增量（0.5.12.13 Lyra）：**dev 与发布包双绿 62/62 + 22/22**（猎手专项 46/46、真实场景 3/3），21 个第三方 mod，**138 twee / 3745 passage**，发布包 passage 汉化 **99.1%**（97.4MB / zip 130.0MB）。
无强制缺口；挂起项：猎手 P2 魅魔「诱惑」、宠物店买卖、i.Candy `TimeEvent('onThread')`、`img_tf_bee_*` 美术。

## 测试断言铁律（详见 HANDOFF §5）
- 文本断言用浏览器内 probe() 求值，禁止 returnByValue 传大字符串
- 链接断言用 `data-passage`；渲染期变量 setVars→goto→click 三段式
- goto 前钉死随机状态（`<<pass>>` 会重置 eventskip + danger 重掷）
- feat 断言前清 `V.objectVersion.test = 0`（反作弊混淆锁，属性名 `\x` 转义 grep 搜不到）

## 文档约定
- **全项目只有 `work/HANDOFF.md` 一份交接档案**（2026-10-21 已清掉三份历史平行文档），新内容一律追加或改写进它。
- 挂起/未修项集中在 HANDOFF **§0「已知遗留」** 索引 + 对应 §8.x 详情；别另开文件记 TODO。
