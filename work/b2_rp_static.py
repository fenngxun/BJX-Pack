# -*- coding: utf-8 -*-
"""B2 ReplacePatcher 静态命中核对。

宿主 polyfill HTML 内联的 JS 是未压缩原文（已抽验），因此可直接对
(fileName, from) 做字节级检索，预判 ReplacePatcher 在运行时能否命中。

判定：
  FILE_MISSING   宿主 HTML 无此 fileName 字串 → 运行时 "cannot find file"
  FROM_MISSING   fileName 在，但 from 原文不在 → 运行时 "cannot find 'from'"
  OK             两者都在
  FROM_WS_ONLY   仅空白/换行差异（归一后命中）
输出 work/b2_rp_static.json
"""
import json
import os
import re
import zipfile

ROOT = r"C:/Users/79403/Desktop/dol"
HTML = os.path.join(ROOT, "game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/Degrees of Lewdity.html")
MOD = os.path.join(ROOT, "mod")

TARGETS = [
    "DoLSims.mod.zip",
    "i.Candy.and.Robot.2.4.4.2.3.zip",
    "DomRobin.mod.zip",
    "BabyHawk.mod.zip",
    "Cattery1.1.8.2.for.dol0.5.10.zip",
    "Terraria.Expand.Mod.mod.zip",
]


def strip_json5(text):
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


def main():
    html = open(HTML, "rb").read()
    print("html bytes=%d" % len(html))
    report = []
    for tz in TARGETS:
        p = os.path.join(MOD, tz)
        if not os.path.exists(p):
            print("[MISS]", tz)
            continue
        with zipfile.ZipFile(p) as z:
            boot = json.loads(strip_json5(z.read("boot.json").decode("utf-8-sig")))
        rows = []
        for a in boot.get("addonPlugin") or []:
            if a.get("addonName") != "ReplacePatcherAddon":
                continue
            params = a.get("params")
            js = params.get("js") if isinstance(params, dict) else None
            for r in js or []:
                fn = r.get("fileName") or ""
                fr = r.get("from") or ""
                status, note = "OK", ""
                fb = fn.encode("utf-8")
                has_file = fb in html
                if not has_file:
                    # 可能只存 basename 之外的形式，再试 basename
                    base = os.path.basename(fn).encode("utf-8")
                    has_file = base in html
                    note = "basename" if has_file else ""
                if not has_file:
                    status = "FILE_MISSING"
                else:
                    if fr.encode("utf-8") in html:
                        status = "OK"
                    else:
                        # 空白归一重试
                        norm = re.sub(r"\s+", "", fr)
                        if len(norm) > 24:
                            # 用归一后前 60 字符做近似
                            probe = norm[:60].encode("utf-8")
                            if probe in re.sub(rb"[\s]+", b"", html):
                                status = "FROM_WS_ONLY"
                            else:
                                status = "FROM_MISSING"
                        else:
                            status = "FROM_MISSING"
                rows.append({
                    "fileName": fn,
                    "from_len": len(fr),
                    "status": status,
                    "note": note,
                    "from_head": fr[:90],
                })
        counts = {}
        for x in rows:
            counts[x["status"]] = counts.get(x["status"], 0) + 1
        report.append({"zip": tz, "name": boot.get("name"), "version": boot.get("version"),
                       "n_rules": len(rows), "counts": counts, "rules": rows})
        print("=" * 78)
        print("%-40s RP=%-3d %s" % (tz, len(rows), json.dumps(counts, ensure_ascii=False)))
        for x in rows:
            if x["status"] != "OK":
                print("   [%-12s] %-30s %r" % (x["status"], x["fileName"][:30], x["from_head"][:70]))
    with open(os.path.join(ROOT, "work/b2_rp_static.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("\nreport -> work/b2_rp_static.json")


if __name__ == "__main__":
    main()
