# -*- coding: utf-8 -*-
"""B2 深度扫描：容错解析 boot.json，统计各 addon 规则数与依赖缺口。

输出 work/b2_scan.json（覆盖写，含 rules 明细摘要）。
"""
import io
import json
import os
import re
import zipfile

MOD = r"C:/Users/79403/Desktop/dol/mod"
TARGETS = [
    "DoLSims.mod.zip",
    "i.Candy.and.Robot.2.4.4.2.3.zip",
    "DomRobin.mod.zip",
    "BabyHawk.mod.zip",
    "Cattery1.1.8.2.for.dol0.5.10.zip",
    "Terraria.Expand.Mod.mod.zip",
]
# 宿主实际可用（b2_host_plugins.py 实测）
HOST = {
    "ModLoader": "2.101.1",
    "ModLoader DoL ImageLoaderHook": "2.101.0",
    "TweeReplacer": "1.0.0",
    "ReplacePatcher": "1.3.0",
    "ModdedFeatsAddon": "1.1.1",
    "BeautySelectorAddon": "2.9.0",
    "SweetAlert2Mod": "1.1.0",
    "DoLTimeWrapperAddon": "1.2.0",
    "ModdedClothesAddon": "1.6.3",
    "GameVersion": "0.5.10.12",
}


def load_boot(z):
    raw = z.read("boot.json").decode("utf-8-sig")
    try:
        return json.loads(raw), raw, None
    except Exception as e:
        err = repr(e)
    # 容错：去掉 ], } 前的尾逗号，再试
    fixed = re.sub(r",(\s*[\]}])", r"\1", raw)
    try:
        return json.loads(fixed), raw, err + " | fixed by trailing-comma strip"
    except Exception as e2:
        return None, raw, err + " | still broken: " + repr(e2)


def scan(zpath):
    out = {"zip": os.path.basename(zpath)}
    with zipfile.ZipFile(zpath) as z:
        boot, raw, jerr = load_boot(z)
        out["json_error"] = jerr
        if boot is None:
            return out
        out["name"] = boot.get("name")
        out["version"] = boot.get("version")
        out["deps"] = boot.get("dependenceInfo", [])
        gaps = []
        for d in out["deps"]:
            mn, ver = d.get("modName"), d.get("version", "")
            if mn not in HOST:
                gaps.append("%s %s [缺失]" % (mn, ver))
            elif mn == "GameVersion":
                gaps.append("GameVersion %s [宿主 %s → 需降级声明]" % (ver, HOST[mn]))
        out["dep_gaps"] = gaps
        counts = {}
        for a in boot.get("addonPlugin") or []:
            an = a.get("addonName")
            p = a.get("params")
            if isinstance(p, list):
                counts[an] = counts.get(an, 0) + len(p)
            elif isinstance(p, dict):
                for k, v in p.items():
                    n = len(v) if isinstance(v, list) else 1
                    counts[an + ":" + k] = counts.get(an + ":" + k, 0) + n
        out["rule_counts"] = counts
        out["lists"] = {k: len(v) for k, v in boot.items()
                        if k.endswith("FileList") or k == "additionFile" and isinstance(v, list)}
        # TweeReplacer 规则摘要：passage 名 + findString 长度 + 是否 all/replaceFile/findRegex
        tr = []
        for a in boot.get("addonPlugin") or []:
            if a.get("addonName") != "TweeReplacerAddon":
                continue
            rules = a.get("params")
            if not isinstance(rules, list):
                continue
            for r in rules:
                tr.append({
                    "passage": r.get("passage"),
                    "find_len": len(r.get("findString") or r.get("findRegex") or ""),
                    "mode": ("findRegex" if r.get("findRegex") else
                             "replaceFile" if r.get("replaceFile") else "replace"),
                    "all": bool(r.get("all")),
                    "head": (r.get("findString") or r.get("findRegex") or "")[:60],
                })
        out["tr_rules"] = tr
    return out


def main():
    res = []
    for t in TARGETS:
        p = os.path.join(MOD, t)
        if os.path.exists(p):
            res.append(scan(p))
    with open(r"C:/Users/79403/Desktop/dol/work/b2_scan.json", "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    for r in res:
        print("=" * 76)
        print("%s | %s %s" % (r["zip"], r.get("name"), r.get("version")))
        if r.get("json_error"):
            print("  boot.json:", r["json_error"])
        if r.get("deps") is None:
            continue
        print("  lists:", json.dumps(r.get("lists", {}), ensure_ascii=False))
        print("  rules:", json.dumps(r.get("rule_counts", {}), ensure_ascii=False))
        print("  dep_gaps:", r.get("dep_gaps") or "无")
        print("  twee patches=%d" % len(r.get("tr_rules", [])))
        for x in r.get("tr_rules", [])[:8]:
            print("    - [%s] %s findlen=%d all=%s :: %r" %
                  (x["mode"], x["passage"], x["find_len"], x["all"], x["head"]))


if __name__ == "__main__":
    main()
