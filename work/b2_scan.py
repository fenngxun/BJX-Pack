# -*- coding: utf-8 -*-
"""B2 批次原料包结构扫描：boot.json / 文件清单 / addonPlugin 规则 / $args[ 计数。

输出 work/b2_scan.json + 控制台摘要。只读，不改任何 mod。
"""
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

ARG_RE = re.compile(r"\$args\[")
ARGS_WORD_RE = re.compile(r"\$args\b")


def scan(zpath):
    out = {"zip": os.path.basename(zpath), "size": os.path.getsize(zpath)}
    with zipfile.ZipFile(zpath) as z:
        names = z.namelist()
        out["n_files"] = len(names)
        out["has_boot"] = "boot.json" in names
        boot = None
        if out["has_boot"]:
            boot = json.loads(z.read("boot.json").decode("utf-8-sig"))
            out["name"] = boot.get("name")
            out["version"] = boot.get("version")
            out["dependencies"] = boot.get("dependenceInfo", {})
            lists = {}
            for k in ("tweeFileList", "imgFileList", "scriptFileList",
                      "scriptFileList_inject_early", "scriptFileList_earlyload",
                      "scriptFileList_preload", "styleFileList", "additionFile"):
                v = boot.get(k)
                if v is None:
                    continue
                lists[k] = {"n": len(v), "empty": sum(1 for x in v if not str(x).strip())}
            out["lists"] = lists
            ad = boot.get("addonPlugin") or []
            out["addonPlugin"] = []
            for a in ad:
                an = a.get("addonName")
                params = a.get("modName"), a.get("params")
                rules = None
                for key in ("patch", "replace", "rules"):
                    if isinstance(a.get("params"), dict) and key in a["params"]:
                        rules = a["params"][key]
                out["addonPlugin"].append({
                    "addonName": an,
                    "modName": a.get("modName"),
                    "n_rules": len(rules) if isinstance(rules, list) else None,
                    "param_keys": sorted(a.get("params", {}).keys()) if isinstance(a.get("params"), dict) else None,
                })
        # twee 内容统计
        twee_names = [n for n in names if n.endswith(".twee")]
        out["n_twee"] = len(twee_names)
        out["n_js"] = sum(1 for n in names if n.endswith(".js"))
        out["n_img"] = sum(1 for n in names if n.endswith((".png", ".gif", ".jpg", ".webp")))
        arg_files = []
        total_args = 0
        for n in twee_names:
            try:
                txt = z.read(n).decode("utf-8-sig", "replace")
            except Exception:
                continue
            c = len(ARG_RE.findall(txt))
            w = len(ARGS_WORD_RE.findall(txt))
            if c:
                arg_files.append({"file": n, "dollar_args_idx": c, "args_word": w})
                total_args += c
        out["dollar_args_total"] = total_args
        out["dollar_args_files"] = sorted(arg_files, key=lambda x: -x["dollar_args_idx"])[:15]
        out["twee_sample"] = twee_names[:12]
    return out


def main():
    res = []
    for t in TARGETS:
        p = os.path.join(MOD, t)
        if not os.path.exists(p):
            print("[MISS]", t)
            continue
        try:
            res.append(scan(p))
        except Exception as e:
            print("[ERR]", t, repr(e))
    with open(r"C:/Users/79403/Desktop/dol/work/b2_scan.json", "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    for r in res:
        print("=" * 78)
        print(r["zip"], "|", r.get("name"), r.get("version"), "| %.0fKB" % (r["size"] / 1024))
        print("  files=%d twee=%d js=%d img=%d" % (r["n_files"], r["n_twee"], r["n_js"], r["n_img"]))
        print("  lists:", json.dumps(r.get("lists", {}), ensure_ascii=False))
        print("  deps:", json.dumps(r.get("dependencies", {}), ensure_ascii=False))
        for a in r.get("addonPlugin", []):
            print("  addon:", a["addonName"], "rules=", a["n_rules"], "keys=", a["param_keys"])
        print("  $args[ total=%d files=%d" % (r["dollar_args_total"], len(r["dollar_args_files"])))
        for a in r["dollar_args_files"][:6]:
            print("     ", a["file"], a["dollar_args_idx"], "args_word=", a["args_word"])


if __name__ == "__main__":
    main()
