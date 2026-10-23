# -*- coding: utf-8 -*-
"""列出宿主 HTML 内置 mod 清单（名字/版本/提供的 addonName），用于判断 B2 依赖是否可满足。"""
import base64
import io
import json
import re
import zipfile

HTML = r"C:/Users/79403/Desktop/dol/game/DoL-ModLoader-0.5.10.12-v2.101.1-polyfill/Degrees of Lewdity.html"


def main():
    data = open(HTML, "rb").read()
    i = data.find(b"window.modDataValueZipList")
    start = data.find(b"[", i)
    # 数组元素只含 base64 字符与引号逗号空白，找到 "]"
    end = data.find(b']', start)
    blob = data[start + 1:end].decode("ascii", "replace")
    items = re.findall(r'"([A-Za-z0-9+/=]+)"', blob)
    print("entries:", len(items))
    rows = []
    for idx, b64 in enumerate(items):
        try:
            raw = base64.b64decode(b64)
            z = zipfile.ZipFile(io.BytesIO(raw))
            if "boot.json" not in z.namelist():
                rows.append((idx, "?", "?", "", 0, len(raw)))
                continue
            boot = json.loads(z.read("boot.json").decode("utf-8-sig"))
            addons = [a.get("addonName") for a in (boot.get("addonPlugin") or [])]
            rows.append((idx, boot.get("name"), boot.get("version"),
                         ",".join(a for a in addons if a), len(raw), len(z.namelist())))
        except Exception as e:
            rows.append((idx, "ERR:" + repr(e)[:60], "", "", 0, 0))
    for r in rows:
        print("%2d | %-42s | %-12s | %-40s | %6dB | %d files" % r)
    # 汇总全部 addonName
    names = set()
    for r in rows:
        for a in (r[3] or "").split(","):
            if a:
                names.add(a)
    print("\n--- 宿主可用 addonName (%d) ---" % len(names))
    for n in sorted(names):
        print("  ", n)


if __name__ == "__main__":
    main()
