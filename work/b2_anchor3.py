# -*- coding: utf-8 -*-
"""B2 三源锚点核对（修正 b2_anchor_check.py 的假阴性）。

运行时 passage 最终文本的覆盖优先级：
    宿主 0.5.10.12 原版  <  bjx-pack  <  mod 自身 twee
TweeReplacer.do_patch 作用于「全部 mod 加载完成后」的 passageDataItems，
所以锚点必须在「最终 body」里命中，而不是只在宿主原版里命中。

输出 work/b2_anchor3.json + 控制台摘要。只读。
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


def parse_passages(txt, into):
    """把 txt 里的 passage 解析进 dict（同名后者覆盖）。"""
    txt = txt.replace("\r\n", "\n")
    cur, buf, tags = None, [], ""
    for line in txt.split("\n"):
        m = PASSAGE_RE.match(line)
        if m:
            if cur:
                into[cur] = "\n".join(buf)
            cur = m.group(1).strip()
            tags = (m.group(2) or "")
            buf = []
        elif cur is not None:
            buf.append(line)
    if cur:
        into[cur] = "\n".join(buf)
    return into


def load_host():
    d = {}
    for dirpath, _, files in os.walk(SRC):
        for fn in sorted(files):
            if not fn.endswith(".twee"):
                continue
            try:
                d = parse_passages(open(os.path.join(dirpath, fn),
                                        encoding="utf-8-sig", errors="replace").read(), d)
            except Exception:
                continue
    return d


def load_pack():
    d = {}
    if os.path.isdir(PACK):
        for fn in sorted(os.listdir(PACK)):
            if fn.endswith(".twee"):
                d = parse_passages(open(os.path.join(PACK, fn),
                                        encoding="utf-8-sig", errors="replace").read(), d)
    return d


def load_mod(z):
    """按 namelist 顺序解析 mod 内所有 twee（后者覆盖前者）。"""
    d = {}
    for n in z.namelist():
        if n.endswith(".twee"):
            try:
                d = parse_passages(z.read(n).decode("utf-8-sig", "replace"), d)
            except Exception:
                continue
    return d


def rules_of(boot):
    tr = []
    for a in boot.get("addonPlugin") or []:
        if a.get("addonName") != "TweeReplacerAddon":
            continue
        p = a.get("params")
        if isinstance(p, list):
            tr.extend(p)
    return tr


def main():
    host = load_host()
    pack = load_pack()
    print("host passages=%d  pack passages=%d" % (len(host), len(pack)))

    report = []
    for tz in TARGETS:
        p = os.path.join(MOD, tz)
        if not os.path.exists(p):
            print("[MISS]", tz)
            continue
        with zipfile.ZipFile(p) as z:
            names = set(z.namelist())
            boot = json.loads(strip_json5(z.read("boot.json").decode("utf-8-sig")))
            modp = load_mod(z)
            rows = []
            for r in rules_of(boot):
                passage = (r.get("passage") or "").strip()
                fs, fr, rf = r.get("findString"), r.get("findRegex"), r.get("replaceFile")
                # 选最终 body
                if passage in modp:
                    body, source = modp[passage], "mod"
                elif passage in pack:
                    body, source = pack[passage], "pack"
                elif passage in host:
                    body, source = host[passage], "host"
                else:
                    body, source = None, "none"
                status, hit = "", 0
                if rf and rf not in names:
                    status = "REPLACEFILE_MISSING"
                if body is None:
                    status = status or "PASSAGE_MISSING"
                elif fr:
                    try:
                        hit = len(re.findall(fr, body))
                    except Exception:
                        hit = -1
                    if hit == 0:
                        status = "ANCHOR_MISSING"
                    elif hit < 0:
                        status = "REGEX_UNSUPPORTED"
                    else:
                        status = "OK"
                elif fs is not None:
                    hit = body.count(fs)
                    if hit == 0 and body.count(fs.strip()) > 0:
                        hit, status = body.count(fs.strip()), "OK_TRIM"
                    elif hit == 0:
                        status = "ANCHOR_MISSING"
                    else:
                        status = "OK"
                else:
                    status = "NO_FIND"
                if not status:
                    status = "OK"
                rows.append({
                    "passage": passage,
                    "status": status,
                    "src": source,
                    "hit": hit,
                    "in_host": passage in host,
                    "in_pack": passage in pack,
                    "in_mod": passage in modp,
                    "find_head": (fs if fs is not None else (fr or ""))[:80],
                    "find_len": len(fs or fr or ""),
                    "replace_file": rf,
                    "mode": ("findRegex" if fr else "replaceFile" if rf else "replace"),
                })
            counts = {}
            for x in rows:
                counts[x["status"]] = counts.get(x["status"], 0) + 1
            srcs = {}
            for x in rows:
                srcs[x["src"]] = srcs.get(x["src"], 0) + 1
            report.append({
                "zip": tz, "name": boot.get("name"), "version": boot.get("version"),
                "n_rules": len(rows), "counts": counts, "src_dist": srcs,
                "n_mod_passages": len(modp), "rules": rows,
            })
            print("=" * 78)
            print("%-40s rules=%-4d %s" % (tz, len(rows), json.dumps(counts, ensure_ascii=False)))
            print("   body 来源分布:", json.dumps(srcs, ensure_ascii=False),
                  " mod 自带 passage=%d" % len(modp))
            bad = [x for x in rows if x["status"] in
                   ("PASSAGE_MISSING", "ANCHOR_MISSING", "REPLACEFILE_MISSING", "NO_FIND")]
            for x in bad[:10]:
                print("   [%-18s] %-26s src=%-4s findlen=%-4d host=%s pack=%s mod=%s %r"
                      % (x["status"], x["passage"][:26], x["src"], x["find_len"],
                         x["in_host"], x["in_pack"], x["in_mod"], x["find_head"][:50]))
            if len(bad) > 10:
                print("   ... 共 %d 条待处理" % len(bad))
    with open(os.path.join(ROOT, "work/b2_anchor3.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("\nreport -> work/b2_anchor3.json")


if __name__ == "__main__":
    main()
