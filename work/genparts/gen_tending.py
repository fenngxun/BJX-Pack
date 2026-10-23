# -*- coding: utf-8 -*-
"""批量耕作 / 拖拉机系统（BJX 0.4.3.3 -> DoL 0.5.10.12 pack）。

只读 0.5 目标源码（refs/dol-0.5.10.12-target/game/base-system/tending.twee）
与 BJX 源码（Dol-BJX-Ex-main/源码/base-system/tending.twee），输出写到
本脚本同目录的 _verify_tending/bjx-tending-bjx.twee。不写 TWE、不改
build_pack.py；接线时 build_pack.py 把该文件复制进 tweeFileList 即可。

移植判定（先对照 0.5 现状，避免重复搬运）
------------------------------------------------------------
0.5 已原生具备、本组**不重复移植**：
  - 单块耕 / 种 UI：tendingTillOptions、tendingPlantSeedsOptions（0.5 仍在，
    只是 display_plot 不再调用；保留定义以兼容其它 mod/存档）。
  - foodstuff 模型（setup.foodstuff / $foodstuff）、tending 子对象
    （planting_bed / growth_days / yield_multiplier / seasons /
    has_seeds / seed_name）、foodstufficon 图标、updatePlants。
  - 危险事件新机制：$phase + $phase2 + dangerEvent()（替代 BJX 的
    <<event_trigger>> 与 $weather/$statdisable 旧变量）。
  - Robin 自动浇水 / 温室 / 雪天分支（0.5 新增剧情）。
  - 单块浇水（tendingWaterPlot）与批量浇水（tendingWaterAllDryBeds）。

0.5 缺失、本组移植：
  - display_plot 的批量入口（按成熟/待种/待耕聚合，显示尺寸统计）。
  - 新 widget：tending_harvests（单块/全部收获，含拖拉机收割机加速）。
  - 新 widget：tendingPlantSeeds（单块/全部播种，含播种机加速）。
  - 新 widget：tendingTills（单块/全部耕种，含犁加速、猪粪肥料、
    批量施肥）。
  - tending_harvest：strongnose 1.5x 产量、按作物汇总 harvest_dict。
  - plot_effects：批量收获时按种类逐行汇总。
  - 拖拉机变量（$farm.tractor / tractorplough / tractorseeddrill /
    tractorharvester / tractorloader）在 display_plot 首次进入时兜底初始化。

覆盖的 0.5 widget（HANDOFF §4.4：pack 后加载覆盖）：
  - display_plot   ：0.5 单块 options -> BJX 单块+批量聚合；保留 0.5 的
                     foodstuff / Robin / Weather / error 守卫。
  - tending_harvest：增加 strongnose 加成与 harvest_dict；产量模型仍用
                     0.5 的 $settings.tendingYieldModifier / foodstuff。
  - plot_effects   ：harvest 分支改为逐种类汇总，无汇总时回退 0.5 文本。
  其余 13 个 widget 按 0.5 原文重声明（整体文件覆盖，保证 passage 内
  widget 定义集合与 0.5 一致）。

BJX 原实现中的 bug（本组修正，均已在差异清单标注）：
  1. tending_harvests 的时间守卫误用 _totalTimeToSeed（应 _totalTimeToHarvest），
     导致"雷米到来前时间不足"永不触发。
  2. tendingTills 的 _baseTiredsness 拼写错误（应为 _baseTiredness），
     拖拉机减疲劳实际不生效。
  3. tending_harvests 单块分支用 _args[1] 当索引：当 display_plot 以 "all"
     调用且只有一块成熟田时，生成 $plots["loc"]["all"] 的死链。
  4. tendingPlantSeeds 在 "all" 且只有一块兼容田（_canSeed is 1）时不生成
     任何链接；改为按"是否 all"而不是"是否多于一块"决定文案与地块集合。
  5. display_plot 的聚合按钮原为 gte 1，会与单块链接重复；改为 gte 2。
  6. tendingTills 的 <<farm_count>> 门控沿用 BJX 的 $location is "farm"，
     但农场实际值是 "alex_farm"；按 0.5 tendingTillOptions 改为 alex_farm，
     否则批量耕地不计入当日工作量。

变量翻译（HANDOFF §4.2）：
  setup.plants            -> setup.foodstuff
  $plants[...]            -> $foodstuff[...]
  $weather is "rain"      -> Weather.precipitation is "rain"
  $statdisable is "f"     -> !$settings.blindStatsEnabled
  $tending_yield_factor   -> $settings.tendingYieldModifier
  $leftarm/$rightarm      -> pcAreArmsBound("both")
  <<event_trigger>>       -> <<set $phase to Number(dangerEvent())>>
                             <<set $phase2 to "watered">>
  $_plant.season          -> $_plant.tending?.seasons
  $_plant.bed             -> $_plant.tending?.planting_bed
  $_plant.days            -> $_plant.tending?.growth_days
  $_plant.multiplier      -> $_plant.tending.yield_multiplier
  $_plant.icon            -> <<foodstufficon KEY>>
  BJX 独有变量 $pig/$pigshit/$options.bjx_animal/strongnose：
  读时 ($pig ?? 0) / 三处存在性守卫；兽化系统未移植，键缺失即不触发。

不移植项：
  - BJX display_plot 的中文状态文案（成熟/开花/幼苗/萌发/播种）：0.5 用
    foodstuff 的 seed_name 语法区分单复数，属 0.5 新增表达，保留英文原文
    交给汉化包；只新增批量按钮的中文标签。
  - BJX 的 tending_day（0.5 已删除，生长逻辑迁到 JS tending.js）、
    0.5 已有且更好的 foodstuff/图标/危险事件实现。
  - 农场升级购买页与 $farm.tractor* 的购买入口：pack 已由
    bjx-farm.twee（Farm Upgrades Tractor 1-3 / Plough / Seed Drill /
    Harvester / Loader）与 bjx-farm-hooks.twee（farm_upgrades_status
    拖拉机区块）移植，本组不重复。
  - BJX 农场页 main.twee 无独立批量按钮块：批量 UI 全在 display_plot，
    0.5 fields.twee 的 <<display_plot farm>> 调用点与 0.4.3.3 一致
    （仅 dangerEvent / pushUnique / endevent 等版本演化），无需改页面。
  - 拖拉机装载机对应的 farm_clear widget（BJX widgets.twee:2973）与
    Farm Work 的"清理农田"入口不在 tending.twee；pack 的 Farm Work 仍是
    0.5 版本，单独搬 farm_clear 不会被调用。列为残留缺口：装载机目前
    只有购买 UI，无实际效果。
"""

import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'refs', os.environ.get('DOL_REF', 'dol-0.5.10.12-target'), 'game',
                   'base-system', 'tending.twee')
BJX = os.path.join(ROOT, 'Dol-BJX-Ex-main', '源码', 'base-system',
                   'tending.twee')
PACK = os.path.join(ROOT, 'work', 'bjx-pack', 'tweeFileList')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '_verify_tending')
OUT_NAME = 'bjx-tending-bjx.twee'

# 0.5 widget 清单（顺序即文件顺序），用于结构断言。
BASE_WIDGETS = [
    'plots_init', 'add_plot', 'clear_plot', 'display_quality',
    'display_plot', 'tendingWaterPlot', 'tendingWaterAllDryBeds',
    'tendingPlantSeedsOptions', 'tendingTillOptions', 'plot_effects',
    'tending_harvest', 'tending_pick', 'tending_give',
    'tending_season_notice', 'updatePlants', 'updateFoodstuffKey',
]
# 0.5.12.13 renamed updateFoodstuffKey -> updateFoodstuffVariables and added
# foodstuffReport / harvestText right after it (still one [widget] passage).
BASE_WIDGETS_512 = (BASE_WIDGETS[:-1]
                    + ['updateFoodstuffVariables', 'foodstuffReport',
                       'harvestText'])
NEW_WIDGETS = ['tending_harvests', 'tendingPlantSeeds', 'tendingTills']
MODIFIED = ['display_plot', 'tending_harvest', 'plot_effects']


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def write(name, text):
    os.makedirs(OUT, exist_ok=True)
    if not text.endswith('\n'):
        text += '\n'
    with open(os.path.join(OUT, name), 'w', encoding='utf-8',
              newline='') as f:
        f.write(text)


def t(n, s):
    """Indent with n tabs (explicit, so whitespace is unambiguous)."""
    return ('\t' * n + s) if s else ''


def rename_local(lines):
    """New widgets use _bed/_beds so they cannot clobber display_plot's
    outer <<for _plantbed>> loop variable (temps are passage-scoped).
    Also restore $location for farm/time gates: _location is the $plots key
    ("farm"), while BJX gates on the story variable ("alex_farm")."""
    out = []
    for l in lines:
        l = l.replace('_plantbeds', '_beds').replace('_plantbed', '_bed')
        l = l.replace('_location is "alex_farm"', '$location is "alex_farm"')
        out.append(l)
    return out


def macro_balance(text):
    """Quote-aware macro nesting check. Skips /* */ comments and treats
    <<print '...'>> as one self-contained token (inner <<...>> are literal
    link markup, not macros). Returns (errors, unclosed_stack)."""
    body = re.sub(r'/\*[\s\S]*?\*/', '', text)
    toks = []
    i = 0
    while True:
        j = body.find('<<', i)
        if j < 0:
            break
        k = j + 2
        quote = None
        while k < len(body):
            c = body[k]
            if quote:
                if c == quote:
                    quote = None
            elif c in "'\"":
                quote = c
            elif body.startswith('>>', k):
                break
            k += 1
        toks.append(body[j:k + 2])
        i = k + 2
    opens = {'if', 'for', 'switch', 'capture', 'widget', 'link',
             'silently', 'script'}
    stack = []
    errs = []
    for m in toks:
        s = m[2:-2].strip()
        name = s.split(None, 1)[0] if s else ''
        if name == 'print':
            continue
        if name in opens:
            stack.append((name, s[:50]))
        elif name.startswith('/'):
            n = name[1:]
            if n not in opens:
                continue
            if not stack or stack[-1][0] != n:
                errs.append((n, stack[-1] if stack else None, s[:50]))
            else:
                stack.pop()
    return errs, stack


def passage_names(text):
    return [l[3:].strip() for l in text.split('\n') if l.startswith(':: ')]


def widget_names(text):
    return re.findall(r'<<widget "([^"]+)">>', text)


def replace_once(src, old, new, label):
    """Byte-exact anchor check: CR-free, tab-indented, unique."""
    assert '\r' not in old and '\r' not in new, label + ': CR in block'
    for line in old.split('\n'):
        lead = line[:len(line) - len(line.lstrip())]
        assert lead == '\t' * len(lead), \
            '%s: non-tab indentation %r in %r' % (label, lead, line)
    n = src.count(old)
    assert n == 1, '%s: anchor count %d != 1: %r' % (label, n, old[:80])
    return src.replace(old, new)


def widget_blocks(text):
    return {m.group(2): m.group(1) for m in re.finditer(
        r'(<<widget "([^"]+)">>[\s\S]*?<</widget>>)', text)}


# --------------------------------------------------------------- new widgets
HARVESTS = [
    t(0, '<<widget "tending_harvests">>'),
    t(1, '/* BJX pack: 收获单块或全部成熟作物。参数：地点，地块索引或 "all" */'),
    t(1, '<<set _location to _args[0]>>'),
    t(1, '<<set _allPlots to ($plots ?? [])>>'),
    t(1, '<<set _locationPlots to (_allPlots[_location] ?? [])>>'),
    t(1, '<<if _args[1] is "all">>'),
    t(2, '<<set $_plotsToHarvest to _locationPlots.filter(plot => plot.stage >= 5)>>'),
    t(1, '<<else>>'),
    t(2, '<<set $_plotsToHarvest to [_locationPlots[_args[1]]]>>'),
    t(1, '<</if>>'),
    t(1, '<<set _totalTimeToHarvest to 0>>'),
    t(1, '<<if $farm_attack_timer is 0>>'),
    t(2, '<<set $_timeUntilAttack to ((23 - Time.hour) * 60) + (60 - Time.minute)>>'),
    t(1, '<</if>>'),
    t(1, '<<for _plantbed range $_plotsToHarvest>>'),
    t(2, '<<switch _plantbed.size>>'),
    t(3, '<<case "small">> <<set _baseTime to 5>>'),
    t(3, '<<case "medium">> <<set _baseTime to 15>>'),
    t(3, '<<default>> <<set _baseTime to 60>>'),
    t(2, '<</switch>>'),
    t(2, '<<if _location is "alex_farm">>'),
    t(3, '<<set _tractor to 1>>'),
    t(3, '<<if ($farm?.tractor ?? 0) gte 3>>'),
    t(4, '<<set _baseTime = Math.round(_baseTime * 0.7)>>'),
    t(4, '<<set _tractor to 0.25>>'),
    t(3, '<<elseif ($farm?.tractor ?? 0) gte 2>>'),
    t(4, '<<set _baseTime = Math.round(_baseTime * 0.8)>>'),
    t(4, '<<set _tractor to 0.5>>'),
    t(3, '<<elseif ($farm?.tractor ?? 0) gte 1>>'),
    t(4, '<<set _baseTime = Math.round(_baseTime * 0.9)>>'),
    t(3, '<</if>>'),
    t(3, '<<if $farm?.tractorharvester is true>>'),
    t(4, '<<set _baseTime = Math.round(_baseTime * (0.5 * _tractor))>>'),
    t(3, '<</if>>'),
    t(2, '<</if>>'),
    t(2, '<<set _totalTimeToHarvest += _baseTime>>'),
    t(1, '<</for>>'),
    t(1, '<<set $_time to getTimeString(_totalTimeToHarvest)>>'),
    t(1, ''),
    t(1, '<<if pcAreArmsBound("both")>>'),
    t(2, '<span class="red">你的手臂被捆绑住了，你无法收获作物。</span>'),
    t(2, '<br>'),
    t(1, '<<elseif _location is "alex_farm" and _totalTimeToHarvest gte $_timeUntilAttack>>'),
    t(2, '<span class="pink">在雷米到来之前，你没有足够的时间收获作物。</span>'),
    t(2, '<br>'),
    t(1, '<<elseif $_plotsToHarvest.length is 1>>'),
    t(2, '<<set _plantbed to $_plotsToHarvest[0]>>'),
    t(2, '<<set _idx to _locationPlots.indexOf(_plantbed)>>'),
    t(2, '<<set $_plantedPlant to setup.foodstuff[_plantbed.plant]>>'),
    t(2, '<<if $options.images is 1>>'),
    t(3, '<<foodstufficon _plantbed.plant>>'),
    t(2, '<</if>>'),
    t(2, "<<print '<<link \"收获 ('+$_time+')\" $passage>><<pass '+_totalTimeToHarvest+'>><<set _plantbed to $plots[\"'+_location+'\"]['+_idx+']>><<tending_harvest _plantbed>><<clear_plot _plantbed>><</link>>'>>"),
    t(2, '<br>'),
    t(1, '<<elseif $_plotsToHarvest.length gte 2>>'),
    # 注意：这里生成的是「点击后才执行」的链接内容，不能用
    # `(x ?? []).filter(plot => ...)` —— SugarCube 的 <<set>> 解析器对
    # 空值合并 + 箭头函数组合会返回 undefined，<<for range undefined>>
    # 直接报 "unsupported range expression type: undefined"（玩家实测）。
    # 改成「先置空数组 + if 守卫 + 普通 function」。
    # payload 点击时才执行；渲染期临时变量须先由 <<print>> 展开成字面量。
    # 修复：先收集成熟地块索引 _idxList → 走时间 → 按索引逐块收获
    # （clear_plot 后 stage 归 0，二次校验防重复；避免 pass 期间状态刷新清空数组）。
    t(2, "<<print '<<link \"收获全部 ('+$_time+')\" $passage>>"
          "<<set _idxList to []>>"
          "<<if $plots and $plots[\"'+_location+'\"]>>"
          "<<for _i to 0; _i lt $plots[\"'+_location+'\"].length; _i++>>"
          "<<if $plots[\"'+_location+'\"][_i] and $plots[\"'+_location+'\"][_i].stage gte 5>><<run _idxList.push(_i)>><</if>>"
          "<<</for>>"
          "<<</if>>"
          "<<pass '+_totalTimeToHarvest+'>>"
          "<<for _i range _idxList>>"
          "<<set _bed to $plots[\"'+_location+'\"][_i]>>"
          "<<if _bed and _bed.stage gte 5>><<tending_harvest _bed>><<clear_plot _bed>><</if>>"
          "<<</for>>"
          "<<</link>>'>>"),
    t(2, '<br>'),
    t(1, '<</if>>'),
    t(0, '<</widget>>'),
    t(0, ''),
]

PLANTSEEDS = [
    t(0, '<<widget "tendingPlantSeeds">>'),
    t(1, '/* BJX pack: 播种单块或全部已耕空地。参数：地点，地块索引或 "all" */'),
    t(1, '<<set _location to _args[0]>>'),
    t(1, '<<set _allPlots to ($plots ?? [])>>'),
    t(1, '<<set _locationPlots to (_allPlots[_location] ?? [])>>'),
    t(1, '<<if _args[1] is "all">>'),
    t(2, '<<set _plantbeds to _locationPlots.filter(plot => plot.stage === 0 && plot.till >= 1)>>'),
    t(1, '<<else>>'),
    t(2, '<<set _plantbeds to [_locationPlots[_args[1]]]>>'),
    t(1, '<</if>>'),
    t(1, '<<set _knownPlants to ($plants_known ?? [])>>'),
    t(1, '<<if _plantbeds.length is 1 and _knownPlants.length is 0>>'),
    t(2, '在野外寻找种子来种植。'),
    t(2, '<br>'),
    t(1, '<</if>>'),
    t(1, '<<switch _location>>'),
    t(2, '<<case "farm">> <<set _irrigation to ($farm.irrigation ? $farm.irrigation : 0)>>'),
    t(2, '<<default>> <<set _irrigation to 0>>'),
    t(1, '<</switch>>'),
    t(1, '<<if $farm_attack_timer is 0>>'),
    t(2, '<<set $_timeUntilAttack to ((23 - Time.hour) * 60) + (60 - Time.minute)>>'),
    t(1, '<</if>>'),
    t(1, ''),
    t(1, '<<for _plantType range _knownPlants>>'),
    t(2, '<<set $_plant to setup.foodstuff[_plantType]>>'),
    t(2, '<<if !$_plant>>'),
    t(3, '<span class="red">Plant type \'<<print _plantType>>\' not found.</span>'),
    t(3, '<br><br>'),
    t(3, 'Please report this.'),
    t(2, '<<elseif $_plant.tending?.seasons?.includes(Time.season) or (_location is "garden" and $alex_greenhouse gte 3)>>'),
    t(3, '/* 比较土壤类型：目标地块必须与种子的 planting_bed 一致 */'),
    t(3, '<<set _canSeed to 0>>'),
    t(3, '<<set _totalTimeToSeed to 0>>'),
    t(3, '<<set _name to ($_plant.tending?.seed_name ?? $_plant.plural)>>'),
    t(3, '<<for _plantbed range _plantbeds>>'),
    t(4, '<<if $_plant.tending?.planting_bed is _plantbed.bed>>'),
    t(5, '<<set _canSeed += 1>>'),
    t(5, '<<switch _plantbed.size>>'),
    t(6, '<<case "small">> <<set _baseTime to 30>>'),
    t(6, '<<case "medium">> <<set _baseTime to 90>>'),
    t(6, '<<default>> <<set _baseTime to 180>>'),
    t(5, '<</switch>>'),
    t(5, '<<if _location is "alex_farm">>'),
    t(6, '<<set _tractor to 1>>'),
    t(6, '<<if ($farm?.tractor ?? 0) gte 3>>'),
    t(7, '<<set _baseTime = Math.round(_baseTime * 0.7)>>'),
    t(7, '<<set _tractor to 0.25>>'),
    t(6, '<<elseif ($farm?.tractor ?? 0) gte 2>>'),
    t(7, '<<set _baseTime = Math.round(_baseTime * 0.8)>>'),
    t(7, '<<set _tractor to 0.5>>'),
    t(6, '<<elseif ($farm?.tractor ?? 0) gte 1>>'),
    t(7, '<<set _baseTime = Math.round(_baseTime * 0.9)>>'),
    t(6, '<</if>>'),
    t(6, '<<if $farm?.tractorseeddrill is true>>'),
    t(7, '<<set _baseTime = Math.round(_baseTime * (0.5 * _tractor))>>'),
    t(6, '<</if>>'),
    t(5, '<</if>>'),
    t(5, '<<set _totalTimeToSeed += _baseTime>>'),
    t(4, '<</if>>'),
    t(3, '<</for>>'),
    t(3, '<<if _canSeed gte 1>>'),
    t(4, '<<if pcAreArmsBound("both")>>'),
    t(5, '<span class="red">你的手臂被捆绑住了，你无法进行播种。</span>'),
    t(5, '<br>'),
    t(4, '<<elseif _location is "alex_farm" and _totalTimeToSeed gte $_timeUntilAttack>>'),
    t(5, '<span class="pink">在雷米到来之前，你没有足够的时间播种。</span>'),
    t(5, '<br>'),
    t(4, '<<else>>'),
    t(5, '<<set $_time to getTimeString(_totalTimeToSeed)>>'),
    t(5, '<<if _args[1] is "all">>'),
    t(6, '<<if _canSeed gt 1>>'),
    t(7, '<<set _textout to "全部种植" + _name + " (" + $_time + ")">>'),
    t(6, '<<else>>'),
    t(7, '<<set _textout to "种植" + _name + " (" + $_time + ")">>'),
    t(6, '<</if>>'),
    t(6, '<<set _bedsString to "<<set _plantbeds to ($plots[\'" + _location + "\'] ?? []).filter(plot => plot.stage === 0 && plot.till >= 1)>>">>'),
    t(5, '<<else>>'),
    t(6, '<<set _textout to "种植" + _name + " (" + $_time + ")">>'),
    t(6, '<<set _bedsString to "<<set _plantbeds to [$plots[\'" + _location + "\'][" + _args[1] + "]]>>">>'),
    t(5, '<</if>>'),
    t(5, '<<if $options.images is 1>>'),
    t(6, '<<foodstufficon _plantType>>'),
    t(5, '<</if>>'),
    t(5, '<<print "<<link _textout $passage>><<pass " + _totalTimeToSeed + ">>" + _bedsString + "<<for _plantbed range _plantbeds>><<if _plantbed.bed is \'" + $_plant.tending?.planting_bed + "\'>><<run plantSeedsInPlot(_plantbed, \'" + _plantType + "\')>><</if>><</for>><</link>>">>'),
    t(5, '<<if !$settings.blindStatsEnabled>>'),
    t(6, '<span class="orange">(<<print ($_plant.tending?.growth_days ?? 0)>>天)</span>'),
    t(5, '<</if>>'),
    t(5, '<br>'),
    t(4, '<</if>>'),
    t(3, '<<else>>'),
    t(4, '<span class="blue"><<print _name.toLocaleUpperFirst()>>只能种植于<<print ($_plant.tending?.planting_bed ?? "?")>>。</span>'),
    t(4, '<br>'),
    t(3, '<</if>>'),
    t(2, '<<else>>'),
    t(3, '<<tending_season_notice _plantType>>'),
    t(3, '<br>'),
    t(2, '<</if>>'),
    t(1, '<</for>>'),
    t(0, '<</widget>>'),
    t(0, ''),
]

TILLS = [
    t(0, '<<widget "tendingTills">>'),
    t(1, '/* BJX pack: 耕种单块或全部未耕空地，可连带施肥。参数：地点，地块索引或 "all" */'),
    t(1, '<<set _location to _args[0]>>'),
    t(1, '<<set _allPlots to ($plots ?? [])>>'),
    t(1, '<<set _locationPlots to (_allPlots[_location] ?? [])>>'),
    t(1, '<<if _args[1] is "all">>'),
    t(2, '<<set _plantbeds to _locationPlots.filter(plot => plot.stage === 0 && plot.till === 0)>>'),
    t(1, '<<else>>'),
    t(2, '<<set _plantbeds to [_locationPlots[_args[1]]]>>'),
    t(1, '<</if>>'),
    t(1, '<<set _totalTimeToTill to 0>>'),
    t(1, '<<set _totalTirednessToTill to 0>>'),
    t(1, '<<set _totalTimeToFertilise to 0>>'),
    t(1, '<<set _totalTirednessToFertilise to 0>>'),
    t(1, '<<set _numFertilise to 0>>'),
    t(1, ''),
    t(1, '/* BJX 猪粪肥料；兽化未移植时 $pig 不存在，视为 0 */'),
    t(1, '<<if $pigshit is undefined or !$options.bjx_animal or ($pig ?? 0) lt 6>>'),
    t(2, '<<set $pigshit to 0>>'),
    t(1, '<</if>>'),
    t(1, ''),
    t(1, '<<for _plantbed range _plantbeds>>'),
    t(2, '<<if currentSkillValue(\'tending\') gte 1500>>'),
    t(3, '<<set _baseTime to 3>>'),
    t(3, '<<set _baseTiredness to 1>>'),
    t(2, '<<else>>'),
    t(3, '<<set $_ti to Math.clamp(Math.floor(currentSkillValue(\'tending\') / 200), 0, 6)>>'),
    t(3, '<<set _baseTime to [30,25,20,15,10,5,4][$_ti]>>'),
    t(3, '<<set _baseTiredness to [6,5,4,3,2,1,1][$_ti]>>'),
    t(2, '<</if>>'),
    t(2, '<<if _plantbed.size is "medium">>'),
    t(3, '<<set _baseTime *= 3>>'),
    t(3, '<<set _baseTiredness *= 2>>'),
    t(2, '<<elseif _plantbed.size is "large">>'),
    t(3, '<<set _baseTime *= 12>>'),
    t(3, '<<set _baseTiredness *= 6>>'),
    t(2, '<</if>>'),
    t(2, '<<if _location is "alex_farm">>'),
    t(3, '<<set _tractor to 1>>'),
    t(3, '<<if ($farm?.tractor ?? 0) gte 1>>'),
    t(4, '<<set _baseTiredness = Math.round(_baseTiredness * 0.8)>>'),
    t(3, '<</if>>'),
    t(3, '<<if ($farm?.tractor ?? 0) gte 3>>'),
    t(4, '<<set _baseTime = Math.round(_baseTime * 0.7)>>'),
    t(4, '<<set _tractor to 0.25>>'),
    t(3, '<<elseif ($farm?.tractor ?? 0) gte 2>>'),
    t(4, '<<set _baseTime = Math.round(_baseTime * 0.8)>>'),
    t(4, '<<set _tractor to 0.5>>'),
    t(3, '<<elseif ($farm?.tractor ?? 0) gte 1>>'),
    t(4, '<<set _baseTime = Math.round(_baseTime * 0.9)>>'),
    t(3, '<</if>>'),
    t(3, '<<if $farm?.tractorplough is true>>'),
    t(4, '<<set _baseTime = Math.round(_baseTime * (0.5 * _tractor))>>'),
    t(4, '<<set _baseTiredness = Math.round(_baseTiredness * (0.5 * _tractor))>>'),
    t(3, '<</if>>'),
    t(2, '<</if>>'),
    t(2, '<<set _totalTimeToTill += _baseTime>>'),
    t(2, '<<set _totalTirednessToTill += _baseTiredness>>'),
    t(2, '<<if ($fertiliser.current + $pigshit) gt _numFertilise and _plantbed.quality lt 4>>'),
    t(3, '<<set _numFertilise += 1>>'),
    t(3, '<<set _totalTimeToFertilise += _baseTime * 1.5>>'),
    t(3, '<<set _totalTirednessToFertilise += _baseTiredness * 1.5>>'),
    t(2, '<<else>>'),
    t(3, '<<set _totalTimeToFertilise += _baseTime>>'),
    t(3, '<<set _totalTirednessToFertilise += _baseTiredness>>'),
    t(2, '<</if>>'),
    t(1, '<</for>>'),
    t(1, '<<set _timeString to getTimeString(_totalTimeToTill)>>'),
    t(1, '<<set _timeString2 to getTimeString(_totalTimeToFertilise)>>'),
    t(1, ''),
    t(1, '<<if $farm_attack_timer is 0>>'),
    t(2, '<<set $_timeUntilAttack to ((23 - Time.hour) * 60) + (60 - Time.minute)>>'),
    t(1, '<</if>>'),
    t(1, '<<if pcAreArmsBound("both")>>'),
    t(2, '<span class="red">你的手臂被捆绑住了，你无法进行耕地。</span>'),
    t(2, '<br>'),
    t(1, '<<else>>'),
    t(2, '<<if _location is "alex_farm" and _totalTimeToTill gte $_timeUntilAttack>>'),
    t(3, '<span class="pink">在雷米到来之前，你没有足够的时间耕地。</span>'),
    t(3, '<br>'),
    t(2, '<<else>>'),
    t(3, '<<if _plantbeds.length is 1>>'),
    t(4, '<<set _textout to "耕种 (" + _timeString + ")">>'),
    t(3, '<<else>>'),
    t(4, '<<set _textout to "全部耕种 (" + _timeString + ")">>'),
    t(3, '<</if>>'),
    t(3, '<<if _args[1] is "all">>'),
    t(4, '<<set _bedsString to "<<set _plantbeds to ($plots[\'" + _location + "\'] ?? []).filter(plot => plot.stage === 0 && plot.till === 0)>>">>'),
    t(3, '<<else>>'),
    t(4, '<<set _bedsString to "<<set _plantbeds to [$plots[\'" + _location + "\'][" + _args[1] + "]]>>">>'),
    t(3, '<</if>>'),
    t(3, '<<gardenicon "till">>'),
    t(3, '<<print \'<<link _textout $passage>><<set $tendingvars.plot_tilled to true>><<tiredness \'+_totalTirednessToTill+\'>><<physique \'+_totalTirednessToTill+\'>><<pass \'+_totalTimeToTill+\'>><<if $location is "alex_farm">><<farm_count \'+_totalTimeToTill+\'>><</if>>\'+_bedsString+\'<<for _plantbed range _plantbeds>><<set _plantbed.till to 1>><</for>><</link>>\'>>'),
    t(3, '<<gtiredness>>'),
    t(3, '<br>'),
    t(2, '<</if>>'),
    t(2, ''),
    t(2, '<<if ($fertiliser.current + $pigshit) gte 1 and _numFertilise gt 0 and currentSkillValue(\'tending\') gte 400>>'),
    t(3, '<<if _location is "alex_farm" and _totalTimeToFertilise gte $_timeUntilAttack>>'),
    t(4, '<span class="pink">在雷米到来之前，你没有足够的时间耕地并施肥。</span>'),
    t(4, '<br>'),
    t(3, '<<else>>'),
    t(4, '<<if _plantbeds.length is 1>>'),
    t(5, '<<set _textout to "耕种并施肥 (" + _timeString2 + ")">>'),
    t(4, '<<else>>'),
    t(5, '<<set _textout to "全部耕种并施肥 (" + _timeString2 + ")">>'),
    t(4, '<</if>>'),
    t(4, '<<if _args[1] is "all">>'),
    t(5, '<<set _bedsString to "<<set _plantbeds to ($plots[\'" + _location + "\'] ?? []).filter(plot => plot.stage === 0 && plot.till === 0)>>">>'),
    t(4, '<<else>>'),
    t(5, '<<set _bedsString to "<<set _plantbeds to [$plots[\'" + _location + "\'][" + _args[1] + "]]>>">>'),
    t(4, '<</if>>'),
    t(4, '<<gardenicon "fertiliser">>'),
    t(4, '<<print \'<<link _textout $passage>><<set $tendingvars.plot_tilled_fertiliser to true>><<tiredness \'+_totalTirednessToFertilise+\'>><<physique \'+_totalTirednessToFertilise+\'>><<pass \'+_totalTimeToFertilise+\'>><<if $location is "alex_farm">><<farm_count \'+_totalTimeToFertilise+\'>><</if>>\'+_bedsString+\'<<for _plantbed range _plantbeds>><<set _plantbed.till to 1>><</for>><<for _plantbed range _plantbeds>><<if ($fertiliser.current + $pigshit) gte 1 and _plantbed.quality lt 4>><<if $pigshit gte 1>><<set $pigshit-->><<else>><<set $fertiliser.current-->><</if>><<set $fertiliser.used++>><<set _plantbed.quality++>><<if !$backgroundTraits.includes("greenthumb")>><<if _plantbed.baseQuality is undefined>><<set _plantbed.baseQuality to clone(_plantbed.quality - 1)>><</if>><<set _plantbed.fertiliserDecay to 2>><<if _plantbed.size isnot "large">><<set _plantbed.fertiliserDecay++>><</if>><</if>><</if>><</for>><</link>>\'>>'),
    t(4, '<<gtiredness>>'),
    t(4, '<br>'),
    t(3, '<</if>>'),
    t(2, '<</if>>'),
    t(1, '<</if>>'),
    t(0, '<</widget>>'),
    t(0, ''),
]

# ------------------------------------------------------------- display_plot
DISPLAY = [
    t(0, '<<widget "display_plot">>/*Argument is the plot location you want to display.*/'),
    t(1, '<<set _location to _args[0]>>'),
    t(1, '<<set _allPlots to ($plots ?? [])>>'),
    t(1, '<<set $_plotsHere to (_allPlots[_location] ?? [])>>'),
    t(1, '<<set _harvest_needed to 0>>'),
    t(1, '<<set _seed_needed to 0>>'),
    t(1, '<<set _till_needed to 0>>'),
    t(1, '<<set _water_needed to 0>>'),
    t(1, '/* BJX pack: 拖拉机/机具标记（BJX tending）*/'),
    t(1, '<<if $farm isnot undefined>>'),
    t(2, '<<if $farm.tractor is undefined>>'),
    t(3, '<<set $farm.tractor to 0>>'),
    t(3, '<<set $farm.tractorplough to false>>'),
    t(3, '<<set $farm.tractorseeddrill to false>>'),
    t(3, '<<set $farm.tractorharvester to false>>'),
    t(3, '<<set $farm.tractorloader to false>>'),
    t(2, '<</if>>'),
    t(1, '<</if>>'),
    t(1, '<<set _number_small to 0>>'),
    t(1, '<<set _number_medium to 0>>'),
    t(1, '<<set _number_large to 0>>'),
    t(1, '<<for _plantbed range $_plotsHere>>'),
    t(2, '<<switch _plantbed.size>>'),
    t(3, '<<case "small">> <<set _number_small += 1>>'),
    t(3, '<<case "medium">> <<set _number_medium += 1>>'),
    t(3, '<<default>> <<set _number_large += 1>>'),
    t(2, '<</switch>>'),
    t(1, '<</for>>'),
    t(1, '这里有:'),
    t(1, '<br>'),
    t(1, '<<if _number_small gte 1>>'),
    t(2, '<<print _number_small>>块可供耕种的<span class="lblue">苗圃</span>。'),
    t(2, '<br>'),
    t(1, '<</if>>'),
    t(1, '<<if _number_medium gte 1>>'),
    t(2, '<<print _number_medium>>块可供耕种的<span class="teal">菜田</span>。'),
    t(2, '<br>'),
    t(1, '<</if>>'),
    t(1, '<<if _number_large gte 1>>'),
    t(2, '<<print _number_large>>块可供耕种的<span class="green">农田</span>。'),
    t(2, '<br>'),
    t(1, '<</if>>'),
    t(1, '<<if $fertiliser.current + $fertiliser.used gt 0>>'),
    t(2, 'You have <<number $fertiliser.current>> fertiliser.'),
    t(1, '<</if>>'),
    t(1, 'Tilling time is reduced by tending skill.'),
    t(1, '<br><br>'),
    t(1, ''),
    t(1, '<<if _location is "garden" and $robin.autoWater and C.npc.Robin.trauma < 50 and ["orphanage", "garden", "bath"].includes(getRobinLocation()) and Time.hour is 16 and between(Time.minute, 30, 59) and orphanagePlotsPlanted() and !orphanagePlotsWatered() and Weather.precipitation !== "rain" and (Weather.precipitation !== "snow" or V.alex_greenhouse >= 3)>>'),
    t(2, '<span class="green">Robin is busy watering the garden for you.</span>'),
    t(2, '<br>'),
    t(2, '<<exit>>'),
    t(1, '<</if>>'),
    t(1, ''),
    t(1, '<<set $_i to 0>>'),
    t(1, ''),
    t(1, '<<for _plantbed range $_plotsHere>>'),
    t(2, '<<capture _plantbed>>'),
    t(3, '<span class="gold"><<wordify_i $_i true>> plot (<<display_quality _plantbed>>):</span>'),
    t(3, ''),
    t(3, '<<if _plantbed.stage gte 1>>'),
    t(4, '<<set $_plantedPlant to setup.foodstuff[_plantbed.plant]>>'),
    t(4, '<<if $_plantedPlant is undefined>>'),
    t(5, '<<error {'),
    t(6, 'message\t: `Could not access property from modded save. (${_plantbed.plant})`,'),
    t(5, '}>>'),
    t(5, '<<exitAll>>'),
    t(4, '<</if>>'),
    t(4, ''),
    t(4, '<<if Weather.precipitation is "rain">>'),
    t(5, '<<set _plantbed.water to 1>>'),
    t(4, '<</if>>'),
    t(3, '<</if>>'),
    t(3, ''),
    t(3, '<<if _plantbed.stage gte 5>>'),
    t(4, '<span class="green">The <<print $_plantedPlant.tending?.seed_name ? `$_plantedPlant.tending.seed_name is` : `$_plantedPlant.plural are`>> flowering and ready for picking.</span>'),
    t(4, '<br>'),
    t(4, '<<set _harvest_needed += 1>>'),
    t(4, '<<tending_harvests _location $_i>>'),
    t(3, '<<elseif _plantbed.stage is 4>>'),
    t(4, '<span class="teal">The <<print $_plantedPlant.tending?.seed_name ? `$_plantedPlant.tending.seed_name is` : `$_plantedPlant.plural are`>> budding.</span>'),
    t(3, '<<elseif _plantbed.stage is 3>>'),
    t(4, '<span class="lblue">The <<print $_plantedPlant.tending?.seed_name ? `$_plantedPlant.tending.seed_name has` : `$_plantedPlant.plural have`>> grown into seedlings.</span>'),
    t(3, '<<elseif _plantbed.stage is 2>>'),
    t(4, '<span class="blue"><<print $_plantedPlant.tending?.seed_name ? `${$_plantedPlant.tending.seed_name.toUpperFirst()} sprouts` : `Thin $_plantedPlant.plural sprout`>> from the soil.</span>'),
    t(3, '<<elseif _plantbed.stage is 1>>'),
    t(4, '<span class="blue">You planted <<print $_plantedPlant.name.replace(/_/g," ")>> seeds here.</span>'),
    t(3, '<<else>>'),
    t(4, '<<if _plantbed.till gte 1>>'),
    t(5, 'The soil is ready for planting.'),
    t(5, '<br>'),
    t(5, '<<set _seed_needed += 1>>'),
    t(5, '<<tendingPlantSeeds _location $_i>>'),
    t(4, '<<else>>'),
    t(5, 'The soil is ready for tilling.'),
    t(5, '<br>'),
    t(5, '<<set _till_needed += 1>>'),
    t(5, '<<tendingTills _location $_i>>'),
    t(4, '<</if>>'),
    t(3, '<</if>>'),
    t(3, '<<if _plantbed.stage gte 1 and _plantbed.stage lt 5>>'),
    t(4, '<<if _plantbed.bed is "water">>'),
    t(5, '<br>'),
    t(4, '<<elseif _plantbed.water is 1>>'),
    t(5, '<span class="green">The <<print (_plantbed.bed is "large" ? "field" : "plot")>> is watered.</span>'),
    t(5, '<br>'),
    t(4, '<<else>>'),
    t(5, '<span class="purple">The <<print (_plantbed.bed is "large" ? "field" : "plot")>> is dry.</span>'),
    t(5, '<br>'),
    t(5, '<<tendingWaterPlot _plantbed>>'),
    t(5, '<br>'),
    t(4, '<</if>>'),
    t(3, '<</if>>'),
    t(3, '<br>'),
    t(3, ''),
    t(2, '<</capture>>'),
    t(2, '<<set $_i++>>'),
    t(1, '<</for>>'),
    t(1, ''),
    t(1, '/* BJX pack: 批量入口（单块链接已在循环内给出，>=2 才追加"全部"）*/'),
    t(1, '<<if _harvest_needed gte 2>>'),
    t(2, '<<tending_harvests _location "all">>'),
    t(1, '<</if>>'),
    t(1, '<<if _seed_needed gte 2>>'),
    t(2, '<<tendingPlantSeeds _location "all">>'),
    t(1, '<</if>>'),
    t(1, '<<if _till_needed gte 2>>'),
    t(2, '<<tendingTills _location "all">>'),
    t(1, '<</if>>'),
    t(1, ''),
    t(1, '<<if _water_needed gte 1>>'),
    t(2, '<<set _plotsToWater to $_plotsHere.filter(plot => plot.stage >= 1 && plot.stage < 5 && plot.bed !== "water" && plot.water === 0)>>'),
    t(2, '<<set _totalTimeToWater to 0>>'),
    t(2, '<<run _plotsToWater.forEach(plot => _totalTimeToWater += setup.tending.wateringTimes[plot.size])>>'),
    t(2, '<<set $_time to getTimeString(_totalTimeToWater)>>'),
    t(2, ''),
    t(2, '<<if $farm_attack_timer is 0>>'),
    t(3, '<<set $_timeUntilAttack to ((23 - Time.hour) * 60) + (60 - Time.minute)>>'),
    t(2, '<</if>>'),
    t(2, '<<if $location is "alex_farm" and _totalTimeToWater gte $_timeUntilAttack>>'),
    t(3, '<span class="pink">You won\'t have enough time to water all your fields before Remy\'s arrival.</span>'),
    t(2, '<<else>>'),
    t(3, '<<if !pcAreArmsBound("both")>>'),
    t(4, '<<gardenicon "water">>'),
    t(4, '<<link "Water all dry beds ($_time)" $passage>>'),
    t(5, '<<tendingWaterAllDryBeds _plotsToWater>><<tiredness _water_needed>><<physique _water_needed>><<tending _water_needed>>'),
    t(4, '<</link>><<gtiredness>><<gtending>>'),
    t(3, '<</if>>'),
    t(2, '<</if>>'),
    t(2, '<br>'),
    t(2, ''),
    t(1, '<</if>>'),
    t(1, ''),
    t(1, '<<if $debug is 1 and $_plotsHere.filter(plot => plot.stage > 0 && plot.stage < 5).length gte 1>>'),
    t(2, '<br>'),
    t(2, '<<link "DEBUG: Instagrow all plants here" $passage>><<run tendingInstaGrow(_location)>><</link>>'),
    t(2, '<br>'),
    t(1, '<</if>>'),
    t(0, '<</widget>>'),
    t(0, ''),
]

HEADER = """/* BJX pack: 0.5 原版 base-system/tending.twee 全文重声明，叠加 BJX
   批量耕作/播种/收获 + 拖拉机加成。
   BJX 源：Dol-BJX-Ex-main/源码/base-system/tending.twee（0.4.3.3 基）。
   覆盖 0.5 同名 widget（HANDOFF §4.4，pack 后加载覆盖）：
     display_plot   —— 单块 options 改为 单块 + 批量聚合；保留 0.5 的
                       foodstuff/Robin/Weather/error 守卫。
     tending_harvest—— 增加 strongnose 1.5x 与 harvest_dict 汇总。
     plot_effects   —— 批量收获按作物逐行汇总，无汇总时回退 0.5 文本。
   新增 widget：tending_harvests / tendingPlantSeeds / tendingTills。
   其余 13 个 widget 为 0.5 原文重声明；无新增 passage。
   BJX 原实现 bug 修正见生成脚本 work/genparts/gen_tending.py 头部。 */
"""


def build():
    base = read(REF)
    bjx = read(BJX)

    assert base.count('\r') == 0, '0.5 base must be LF'
    assert bjx.count('\r') == 0, 'BJX source must be LF'
    vps = passage_names(base)
    assert vps == ['Widgets Tending [widget]'], vps
    base_w = (BASE_WIDGETS_512
              if '<<widget "updateFoodstuffVariables">>' in base
              else BASE_WIDGETS)
    assert widget_names(base) == base_w, widget_names(base)

    # BJX source sanity: the three batch widgets really exist there.
    for w in NEW_WIDGETS:
        assert ('<<widget "%s">>' % w) in bjx, w
    assert '_baseTiredsness' in bjx  # confirms the bug we fix is real
    assert '_totalTimeToSeed gte $_timeUntilAttack' in bjx

    src = base

    # 1) display_plot 整段替换（以 tendingWaterPlot 为右边界）。
    disp_start = '<<widget "display_plot">>'
    disp_end = '\n<<widget "tendingWaterPlot">>'
    assert src.count(disp_start) == 1
    assert src.count(disp_end) == 1
    i = src.index(disp_start)
    j = src.index(disp_end)
    assert i < j
    new_block = '\n'.join(DISPLAY + rename_local(HARVESTS)
                          + rename_local(PLANTSEEDS) + rename_local(TILLS))
    new_block = new_block.rstrip('\n') + '\n'
    src = src[:i] + new_block + src[j:]

    # 2) plot_effects harvest 分支。
    # 0.5.12.13 appends <<harvestText>> (the new harvestText widget) to the
    # harvest line; keep it when present so that feature survives.
    htxt = ' <<harvestText>>' if '<<harvestText>>' in base else ''
    old_effects = (
        t(1, '<<if $tendingvars.harvest>>') + '\n'
        + t(2, 'You harvest <<number $tendingvars.harvest_amount>> <<print $tendingvars.harvest_name>>.' + htxt) + '\n'
        + t(2, '<<if $tendingvars.plotDecay>>') + '\n'
        + t(3, 'The fertiliser effect has decayed<<if $tendingvars.plotDecay is 2>> completely<</if>>.') + '\n'
        + t(2, '<</if>>') + '\n'
        + t(2, '<br>') + '\n'
        + t(1, '<</if>>')
    )
    new_effects = (
        t(1, '<<if $tendingvars.harvest>>') + '\n'
        + t(2, '/* BJX pack: 批量收获按作物逐行汇总；单块老存档回退原文 */') + '\n'
        + t(2, '<<if $tendingvars.harvest_dict isnot undefined and Object.keys($tendingvars.harvest_dict).length gte 1>>') + '\n'
        + t(3, '<<for _key range Object.keys($tendingvars.harvest_dict)>>') + '\n'
        + t(4, '你收获了<<number $tendingvars.harvest_dict[_key]>>个<<print _key>>。') + '\n'
        + t(4, '<br>') + '\n'
        + t(3, '<</for>>') + '\n'
        + t(2, '<<else>>') + '\n'
        + t(3, 'You harvest <<number $tendingvars.harvest_amount>> <<print $tendingvars.harvest_name>>.' + htxt) + '\n'
        + t(3, '<br>') + '\n'
        + t(2, '<</if>>') + '\n'
        + t(2, '<<set $tendingvars.harvest_dict to {}>>') + '\n'
        + t(2, '<<set $tendingvars.harvest to false>>') + '\n'
        + t(2, '<<if $tendingvars.plotDecay>>') + '\n'
        + t(3, 'The fertiliser effect has decayed<<if $tendingvars.plotDecay is 2>> completely<</if>>.') + '\n'
        + t(2, '<</if>>') + '\n'
        + t(2, '<br>') + '\n'
        + t(1, '<</if>>')
    )
    src = replace_once(src, old_effects, new_effects, 'plot_effects.harvest')

    # 3) tending_harvest：strongnose 加成。
    dflt_note = ('\t<!-- The game\'s default setting sets the '
                 'tendingYieldModifer to 5x. 1x is for the "Legacy" Hard '
                 'Mode. -->\n') if '"Legacy" Hard Mode' in base else ''
    old_yield = (
        t(1, '<<if $backgroundTraits.includes("greenthumb")>>') + '\n'
        + t(2, '<<set _tending_amount *= 1.2>>') + '\n'
        + t(1, '<</if>>') + '\n'
        + dflt_note
        + t(1, '<<set _tending_amount *= $settings.tendingYieldModifier>>')
    )
    new_yield = (
        t(1, '<<if $backgroundTraits.includes("greenthumb")>>') + '\n'
        + t(2, '<<set _tending_amount *= 1.2>>') + '\n'
        + t(1, '<</if>>') + '\n'
        + t(1, '/* BJX pack: 兽鼻（strongnose）产量加成；兽化未移植时键不存在 */') + '\n'
        + t(1, '<<if $options.bjx_animal and $transformationParts?.traits?.strongnose isnot undefined and $transformationParts?.traits?.strongnose isnot "disabled">>') + '\n'
        + t(2, '<<set _tending_amount *= 1.5>>') + '\n'
        + t(1, '<</if>>') + '\n'
        + dflt_note
        + t(1, '<<set _tending_amount *= $settings.tendingYieldModifier>>')
    )
    src = replace_once(src, old_yield, new_yield, 'tending_harvest.strongnose')

    # 4) tending_harvest：harvest_dict 汇总。
    old_harvest = t(1, '<<set $tendingvars.harvest to true>>')
    new_harvest = (
        t(1, '<<set $tendingvars.harvest to true>>') + '\n'
        + t(1, '/* BJX pack: 按作物 plural 汇总，plot_effects 一次输出 */') + '\n'
        + t(1, '<<if $tendingvars.harvest_dict is undefined>>') + '\n'
        + t(2, '<<set $tendingvars.harvest_dict to {}>>') + '\n'
        + t(1, '<</if>>') + '\n'
        + t(1, '<<if $tendingvars.harvest_dict[setup.foodstuff[$_type].plural] is undefined>>') + '\n'
        + t(2, '<<set $tendingvars.harvest_dict[setup.foodstuff[$_type].plural] to _tending_amount>>') + '\n'
        + t(1, '<<else>>') + '\n'
        + t(2, '<<set $tendingvars.harvest_dict[setup.foodstuff[$_type].plural] += _tending_amount>>') + '\n'
        + t(1, '<</if>>')
    )
    src = replace_once(src, old_harvest, new_harvest, 'tending_harvest.dict')

    # ------------------------------------------------------------- asserts
    assert src.count('\r') == 0, 'output must be LF'
    assert passage_names(src) == vps, 'passage list/order changed'
    assert src.count(':: ') == base.count(':: ')

    wnames = widget_names(src)
    expected = base_w[:5] + NEW_WIDGETS + base_w[5:]
    assert wnames == expected, wnames
    assert len(wnames) == len(set(wnames)), 'duplicate widget definition'

    # 13 untouched widgets must be byte-identical to 0.5; the 3 overrides
    # must actually differ (no silently skipped edit).
    bblocks = widget_blocks(base)
    oblocks = widget_blocks(src)
    assert set(oblocks) == set(bblocks) | set(NEW_WIDGETS)
    for w in base_w:
        if w in MODIFIED:
            assert bblocks[w] != oblocks[w], 'expected override missing: ' + w
        else:
            assert bblocks[w] == oblocks[w], 'widget changed by accident: ' + w

    for w in NEW_WIDGETS:
        assert ('<<widget "%s">>' % w) not in base, \
            '0.5 unexpectedly already has ' + w
        assert src.count('<<widget "%s">>' % w) == 1
    for w in MODIFIED:
        assert src.count('<<widget "%s">>' % w) == 1

    # translation residues
    for bad in ['setup.plants', '$tending_yield_factor', '$statdisable',
                '$weather is', '$leftarm is', 'event_trigger',
                '_baseTiredsness', '$_plant.bed', '$_plant.days',
                '$_plant.icon', '$_plant.season ']:
        assert bad not in src, 'translation residue: ' + bad

    # bug-fix presence
    assert src.count('_totalTimeToHarvest gte $_timeUntilAttack') == 1
    assert src.count('_totalTimeToSeed gte $_timeUntilAttack') == 1  # seeds
    assert '_baseTiredness = Math.round(_baseTiredness * 0.8)' in src
    assert '<<set _idx to _locationPlots.indexOf(_bed)>>' in src
    assert '$plots["\'+_location+\'"][\'+_idx+\']' in src

    # macro balance (quote-aware; catches broken hand-written blocks)
    for a, b in [('<<if ', '<</if>>'), ('<<for ', '<</for>>'),
                 ('<<switch ', '<</switch>>'), ('<<capture ', '<</capture>>'),
                 ('<<widget ', '<</widget>>'), ('<<link ', '<</link>>'),
                 ('<<silently>>', '<</silently>>')]:
        assert src.count(a) == src.count(b), \
            'unbalanced %s: %d vs %d' % (a, src.count(a), src.count(b))
    berrs, bleft = macro_balance(src)
    assert not berrs and not bleft, \
        'macro nesting broken: %r / unclosed %r' % (berrs[:3], bleft[-3:])

    # passage collision against the shipped pack (no new passages expected)
    pack_passages = {}
    pack_widgets = {}
    if os.path.isdir(PACK):
        for fn in sorted(os.listdir(PACK)):
            if not fn.endswith('.twee') or fn == OUT_NAME:
                continue
            txt = read(os.path.join(PACK, fn))
            for name in passage_names(txt):
                pack_passages.setdefault(name, fn)
            for name in widget_names(txt):
                pack_widgets.setdefault(name, fn)
    for name in passage_names(src):
        assert name not in pack_passages, \
            'passage collides with pack: %s (%s)' % (name,
                                                     pack_passages[name])
    for name in wnames:
        assert name not in pack_widgets, \
            'widget collides with pack: %s (%s)' % (name,
                                                    pack_widgets[name])

    write(OUT_NAME, HEADER + src)

    # ------------------------------------------------------------- report
    print('=== tending port ===')
    print('source : %s' % os.path.relpath(REF, ROOT))
    print('bjx    : %s' % os.path.relpath(BJX, ROOT))
    print('output : %s' % os.path.relpath(os.path.join(OUT, OUT_NAME), ROOT))
    print('ported (3): tending_harvests, tendingPlantSeeds, tendingTills')
    print('override (3): display_plot (batch UI + tractor init), '
          'tending_harvest (strongnose + harvest_dict), '
          'plot_effects (per-crop summary)')
    print('kept from 0.5 (13, byte-identical): plots_init, add_plot, '
          'clear_plot, display_quality, tendingWaterPlot, '
          'tendingWaterAllDryBeds, tendingPlantSeedsOptions, '
          'tendingTillOptions, tending_pick, tending_give, '
          'tending_season_notice, updatePlants, updateFoodstuffKey')
    print('not ported: tending_day (0.5 moved growth to tending.js); '
          'tractor purchase pages (already in pack bjx-farm*.twee); '
          'farm_clear/loader work (needs Farm Work UI, outside tending.twee); '
          'BJX per-plot Chinese flavor text (kept 0.5 foodstuff grammar)')
    print('checks: LF, 1 passage vps==ops, 19 widgets unique, '
          '4 byte anchors, 13 untouched widgets identical, '
          '0 passage/widget collision, macro balance')
    print('fixed BJX bugs (6): harvest time guard, _baseTiredsness typo, '
          '"all"+1 plot dead link, seed link lost at _canSeed==1, '
          'duplicate batch link, farm_count gate farm->alex_farm')
    print('=== end ===')


if __name__ == '__main__':
    build()
