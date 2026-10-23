# -*- coding: utf-8 -*-
"""B2 离线锚点体检：用 0.5.10.12 原版 twee 源码核对各 mod 的 TweeReplacer 规则。

判定：PASSAGE_MISSING / ANCHOR_MISSING / OK / OK_CRLF（仅换行差异）
额外标记：pack 覆盖（bjx-pack 也定义同名 passage，运行时文本可能不同）

输出 work/b2_anchor_report.json
"""
import json
import os
import re
import zipfile

ROOT = r"C:/Users/79403/Desktop/dol"
SRC = os.path.join(ROOT, "refs/dol-0.5.10.12-target/game")
PACK = os.path.join(ROOT, "work/bjx-pack/tweeFileList")
MOD = os.path.join(ROOT, "mod")

TARGETS = [
    "DoLSims.mod.zip",
    "i.Candy.and.Robot.2.4.4.2.3.zip",
    "DomRobin.mod.zip",
    "BabyHawk.mod.zip",
    "Cattery1.1.8.2.for.dol0.5.10.zip",
    "Terraria.Expand.Mod.mod.zip",
]

PASSAGE_RE = re.compile(r"^::\s*([^\[\n]+?)\s*(\[[^\]]*\])?\s*$")


def strip_json5(text):
    """去 /* */ 与 // 注释、尾逗号，供 json.loads 使用（字符串内不动）。"""
    out = []
    i, n = 0, len(text)
    in_str = False
    quote = ""
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
            in_str = True
            quote = c
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
    s = "".join(out)
    return re.sub(r",(\s*[\]}])", r"\1", s)


def load_passages():
    passages = {}
    dup = {}
    for dirpath, _, files in os.walk(SRC):
        for fn in files:
            if not fn.endswith(".twee"):
                continue
            p = os.path.join(dirpath, fn)
            try:
                txt = open(p, encoding="utf-8-sig", errors="replace").read()
            except Exception:
                continue
            txt = txt.replace("\r\n", "\n")
            cur = None
            buf = []
            for line in txt.split("\n"):
                m = PASSAGE_RE.match(line)
                if m:
                    if cur:
                        passages.setdefault(cur, "\n".join(buf))
                        dup[cur] = dup.get(cur, 0) + 1
                    cur = m.group(1).strip()
                    buf = []
                elif cur is not None:
                    buf.append(line)
            if cur:
                passages.setdefault(cur, "\n".join(buf))
                dup[cur] = dup.get(cur, 0) + 1
    return passages


def load_pack_passages():
    names = set()
    if not os.path.isdir(PACK):
        return names
    for fn in os.listdir(PACK):
        if not fn.endswith(".twee"):
            continue
        txt = open(os.path.join(PACK, fn), encoding="utf-8-sig", errors="replace").read()
        for line in txt.replace("\r\n", "\n").split("\n"):
            m = PASSAGE_RE.match(line)
            if m:
                names.add(m.group(1).strip())
    return names


def rules_of(boot):
    tr = []
    for a in boot.get("addonPlugin") or []:
        if a.get("addonName") != "TweeReplacerAddon":
            continue
        params = a.get("params")
        if isinstance(params, list):
            tr.extend(params)
    return tr


def main():
    passages = load_passages()
    pack_names = load_pack_passages()
    print("host passages=%d  pack passages=%d" % (len(passages), len(pack_names)))

    report = []
    for tz in TARGETS:
        p = os.path.join(MOD, tz)
        if not os.path.exists(p):
            continue
        with zipfile.ZipFile(p) as z:
            names = set(z.namelist())
            boot = json.loads(strip_json5(z.read("boot.json").decode("utf-8-sig")))
            rules = rules_of(boot)
            rows = []
            for r in rules:
                passage = (r.get("passage") or "").strip()
                fs = r.get("findString")
                fr = r.get("findRegex")
                rf = r.get("replaceFile")
                status = "OK"
                note = ""
                if rf and rf not in names:
                    status = "REPLACEFILE_MISSING"
                if passage not in passages:
                    if status == "OK":
                        status = "PASSAGE_MISSING"
                else:
                    body = passages[passage]
                    if fr:
                        try:
                            hit = len(re.findall(fr, body))
                        except Exception as e:
                            hit = -1
                            note = "regex_err:" + repr(e)[:40]
                        if hit == 0:
                            status = "ANCHOR_MISSING"
                        elif hit < 0 and status == "OK":
                            status = "REGEX_UNSUPPORTED"
                    elif fs is not None:
                        c = body.count(fs)
                        if c == 0:
                            # 换行/空白归一重试
                            body2 = body.replace("\r\n", "\n")
                            fs2 = fs.replace("\r\n", "\n")
                            if body2.count(fs2) > 0:
                                status = "OK_CRLF"
                            elif body2.count(fs2.strip()) > 0:
                                status = "OK_TRIM"
                            else:
                                status = "ANCHOR_MISSING"
                    else:
                        status = "NO_FIND"
                rows.append({
                    "passage": passage,
                    "status": status,
                    "pack_override": passage in pack_names,
                    "find_head": (fs or fr or "")[:70],
                    "replace_file": rf,
                    "note": note,
                })
            counts = {}
            for r in rows:
                counts[r["status"]] = counts.get(r["status"], 0) + 1
            report.append({
                "zip": tz,
                "name": boot.get("name"),
                "version": boot.get("version"),
                "n_rules": len(rows),
                "counts": counts,
                "deps": boot.get("dependenceInfo"),
                "rules": rows,
            })
            print("=" * 78)
            print("%-40s rules=%-4d %s" % (tz, len(rows), json.dumps(counts, ensure_ascii=False)))
            bad = [r for r in rows if r["status"] in ("PASSAGE_MISSING", "ANCHOR_MISSING", "REPLACEFILE_MISSING")]
            for r in bad[:12]:
                print("   [%s] %-28s %r%s" % (r["status"], r["passage"][:28], r["find_head"],
                                              " (pack覆盖)" if r["pack_override"] else ""))
            if len(bad) > 12:
                print("   ... 共 %d 条待修" % len(bad))
    with open(os.path.join(ROOT, "work/b2_anchor_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("\nreport -> work/b2_anchor_report.json")


if __name__ == "__main__":
    main()
