# BJX-Pack

DoL 0.5.12.13 中文整合包：BJX 魔改全量移植 + 21 个第三方 mod，开箱即玩（桌面 HTML + 安卓 APK）。

## 整合包包含什么

**bjx-pack**（BJX 0.4.3.3 → 0.5.12.13 全量移植）
奇美拉的祝福、龙化、灵体化战斗、虫群尾、飞行、农场批量 tending、猎人/堕天分支、画布 TF、古董战斗与龙息、作弊面板等。

**第三方 mod（21 个）**

| 类别 | mod |
|---|---|
| NPC / 剧情 | WhitneyExpansion、More Love Interests、Sydney Dialogue Expansion、Sydney Bare Study、DomRobin、Remy Love Mod、BabyHawk、Eden Fence Rescue |
| 场景 / 地图 | 日落伊甸园（In the Eden After Sunset）、猫咖出租屋（Cattery）、Terraria Expand、i, Candy + Robot（唐人街 + 9 新 NPC） |
| 玩法 / 机制 | cummilk、ReOverfits、Wraith's Reflection、TimeHourglass、DefrockMod、露出拓展（MEE）、DoLSims、钓鱼人生 |
| 体验优化 | NoAutoReBuyTrash |

**其他**：ModI18N 原版汉化、全部美术资源。

## 怎么玩

1. 从 [Releases](https://github.com/fenngxun/BJX-Pack/releases) 下载整合包（桌面选 zip，安卓选 apk）。
2. 桌面版：解压后双击 `Degrees of Lewdity.html`，用 Chrome / Edge 打开。首次加载需解压约 113MB mod，等标题界面出现即可。
3. 安卓版：安装 apk 后打开。

**新内容入口**
- 奇美拉线：森林深处 → 林间巨石
- 龙化：需先完整变身过其他生物一次（build 达到 100）后解锁
- 唐人街：从商业街（Shopping Centre）进入

## 源码构建

本仓库只含构建源码与工具（`work/`），游戏本体、第三方 mod 原始包、发布产物不入库。

```bash
# 准备外部输入
Dol-BJX-Ex-main/            BJX 改动集源码
refs/dol-0.5.12.13-target/  DoL 原版源码树
game/DoL-ModLoader-*/       宿主运行时
mod/                        第三方 mod 原始包

# 构建
cd work
python build_pack.py          # 生成 bjx-pack mod
python update_mod_inject.py   # 注入 HTML
python make_dist.py           # 出整合包 HTML
python make_zip.py            # 打 zip
python build_apk.py           # 打安卓 APK
```
