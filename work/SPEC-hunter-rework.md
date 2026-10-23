# 恶魔猎手重做 · 实现规格（交给实现 AI）

> 状态：**设计定稿，未动代码**
> 日期：2026-10-22
> 范围：BJX 模组「恶魔猎手」线的玩法重做（0.5.10.12 基座 / BJX-Pack 整合包）

---

## 0. 一句话

把 BJX 原版「禁欲天数 → 猎手升级」的慢节奏改成「**非自愿战斗点数 → 猎手升级**」，并给猎手加三样东西：**阶段抗性**、**主动夺回自控**、**非致命腐蚀**；另加魅魔的**继续索取**与**吸收胚胎**。

设计意图：魅魔是"被喂"（越玩越软），猎手是"被锻"（越玩越硬）。同一条线的上下半段，不是对立路线。

---

## 0.5 改动文件清单（先看这张表）

| 动作 | 文件 | 说明 |
|---|---|---|
| 新增生成函数 | `work/build_pack.py` | 加 `gen_hunter()` 写 `bjx-hunter.twee`，在 `main()` 调用 |
| 新增（生成物） | `work/bjx-pack/tweeFileList/bjx-hunter.twee` | 5 个重声明 widget + 2 个新 widget + 1 个 passage |
| 改一行 | `work/build_pack.py` 的 `gen_compat3()` | `hunterbuild` clamp `0,100` → `0,360` |
| 加补丁段 | `work/bjx-pack/scriptFileList_inject_early/inject_early.js` | 宏包裹、减免、自控、免疫、入门、厕所链接 |
| 不动 | `bjx-tf-divine.twee` / `bjx-hospital-*` / `bjx-cheats-bjx.twee` | 原样保留 |

---

## 1. 必读：这个仓库怎么工作

- 构建产物**禁止手改**。所有 `work/bjx-pack/tweeFileList/*.twee` 都由 `work/build_pack.py` 生成（幂等）。
- 新增内容 = 在 `build_pack.py` 里加一个 `gen_xxx()` 函数写文件，然后在 `main()` 里调用。
- `work/bjx-pack/boot.json` 的 `tweeFileList` 是**按目录自动重建**的（build_pack.py:2721 附近），新文件自动收录，不用手工登记。
- JS 侧补丁统一写在 `work/bjx-pack/scriptFileList_inject_early/inject_early.js`（手工维护，不生成）。
- 改完必须按顺序跑：
  ```bash
  cd work && python build_pack.py
  cd work && python update_mod_inject.py
  # 起服务器（端口必须 8766）
  cd game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill && python -m http.server 8766 &
  # 回归（先退出 360 安全卫士，否则 CDP 被拦）
  cd work && node run_tests.mjs "http://127.0.0.1:8766/Degrees%20of%20Lewdity.html"
  ```
- 参考源码在 `refs/dol-0.5.10.12-target/game/`（下文所有 `文件:行` 都指这里，除非另注）。

---

## 2. 现状盘点（BJX 原实现，已在包里）

| 位置 | 内容 | 本次处置 |
|---|---|---|
| `work/bjx-pack/tweeFileList/bjx-tf-divine.twee:12` | `hunterstart`：清神圣转化 → demonbuild=30 → demon=6 → `hunterTransform` | **保留**（作弊入口用） |
| 同上 `:19` | `hunterTransform`：demon≥6 → `demonhunter=2` + 成就；否则 demonbuild+1 | **保留**（作为"满级即转"的落点） |
| 同上 `:35` | `hunterButNotOut(n)`：case 2/3/5/99，**缺 case 4** | **不再调用**（升级判定改走新 widget） |
| `bjx-compat3.twee:159` | `<<case "hunter">>` → `hunterbuild` clamp 0~100 | **改**：clamp 0~360 |
| `bjx-hospital-events.twee:171` | 医院学催眠：£10000，需 `demonhunter is 4` → 5 | **保留原样**（4→5 唯一途径） |
| `bjx-hospital-hooks.twee:129` | `demonhunter 2~4` 时显示"要求学习催眠术" | **保留** |
| `bjx-cheats-bjx.twee:1176` | 作弊：恶魔猎手 应用 / 清除 | **保留** |
| `bjx-swarm-effects-hooks.twee:439` | 虫群战斗中 `orgasmdown lte 0 or demonhunter gte 6` | **保留**（6 级免锁的一处已实现） |
| `inject_early.js:297` | `$options.bjx_divine` 默认 true | **保留**，所有新功能都挂这个开关 |

**当前实际状态**：整条线是死代码——没有每日驱动，玩家只能靠作弊面板变 2 级，之后卡死。

---

## 3. 数值表（唯一真值来源）

### 3.1 阶段与门槛

| 阶段 | 达成条件 | 非自愿战斗减免 |
|---|---|---|
| 魅魔 6 级 | demon 满级，**立即**转猎手 2 | 50% |
| 猎手 2 级 | 进入即得（0 点） | 50% |
| 猎手 3 级 | `hunterbuild ≥ 90` | 60% |
| 猎手 4 级 | `hunterbuild ≥ 180` | 70% |
| 猎手 5 级 | **只能去医院**（£10000，需 4 级） | 80% |
| 猎手 6 级 | `hunterbuild ≥ 360` | **95%** |

### 3.2 点数

| 事件 | 点数 | 条件 |
|---|---|---|
| 被内射（阴道/肛门/口腔） | +3 | `$combat is 1 and $consensual is 0` |
| 自己高潮 | +1 | 同上 |
| 单场战斗上限 | 9 | 超出不计 |
| 自愿战斗 | 0 | 不计 |

### 3.3 自控夺回

| 阶段 | 每次主动行动 | 每场上限 |
|---|---|---|
| 2 | +8 | 120 |
| 3 | +12 | 120 |
| 4 | +16 | 120 |
| 5 | +20 | 120 |
| 6 | +24 | 120 |

（`$controlmax = 1000`，一次侵袭 `controlloss` 是 `-25`，用于校准手感）

### 3.4 其他

| 项 | 数值 |
|---|---|
| 腐蚀伤害 | 12（沿用原值），结算后**血量最低留 1** |
| 继续索取 | 每场 1 次 |
| 吸收胚胎 · 淫乱 | +20（`$promiscuity` 上限就是 100，**不要写 +100**） |
| 吸收胚胎 · 进度 | +40 |
| 吸收胚胎 · 免疫 | 7 天（`7 × 24 × 60` 分钟） |
| 吸收胚胎 · 状态恢复 | 压力/创伤/疼痛/性奋 ×0.1，自控 = 90% 满值 |
| 吸收胚胎 · 史莱姆 | `$earSlime.corruption += 30`（clamp 100） |

---

## 4. 变量

| 变量 | 范围 | 含义 | 初始化 |
|---|---|---|---|
| `$demonhunter` | 0 / 2~6 | 猎手阶段（0=不是猎手） | 已有 |
| `$hunterbuild` | 0~360 | **猎手点数**（复用原变量，语义从"信念"改为"进度"） | 已有，clamp 改 0~360 |
| `$hunterfightPoints` | 0~9 | 本场已得点数 | 新增，每场重置 |
| `$huntercontrolgain` | 0~120 | 本场已夺回自控 | 新增，每场重置 |
| `$pleaseagain` | 0/1 | 本场是否已用"继续索取" | 新增，每场重置 |
| `$bjxNoPregUntil` | 时间戳 | 免疫怀孕到期（`Time.date.timeStamp` 单位） | 新增，默认 0 |

**已废弃**：`$daynoabsorb`（不再需要）、`$hunterstreak`（从未存在过）。
`$demonabsorb` **保留**（魅魔回血仍在用）。

---

## 5. 实现清单

### P0-1 点数与升级

**前置：通用包裹助手**（本规格所有 JS 钩子都靠它，先加这一段）

```js
// 包住某个宏/ widget 的 handler：不改原文，只在外层做前后处理
function bjxWrapMacro(name, fn) {
  const m = window.Macro?.get?.(name);
  if (!m || m.__bjxWrapped) return;
  const orig = m.handler;
  m.handler = function () { return fn.call(this, orig, arguments); };
  m.__bjxWrapped = true;
}
```

> SugarCube 的 `DefineMacro` 把每个宏注册进 `Macro` 表，`handler` 可替换。DoL 的 `<<widget>>` 也是宏（`isWidget: true`），所以同一套能用。
> 调用约定：`fn(orig, args)`，`this.args` 是解析后的参数数组（可原地修改再交给 orig）。

**A. 内射 +3** —— 重声明 `internalejac`（原文 `base-system/widgets.twee:2765`，只有 10 行，整段复制后插入 3 行）：

```twee
<<widget "internalejac">>
	<<if $demon gte 6>>
		<<set $demonabsorb += 1>>
	<</if>>
	<<if $demonhunter gte 2 and $combat is 1 and $consensual is 0>>
		<<bjxHunterGain 3>>
	<</if>>
	<<if $combat isnot 1>>
		<<if $demonabsorb gte 1>>
			<<set $trauma -= (150 * $demonabsorb)>>
			<<if _args[0]>>
				<span class="lewd">You absorb the sexual essence. You feel soothed.</span>
			<</if>>
			<<set $demonabsorb to 0>>
			<<traumaclamp>>
		<</if>>
	<</if>>
<</widget>>
```

**B. 高潮 +1** —— 重声明 `orgasmcount`（原文 `base-system/orgasm.twee:1192`，5 行）：

```twee
<<widget "orgasmcount">>
	<<if _args[0]>>
		<<set $orgasmcount += _args[0]>>
		<<set $orgasmcount = Math.clamp($orgasmcount, 0, 25)>>
		<<if $demonhunter gte 2 and $combat is 1 and $consensual is 0>>
			<<bjxHunterGain 1>>
		<</if>>
	<</if>>
<</widget>>
```

**C. 加点与升级判定**

```twee
<<widget "bjxHunterGain">>
	<<set _room to Math.max(0, 9 - ($hunterfightPoints ?? 0))>>
	<<set _gain to Math.min(_args[0], _room)>>
	<<if _gain gt 0>>
		<<set $hunterfightPoints to ($hunterfightPoints ?? 0) + _gain>>
		<<set $hunterbuild to Math.min(360, ($hunterbuild ?? 0) + _gain)>>
		<<bjxHunterCheckRank>>
	<</if>>
<</widget>>

<<widget "bjxHunterCheckRank">>
	<<if $demonhunter is 2 and $hunterbuild gte 90>>
		<<set $demonhunter to 3>>
		<span class="lustful">你的体液变得愈发灼热。</span>
	<<elseif $demonhunter is 3 and $hunterbuild gte 180>>
		<<set $demonhunter to 4>>
		<span class="lustful">你的体液仿佛岩浆般沸腾。</span>
	<<elseif $demonhunter is 5 and $hunterbuild gte 360>>
		<<set $demonhunter to 6>>
		<<earnFeat "Demon Hunter Master">>
		<span class="lustful">你的身体在变异体液不断地冲刷下愈发坚韧。</span>
	<</if>>
<</widget>
```

> ⚠️ 4→5 **不在这里**，只能走医院。也不要再调用 `hunterButNotOut`（它是旧阈值，会和新逻辑打架）。

**D. 入门：满级即转** —— 在 `inject_early.js` 里包 `demonTransform` 宏：

```js
bjxWrapMacro("demonTransform", function (orig, args) {
  const out = orig.apply(this, args);
  const V = State.variables;
  if ((V.demon ?? 0) >= 6 && (V.demonhunter ?? 0) < 2 && V.options?.bjx_divine) {
    wikifier("hunterstart");   // DoL 全局 wikifier(name, ...args)，time.js 同款用法
  }
  return out;
});
```

（`hunterstart` 会设 `demon=6` 并调 `hunterTransform` → `demonhunter=2`，幂等）

### P0-2 阶段减免

**A. 自控损失** —— 重声明 `controlloss`（原文 `base-system/widgets.twee:1714`，20 行），只改一行：

```twee
<<set $controlstart to $control>><<combatcontrol -Math.round(25 * (1 - bjxHunterReduction()))>>
```

**B. 压力/创伤** —— 这两个是 JS 宏不是 widget，只能包 handler（全局生效）：

```js
function bjxHunterReduction() {
  const V = State.variables;
  if (!V || V.gamemode === "soft") return 0;
  const s = V.demonhunter ?? 0;
  if (s >= 6) return 0.95;
  if (s >= 5) return 0.80;
  if (s >= 4) return 0.70;
  if (s >= 3) return 0.60;
  if (s >= 2) return 0.50;
  if ((V.demon ?? 0) >= 6) return 0.50;
  return 0;
}

["stress", "trauma"].forEach(name => bjxWrapMacro(name, function (orig, args) {
  const V = State.variables;
  const r = bjxHunterReduction();
  if (r > 0 && V.combat === 1 && V.consensual === 0 && this.args?.length) {
    const a = Number(this.args[0]);
    if (Number.isFinite(a) && a > 0) this.args[0] = Math.max(1, Math.round(a * (1 - r)));
  }
  return orig.apply(this, args);
}));
```

> 只缩放**正数**（增加的），减压力/减创伤不放大。攻击力、伤害、击杀完全不受影响——这是硬要求。

### P0-3 自控夺回

包 `effectsman`（`base-combat/effects.twee:2`，上千行，只能包不能重声明）：

```js
const BJX_ACTIVE_ACTION = /cooperate|rub|lick|suck|kiss|tease|edge|ride|grind|stroke|seduce|whack|kick|headbutt|spray|take|grab|penispussy|penisanus/i;
const BJX_ACTION_SLOTS = ["mouthaction", "feetaction", "vaginaaction", "anusaction",
  "penisaction", "chestaction", "handaction", "thighaction", "bottomaction"];

bjxWrapMacro("effectsman", function (orig, args) {
  const V = State.variables;
  const before = BJX_ACTION_SLOTS.map(k => V[k]).filter(x => typeof x === "string" && x);
  const r = bjxHunterReduction();
  const out = orig.apply(this, args);
  if (r > 0 && V.combat === 1 && V.consensual === 0 &&
      before.some(a => BJX_ACTIVE_ACTION.test(a))) {
    const stage = Math.max(2, V.demonhunter ?? 2);
    const step = 8 + (stage - 2) * 4;                    // 8/12/16/20/24
    const used = V.huntercontrolgain ?? 0;
    const add = Math.min(step, Math.max(0, 120 - used));
    if (add > 0) {
      V.huntercontrolgain = used + add;
      V.control = Math.min(V.controlmax, V.control + add);
    }
  }
  return out;
});
```

**白名单说明**：命中"主动配合 / 主动挑逗 / 主动索取 / 主动施压"四类。排除 `rest / escape / stop / cover / plead / cry / endure / pullaway`（这些是挨着的）。

**每场重置**：包 `combatinit`：

```js
bjxWrapMacro("combatinit", function (orig, args) {
  const V = State.variables;
  V.hunterfightPoints = 0;
  V.huntercontrolgain = 0;
  V.pleaseagain = 0;
  return orig.apply(this, args);
});
```

### P0-4 非致命腐蚀

**⚠️ 2026-10-22 审计修正**：0.5 原版的 `tentacle_skin` **没有**猎手分支，腐蚀在 BJX 里是**两处**，都要补：

**① `hunterhotfluid`（主伤害源，`base-system/widgets.twee:3182`）**
BJX 独有 widget，伤害 = `_args[0] * 100`，直接扣 `$enemyhealth` / `$NPCList[i].health`，**能把敌人打死**——这就是"刷等级时把猎物烫死"的真凶。`orgasm.twee` 里 10+ 处调用（`<<hunterhotfluid 3 $penistarget>>` 等）。
→ 重声明时把两处扣血都改成 `Math.max(1, ...)`，并去掉 `_npctodefeat` 的击败逻辑。

**② `tentacle_skin`（`base-combat/tentacles/tentacle-adv.twee:2360`）**
在 0.5 原文的 holy 分支后插入 BJX 分支（`$demonhunter gte 2 and ["vagina","penis","anus","pubic"]` / `["mouth"]`），并把 `-12` 改成：

```twee
<<set _tentacle.tentaclehealth to Math.max(1, _tentacle.tentaclehealth - 12)>>
```

> 保留 `<<tentacleadvdisable _tentacle>>`（逼退不等于击杀）。**普通攻击不受影响，该打死照打死。**

### P0-5 继续索取（半自动）

重声明 `setupMidOrgasm`（原文 `base-combat/widgets.twee:491`，18 行），在原有逻辑**前面**插入：

```twee
<<widget "setupMidOrgasm">>
	<<if $demon gte 6 and $pleaseagain isnot 1 and $combat is 1 and $enemyarousal gte $enemyarousalmax>>
		<<set $enemyarousal to $enemyarousalmax - 1>>
		<<set $pleaseagain to 1>>
		<br><span class="lewd">你不肯放它走，继续索取。</span>
	<</if>>
	/* ↓ 以下为 0.5 原文，整段照抄不要改 ↓ */
	<<if $setupMidOrgasm isnot undefined and $enemyarousal gte $enemyarousalmax>>
	...
	<</if>>
<</widget>>
```

> **降级说明**：做不成"玩家主动选"——可选行动要重声明 `generateActions` 或 `ejaculation`（都上千行，上游一改就废）。当前是"高潮瞬间自动续一发，每场一次"。

### P0-6 吸收胚胎

**A. 触发入口**：不重声明厕所 passage（5 个都不小），用 JS 在 `:passagedisplay` 时往页面追加链接：

```js
const BJX_TOILETS = ["Bathroom", "School Toilets", "Shopping Centre Restroom", "Men's Toilets", "Women's Toilets"];

$(document).on(":passagedisplay", function () {
  const V = State.variables;
  if (!V || (V.demon ?? 0) < 6 || !V.options?.bjx_divine) return;
  if (!BJX_TOILETS.includes(State.passage)) return;
  if (!window.playerAwareTheyArePregnant?.()) return;
  if ($("#bjx-embryo-link").length) return;
  $("#passages").append(
    '<div id="bjx-embryo-link" class="passage"><a data-passage="BJX Embryo Absorb" class="link-internal">吸收腹中的胚胎</a></div>'
  );
});
```

> 用 `data-passage` 而不是 `<<link>>`，符合本项目测试约定。

**B. 效果 passage**（新 twee）：

```twee
:: BJX Embryo Absorb
<<set $outside to 0>><<effects>>
你把手按在小腹上。恶魔的体质开始工作——那团尚未成形的东西被当作养料，一点一点化开。
<br><br>
<<set _p to getPregnancyObject()>>
<<if _p and _p.type>>
	<<set _p.type to null>>
	<<set _p.fetus to []>>
	<<set _p.waterBreaking to false>>
	<<set _p.waterBreakingTimer to null>>
	<<set _p.timer to null>>
	<<set _p.timerEnd to null>>
	<<set _p.awareOf to null>>
	<<set _p.awareOfMultiple to null>>
	<<set _p.awareOfDetails to null>>
	<<set _p.potentialFathers to []>>
	<<set $sexStats[($player.vaginaExist ? "vagina" : "anus")].sperm to []>>
	<<restartMenstruationCycle>>
<</if>>
<<promiscuity 20>>
<<set $hunterbuild to Math.min(360, ($hunterbuild ?? 0) + 40)>>
<<bjxHunterCheckRank>>
<<set $bjxNoPregUntil to Time.date.timeStamp + 10080>>
<<bjxHunterRestore>>
<<if numberOfEarSlime()>>
	<<set $earSlime.corruption to Math.min(100, ($earSlime.corruption ?? 0) + 30)>>
	<br><span class="red">耳朵里的东西尝到了甜头，它兴奋地蠕动起来。</span>
<</if>>
<br>
<<link [[离开|$passage]]>><<endevent>><</link>>
```

> 最后那个 `$passage` 链接会指回自己，需要改成来源地点。**实现时用一个变量 `$bjxEmbryoReturn` 记录来源**，或在 4 个厕所各挂一个固定返回目标。这是本项唯一需要动脑的地方。

**C. 状态恢复**：

```twee
<<widget "bjxHunterRestore">>
	<<set $stress to Math.round($stress * 0.1)>>
	<<set $trauma to Math.round($trauma * 0.1)>>
	<<set $pain to Math.round($pain * 0.1)>>
	<<set $arousal to Math.round($arousal * 0.1)>>
	<<set $control to Math.round($controlmax * 0.9)>>
	<<clamp>>
<</widget>>
```

**D. 7 天免疫**：包 `playerPregnancyAttempt`（`03-JavaScript/04-Pregnancy/pregnancy.js:155`）：

```js
bjxWrapMacro("playerPregnancyAttempt", function (orig, args) {
  const V = State.variables;
  if (V.bjxNoPregUntil && Time.date.timeStamp < V.bjxNoPregUntil) return;
  return orig.apply(this, args);
});
```

> `Time.date.timeStamp` 的单位要在控制台核对：`<<pass 1 hour>>` 前后应差 60。如果不是分钟，`10080` 要换算。

### P1 百练之躯（6 级 · 高潮不锁行动）

原版靠改几十处 `($orgasmdown lte 0 or $demonhunter gte 6)` 实现，太重。改用一行等效：

```js
bjxWrapMacro("man", function (orig, args) {
  const V = State.variables;
  if ((V.demonhunter ?? 0) >= 6) V.orgasmdown = 0;
  return orig.apply(this, args);
});
```

> `man` 是每回合开始的动作渲染入口（`base-combat/init.twee:944`）。副作用是"仍在高潮余韵"的文本也会消失，可接受。

### P2 可选（本轮可不做）

- **摄魂之眼（5 级 · 催眠动作）**：要往 `_mouthaction` 塞一项，得重声明 `actions-speech.twee`（大）。若不做，5 级只剩减免 75%，内容偏薄。
- **魅魔「诱惑」`demonseduce`**：同样要动 `actions-speech.twee`。
- **「再来一发」做成可选行动**：要动 `generateActions`，不建议。

---

## 6. 与原版猎手的适配（改 / 删 / 留）

| 项 | 处置 |
|---|---|
| `$daynoabsorb`、14 天禁欲 | **删**（`inject_early.js` 里若已引用需一并清掉；目前包里没有） |
| `hunterButNotOut` | **保留定义但不调用**（阈值已过时，误调会跳级） |
| `hunterTransform` | 保留。注意它只在 `demonhunter is 2` 时设 `specialTransform`，作为入门已够 |
| `$hunterbuild` 语义 | 0~100「信念」→ 0~360「进度」，`bjx-compat3.twee:159` 的 clamp 必须同步 |
| 医院 £10000 | **原样不动**，4→5 唯一途径 |
| 作弊面板「恶魔猎手 应用」 | 保留，`hunterstart` 仍可用（会直接给 2 级） |
| 统计面板「复仇的信念 30+ 完全坚定」 | 在 BJX 源 `statistics.twee:901`，**包里没有**，不用改；若以后移植需改成「进度 / 360」 |

---

## 7. 构建与验证

```bash
# 1. 改 build_pack.py：新增 gen_hunter() 写 bjx-hunter.twee，并在 main() 调用
cd work && python build_pack.py          # 幂等，重跑两遍应无 diff
cd work && python update_mod_inject.py   # 测试加载的是注入后的 HTML
# 2. 起服务
cd game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill && python -m http.server 8766 &
# 3. 回归（先退 360）
cd work && node run_tests.mjs "http://127.0.0.1:8766/Degrees%20of%20Lewdity.html"
```

---

## 8. 验收清单

前置：调试菜单 → 作弊 → 恶魔猎手「应用」（得到 2 级），或 `<<set $demon to 6>><<hunterstart>>`。

1. **入门**：把 `$demon` 设到 6 并触发一次 `demonTransform`（或过一天），确认 `$demonhunter` 自动变 2、拿到成就。
2. **点数**：打一场非自愿战斗，被内射一次 → `$hunterbuild` +3；自己高潮 → +1；连打多轮确认**单场不超过 9**。
3. **升级**：调试把 `$hunterbuild` 设到 89，再得 1 点 → 变 3 级；设 179 → 4 级；确认 **4→5 不会自动升**。
4. **减免**：同一场战斗里，2 级和 6 级各被侵袭一次，比较 `$stress/$trauma/$control` 的掉幅，应约为 70% 与 10%。
5. **攻击力不受影响**：确认普通攻击伤害、击杀正常（减免只作用在被施加的压力/创伤/自控）。
6. **自控夺回**：非自愿战斗里点"主动配合/主动口交"类动作，`$control` 应上涨；一场打满后不再涨（上限 120）。
7. **腐蚀非致命**：让触手反复碰下体，确认触手血量**不会降到 0**（最低 1）。
8. **继续索取**：敌人高潮时战斗不结束、`$pleaseagain` 变 1，第二次高潮正常结束。
9. **胚胎**：设 `$player` 怀孕 + `awareOf`，去家里浴室，确认出现「吸收腹中的胚胎」；点击后怀孕清空、淫乱 +20、进度 +40、7 天内 `playerPregnancyAttempt` 不生效。
10. **史莱姆**：带耳史莱姆再做一次，确认 `$earSlime.corruption` +30 且不超过 100。

---

## 9. 红线

1. **不要手改** `work/bjx-pack/tweeFileList/*`，改 `build_pack.py`。
2. **重声明 widget 必须整段复制原文再改**，不能只写改动部分——少一行就会丢原行为。
3. **`stress`/`trauma`/`effectsman`/`man`/`demonTransform` 只能包 handler，不能重声明**（体积太大，且上游会变）。
4. **减免只作用于"被施加"的压力/创伤/自控**，绝不碰玩家输出伤害。
5. **`$promiscuity` 上限 100**，别写 +100。
6. **耳朵史莱姆的"堕落"是 `corruption`**，不是 `growth`。
7. **soft 模式（`$gamemode is "soft"`）下所有减免返回 0**。
8. 新变量一律用 `?? 0` 兜底，避免老存档炸。

---

## 10. 未决 / 已知风险

- 「继续索取」只能半自动（见 P0-5），要真·可选就得重声明巨型 widget，暂不做。
- 摄魂之眼（5 级）本轮可能缺失，5 级只剩减免，需要补 P2。
- `Time.date.timeStamp` 单位需实测确认，影响 7 天免疫的换算。
- 胚胎吸收的返回地点需要设计（`$bjxEmbryoReturn` 或四个固定目标）。
- 全程数值尚未实机验证，第 8 节的验收通过后可能还要回调（尤其是自控 +8~+24 的手感）。

---

## 附录 A · 完整移植缺口审计（2026-10-22）

对照源：`Dol-BJX-Ex-main/源码/`（37 个文件含 `demonhunter`）vs `work/bjx-pack/`（6 个）。
**结论：原版猎手在包里只移植了"骨架"，几乎所有战斗效果、文本、状态联动都没进来。**

### A0. 已经移植好的（不要重做）

| 内容 | 位置 |
|---|---|
| `hunterstart` / `hunterTransform` / `hunterButNotOut` | `bjx-tf-divine.twee:12/19/35` |
| `transform "hunter"` 分支 | `bjx-compat3.twee:159` |
| 医院学催眠（4→5） | `bjx-hospital-events.twee:171` |
| `<<demonhunter>>` 图标 widget | `bjx-hospital-events.twee:224` |
| 医院菜单入口 | `bjx-hospital-hooks.twee:129` |
| 作弊面板「恶魔猎手 应用/清除」 | `bjx-cheats-bjx.twee:1176` |
| 虫群战斗 6 级免锁 | `bjx-swarm-effects-hooks.twee:439` |
| `$options.bjx_divine` 默认 true | `inject_early.js:297` |
| 魅魔外观（succubus 角/尾/翼）、魅魔 6 级特质、强制受孕 | 0.5 原版自带，无需移植 |

### A1. 战斗数值层（**全部缺失**，优先级最高）

| # | 内容 | BJX 位置 | 现状 | 本次 |
|---|---|---|---|---|
| 1 | `hunterhotfluid` 体液灼伤（伤害 = args×100，可击杀） | `base-system/widgets.twee:3182` | ❌ 整个 widget 不存在 | **P0-4 必做** |
| 2 | `tentacle_skin` 猎手腐蚀分支（-12 血） | `base-combat/tentacles/tentacle-adv.twee:2358` | ❌ 0.5 无此分支 | **P0-4 必做** |
| 3 | 猎手高潮后回状态：`-5 pain / -50 trauma / -100 stress` | `base-system/orgasm.twee:436` | ❌ | **强烈建议做**（否则猎手没有续航，纯挨打） |
| 4 | 精液腐蚀避孕套（→ `sabotaged`）、腐蚀寄生虫/活体衣服 | `base-system/orgasm.twee:41/60/67/282/289` | ❌ | 可选（风味） |
| 5 | 被内射结算：猎手 ≥2 → `+5×pain / +300×stress / +150×trauma` | `base-combat/end.twee:29` | ❌（0.5 只有魅魔回血版 `end.twee:15`） | **必做**（否则"排斥体液"设定不存在） |
| 6 | 内射他人结算：demon≥2 且 hunter<2 → `-300/-150` | `base-combat/end.twee:57` | ❌ | 可选 |
| 7 | `orgasmtrait` 加成：猎手 ×1.4、其他 ×0.6 | `base-system/stat-changes.twee:276` | ❌ | 可选 |
| 8 | `willpowerorgasm`：猎手 ≤5 可用意志抵抗高潮 | `base-system/widgets.twee:4136` | ❌（0.5 无 `demonhunter lte 5` 条件） | **建议做**（配合"自控"主题） |
| 9 | 「忍耐」penis 动作（猎手 ≥2 解锁） | `base-system/attitudes.twee:557` | ❌ | 可选 |
| 10 | 6 级高潮后"行动自如"文本 + 免 disable | `base-combat/state.twee:256` | ❌（虫群那处已做） | 用 P1 的 `man` 钩子等效 |
| 11 | 全局 `($orgasmdown lte 0 or $demonhunter gte 6)` 绕过 | struggle 17 / actionsGeneration 22 / tentacleActionsGeneration 14 / machine 9 / vore 5 / abomination 1 / actions 1 | ❌（仅虫群 8 处做了） | 用 P1 的 `man` 钩子一次性等效 |

### A2. 动作与技能（**全部缺失**）

| # | 内容 | BJX 位置 | 本次 |
|---|---|---|---|
| 12 | 摄魂之眼「催眠」动作（5 级，锁对方高潮） | `base-combat/actions-speech.twee:88` + `attitudes.twee:434` + `effects.twee:3721` | P2 |
| 13 | 魅魔「诱惑」`demonseduce`（6 级，submission 150） | `actions-speech.twee:91` + `attitudes.twee:437` + `effects.twee:3748` | P2 |
| 14 | 「再来一发」`pleaseagain`（敌人高潮后继续） | `actionsGeneration.twee:1216` + `widgets.twee:312` | 本轮降级为 P0-5 半自动 |
| 15 | `$demonhunterhypnosis` / `$demonseduce` 变量初始化 | `variables-start.twee:313/316` | 跟着 12/13 一起做 |

### A3. 文本与展示层（**全部缺失**）

| # | 内容 | BJX 位置 | 影响 |
|---|---|---|---|
| 16 | 三条特质：恶魔猎手 / 摄魂之眼 / 百练之躯 | `base-system/overlays/traits.twee:605-625` | 玩家看不到自己是什么 |
| 17 | 镜子描述「一团复仇的烈火」 | `base-system/mirror.twee:151` | 小 |
| 18 | 身体特征描述（"你是恶魔猎手"） | `base-system/overlays/characteristics.twee:14/94` | 小 |
| 19 | 战斗台词（猎手挑衅） | `base-combat/actions-text.twee:5072` | 小 |
| 20 | 成就补发（`demonhunter≥2 → earnFeat`） | `base-system/feats.twee:520` | 小 |
| 21 | 季节事件 1 处 | `flavour-text-generators/seasonal-events.twee` | 极小 |

> 特质表是**大 widget**，直接重声明代价高。建议先用一个轻量方案：在 `traits` 面板外挂一行（同 P0-6 的 DOM 注入思路），或等上游。

### A4. 场景与系统层

| # | 内容 | BJX 位置 | 说明 |
|---|---|---|---|
| 22 | 特殊场景临时抹除猎手状态：`$real_demonhunter` 存/清/还原 | `special-olive.twee:1098/1215/1311`、`special-scarlet.twee:632/725`、`schism.twee:865/986` | 未移植 → 这些剧情里猎手能力仍生效，可能破坏剧情张力 |
| 23 | 触手世界猎手专属分支 `$tentacledemonhunter` | `overworld-forest/loc-tentacle-world/main.twee:423-484` | 整块新内容，未移植 |
| 24 | 每日驱动（`daynoabsorb` / `huntermessage`） | `base-system/time/time.js:1297-1315` | **本次重做会替代它**，不用补 |
| 25 | 老存档变量迁移 | `variables-modUpdate.twee:148-167` | 新存档不需要 |

### A5. 给实现者的排序建议

1. **P0 六项**（本文档 §5）：点数/减免/自控/腐蚀/继续索取/胚胎——这是"能玩"的底线。
2. **A1-3（高潮回状态）+ A1-5（内射惩罚）**：这两条决定猎手是"越打越硬"还是"纯挨打"，缺了手感会很空。
3. **A1-8（意志抵抗）+ A3-16（特质显示）**：让玩家能感知到成长。
4. 其余按需。
