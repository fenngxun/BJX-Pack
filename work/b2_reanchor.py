# -*- coding: utf-8 -*-
"""B2 批量重锚：把中文 link 锚点换回 0.5.10.12 英文原文。

原理：失败的 findString 里普遍含 `[[中文标签|目标passage]]`。宿主 passage 的目标
名称不变（Park/Bedroom/Forest...），只是标签语言不同。因此用「目标 passage」反查
最终 body 里的实际 link 文本，替换 findString 中的对应片段，再验证新 find 是否命中。

最终 body 优先级：mod 自身 twee > bjx-pack > 宿主 0.5.10.12 原版。
输出 work/b2_reanchor.json：{zip: [{passage, old_find, new_find}]} + 无法重锚清单。
"""
import json
import os
import re
import zipfile

ROOT = r"C:/Users/79403/Desktop/dol"
SRC = os.path.join(ROOT, "refs/dol-0.5.10.12-target/game")
PACK = os.path.join(ROOT, "work/bjx-pack/tweeFileList")
MOD = os.path.join(ROOT, "mod")

ZIP_OF = {
    "Terraria Expand Mod": "Terraria.Expand.Mod.mod.zip",
    "DomRobin": "DomRobin.mod.zip",
    "BabyHawk": "BabyHawk.mod.zip",
    "DoLSims": "DoLSims.mod.zip",
    "猫咖出租屋": "Cattery1.1.8.2.for.dol0.5.10.zip",
}

PASSAGE_RE = re.compile(r"^::\s*([^\[\n]+?)\s*(\[[^\]]*\])?\s*$")
LINK_RE = re.compile(r"\[\[([^\[\]|]*)\|([^\[\]]+)\]\]")


def parse_into(txt, into):
    txt = txt.replace("\r\n", "\n")
    cur, buf = None, []
    for line in txt.split("\n"):
        m = PASSAGE_RE.match(line)
        if m:
            if cur:
                into[cur] = "\n".join(buf)
            cur = m.group(1).strip()
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
            if fn.endswith(".twee"):
                try:
                    d = parse_into(open(os.path.join(dirpath, fn), encoding="utf-8-sig",
                                        errors="replace").read(), d)
                except Exception:
                    pass
    return d


def load_pack():
    d = {}
    if os.path.isdir(PACK):
        for fn in sorted(os.listdir(PACK)):
            if fn.endswith(".twee"):
                d = parse_into(open(os.path.join(PACK, fn), encoding="utf-8-sig",
                                    errors="replace").read(), d)
    return d


def load_mod(z):
    d = {}
    for n in z.namelist():
        if n.endswith(".twee"):
            try:
                d = parse_into(z.read(n).decode("utf-8-sig", "replace"), d)
            except Exception:
                pass
    return d


def main():
    host, pack = load_host(), load_pack()
    failed = json.load(open(os.path.join(ROOT, "work/b2_failed_rules.json"), encoding="utf-8"))

    by_zip = {}
    for r in failed:
        by_zip.setdefault(ZIP_OF.get(r["mod"], r["mod"]), []).append(r)

    out, unresolvable = {}, []
    for tz, rules in by_zip.items():
        with zipfile.ZipFile(os.path.join(MOD, tz)) as z:
            modp = load_mod(z)
        fixed = []
        for r in rules:
            r = dict(r, zip=tz)
            pg, find = r["passage"], r["find"]
            if pg in modp:
                body = modp[pg]
            elif pg in pack:
                body = pack[pg]
            elif pg in host:
                body = host[pg]
            else:
                unresolvable.append({**r, "why": "passage_missing"})
                continue
            if r.get("isRegex"):
                unresolvable.append({**r, "why": "regex"})
                continue
            links = LINK_RE.findall(find)
            if not links:
                unresolvable.append({**r, "why": "no_link"})
                continue
            # 逐个 link 用 target 反查 body 里的真实写法
            new_find = find
            ok = False
            for label, target in links:
                if "$" in target:
                    continue
                cand_re = re.compile(r"\[\[([^\[\]|]*)\|" + re.escape(target) + r"\]\]")
                cands = cand_re.findall(body)
                if not cands:
                    continue
                for cand_label in dict.fromkeys(cands):
                    trial = new_find.replace("[[%s|%s]]" % (label, target),
                                             "[[%s|%s]]" % (cand_label, target), 1)
                    if trial != new_find and trial in body:
                        new_find = trial
                        ok = True
                        break
                if ok:
                    break
            if ok and new_find != find:
                fixed.append({"passage": pg, "old_find": find, "new_find": new_find})
            else:
                unresolvable.append({**r, "why": "no_english_match"})
        if fixed:
            out[tz] = fixed

    json.dump({"reanchored": out, "unresolvable": unresolvable},
              open(os.path.join(ROOT, "work/b2_reanchor.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    total_fix = sum(len(v) for v in out.values())
    print("reanchored: %d   unresolvable: %d" % (total_fix, len(unresolvable)))
    for tz, v in out.items():
        print("  %-46s %d" % (tz, len(v)))
    from collections import Counter
    print("unresolvable reasons:", Counter(x["why"] for x in unresolvable))
    for x in unresolvable[:15]:
        print("   [%s] %-28s %r" % (x["why"], x["passage"][:28], x["find"][:70]))


if __name__ == "__main__":
    main()
