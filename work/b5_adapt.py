# -*- coding: utf-8 -*-
"""MEE（露出拓展 My Exhibitionism Expansion）适配。

原包结构：所有文件位于 `Degrees-of-Lewdity-MyExhibitionismExpansion-main/Source/`
子目录，boot.json 也在其中 → 必须扁平化到 zip 根。

依赖（GameVersion >=0.5.10.12 / TweeReplacer ^1.2.0 / BeautySelectorAddon ^2.0.0）
在宿主 + 自建 TweeReplacer 1.2.0 下**全部满足**，因此保留 dependenceInfo 不动，
让 DependenceChecker 正常工作。

TweeReplacer 侧的 15 条规则中 4 条使用 `all: true`——这正是本轮把自建插件
从 1.0.0 升到 1.2.0 的原因（1.0.0 只替换第一处）。
ReplacePatcher 侧 7 条规则（ingame.js ×1 / stat-changes.js ×6）原样保留，
运行期若有失配由 errwrap2 报告后再决定剔除。

幂等：每次从原始 zip 重新生成。
"""
import io
import json
import os
import re
import zipfile

MODDIR = r"C:\Users\79403\Desktop\dol\mod"
SRC = "Degrees-of-Lewdity-MyExhibitionismExpansion-main.zip"
OUT = "Degrees-of-Lewdity-MyExhibitionismExpansion-main.adapted.mod.zip"

# MEE 的 ReplacePatcher 规则会插入 `mod *= window.mee?.calmStatModifier()` 之类，
# 但 js/mee_js.js 里的 `mee` 只是 IIFE 内的隐式全局，**从未挂到 window**
# （实测 `window.mee.calmStatModifier is not a function`）。可选链只挡 null/undefined，
# 挡不住「对象存在但方法不存在」，于是 `mod *= undefined` → NaN，
# 连锁把 pain/stress/arousal 全算成 NaN（主回归 lust-slime-fox-dragon 因此红）。
# 修法：IIFE 收尾前把 mee 显式暴露到 window。
MEE_EXPOSE = ("js/mee_js.js", "})();", "window.mee = mee;\n})();")

# 「渲染 <<wardrobeLinks>> 到临时 div，再 setTimeout 删掉」的收尾语句。
# 删掉容器会让 14 个 Dynamic 绑定找不到元素（见 main() 里的说明）。
DYN_TEMP_RE = re.compile(
    r'<<run setTimeout\(\(\)=>\{\$\("#clothing-(?:caption|takeback)-button-temp"\)\.remove\(\)\}\)>>')

# 更彻底的做法：MEE 只是为了拿到 widget 内部的 _wardrobeLinks 数组（`_` 变量是
# passage 作用域，widget 里 <<set>> 完就泄漏到当前 passage）。但渲染 widget 的
# 副作用是会生成 14 个 @id="Dynamic.eventBinder(...)" 的 <a>，容器一删就报
# "Unable to find Dynamic id"。这里直接把同一份数据 <<set>> 进去，
# 不产生任何 DOM，警告根除。
WARDROBE_LINKS_SET = (
    "<<set _wardrobeLinks to ["
    "{ id: 'over_head', label: 'Over Head', disabled: !$debug },"
    "{ id: 'over_upper', label: 'Over Upper', disabled: !$debug },"
    "{ id: 'over_lower', label: 'Over Lower', disabled: !$debug },"
    "{ id: 'head', label: 'Head' },{ id: 'face', label: 'Face' },"
    "{ id: 'neck', label: 'Neck' },{ id: 'upper', label: 'Upper' },"
    "{ id: 'lower', label: 'Lower' },{ id: 'under_upper', label: 'Under Upper' },"
    "{ id: 'under_lower', label: 'Under Lower' },{ id: 'hands', label: 'Hands' },"
    "{ id: 'handheld', label: 'Handheld' },{ id: 'legs', label: 'Legs' },"
    "{ id: 'feet', label: 'Feet' }]>>"
)
MEE_WL_RE = re.compile(
    r'<div id="clothing-(?:caption|takeback)-button-temp"[^>]*><<wardrobeLinks>></div>'
    r'(?:<<run setTimeout\(\(\)=>\{\$\("#clothing-(?:caption|takeback)-button-temp"\)\.remove\(\)\}\)>>)?')

# 即使补了 window.mee，运行时依然 `window.mee.calmStatModifier is not a function`
# （mee 的定义与实际暴露时机不匹配，原 mod 在 0.4 全局环境下能跑，0.5 不行）。
# 这些 RP 规则的价值是「疼痛/压力/欲望减免」，一旦 mee 不可用就变成
# `mod *= undefined` → NaN，把 pain/stress/arousal 全算坏（主回归实测）。
# 按 B1/B2 的既有策略：不可移植的规则明确剔除，保留 TweeReplacer 的 15 条主体规则。
DROP_RP = True


def main():
    src = os.path.join(MODDIR, SRC)
    with zipfile.ZipFile(src) as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}
    bn = "boot.json" if "boot.json" in names else next(
        (n for n in names if n.endswith("/boot.json")), None)
    assert bn, "boot.json not found"
    prefix = bn[:-len("boot.json")]

    # MEE 用「把 <<wardrobeLinks>> 渲染进临时 div，再 setTimeout 删掉」来偷取
    # widget 内的 _wardrobeLinks 数组。但该 widget 会生成 14 个
    # @id="Dynamic.eventBinder(...)"，而 Dynamic.task 要等整个渲染阶段 settle
    # 才执行 —— 那时 setTimeout(0) 已经把容器删了，于是每个 passage 刷 14 条
    # "Unable to find Dynamic id"（冒烟一次 28 条）。
    # 容器是 display:none，且随 StoryCaption 每页重建、不会累积，留着不删即可。
    for key in list(data):
        if not key.endswith(".twee"):
            continue
        txt = data[key].decode("utf-8", "replace")
        orig = txt
        txt = MEE_WL_RE.sub(WARDROBE_LINKS_SET, txt)
        txt = DYN_TEMP_RE.sub("", txt)
        if txt != orig:
            data[key] = txt.encode("utf-8")
            print("  inline _wardrobeLinks (drop Dynamic ids) in %s" % key)

    boot = json.loads(data[bn].decode("utf-8-sig"))

    if DROP_RP:
        for a in boot.get("addonPlugin") or []:
            if a.get("addonName") != "ReplacePatcherAddon":
                continue
            params = a.get("params") or {}
            if isinstance(params, dict) and params.get("js"):
                print("  drop ReplacePatcher js rules: %d" % len(params["js"]))
                params["js"] = []

    # 把 mee 暴露到 window（见 MEE_EXPOSE 注释）
    js_file, js_from, js_to = MEE_EXPOSE
    prefix0 = bn[:-len("boot.json")]
    js_key = prefix0 + js_file
    if js_key in data:
        txt = data[js_key].decode("utf-8")
        pos = txt.rfind(js_from)
        assert pos >= 0, "IIFE tail not found in " + js_key
        if "window.mee = mee;" not in txt:
            data[js_key] = (txt[:pos] + js_to + txt[pos + len(js_from):]).encode("utf-8")
            print("  expose window.mee: patched at %d" % pos)
    else:
        raise SystemExit("cannot find %s in zip" % js_key)
    if prefix:
        for key in ("tweeFileList", "scriptFileList", "imgFileList", "styleFileList",
                    "additionFile", "scriptFileList_inject_early", "scriptFileList_earlyload",
                    "scriptFileList_preload"):
            if isinstance(boot.get(key), list):
                boot[key] = [f[len(prefix):] if prefix and f.startswith(prefix) else f
                             for f in boot[key]]
        # addonPlugin 里的 replaceFile 路径同样去前缀
        for a in boot.get("addonPlugin") or []:
            params = a.get("params")
            if isinstance(params, list):
                for r in params:
                    rf = r.get("replaceFile")
                    if isinstance(rf, str) and prefix and rf.startswith(prefix):
                        r["replaceFile"] = rf[len(prefix):]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        zout.writestr("boot.json", json.dumps(boot, ensure_ascii=False, indent=1).encode("utf-8"))
        written = 0
        for n in names:
            if n.endswith("/") or n == bn:
                continue
            rel = n[len(prefix):] if prefix and n.startswith(prefix) else n
            if not rel or rel.startswith("../"):
                continue
            zout.writestr(rel, data[n])
            written += 1
    blob = buf.getvalue()
    with open(os.path.join(MODDIR, OUT), "wb") as f:
        f.write(blob)
    print("%s -> %s (%d bytes)" % (SRC, OUT, len(blob)))
    print("  flattened prefix %r, %d files" % (prefix, written))
    print("  twee=%d script=%d img=%d style=%d" % (
        len(boot.get("tweeFileList") or []), len(boot.get("scriptFileList") or []),
        len(boot.get("imgFileList") or []), len(boot.get("styleFileList") or [])))
    n_rules = sum(len(a.get("params") or []) for a in boot.get("addonPlugin") or []
                  if a.get("addonName") == "TweeReplacerAddon")
    n_all = sum(1 for a in boot.get("addonPlugin") or [] if a.get("addonName") == "TweeReplacerAddon"
                for r in (a.get("params") or []) if r.get("all"))
    print("  TweeReplacer rules=%d (all=%d)" % (n_rules, n_all))
    print("  dependenceInfo kept: %s" % json.dumps(
        [d.get("modName") for d in boot.get("dependenceInfo") or []], ensure_ascii=False))


if __name__ == "__main__":
    main()
