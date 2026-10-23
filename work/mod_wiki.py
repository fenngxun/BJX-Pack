"""DoL 中文 wiki 模组列表抓取与解析。

数据源: https://degreesoflewditycn.miraheze.org/wiki/模块列表
- raw wikitext (action=raw) 比 HTML 好解析: 表格 {| .. |}, 行 |-,
  单元格以行首 | 分隔（部分行用 || 内联）。
- 模组条目四列: 模组名称(含 GitHub 外链) / 简介 / 作者 / 最后更新日期(YYYY/M/D(vX.Y.Z))
- 公开/私有两个大区, 每区若干表; 只解析含"最后更新日期"表头的模组表。

用法:
    from mod_wiki import fetch_raw, parse_mods
    mods = parse_mods(fetch_raw())          # [{name, date, version, github, section}, ...]

offline: parse_mods(open(snapshot_path, encoding='utf-8').read())
"""

import re
import urllib.request

WIKI_URL = 'https://degreesoflewditycn.miraheze.org/wiki/%E6%A8%A1%E7%BB%84%E5%88%97%E8%A1%A8?action=raw'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')

_DATE_VER = re.compile(r'(\d{4})/(\d{1,2})/(\d{1,2})\s*[（(]\s*v?([0-9][0-9A-Za-z._ ]{0,24}?)\s*[）)]')
_DATE_ONLY = re.compile(r'(\d{4})/(\d{1,2})/(\d{1,2})')


def fetch_raw(url=WIKI_URL, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', errors='replace')


def _split_rows(table):
    """Yield rows as lists of cell texts. Handles both |- line separators and
    inline || cell separators; cells may span multiple lines."""
    body = table.split('\n', 1)[1] if '\n' in table else ''
    body = re.sub(r'\|\}\s*$', '', body)
    # normalise: a line starting with | starts a new cell; || also splits
    rows, cur, cell = [], [], []
    for line in body.split('\n'):
        s = line.strip()
        if s == '|-':
            if cell or cur:
                cur.append(''.join(cell)); rows.append(cur)
            cur, cell = [], []
            continue
        if s.startswith('|'):
            if cell or cur:
                cur.append(''.join(cell))
            cell = [s[1:]]
            # inline || splits inside the same line
            parts = re.split(r'\|\||(?=\|\[)', s[1:])
            # keep it simple: treat the remainder; multi-line cells dominate
            cell = [s[1:]]
            continue
        if s.startswith('!'):
            continue  # header
        if cell:
            cell.append(line)
        elif cur is not None and s:
            cell = [line]
    if cell or cur:
        cur.append(''.join(cell)); rows.append(cur)
    out = []
    for r in rows:
        cells = []
        for c in r:
            # inline || split (single-line rows)
            if '||' in c and len(re.split(r'\|\|', c)) > 1:
                cells.extend(x.strip() for x in re.split(r'\|\|', c))
            else:
                cells.append(c.strip())
        if any(cells):
            out.append(cells)
    return out


def parse_mods(wikitext):
    """Parse all mod-list tables. Returns a list of dicts sorted by name."""
    mods = []
    # split into tables
    tables = re.findall(r'\{\|(.*?)\n\|\}', wikitext, re.S)
    section = ''
    for tb in tables:
        m = re.search(r'\|+\s*(可以使用[^\n]*|可以作为[^\n]*|与[^\n]*无关[^\n]*)', tb)
        if m:
            section = m.group(1).strip()
        if '最后更新日期' not in tb:
            continue
        for cells in _split_rows(tb):
            if len(cells) < 4:
                continue
            name_cell, desc, author, updated = cells[0], cells[1], cells[2], cells[-1]
            # name: first external link label or bold text
            nm = re.search(r"'''''?<big>(.*?)</big>'''''?", name_cell) or \
                 re.search(r"'''<big>(.*?)</big>'''''", name_cell) or \
                 re.search(r"'''''(.+?)'''''", name_cell) or \
                 re.search(r"'''(.+?)'''", name_cell)
            if not nm:
                continue
            name = re.sub(r'<[^>]+>', '', nm.group(1)).strip()
            urls = re.findall(r'\[(https?://[^\s\]\|]+)', name_cell)
            github = next((u for u in urls if 'github.com' in u), '')
            dm = _DATE_VER.search(updated)
            if dm:
                date = '%s/%02d/%02d' % (dm.group(1), int(dm.group(2)), int(dm.group(3)))
                version = dm.group(4).strip().rstrip('.')
            else:
                dom = _DATE_ONLY.search(updated)
                date = ('%s/%02d/%02d' % (dom.group(1), int(dom.group(2)), int(dom.group(3)))) if dom else ''
                version = ''
            mods.append({
                'name': name,
                'date': date,
                'version': version,
                'github': github.split('[', 1)[0].strip(),
                'desc': re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"\2", desc),
                'author': author.strip(),
                'section': section,
            })
    return mods


def compare(manifest, wiki_mods):
    """manifest: list of {file, wiki_name, local_version, local_date}.
    Returns report rows: {file, wiki_name, wiki_ver, wiki_date, local_ver,
    status: latest|update|not_found}."""
    by_name = {}
    for m in wiki_mods:
        by_name.setdefault(m['name'], m)
    rows = []
    for e in manifest:
        wn = e.get('wiki_name')
        w = by_name.get(wn)
        if not w:
            # fuzzy: local name contained in a wiki name or vice versa
            for k, m in by_name.items():
                if wn and (wn in k or k in wn):
                    w = m
                    break
        if not w:
            rows.append({'file': e['file'], 'wiki_name': wn, 'status': 'not_found',
                         'local_ver': e.get('local_version', '')})
            continue
        lv = (e.get('local_version') or '').strip().lstrip('v')
        wv = (w.get('version') or '').strip().lstrip('v')
        status = 'latest'
        if not lv or not wv:
            status = 'check_manually'
        elif _verkey(wv) > _verkey(lv):
            status = 'update'
        elif _verkey(wv) < _verkey(lv):
            status = 'local_newer'
        rows.append({'file': e['file'], 'wiki_name': w['name'], 'wiki_ver': wv,
                     'wiki_date': w['date'], 'local_ver': lv, 'github': w['github'],
                     'status': status})
    return rows


def _verkey(v):
    parts = re.findall(r'\d+', v)
    return [int(x) for x in parts] or [0]


if __name__ == '__main__':
    import sys
    raw = fetch_raw()
    if len(sys.argv) > 1:
        open(sys.argv[1], 'w', encoding='utf-8').write(raw)
    mods = parse_mods(raw)
    print('wiki 模组条目:', len(mods))
    for m in mods[:8]:
        print('  %-24s %s (%s) %s' % (m['name'], m['version'], m['date'], m['github'][:50]))
