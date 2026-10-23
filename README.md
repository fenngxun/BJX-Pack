# BJX-Pack

把北极星扩展 BJX（`Dol-BJX-Ex-main`，基于 DoL 0.4.3.3 的中文魔改版）的全部模块，
移植到 **DoL 0.5.12.13 ModLoader**，合成单一 mod `bjx-pack`，再叠加 21 个第三方 mod，
产出「开箱即玩」整合包（桌面 HTML + 安卓 APK）。

**本仓库只含源码与工具**——游戏本体、原版基线、第三方 mod 包、构建产物都不入库
（见 `.gitignore`）。拿到仓库后需要自己准备外部输入才能构建。

## 规模

| 项 | 值 |
|---|---|
| 生成器 | `work/genparts/` 25 个（AST 级锚点断言，上游改了会构建失败） |
| 回归 | 62 步主回归 + 22 步第三方冒烟 + 猎手专项 46 项 |
| 构建断言 | 800+ 条 `assert`，锚点唯一性是硬门槛 |
| 汉化 | 发布包 passage 含中文 97%+ |
| 安卓 | `bjx-整合包-1.4.0-安卓.apk`（172MB，v1+v2+v3 签名） |

## 快速开始

```bash
# 外部输入（本仓库不含，需自行准备）
Dol-BJX-Ex-main/            BJX 改动集源码（0.4.3.3 基）
refs/dol-0.5.12.13-target/  移植宿主原版源码树
game/DoL-ModLoader-0.5.12.13-lyra/   宿主运行时
mod/                        第三方 mod 原始包

# 构建
cd work && DOL_REF=dol-0.5.12.13-target python build_pack.py   # ~20s，幂等
cd work && python update_mod_inject.py                          # 注入 HTML
cd work && python make_dist.py && python make_zip.py            # 发布包
cd work && python build_apk.py                                  # 安卓 APK（需工具链，见脚本头注释）

# 验证
cd work && node run_tests.mjs "http://127.0.0.1:8766/Degrees%20of%20Lewdity.html"
```

## 找东西

改代码前先定位，别 grep 半天：

```bash
python work/find.py "passage 名"       # -> 产物 twee + 生成器:行
python work/find.py --text 关键词      # 搜源码（自动跳过产物）
python work/find.py --js 函数名        # inject_early.js 索引
```

`work/CODE-MAP.md`（构建时自动刷新）有完整的「产物 → 生产者 → passage」反查表。

## 文档

| 文件 | 内容 |
|---|---|
| `AGENTS.md` | AI 行动规则：硬规则、常用命令、断言铁律 |
| `work/HANDOFF.md` | **主交接档案**：状态速览、方法论、踩坑 20 条、历史与现状 |
| `work/CODE-REVIEW-2026-10-23.md` | 代码质量审查（6.9/10，三条 P0 已修） |
| `work/SPEC-hunter-rework.md` | 恶魔猎手重做设计稿 |

## 核心设计

- **生成器而非手抄**：每个模块从上游源码整段抽取再改，上游升级自动跟过来；
  所有补丁点都有 `assert count == 1` 做锚点唯一性校验，失配即构建失败。
- **全流程幂等**：重建 = 覆盖写 + 陈旧产物按 mtime 剪枝，可以随时重跑。
- **测试性能当产品需求**：147 处 `sleep` 改 `settle()`（页面内 MutationObserver）、
  日志从百万次同步写盘改一次性落盘，回归从 200s 降到 62s。
