# -*- coding: utf-8 -*-
"""B2 批次适配：为 0.5.10.12-v2.101.1 polyfill 宿主生成 .adapted.mod.zip。

处理项：
1. dependenceInfo -> []        清掉 GameVersion 上限/下限与缺失的 Simple Frameworks
2. i.Candy+Robot: $args -> _args   0.4.3.3 widget 参数语法（20 处 / 4 文件）
3. Cattery: boot.json 由 JSON5 注释态规范化为严格 JSON（ModLoader 也能读 JSON5，
   这里统一成 JSON，便于后续手术脚本解析）
4. 其余文件字节级原样复制，不 flatten（6 个包的 boot.json 均在根部）

幂等：每次都从原始 zip 重新生成。运行后需 update_mod_inject.py 重注入。
"""
import io
import json
import os
import re
import zipfile

MODDIR = r"C:\Users\79403\Desktop\dol\mod"
REANCHOR_JSON = r"C:\Users\79403\Desktop\dol\work\b2_reanchor.json"

SOURCES = [
    "Terraria.Expand.Mod.mod.zip",
    "DomRobin.mod.zip",
    "BabyHawk.mod.zip",
    "i.Candy.and.Robot.2.4.4.2.3.zip",
    "DoLSims.mod.zip",
    "Cattery1.1.8.2.for.dol0.5.10.zip",
]


def strip_json5(text):
    """去注释与尾逗号（字符串内不动），供 json.loads 使用。"""
    out, i, n = [], 0, len(text)
    in_str, quote = False, ""
    while i < n:
        c = text[i]
        if in_str:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == quote:
                in_str = False
            i += 1
            continue
        if c in "\"'":
            in_str, quote = True, c
            out.append(c)
            i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        out.append(c)
        i += 1
    return re.sub(r",(\s*[\]}])", r"\1", "".join(out))


ARG_RE = re.compile(r"\$args\b")

# 必须摘除的 inject_early 脚本：Terraria 的 alertForFramework.js 在
# afterInjectEarlyLoad 里三条分支全部 await SweetAlert2 弹窗等用户点「知道了」
# （缺 maplebirch / 有 Simple Frameworks / 都没有，都会弹）。headless 与
# 无人值守环境永不 resolve，直接卡死整个 ModLoader 启动链（boot 100s 超时）。
# 该脚本只做兼容性提示，不提供任何 addon 消费者，摘除无功能损失。
DROP_EARLY = {
    "Terraria.Expand.Mod.mod.zip": ["js/alertForFramework.js"],
}

# ---------------------------------------------------------------------------
# 兼容层 1：TimeEvent（0.4.x 旧 API，0.5.10.12 已删除，宿主 HTML 内 0 次出现）
# BabyHawk 的 hawkBabyActivity.js 末尾有未注释的
#   new TimeEvent('onMin', 'BabyHawkHuntTimer').Cond(...).Action(...)
# 顶层执行即 ReferenceError，会中断整段 user script（tw-user-script-0）→ boot 挂死。
# 这里提供最小实现：收集 Cond/Action，按 passage 切换时的时间增量补发 onMin/onHour。
TIME_SHIM = r'''/* B2 compat: TimeEvent shim (0.4.x API removed in 0.5.10.12) */
(function () {
    if (window.__b2TimeEventShim) return;
    window.__b2TimeEventShim = true;
    var reg = [];
    function BhTimeEvent(evt, id) { this.evt = evt; this.id = id; this._cond = null; this._action = null; }
    BhTimeEvent.prototype.Cond = function (fn) { this._cond = fn || null; return this; };
    BhTimeEvent.prototype.Action = function (fn) { this._action = fn || null; reg.push(this); return this; };
    window.TimeEvent = BhTimeEvent;

    function absMinute() {
        try {
            var T = window.Time;
            if (!T || !T.date) return null;
            var d = T.date;
            var day = ((d.year * 12 + d.month) * 30 + d.day);
            return (day * 24 + d.hour) * 60 + d.minute;
        } catch (e) { return null; }
    }
    var last = null;
    jQuery(document).on(':passageend', function () {
        var cur = absMinute();
        if (cur === null) return;
        if (last === null) { last = cur; return; }
        var delta = cur - last;
        if (delta <= 0) { last = cur; return; }
        last = cur;
        for (var i = 0; i < reg.length; i++) {
            var h = reg[i];
            try {
                if (h._cond && !h._cond()) continue;
                if (!h._action) continue;
                if (h.evt === 'onMin') {
                    h._action({ min: delta, hour: 0 });
                } else if (h.evt === 'onHour') {
                    var hours = Math.floor(delta / 60);
                    for (var k = 0; k < hours; k++) h._action({ min: 60, hour: 1 });
                }
            } catch (e) { console.warn('[B2 TimeEvent shim]', h.id, e); }
        }
    });
})();
'''

# ---------------------------------------------------------------------------
# 兼容层 2：Simple Frameworks（宿主无此 mod；i.Candy 的 SFRegist.js 在
# inject_early 阶段就调用 simpleFrameworks.addto，Cattery 的 cafeSF.js 同理）
# 只实现注册表 + 渲染期插槽；生命周期槽（iModInit/Ready/Done）按每页一次近似。
SF_SHIM = r'''/* B2 compat: minimal Simple Frameworks shim (host lacks the real mod) */
(function () {
    if (window.__b2SFShim) return;
    window.__b2SFShim = true;

    // lanSwitch: SF 提供的双语选择函数，i.Candy 全项目依赖（顶层就会调用）
    //   lanSwitch('EN','中') / lanSwitch(['en','中']) / lanSwitch('文本')
    function isCn() {
        var lang = (window.setup && window.setup.language) || 'CN';
        return String(lang).toUpperCase().indexOf('CN') >= 0;
    }
    if (!window.lanSwitch) {
        window.lanSwitch = function (a, b) {
            var cn = isCn();
            if (Object.prototype.toString.call(a) === '[object Array]') {
                return cn ? (a[1] !== undefined ? a[1] : a[0]) : a[0];
            }
            if (b !== undefined) return cn ? b : a;
            return a;
        };
    }
    // getLan: SF 的界面词条函数。i.Candy 的 Daiso/Storage/Pocket 用它取通用
    // 按钮文案（leave/next/drop/take/equip/unequip/move/clearall），宿主没有
    // 这个全局 —— 报 "getLan is not defined" 会中断整个 passage 渲染。
    var LAN_DICT = {
        next: ['Next', '继续'],
        leave: ['Leave', '离开'],
        drop: ['Drop', '丢下'],
        take: ['Take', '拿取'],
        equip: ['Equip', '装备'],
        unequip: ['Unequip', '卸下'],
        move: ['Move', '移动'],
        clearall: ['Clear all', '全部清空'],
    };
    if (!window.getLan) {
        window.getLan = function (key) {
            var e = LAN_DICT[key];
            if (!e) return key;
            return isCn() ? e[1] : e[0];
        };
    }
    function ensureLang() {
        try {
            if (window.setup && !window.setup.language) window.setup.language = 'CN';
        } catch (e) {}
    }
    ensureLang();

    // SelectCase: SF 提供的区间选择器。i.Candy 的 printer.js（商店物品图标）
    // 和 Xinyu Intro 都用 `new SelectCase().case([min,max], v).else(v2).has(x)`。
    // 宿主没有这个类 —— 商店页会在 printShelf 抛 ReferenceError，整页卡住。
    if (!window.SelectCase) {
        function SelectCase() {
            this._cases = [];
            this._else = undefined;
        }
        SelectCase.prototype.case = function (key, value) {
            if (Object.prototype.toString.call(key) === '[object Array]') {
                this._cases.push({ min: key[0], max: key[1], value: value });
            } else {
                this._cases.push({ min: key, max: key, value: value });
            }
            return this;
        };
        SelectCase.prototype.else = function (value) {
            this._else = value;
            return this;
        };
        SelectCase.prototype.has = function (x) {
            for (var i = 0; i < this._cases.length; i++) {
                var c = this._cases[i];
                if (x >= c.min && x <= c.max) return c.value;
            }
            return this._else;
        };
        window.SelectCase = SelectCase;
    }

    // SF 提供 String/Array 的 .has(...) 便捷方法，i.Candy 有 55 处调用。
    // 语义：this 是否「包含任一」参数（字符串用 indexOf，数组用 includes）。
    // 必须 enumerable:false —— 否则 for...in 遍历字符串/数组时会多出 'has' 键。
    function hasFn() {
        for (var i = 0; i < arguments.length; i++) {
            var needle = arguments[i];
            if (Object.prototype.toString.call(this) === '[object Array]') {
                if (this.indexOf(needle) >= 0) return true;
            } else if (String(this).indexOf(needle) >= 0) return true;
        }
        return false;
    }
    try {
        [String.prototype, Array.prototype].forEach(function (proto) {
            if (typeof proto.has !== 'function') {
                Object.defineProperty(proto, 'has', {
                    value: hasFn, enumerable: false, writable: true, configurable: true,
                });
            }
        });
    } catch (e) { console.warn('[B2 SF shim] has() patch failed', e); }

    // --- $tvar：SF 提供的「临时变量」容器。宿主 0.5.10.12 里 `tvar` 出现 0 次
    // （0.4.3.3 基线里也是 0 次），说明它不是游戏变量而是 SF 塞进去的。
    // i.Candy 有 95 处读 $tvar.scene、23 处 onselect、15 处 eventnext、15 处
    // lastPassage……缺了它 <<iCandyHeader>> 第一行就抛 TypeError，
    // icEvent.initScene() 永远不执行 —— 整个场景系统停在初始化之前。
    // 这里只补「容器」，不预设语义：undefined 与 {} 的差别只是能不能读属性，
    // 而各字段的 undefined 判断（is undefined / 真假）行为完全一致。
    function ensureTvar() {
        try {
            var SC = window.SugarCube;
            var V = SC && SC.State && SC.State.variables;
            if (!V) return false;
            if (!V.tvar || typeof V.tvar !== 'object' || Array.isArray(V.tvar)) V.tvar = {};
            if (!V.tvar.scene || typeof V.tvar.scene !== 'object' || Array.isArray(V.tvar.scene)) V.tvar.scene = {};
            return true;
        } catch (e) { return false; }
    }
    window.__b2EnsureTvar = ensureTvar;

    // SugarCube 2.30–2.35 带 Array.prototype.randompop（随机取一个并移除），
    // 0.5.10.12 用的新版已移除；i.Candy 的 shopManager.js / combatSetting.js
    // 仍在调用，报 "list.randompop is not a function"。
    try {
        if (typeof Array.prototype.randompop !== 'function') {
            Object.defineProperty(Array.prototype, 'randompop', {
                value: function () {
                    if (!this.length) return undefined;
                    return this.splice(Math.floor(Math.random() * this.length), 1)[0];
                },
                enumerable: false, writable: true, configurable: true,
            });
        }
    } catch (e) { console.warn('[B2 SF shim] randompop patch failed', e); }

    var reg = window.__b2SFReg = window.__b2SFReg || {};

    // --- NamedNPC：SF 的命名 NPC 注册 API，i.Candy 用它注册 9 个角色 ---
    // 宿主 0.5.10.12 自带 <<newNamedNpc>> widget（clone setup.baseNNPC + 初始化
    // 童贞/性别），所以这里只做「收集 + 延迟 flush」，注册逻辑完全复用官方实现。
    var npcQueue = window.__b2NpcQueue = window.__b2NpcQueue || [];
    function NamedNPC(nam, aliases, displayname, type) {
        this._c = { nam: nam };
        if (aliases) this._c.title = Array.isArray(aliases) ? aliases[0] : aliases;
        if (displayname) this._c.description = Array.isArray(displayname) ? displayname[0] : displayname;
        // 'robot' 等自定义 type 在 0.5 的 beast type 体系里不存在，统一 human
        this._c.type = 'human';
    }
    NamedNPC.prototype.Init = function (gender, age) {
        if (gender === 'm') { this._c.gender = 'male'; this._c.pronoun = 'm'; }
        else if (gender === 'f') { this._c.gender = 'female'; this._c.pronoun = 'f'; }
        if (age === 'adult') this._c.adult = 1;
        else if (age === 'teen' || age === 'tean') this._c.teen = 1;
        return this;
    };
    NamedNPC.prototype.isImportant = function () { this._c.important = true; return this; };
    NamedNPC.prototype.isSpecial = function () { this._c.special = true; return this; };
    NamedNPC.prototype.setValue = function (k, v) { if (k) this._c[k] = v; return this; };
    NamedNPC.prototype.setColour = function (hair, skin, eyes) {
        if (hair) this._c.hairColour = hair;
        if (skin) this._c.skincolour = skin;
        if (eyes) this._c.eyeColour = eyes;
        return this;
    };
    NamedNPC.prototype.setPregnancy = function () { this._c.pregnancy = true; return this; };
    NamedNPC.add = function () {
        for (var i = 0; i < arguments.length; i++) {
            if (arguments[i] && arguments[i]._c) npcQueue.push(arguments[i]._c);
        }
    };
    if (!window.NamedNPC) window.NamedNPC = NamedNPC;

    function flushNamedNPCs() {
        try {
            var SC = window.SugarCube;
            var V = SC && SC.State && SC.State.variables;
            if (!V) return false;
            if (!npcQueue.length) return true;
            if (!Array.isArray(V.NPCName) || !Array.isArray(V.NPCNameList)) return false;
            var pending = npcQueue.slice();
            var done = 0;
            for (var k = 0; k < pending.length; k++) {
                var c = pending[k];
                if (!c || !c.nam) continue;
                if (V.NPCNameList.indexOf(c.nam) >= 0) { done++; continue; }
                // 优先直接注册：clone setup.baseNNPC 后覆盖字段（baseNNPC 已含
                // gender/chastity/trauma 等默认值，无需再跑 initNNPCVirginity）
                var base = window.setup && window.setup.baseNNPC;
                if (base) {
                    var n = JSON.parse(JSON.stringify(base));
                    for (var key in c) if (Object.prototype.hasOwnProperty.call(c, key)) n[key] = c[key];
                    if (!n.description) n.description = n.nam;
                    // setup.baseNNPC 不含 pregnancy / virginity（宿主在
                    // newNamedNpc/npcNamed 初始化流程中才补），shim 直接 push
                    // 跳过了该流程，导致 npcPregnancyUpdater 读 pregnancy、
                    // relation-box 读 virginity.vaginal 时报 undefined。
                    if (!n.pregnancy) n.pregnancy = {};
                    if (!n.virginity) n.virginity = { penile: true, vaginal: true, anal: true, oral: true, kiss: true, handholding: true };
                    V.NPCName.push(n);
                    V.NPCNameList.push(n.nam);
                    done++;
                    continue;
                }
                // 退化路径：走宿主 <<newNamedNpc>> widget
                var W = window.Wikifier || (SC && SC.Wikifier);
                if (typeof W !== 'function') return false;
                V.__b2NpcTmp = c;
                var div = document.createElement('div');
                new W(div, '<<newNamedNpc $__b2NpcTmp>>');
                if (V.NPCNameList.indexOf(c.nam) >= 0) done++;
            }
            try { delete V.__b2NpcTmp; } catch (e) {}
            // 不清空队列：宿主的 <<npcNamed>> widget 每次执行都会把 $NPCName /
            // $NPCNameList 重置回原版 32 个（<<set $NPCNameList to setup.NPCNameList>>），
            // 会连带洗掉这里注册的 NPC。保留队列，下一页再补回来。
            return done > 0;
        } catch (e) {
            console.warn('[B2 SF shim] NamedNPC flush failed', e);
            return false;
        }
    }
    window.__b2FlushNamedNPCs = flushNamedNPCs;

    // 宿主 <<npcNamed>> 每次执行都会 <<set $NPCNameList to setup.NPCNameList>> 并按
    // setup.NPCNameList 重建 $NPCName。由于 $NPCNameList 与 setup.NPCNameList 是同一
    // 数组引用，注册过的名字能活下来；但重建时 title/type/description 取的是按索引
    // 排的 _tit/_tpe 字面量数组，索引 32+ 全部越界成 undefined。这里把队列里的字段
    // 在官方实现跑完之后重新贴回去。
    function reapplyNamedNPCs() {
        var V = window.SugarCube && window.SugarCube.State && window.SugarCube.State.variables;
        if (!V || !Array.isArray(V.NPCName) || !Array.isArray(V.NPCNameList)) return;
        for (var k = 0; k < npcQueue.length; k++) {
            var c = npcQueue[k];
            if (!c || !c.nam) continue;
            var idx = V.NPCNameList.indexOf(c.nam);
            if (idx < 0 || !V.NPCName[idx]) continue;
            for (var key in c) {
                if (Object.prototype.hasOwnProperty.call(c, key)) V.NPCName[idx][key] = c[key];
            }
            // 宿主 npcNamed 重建时可能重置 pregnancy / virginity，补回默认值
            if (!V.NPCName[idx].pregnancy) V.NPCName[idx].pregnancy = {};
            if (!V.NPCName[idx].virginity) V.NPCName[idx].virginity = { penile: true, vaginal: true, anal: true, oral: true, kiss: true, handholding: true };
        }
    }
    function patchNpcNamed() {
        var M = window.SugarCube && window.SugarCube.Macro;
        if (!M || typeof M.get !== 'function') return false;
        var m = M.get('npcNamed');
        if (!m || typeof m.handler !== 'function') return false;
        if (m.__b2wrapped) return true;
        var orig = m.handler;
        m.handler = function () {
            var out = orig.apply(this, arguments);
            try { reapplyNamedNPCs(); } catch (e) { console.warn('[B2 SF shim] reapply npc failed', e); }
            return out;
        };
        m.__b2wrapped = true;
        return true;
    }

    function allNpcsRegistered() {
        var V = window.SugarCube && window.SugarCube.State && window.SugarCube.State.variables;
        if (!V || !Array.isArray(V.NPCNameList)) return false;
        for (var k = 0; k < npcQueue.length; k++) {
            var c = npcQueue[k];
            if (!c || !c.nam) continue;
            if (V.NPCNameList.indexOf(c.nam) < 0) return false;
        }
        return true;
    }
    // 注册时机问题：npcSetup.js 在 scriptFileList 阶段跑，而 $NPCNameList 要到
    // <<npcNamed>> 首次执行（新游戏/Start2）才出现。只靠 :passagedisplay 会在标题页
    // 那一次就失败、之后没有第二次机会 —— 所以这里用一个短轮询兜住。
    var npcTries = 0;
    function npcBootLoop() {
        npcTries++;
        var patched = false;
        try { ensureTvar(); } catch (e) {}
        try { patched = patchNpcNamed(); } catch (e) {}
        try { flushNamedNPCs(); } catch (e) {}
        var done = npcQueue.length > 0 && allNpcsRegistered() && patched;
        var idle = npcQueue.length === 0 && npcTries > 40;
        if (done || idle || npcTries >= 240) return;
        setTimeout(npcBootLoop, 500);
    }
    try { npcBootLoop(); } catch (e) { console.warn('[B2 SF shim] npc boot loop failed', e); }

    // --- onInit 延迟触发：ModLoaderLoadEnd 早于 scriptFileList（user script）
    // 执行 —— Terraria 在钩子里 simpleFrameworks.onInit(() => terraTimeEventSF())
    // 时后者尚未定义，立即调用必 ReferenceError。收集回调，等 SugarCube 首个
    // passage 出现（user script 已跑完）再统一触发；失败的回调重新入队重试。
    function makeOnInit(owner) {
        var queue = [];
        var tries = 0;
        var loopOn = false;
        function flush() {
            if (!queue.length) return;
            var list = queue.slice();
            var failed = [];
            for (var i = 0; i < list.length; i++) {
                try { if (typeof list[i] === 'function') list[i](); }
                catch (e) { failed.push(list[i]); console.warn('[B2 SF shim] onInit callback failed', e); }
            }
            queue = failed;
        }
        function loop() {
            tries++;
            var SC = window.SugarCube;
            if (SC && SC.State && SC.State.passage) flush();
            if (!queue.length || tries >= 240) { loopOn = false; return; }
            setTimeout(loop, 500);
        }
        return function (fn) {
            if (typeof fn !== 'function') return;
            queue.push(fn);
            if (!loopOn) { loopOn = true; tries = 0; setTimeout(loop, 500); }
        };
    }

    // --- SF 插槽宏与 lanSwitch 宏：i.Candy 的 Daiso 商店/BaseScene Template
    // 直接把 <<ModShopZone>> / <<BeforeLinkZone>> / <<lanSwitch 'EN' '中'>>
    // 当宏调用（真实 SF 就是这么提供的）。宿主没有这些宏，缺了会在 passage
    // 渲染时刷 "macro <<xxx>> does not exist" 并吞掉整段内容。
    // 插槽宏的语义：在调用点就地渲染注册到该槽、且 passage 匹配的 widget。
    function renderSlotInline(slot, host) {
        var list = reg[slot] || [];
        for (var i = 0; i < list.length; i++) {
            var cfg = list[i];
            if (!cfg) continue;
            if (typeof cfg === 'string') { wikify(host, cfg, 'foot'); continue; }
            if (!matches(cfg)) continue;
            wikify(host, cfg.widget, 'foot');
        }
    }
    function registerLanSwitchMacro(M) {
        if (typeof M.get === 'function' && M.get('lanSwitch')) return;
        M.add('lanSwitch', {
            handler: function () {
                // this.args 在 SC 2.36 里是已求值的参数数组（同 <<errorp>> 用法）
                var src = this.args || [];
                var args = [];
                for (var i = 0; i < src.length; i++) args.push(src[i]);
                var v = window.lanSwitch.apply(null, args);
                this.output.append(document.createTextNode(String(v === undefined || v === null ? '' : v)));
            },
        });
    }
    function registerSlotMacros(M) {
        ['ModShopZone', 'BeforeLinkZone'].forEach(function (slot) {
            if (typeof M.get === 'function' && M.get(slot)) return;
            M.add(slot, {
                handler: function () {
                    var div = document.createElement('div');
                    div.className = 'b2sf-slot b2sf-inline';
                    renderSlotInline(slot, div);
                    this.output.appendChild(div);
                },
            });
        });
    }

    // --- <<iModReplace "widgetName">> 宏（SF 提供，Terraria 的虚空袋/装备/工具
    // overlay 按钮依赖）。语义按 terra_hotkey.js 快捷键路径反推：
    //   1) 若已有 overlay 打开则先收起按钮态（宿主模式：T.buttons.activeTab != -1
    //      才 toggle）+ updateOptions()
    //   2) T.currentOverlay = name
    //   3) 显示 #customOverlay（宿主自带该容器与 closeOverlay()）
    //   4) wikify 调用同名 widget —— widget 体内自己 <<replace #customOverlayTitle>>
    //      / #customOverlayContent，不依赖宏输出位置。
    // 注册必须延迟：inject_early 阶段 SugarCube.Macro 尚未就绪。
    var iModReplaceDone = false;
    function registerIModReplace() {
        if (iModReplaceDone) return true;
        try {
            var M = window.SugarCube && window.SugarCube.Macro;
            if (!M || typeof M.add !== 'function') return false;
            if (typeof M.get === 'function' && M.get('iModReplace')) {
                iModReplaceDone = true;
                return true;
            }
            M.add('iModReplace', {
                handler: function () {
                    var name = this.args && this.args[0];
                    if (!name) return;
                    // 每步独立 try：任何一步失败（如 SugarCube 2.36 revive 机制对
                    // T 属性赋值的拦截、T.buttons 缺失等）都不能阻断 overlay
                    // 的显示与 widget 渲染；diag 标志供运行时排查。
                    var diag = (window.__imodDiag = window.__imodDiag || []);
                    var T = null;
                    try { T = window.T || (window.SugarCube && window.SugarCube.State && window.SugarCube.State.temporary); }
                    catch (e) { diag.push('T:' + e); }
                    if (T && T.buttons && T.buttons.activeTab != -1) {
                        try { T.buttons.toggle(); } catch (e) { diag.push('toggle:' + e); }
                    }
                    try { T.currentOverlay = name; } catch (e) { diag.push('setcur:' + e); }
                    if (typeof window.updateOptions === 'function') {
                        try { window.updateOptions(); } catch (e) { diag.push('updopt:' + e); }
                    }
                    try {
                        jQuery('#customOverlay').removeClass('hidden').parent().removeClass('hidden');
                        jQuery('#customOverlay').attr('data-overlay', name);
                    } catch (e) { diag.push('show:' + e); }
                    try {
                        var W = window.Wikifier || (window.SugarCube && window.SugarCube.Wikifier);
                        if (typeof W !== 'function') throw new Error('Wikifier not available');
                        new W(this.output, '<<' + name + '>>');
                    } catch (e) { diag.push('widget:' + e); }
                    if (diag.length) console.warn('[B2 SF shim] iModReplace ' + name + ': ' + diag.join(' | '));
                },
            });
            iModReplaceDone = true;
            return true;
        } catch (e) {
            console.warn('[B2 SF shim] iModReplace register failed', e);
            return false;
        }
    }
    function registerSfMacros() {
        var M = window.SugarCube && window.SugarCube.Macro;
        if (!M || typeof M.add !== 'function') return false;
        try { registerLanSwitchMacro(M); } catch (e) { console.warn('[B2 SF shim] lanSwitch macro failed', e); }
        try { registerSlotMacros(M); } catch (e) { console.warn('[B2 SF shim] slot macros failed', e); }
        try { registerIModReplace(); } catch (e) { console.warn('[B2 SF shim] iModReplace registry failed', e); }
        return true;
    }
    var macroTries = 0;
    function sfMacroLoop() {
        macroTries++;
        var ok = false;
        try { ok = registerSfMacros(); } catch (e) {}
        if (ok || macroTries >= 240) return;
        setTimeout(sfMacroLoop, 250);
    }
    try { sfMacroLoop(); } catch (e) { console.warn('[B2 SF shim] macro loop failed', e); }

    function addto(slot) {
        var bucket = (reg[slot] = reg[slot] || []);
        for (var i = 1; i < arguments.length; i++) bucket.push(arguments[i]);
    }
    // --- SF 对象本体补齐（Terraria 的 ModLoaderLoadEnd 钩子需要）：
    //   iMod.modData.modList.pushUnique(name) → modList 数组 + pushUnique
    //   simpleFrameworks.onInit(fn)           → 无真实初始化生命周期，直接调用
    //   window.iMod                           → SF 全局别名（Terraria 只认 iMod）
    function buildSf() {
        var sf = { addto: addto, _b2shim: true, _reg: reg };
        sf.modData = { modList: [] };
        if (typeof sf.modData.modList.pushUnique !== 'function') {
            sf.modData.modList.pushUnique = function (it) {
                if (this.indexOf(it) < 0) this.push(it);
            };
        }
        sf.onInit = makeOnInit(sf);
        return sf;
    }
    if (!window.simpleFrameworks) {
        window.simpleFrameworks = buildSf();
    } else {
        var real = window.simpleFrameworks;
        if (!real._b2shim) {
            var orig = real.addto ? real.addto.bind(real) : function () {};
            real.addto = function () { try { orig.apply(null, arguments); } catch (e) {} return addto.apply(null, arguments); };
        }
        if (!real.modData) real.modData = { modList: [] };
        if (typeof real.modData.modList.pushUnique !== 'function') {
            real.modData.modList.pushUnique = function (it) {
                if (this.indexOf(it) < 0) this.push(it);
            };
        }
        if (typeof real.onInit !== 'function') {
            real.onInit = makeOnInit(real);
        }
    }
    if (!window.iMod) window.iMod = window.simpleFrameworks;
    // 少数 mod 的 widget 里 <script> 才是功能本体（Cattery 的 cafeCG：脚本里才调
    // createCafePC 去画 CG）。默认仍然删掉脚本——Terraria 那类脚本依赖宿主没有的
    // 按钮注册体系，执行只会报错。
    var SCRIPT_RUN = { cafeCG: 1 };
    function wikify(host, widget, where) {
        try {
            // DoL/SugarCube 把 Wikifier 挂在全局，不是 SugarCube.Wikifier
            var W = window.Wikifier || (window.SugarCube && window.SugarCube.Wikifier);
            if (typeof W !== 'function') throw new Error('Wikifier not available');
            var div = document.createElement('div');
            div.className = 'b2sf-slot b2sf-' + where;
            new W(div, '<<' + widget + '>>');
            // SF 挂件 widget 体内的原生 <script> 标签（如 Terraria 的
            // vanityAccessoryTransformation：按 maplebirch/SF 的按钮注册体系
            // 决定是否显示 void_bag 等按钮）：SugarCube 只会将其作为惰性元素
            // 插入（不执行），但其文本会污染宿主 passage 的 textContent。
            // 宿主没有那两套按钮体系，脚本删掉即功能降级，无副作用。
            var _scripts = [];
            try {
                var _sn = div.querySelectorAll('script');
                for (var _si = 0; _si < _sn.length; _si++) _scripts.push(_sn[_si].textContent);
            } catch (e) {}
            try { jQuery(div).find('script').remove(); } catch (e) {}
            // 过滤「生命周期宏」的 undefined 返回值噪音：
            // 宿主 DefineMacroS(name, fn) 会把 fn() 的返回值经 jQuery .wiki()
            // 渲染到 output——iCandyInit / iCandyUpdate 等初始化函数返回
            // undefined，jQuery 转成字符串 "undefined" 插入 DOM，每页底部
            // 就多出可见的 "undefined" 文本。这类宏只应执行副作用，无可见
            // 输出。判定：无元素子节点 + 纯文本为 undefined/空 → 跳过插入。
            var _txt = div.textContent.trim();
            var _hasEl = div.children.length > 0;
            if (!_hasEl && (_txt === '' || _txt === 'undefined')) return;
            if (where === 'head') host.insertBefore(div, host.firstChild);
            else host.appendChild(div);
            // 白名单脚本：必须等 div 真正进 DOM 之后再执行——Cattery 的脚本靠
            // 「id 命名访问」（window.cafeCG === div）拿容器，脱离文档时拿到的是
            // undefined，createCafePC 第一行就抛错，CG 永远是空白。
            if (_scripts.length && SCRIPT_RUN[widget]) {
                for (var _sj = 0; _sj < _scripts.length; _sj++) {
                    try {
                        (new Function('var V = window.V || (window.SugarCube && window.SugarCube.State.variables) || {};' + _scripts[_sj]))();
                    } catch (e) { console.warn('[B2 SF shim] widget script failed: ' + widget, e); }
                }
            }
        } catch (e) { console.warn('[B2 SF shim] widget failed: ' + widget, e); }
    }
    function curPassage() {
        var st = (window.SugarCube && window.SugarCube.State) || window.State;
        return st && st.passage;
    }
    function matches(cfg) {
        if (!cfg || typeof cfg !== 'object') return true;
        var cur = curPassage();
        // SF 的挂件配置支持 exclude（Terraria 用 exclude: ['Start','Start2']
        // 禁止标题页渲染坠落之星/温度等 widget）
        var ex = cfg.exclude ? (Array.isArray(cfg.exclude) ? cfg.exclude : [cfg.exclude]) : [];
        if (cur && ex.indexOf(cur) >= 0) return false;
        if (!cfg.passage) return true;
        var ps = Array.isArray(cfg.passage) ? cfg.passage : [cfg.passage];
        return ps.indexOf(cur) >= 0;
    }
    function drain(slot, where) {
        var list = reg[slot] || [];
        if (!list.length) return;
        var host = document.querySelector('#passages .passage');
        if (!host) return;
        for (var i = 0; i < list.length; i++) {
            var cfg = list[i];
            if (!cfg) continue;
            if (typeof cfg === 'string') { wikify(host, cfg, where); continue; }
            if (!matches(cfg)) continue;
            wikify(host, cfg.widget, where);
        }
    }
    var doneOnce = false;
    // :passageinit 在渲染之前触发，比 :passagedisplay 更早 —— $tvar 必须在任何
    // widget 读它之前就存在（iCandyHeader 是在 PassageHeader 渲染期跑的）。
    try { jQuery(document).on(':passageinit', function () { ensureTvar(); try { registerSfMacros(); } catch (e) {} }); } catch (e) {}
    jQuery(document).on(':passagedisplay', function () {
        try {
            ensureLang();
            ensureTvar();
            try { registerSfMacros(); } catch (e) {}
            flushNamedNPCs();
            try { reapplyNamedNPCs(); } catch (e) {}
            if (!doneOnce) {
                doneOnce = true;
                drain('iModInit', 'foot');
            }
            drain('iModHeader', 'head');
            drain('BeforeLinkZone', 'head');
            drain('ExtraLinkZone', 'foot');
            drain('ModShopZone', 'foot');
            drain('iModReady', 'foot');
            drain('iModDone', 'foot');
            drain('iModFooter', 'foot');
        } catch (e) { console.warn('[B2 SF shim]', e); }
    });
})();
'''

# 兼容层 3：modUtils.getMod 静默化。
# Terraria / DomRobin 的脚本用 getMod('maplebirch') / getMod('Simple Frameworks')
# 探测可选框架；宿主没有这两个 mod，ModLoader 会走
# ModOrderContainer.getByNameOneWithAlias() 并 console.error —— 主回归的
# consoleErrors 断言因此全红（B1 时代无此调用故不触发）。
# 这里只在「名字确实不在 modList 里」时直接返回 undefined，语义不变、噪音消失。
MODUTILS_SHIM = r'''/* B2 compat: silence getMod() lookups for absent optional frameworks */
(function () {
    if (window.__b2GetModShim) return;
    window.__b2GetModShim = true;
    var mu = window.modUtils;
    if (!mu || typeof mu.getMod !== 'function') return;
    var orig = mu.getMod.bind(mu);
    mu.getMod = function (name) {
        try {
            var list = mu.getModListName ? mu.getModListName() : null;
            if (list && list.indexOf(name) < 0) {
                // 例外：Simple Frameworks 由我们的 shim 顶替。Terraria / BabyHawk 用
                // getMod('Simple Frameworks') 判断「框架在不在」，返回 undefined 就
                // 走 else 分支报「未检测到前置模组」，而它们的 addto 调用其实能被
                // shim 正常接住。这里返回带版本号的占位对象，让它们走 SF 分支。
                // （版本 ≥2.0.5 是 Terraria 自己的下限检查）
                if (name === 'Simple Frameworks' && window.simpleFrameworks) {
                    var sf = window.simpleFrameworks;
                    if (!sf.version) sf.version = '2.0.5';
                    if (!sf.name) sf.name = 'Simple Frameworks';
                    return sf;
                }
                return undefined;
            }
        } catch (e) {}
        return orig(name);
    };
})();
'''

# 各包需要注入的兼容层：(目标列表键, 文件相对路径, 内容)
SHIMS = {
    "Terraria.Expand.Mod.mod.zip": [
        # 必须排在 terraSimpleFramework.js 之前（后者在 ModLoaderLoadEnd 里探测 maplebirch）
        ("scriptFileList_inject_early", "_b2_compat_modutils.js", MODUTILS_SHIM),
        # SF shim：Terraria 的 SF 分支需要 iMod / modData.modList.pushUnique /
        # onInit（Boot logError「terrariaExpand iMod is not defined」根因），
        # addto 挂件走 :passagedisplay 插槽渲染，<<iModReplace>> 宏由 shim 延迟注册。
        # 多 mod 注入同一 shim 由 window.__b2SFShim 守卫幂等。
        ("scriptFileList_inject_early", "_b2_compat_sf.js", SF_SHIM),
    ],
    # BabyHawk 的 BabyHawkWidget.twee 用 <<lanSwitch "BabyHawk" "鹰宝宝">>，
    # 那是 SF 的宏；没有 shim 时整段 widget 报 macro does not exist。
    "BabyHawk.mod.zip": [
        ("scriptFileList", "_b2_compat_sf.js", SF_SHIM),
        ("scriptFileList", "_b2_compat_timeevent.js", TIME_SHIM),
    ],
    "i.Candy.and.Robot.2.4.4.2.3.zip": [
        ("scriptFileList_inject_early", "_b2_compat_sf.js", SF_SHIM),
    ],
    "Cattery1.1.8.2.for.dol0.5.10.zip": [("scriptFileList", "_b2_compat_sf.js", SF_SHIM)],
}

# 源码级容错手术：(源 zip) -> [(文件, from, to)]
# i.Candy 顶层 `setup.modTattoos.push(...)` / `setup.modCombatActions.push(...)`
# 在 0.5.10.12 不存在（宿主 HTML 与源码树均 0 次）→ TypeError 中断 user script。
# 改成惰性建数组：不崩，但纹身/战斗动作在 0.5 的注册体系里不生效（降级，待单独立项）。
JS_FIXES = {
    # 脚本文件重名：ModLoader 的 CacheRecord 按 basename 建索引，同名会刷
    # buildNoPathCache()/fillMap() duplicate name（每次重建缓存一条）。
    # i.Candy 的 actions.js 与宿主 game/special-masturbation/actions.js 同名，
    # 两个 eventRegist.js 自己撞自己 —— 改名即可，纯路径、无代码引用。
    # (见下方 SCRIPT_RENAMES)
    "i.Candy.and.Robot.2.4.4.2.3.zip": [
        ("0Scripts/0_framework/1_setupdata.js",
         "setup.modTattoos.push(...iModTattoos);",
         "(setup.modTattoos = setup.modTattoos || []).push(...iModTattoos);"),
        ("0Scripts/1_database/actions.js",
         "setup.modCombatActions.push(",
         "(setup.modCombatActions = setup.modCombatActions || []).push("),
        # SF 提供的 NPC 面板配置容器；宿主没有 → Object.assign(undefined, ...) 抛
        # TypeError 并中断整段 user script。惰性建对象即可（面板本身由 SF shim 渲染）。
        # 诊断：addItems 里 Object.assign 遇到 undefined 时，打印是哪个物品
        ("0Scripts/0_framework/3_ItemsClass.js",
         "            Object.assign(_data, item);",
         "            try {\n"
         "                Object.assign(_data, item);\n"
         "            } catch (e) {\n"
         "                console.error('B2DBG addItems fail', { id: item && item.id, isUndef: item === undefined, total: (items || []).length, at: (items || []).indexOf(item), err: String(e) });\n"
         "                throw e;\n"
         "            }"),
        ("0Scripts/1_database/npcSetup.js",
         "Object.assign(setup.ModNpcSetting, npcSetting);",
         "Object.assign(setup.ModNpcSetting = setup.ModNpcSetting || {}, npcSetting);"),
        # <<iCandyHeader>> 被 i.Candy 自己用 TweeReplacer 塞进 PassageHeader，
        # 在「渲染期」就执行，比 shim 的 :passagedisplay 早 —— 首屏 Start 时
        # $tvar 还不存在，`$tvar.scene.start` 直接抛 TypeError（每次 2 条）。
        # 加变量守卫，语义不变（undefined 本来就是「没有场景」）。
        ("gamecode/MainWidgets.twee",
         "<<if $tvar.scene.start>>",
         "<<if $tvar and $tvar.scene and $tvar.scene.start>>"),
        # iCandyFooter 被 TweeReplacer 注入每页 PassageFooter，其中 #modversion
        # div 每页打印「iCandyRobot ver X | SimpleFrameworks ver Y」版本横幅。
        # 作者原版设计，但整合包中属于显示噪音；#background / #messageBox 两个
        # 隐藏容器是 iCandy JS 运行时依赖的，必须保留，只删版本行。
        ("gamecode/MainWidgets.twee",
         "<div id='modversion'>iCandyRobot ver <<=iCandy.version>> | SimpleFrameworks ver <<=simpleFrameworks.version>></div>\r\n",
         ""),
        # 任务 9：药房列表只显示名称+规格+价格，drugItems 的 info
        # 中文字段未渲染。在 tag 判断链后追加说明（缺 info 时不加）。
        ("0Scripts/3_systems/printer.js",
         "        else {\r\n            linkname = name;\r\n        }\r\n",
         "        else {\r\n            linkname = name;\r\n        }\r\n        if (drug.info) linkname += ` —— ${lanSwitch(drug.info)}`;\r\n"),
    ],
    # DoLSims 的 Seath 属性归一化：atfield 是 0.4.x 的 Seath 专属字段，
    # 0.5.10.12 没有（宿主源码 0 次出现），于是 Math.clamp(undefined,1,100) = NaN，
    # 触发 DoL 的 scanNaNs →「Corrupted variables have been detected」整页报错。
    # 补 0.4 的初始值 100 再 clamp（librarySims.twee 里首次相遇就是设 100）。
    "DoLSims.mod.zip": [
        ("game/npc/Seath_8.txt",
         "\t<<set $NPCName[_i].atfield = Math.clamp($NPCName[_i].atfield, 1, 100)>>",
         "\t<<if $NPCName[_i].atfield is undefined>><<set $NPCName[_i].atfield to 100>><</if>>\n"
         "\t<<set $NPCName[_i].atfield = Math.clamp($NPCName[_i].atfield, 1, 100)>>"),
        # 任务 6：神殿解锁条件写成了调试变量 $scenePassages
        # （只在 base-debug 写入），正常游玩永远 undefined → 剧情不触发
        # → 许可永远拿不到 → 研习卡在 300。改为真剧情 flag
        # $temple_confessor_intro（confess.twee 设置）。两处条件都改。
        ("game/overworld-town/loc-temple/Temple Hypno Sims.txt",
         "$scenePassages isnot undefined and $scenePassages.includes(\"TempleConfessorIntro\")",
         "$temple_confessor_intro",
         True),
        # 任务 7：研习上限提示「后续内容尚未更新」把「无许可」与
        # 「已练满」混为一谈，拆两段（librarySims.twee 约 1500 行）。
        ("game/overworld-town/loc-library/librarySims.twee",
         "\t\t<<else>>\r\n\t\t\t<<ind>><span class=\"link-internal macro-link noclickSims\">研习无形之术 (1:00)<<note \"+ + 疲劳\" \"black\">><<note \"- - 纯洁\" \"black\">><<note \"+ 世界软腐化\" \"black\">></span><<note \"后续内容尚未更新，目前已无法研习无形之术。\" \"grey\">>\r\n",
         "\t\t<<elseif $hypnoSims lt 500>>\r\n\t\t\t<<ind>><span class=\"link-internal macro-link noclickSims\">研习无形之术 (1:00)<<note \"+ + 疲劳\" \"black\">><<note \"- - 纯洁\" \"black\">><<note \"+ 世界软腐化\" \"black\">></span><<note \"你还没有得到神殿的许可，暂时无法继续研习。\" \"grey\">>\r\n\t\t<<else>>\r\n\t\t\t<<ind>><span class=\"link-internal macro-link noclickSims\">研习无形之术 (1:00)<<note \"+ + 疲劳\" \"black\">><<note \"- - 纯洁\" \"black\">><<note \"+ 世界软腐化\" \"black\">></span><<note \"你感觉某种神圣的东西阻碍了你，目前已无法研习无形之术。\" \"grey\">>\r\n"),
    ],
    # BabyHawk 的 TimeEvent（BabyHawkHuntTimer）会在 Children's Home 初始化
    # V.childRecords 之前就触发，hasOrphan()/hasActiveHawk() 里直接
    # Object.values(V.childRecords) → TypeError（每次 5 条）。补个空对象兜底。
    "BabyHawk.mod.zip": [
        ("game/BabyHawkjs/hawkBabyHuntTogether.js",
         "Object.values(V.childRecords)",
         "Object.values(V.childRecords || {})",
         True),
        # 定时器本体（new TimeEvent('onMin','BabyHawkHuntTimer')）在 activity 里
        ("game/BabyHawkjs/hawkBabyActivity.js",
         "Object.values(V.childRecords)",
         "Object.values(V.childRecords || {})",
         True),
    ],
    # DomRobin 的 4 处 passage 改写走 modUtils.updatePassageData()，0.5 已标    # @deprecated，每次调用都刷一条 console.warn（42 条噪音）。改用官方推荐的
    # updatePassageDataMany([item], true)：item 用 getPassageData() 的原对象补
    # name/content/tags/id，字段与 makePassageNode() 一一对应（id 即 pid）。
    "DomRobin.mod.zip": [
        ("game/javaScript/robinModInject_early.js",
         "    const modSC2DataManager = window.modSC2DataManager;",
         "    const modSC2DataManager = window.modSC2DataManager;\n"
         "    // 0.5: updatePassageData() 已弃用，改走 updatePassageDataMany([item], true)\n"
         "    function bjxSetPassage(name, content, tags, pid) {\n"
         "        const old = modUtils.getPassageData(name) || {};\n"
         "        modUtils.updatePassageDataMany([Object.assign({}, old, {\n"
         "            name: name,\n"
         "            content: content,\n"
         "            tags: tags || old.tags || [],\n"
         "            id: (pid && pid > 0) ? pid : (old.id || 0),\n"
         "        })], true);\n"
         "    }"),
        ("game/javaScript/robinModInject_early.js",
         "modUtils.updatePassageData(",
         "bjxSetPassage(",
         True),
    ],
}

# 脚本文件改名（解决 CacheRecord 按 basename 建索引导致的 duplicate name）。
# 只改路径，boot.json 的 scriptFileList* 同步替换；这些文件不被其他代码按名引用。
SCRIPT_RENAMES = {
    "i.Candy.and.Robot.2.4.4.2.3.zip": {
        "0Scripts/1_database/actions.js": "0Scripts/1_database/icandy_actions.js",
        "gamecode/Scene/Chinatown/eventRegist.js": "gamecode/Scene/Chinatown/icandyChinatownEventRegist.js",
        "gamecode/Scene/Daiso/eventRegist.js": "gamecode/Scene/Daiso/icandyDaisoEventRegist.js",
    },
}


# 运行时验证判定为「未生效」的 TweeReplacer 规则，明确放弃（B1 同策略：
# 重锚到 0.5 实际文本，或明确删除；这 28 条在 0.5.10.12 的 passage 里找不到
# 对应结构，逐条重锚成本远高于收益）。
# 其中 DoLSims 的 5 条是 replace==find 的自反规则（等于空操作，且锚点
# `<<effects>>`/`<<man>>` 过短会误伤），必须删。
# 判定依据：work/b2_rule_probe.json（浏览器内 modUtils.getPassageData 正向验证）。
DROP_RULES = {
    # i.Candy 128 条里唯一失配的一条：`Widgets Difficulty` 已被 bjx-pack 重写，
    # 原版的 <<set $skulduggeryroll to random(1, 1000)>> 在运行时不存在，剔除。
    'i.Candy.and.Robot.2.4.4.2.3.zip': [
        ('Widgets Difficulty', '<<set $skulduggeryroll to random(1, 1000)>>'),
    ],
    'DomRobin.mod.zip': [
        ('Widgets Robin', '\\s*<<robinbully>>'),
        ('Beach', '\\s*<<if \\$scienceproject is "ongoing" and .*>>'),
        ('Balloon Consume', '.*Balloon Partner.*'),
        ('Balloon Widgets', '.*Balloon Convince.*'),
        ('Robin Forest', '<<elseif Weather.isOvercast.*'),
        ('Bedroom', '<<if \\$robinpaid is 1 and.*>>'),
        ('Shopping Centre', '\\s*<</if>>\n\\s*<<hairdressericon>>'),
        ('Widgets Wardrobe', '\\s*<<case "Sydney Beach Changing Room">>'),
        ('Robin Caught CD', '\\s*<<elseif _robin.cdstart is "halloween">>'),
        ('Widgets NPCs', '\\s*<<man-combat _mancombatcontrol>>'),
        ('Canteen', '.*Canteen Robin Whitney.*'),
        ('Widgets School Events', '.*Bully Pantsing Robin.*\n.*\n.*'),
        ('Robin Cinema Romance', '<<else>>(.|\n)*?<br><br>'),
        ('Robin Cinema Romance', '<<set \\$dateCount.Robin\\++>>(.|\n)*?<br><br>'),
        ('Robin Cinema Superhero', '<<wearProp "popcorn">><</if>>(.|\n)*?<br><br>'),
        ('Robin Cinema Horror', '<<wearProp "popcorn">><</if>>(.|\n)*?<<He>>'),
        ('Ocean Breeze', '<<if\\s+(?:\\$money\\s+gte\\s+300|setup\\.inflation\\.canAfford\\(300,\\s*["\']cafe["\']\\)|maplebirch\\.get\\(["\']VanillaPlus["\']\\)\\.finance\\.canPay\\(300,\\s*["\']cafe["\']\\))\\s*>>'),
        ('Widgets Journal', '<<if \\$popcorn .*>>'),
        ('Options Overlay', '\\s*<<if \\$passage isnot "Start">>'),
        ('Robin Room Wake', '<<main_hall_icon>>.*</link>>'),
        ('Danube Street', '<<elseif \\$exposed lte 0>>(.|\n)*?<</if>>'),
        ('Beach', '<<if Time.openingHours()(.|\n)*?<</if>>'),
    ],
    'BabyHawk.mod.zip': [
        ('Widgets Bird', '<<set $daily.birdBabyFeed to true>>'),
    ],
    'DoLSims.mod.zip': [
        ('School Night Pool Party Rape', '<<effects>>'),
        ('School Night Pool Party Rape', '<<effectsman>>'),
        ('School Night Pool Party Rape', '<<man>>'),
        ('School Night Pool Party Rape', '<<actionsman>>'),
        ('Widgets Actions Man', '<<animateCombat>>'),
    ],
    # 重锚后仍失配的 3 条：Cattery 的 link 标签里嵌了时间宏/中文时段，
    # 机械替换无法还原（`<<link [[农田 (<<print getTimeString(...)>>)|...]]>>`）。
    'Cattery1.1.8.2.for.dol0.5.10.zip': [
        ('Containers', '<<getouticon>><<link [[Leave|_container.leaveLink]]>><</link>>'),
        ('Containers', '<<getouticon>><<link [[离开|_container.leaveLink]]>><</link>>'),
        ('Widgets School Projects', '<<icon "project-english.png">><<link [[排练你的角色 (2:00)|English Play Rehearse Alone]]>><<pass 2 hours>>'),
        ('Widgets Bird', '<<farmicon>><<link [[农田 (<<print getTimeString(_hoursPassed, _minutesPassed)>>)|Bird Tower Farmlands]]>>'),
    ],
}


def _make_drop_matcher(drops):
    """精确匹配，外加「长 find 前缀」匹配（部分规则 find 极长且尾部含动态宏）。"""
    exact = set(drops)
    prefixes = [(p, f) for p, f in drops if len(f) >= 30]

    def hit(passage, find):
        if (passage, find) in exact:
            return True
        for pp, pf in prefixes:
            if pp == passage and find.startswith(pf):
                return True
        return False
    return hit

# ReplacePatcher JS 规则剔除：(zip) -> [(fileName, from)]。
# 成因：中文锚点（0.5 的 game JS 是英文）+ 0.5 重构（tiredness/fatigueMod 段落改写）
# + 文件不存在（pregnancy-migration.js 在 0.5.10.12 已拆解）。
# 这些规则运行时必 console.error（`f.content.search(rp.from) < 0`），剔除后
# 对应增强功能降级（DoLSims 的命运之轮/图书馆书减益、DomRobin 的自信显示参数），
# 主体内容不受影响。
RP_DROP = {
    'DomRobin.mod.zip': [
        ('text.js', 'return statDisplay.statChange("罗宾的自信", -1, "lblue");'),
        ('text.js', 'return statDisplay.statChange("罗宾的自信", -2, "lblue");'),
        ('text.js', 'return statDisplay.statChange("罗宾的自信", -3, "lblue");'),
    ],
    'BabyHawk.mod.zip': [
        ('pregnancy-migration.js', 'const LEGACY_DEV_KEYS = ['),
    ],
    'DoLSims.mod.zip': [
        ('02-tooltips.js', '性奋增加</span><br>`'),
        ('02-tooltips.js', '疲劳增加</span><br>`'),
        ('02-tooltips.js', '疼痛增加</span><br>`'),
        ('02-tooltips.js', '压力增加</span><br>`'),
        ('stat-changes.js', '\t\t\tfatigueMod += Weather.BodyTemperature.fatigueModifier - 1;'),
        ('stat-changes.js', '\t\tconst overflow = V.tiredness - 2000;\n\t\tif (overflow > 0) {'),
        ('stat-changes.js', '\t\t// Clamps for safety.\n\t\tV.tiredness = Math.clamp(V.tiredness, 0, 2000);'),
    ],
}


# ---------------------------------------------------------------- 任务 2：自行车 = 运动

def _bike_pass_repl(body):
    """把目的地链接的 <<pass N>>（N=骑行分钟）换算成锻炼：K = max(1, N // 3)。"""
    def f(m):
        n = int(m.group(1))
        k = max(1, n // 3)
        return '<<pass %d>><<physique %d>><<tiredness %d>>' % (n, k, k)
    return re.sub(r'<<pass (\d+)>>(?=<</link>>)', f, body)


def _rewrite_scoped(txt, scope_re, body_fn):
    """只在匹配 scope_re 的 passage 体内做 body_fn 改写（保留其他 passage 原样）。"""
    parts = re.split(r'(?m)^(:: .*)$', txt)
    for i in range(1, len(parts), 2):
        if re.search(scope_re, parts[i]):
            parts[i + 1] = body_fn(parts[i + 1])
    return ''.join(parts)


def apply_bicycle(data):
    """任务 2：DoLSims 骑行目的地链接附带锻炼结算。
    MarketSims 的 13 个 :: Bicycle Sims N passage 按分钟换算；
    Farm BikeSims Farm 两页无 <<pass>>（时间在别处消耗），在抵达页补固定量。
    幂等：已处理的 <<pass>> 后面不再是 <</link>>，正则天然不再命中。"""
    out = []
    fn = 'game/overworld-town/loc-market/MarketSims.twee'
    raw = data.get(fn)
    if raw is not None:
        txt = raw.decode('utf-8', 'replace')
        new = _rewrite_scoped(txt, r'^:: Bicycle Sims \d+', _bike_pass_repl)
        cnt = len(re.findall(r'<<physique \d+>><<tiredness \d+>>', new))
        if new != txt:
            data[fn] = new.encode('utf-8')
        out.append('%s (+%d)' % (fn, cnt))
    fn2 = 'game/overworld-town/loc-farmers-centre/Farm BikeSims Farm.twee'
    raw2 = data.get(fn2)
    if raw2 is not None:
        txt2 = raw2.decode('utf-8', 'replace')
        if '<<physique' not in txt2:
            new2 = txt2.replace('<<effects>>', '<<effects>><<physique 3>><<tiredness 3>>')
            if new2 != txt2:
                data[fn2] = new2.encode('utf-8')
        out.append(fn2)
    return out


def adapt(rel):
    src = os.path.join(MODDIR, rel)
    with zipfile.ZipFile(src) as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}
    boot = json.loads(strip_json5(data["boot.json"].decode("utf-8-sig")))
    old_dep = [d.get("modName") for d in (boot.get("dependenceInfo") or [])]

    # 1. 清依赖
    boot["dependenceInfo"] = []

    # 1b. 摘除会挂死 boot 的交互式 early 脚本
    dropped = []
    for key in ("scriptFileList_inject_early", "scriptFileList_earlyload", "scriptFileList_preload"):
        lst = boot.get(key)
        if not isinstance(lst, list):
            continue
        keep = [f for f in lst if f not in DROP_EARLY.get(rel, [])]
        dropped += [f for f in lst if f not in keep]
        boot[key] = keep

    # 1c. 注入兼容层（必须在消费者脚本之前执行，故插到列表头部）
    shim_added = []
    for key, relpath, content in SHIMS.get(rel, []):
        if relpath not in data:
            data[relpath] = content.encode("utf-8")
        lst = boot.get(key)
        if not isinstance(lst, list):
            lst = []
        boot[key] = [relpath] + [f for f in lst if f != relpath]
        shim_added.append("%s:%s" % (key, relpath))
    # 1d. 源码级容错手术（0.4 专属 setup 数组 → 惰性建）
    js_fixed = []
    for entry in JS_FIXES.get(rel, []):
        fn, old, new = entry[0], entry[1], entry[2]
        replace_all = len(entry) > 3 and entry[3]
        raw = data.get(fn)
        if raw is None:
            js_fixed.append("MISS:" + fn)
            continue
        txt = raw.decode("utf-8", "replace")
        if old not in txt:
            js_fixed.append("ALREADY/NOTFOUND:" + fn)
            continue
        cnt = txt.count(old)
        data[fn] = (txt.replace(old, new) if replace_all else txt.replace(old, new, 1)).encode("utf-8")
        js_fixed.append(fn if cnt == 1 else "%s x%d" % (fn, cnt))

    # 1d-3. 正则级批量手术（任务 2：骑行 = 运动）
    if rel == "DoLSims.mod.zip":
        bike = apply_bicycle(data)
        print("    bicycle: %s" % "; ".join(bike))
    # 1d-2. 脚本改名（必须在 JS_FIXES 之后，fix 表里写的是旧路径）
    renamed = []
    for old, new in SCRIPT_RENAMES.get(rel, {}).items():
        if old not in data:
            renamed.append("MISS:" + old)
            continue
        data[new] = data.pop(old)
        if old in names:
            names[names.index(old)] = new
        for key in ("scriptFileList", "scriptFileList_earlyload",
                    "scriptFileList_preload", "scriptFileList_inject_early"):
            lst = boot.get(key) or []
            boot[key] = [new if x == old else x for x in lst]
        renamed.append(new)
    if renamed:
        print("    script renames: %d" % len(renamed))

    # 1e. 应用批量重锚 + 剔除无法重锚的规则
    # b2_reanchor.py 用「link 目标 passage」反查 0.5 英文原文里的实际标签，
    # 把 `[[离开|Park]]` 这类中文锚点换回 `[[Leave|Park]]`（55 条成功）。
    # 剩下 64 条（纯中文文本锚 / regex / 目标带变量）无法机械重锚，明确删除。
    dropped_rules, reanchored = [], []
    drops = set(DROP_RULES.get(rel, []))
    try:
        _rj = json.load(open(REANCHOR_JSON, encoding="utf-8"))
    except Exception:
        _rj = {"reanchored": {}, "unresolvable": []}
    refix = {(x["passage"], x["old_find"]): x["new_find"]
             for x in _rj.get("reanchored", {}).get(rel, [])}
    for x in _rj.get("unresolvable", []):
        if x.get("zip") == rel:
            drops.add((x.get("passage", ""), x.get("find", "")))
    if drops or refix:
        is_drop = _make_drop_matcher(drops)
        for a in boot.get("addonPlugin") or []:
            if a.get("addonName") != "TweeReplacerAddon":
                continue
            kept_rules = []
            for r in a.get("params") or []:
                key = ((r.get("passage") or "").strip(),
                       r.get("findString") or r.get("findRegex") or "")
                if is_drop(key[0], key[1]):
                    dropped_rules.append(key)
                    continue
                if key in refix:
                    r["findString"] = refix[key]
                    reanchored.append(key)
                    kept_rules.append(r)
                    continue
                kept_rules.append(r)
            a["params"] = kept_rules

    # 1f. 剔除 ReplacePatcher 规则（中文锚点 / 0.5 重构 / 文件不存在）
    rp_dropped = []
    rp_keys = set(RP_DROP.get(rel, []))
    if rp_keys:
        for a in boot.get("addonPlugin") or []:
            if a.get("addonName") != "ReplacePatcherAddon":
                continue
            params = a.get("params") or {}
            kept_js = []
            for r in params.get("js") or []:
                k = (r.get("fileName") or "", r.get("from") or "")
                if k in rp_keys:
                    rp_dropped.append(k)
                    continue
                kept_js.append(r)
            params["js"] = kept_js

    arg_patches = {}
    for n in (boot.get("tweeFileList") or []):
        if not n.endswith(".twee") or n not in data:
            continue
        txt = data[n].decode("utf-8", "replace")
        if "$args" not in txt:
            continue
        new = ARG_RE.sub("_args", txt)
        c = len(ARG_RE.findall(txt))
        arg_patches[n] = c
        data[n] = new.encode("utf-8")

    # 3. boot.json 规范化（严格 JSON）
    data["boot.json"] = json.dumps(boot, ensure_ascii=False, indent=1).encode("utf-8")

    stem = rel[:-4] if rel.endswith(".zip") else rel
    out = os.path.join(MODDIR, stem + ".adapted.mod.zip")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        # boot.json 必须存在且在最前，便于 reader 快速定位
        zout.writestr("boot.json", data["boot.json"])
        for n in names:
            if n == "boot.json" or n.endswith("/"):
                continue
            zout.writestr(n, data[n])
        # files added by this adapter (compat shims) are absent from namelist
        for n in data:
            if n == "boot.json" or n in names:
                continue
            zout.writestr(n, data[n])
    blob = buf.getvalue()
    with open(out, "wb") as f:
        f.write(blob)

    print("%-44s -> %-46s %8d B" % (rel, os.path.basename(out), len(blob)))
    print("    deps %s -> []" % json.dumps(old_dep, ensure_ascii=False))
    if dropped:
        print("    dropped early scripts (boot hang): %s" % dropped)
    if shim_added:
        print("    compat shims: %s" % shim_added)
    if js_fixed:
        print("    js fixes: %s" % js_fixed)
    if dropped_rules:
        print("    dropped rules (unported): %d" % len(dropped_rules))
    if reanchored:
        print("    re-anchored rules (zh -> en): %d" % len(reanchored))
    if rp_dropped:
        print("    dropped ReplacePatcher rules: %d" % len(rp_dropped))
    if arg_patches:
        print("    $args->_args: %d files, %d sites" % (len(arg_patches), sum(arg_patches.values())))
        for k, v in arg_patches.items():
            print("       %-46s %d" % (k, v))
    return out


def main():
    done = []
    for rel in SOURCES:
        if not os.path.exists(os.path.join(MODDIR, rel)):
            print("[MISS]", rel)
            continue
        done.append(adapt(rel))
    print("\nadapted %d mods" % len(done))


if __name__ == "__main__":
    main()
