# -*- coding: utf-8 -*-
"""B4 适配：Remy Love Mod 1.0.0。

该包声明的是 0.5 原生依赖（TweeReplacer>=1.0.0 / ReplacePatcher>=1.0.0 /
ModdedFeatsAddon>=1.0.0 / ImageLoaderHook>=2.3.0 / ModLoader>=1.2.2），但内部文本
是汉化版，75 条 TweeReplacer 里 42 条锚点已随汉化变成中文，在英文宿主上失配
（运行时由 TweeReplacer 自己报 `pp.content.search(p.findString) < 0` 确认）。

处置：
- 2 条 entry 类用「link 目标 passage 反查英文标签」重锚成功（b4_reanchor.py）
- 剩余 40 条（纯中文叙述锚 / 目标 passage 已重构 / 无 link）明确剔除

幂等：每次从原始 zip 重新生成。ReplacePatcher 的 2 条规则（time.js/pregnancy.js）
在宿主上静态命中，保留。
"""
import io
import json
import os
import zipfile

MODDIR = r"C:\Users\79403\Desktop\dol\mod"
SRC = "Remy.Love.Mod.mod.zip"
OUT = "Remy.Love.Mod.adapted.mod.zip"
REANCHOR_JSON = r"C:\Users\79403\Desktop\dol\work\b4_reanchor.json"

# 重锚后仍失配：Canteen 的离开链接同时被 DoLSims / 猫咖的规则改写，
# 运行时文本已不是宿主原文，B4 这条只影响食堂退出链接的措辞，直接放弃。
EXTRA_DROP = [
    ("Canteen",
     "\t\t<<getouticon>><<link [[离开食堂 (0:01)|Hallways]]>><<pass 1>><</link>>\n\t\t<br>\n\t<</if>>\n<</if>>"),
]

# 0.5.12.13 重构了 Pregnancy Birth Hospital 的怀孕／Alex 分支，这两条 Remy 锚点
# 在旧宿主命中、新宿主失配（do_patch findString NOT FOUND）。对新宿主明确剔除。
if "0.5.12.13" in os.environ.get("DOL_REF", ""):
    EXTRA_DROP += [
        ("Pregnancy Birth Hospital 2", "/*Alex variables*/"),
        ("Pregnancy Birth Hospital 5",
         '<<if $alex_pregnancy isnot undefined and $litter_potention_fathers'
         ' is 1 and $alex_pregnancy.source is "Alex">>'),
    ]

# 被替换文件本身结构不完整：locSchool-canteen-poster.txt 以
# `<<if $exposed gte 1>>` 结尾，外层 `<<if Time.schoolDay ...>>` 少一个 `<</if>>`，
# 把后面原段落的闭合标签全吃掉 → :: Canteen 报 "cannot find a closing tag for
# macro <<if>>" + "<<else>> outside parent"。改成独立条件块（原 else 分支本来就是空的）。
REPLACE_FILE_FIXES = {
    "game/overworld-town/addon-replace/locSchool-canteen-poster.txt":
        "/* 学校剧情 - 食堂海报 */\n"
        "<<if Time.schoolDay and $niuniuhaibao_seen isnot undefined and random(1, 4) gte 2 and $remylovemodeventskip isnot 1>>\n"
        "    <<remymod_canteen_poster>>\n"
        "<</if>>\n"
        "<<if $exposed gte 1>>",
}


def main():
    src = os.path.join(MODDIR, SRC)
    with zipfile.ZipFile(src) as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}
    boot = json.loads(data["boot.json"].decode("utf-8-sig"))

    rj = json.load(open(REANCHOR_JSON, encoding="utf-8"))
    refix = {(x["passage"], x["old_find"]): x["new_find"]
             for x in rj.get("reanchored", {}).get(SRC, [])}
    drops = {(x["passage"], x["find"]) for x in rj.get("unresolvable", [])
             if x.get("zip") == SRC}
    drops.update(EXTRA_DROP)

    reanchored, dropped = [], []
    for a in boot.get("addonPlugin") or []:
        if a.get("addonName") != "TweeReplacerAddon":
            continue
        kept = []
        for r in a.get("params") or []:
            key = ((r.get("passage") or "").strip(),
                   r.get("findString") or r.get("findRegex") or "")
            if key in drops:
                dropped.append(key)
                continue
            if key in refix:
                r["findString"] = refix[key]
                reanchored.append(key)
            kept.append(r)
        a["params"] = kept

    missed = [k for k in list(refix) + list(drops)
              if k not in reanchored and k not in dropped]
    if missed:
        raise SystemExit("unmatched specs: %r" % (missed[:5],))

    fixed_files = []
    for fn, content in REPLACE_FILE_FIXES.items():
        if fn not in data:
            raise SystemExit("missing replace file: " + fn)
        data[fn] = content.replace("\n", "\r\n").encode("utf-8")
        fixed_files.append(fn)

    data["boot.json"] = json.dumps(boot, ensure_ascii=False, indent=1).encode("utf-8")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        zout.writestr("boot.json", data["boot.json"])
        for n in names:
            if n == "boot.json" or n.endswith("/"):
                continue
            zout.writestr(n, data[n])
    blob = buf.getvalue()
    with open(os.path.join(MODDIR, OUT), "wb") as f:
        f.write(blob)
    print("%s -> %s (%d bytes)" % (SRC, OUT, len(blob)))
    print("  re-anchored: %d" % len(reanchored))
    print("  dropped    : %d" % len(dropped))
    print("  fixed files: %d %r" % (len(fixed_files), fixed_files))


if __name__ == "__main__":
    main()
