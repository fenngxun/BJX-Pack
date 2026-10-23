# -*- coding: utf-8 -*-
"""B3 适配：Sydney.Dialogue.Expansion v1.7（nocrypt）。

该包 21 条 TweeReplacer 里 20 条在 0.5.10.12 上三源全命中，唯一一条需要
「级联适配」——它和 DoLSims 改同一个片段（`Hallways Slap` 链接），而 DoLSims
在加载序上更靠前，已经先把该片段替换成带 `<<status 5>>`/`<<gcool>>` 的版本，
导致 B3 的原始 findString 失配。

处理：把该规则的 find 更新为 DoLSims 的输出文本，replace 保留 B3 的原意
（链接改指 SSDEE 事件、去掉 detention），并带上 DoLSims 新增的两个宏。

幂等：每次从原始 nocrypt zip 重新生成 `.adapted.mod.zip`。
"""
import io
import json
import os
import zipfile

MODDIR = r"C:\Users\79403\Desktop\dol\mod"
SRC = "Sydney.Dialogue.Expansion.v1.7.nocrypt.mod.zip"
OUT = "Sydney.Dialogue.Expansion.v1.7.nocrypt.adapted.mod.zip"

# (passage, 原始 find) -> (新 find, 新 replace)
CASCADE = {
    ("Widgets School Events",
     "|Hallways Slap]]>><<trauma -6>><<stress -12>><<detention 1>><</link>><<gdelinquency>><<ltrauma>><<lstress>>"): (
        "|Hallways Slap]]>><<trauma -6>><<stress -12>><<detention 1>><<status 5>><</link>><<gdelinquency>><<gcool>><<ltrauma>><<lstress>>",
        "|Hallways Slap SSDEE]]>><<trauma -6>><<stress -12>><<status 5>><</link>><<gcool>><<ltrauma>><<lstress>>",
    ),
}


def main():
    src = os.path.join(MODDIR, SRC)
    with zipfile.ZipFile(src) as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}
    boot = json.loads(data["boot.json"].decode("utf-8-sig"))

    applied = []
    for a in boot.get("addonPlugin") or []:
        if a.get("addonName") != "TweeReplacerAddon":
            continue
        for r in a.get("params") or []:
            key = ((r.get("passage") or "").strip(), r.get("findString") or "")
            if key in CASCADE:
                new_find, new_replace = CASCADE[key]
                r["findString"] = new_find
                r["replace"] = new_replace
                applied.append(key)

    missed = [k for k in CASCADE if k not in applied]
    if missed:
        raise SystemExit("cascade rule not found: %r" % (missed,))

    data["boot.json"] = json.dumps(boot, ensure_ascii=False, indent=1).encode("utf-8")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        zout.writestr("boot.json", data["boot.json"])
        for n in names:
            if n == "boot.json" or n.endswith("/"):
                continue
            zout.writestr(n, data[n])
    blob = buf.getvalue()
    out = os.path.join(MODDIR, OUT)
    with open(out, "wb") as f:
        f.write(blob)
    print("%s -> %s (%d bytes)" % (SRC, OUT, len(blob)))
    print("  cascade-adapted rules: %d" % len(applied))
    for k in applied:
        print("    [%s] %r" % (k[0], k[1][:60]))


if __name__ == "__main__":
    main()
