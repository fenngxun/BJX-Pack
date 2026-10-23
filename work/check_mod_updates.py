"""本地 mod 更新检查器。

数据流:
  1. AI 用 WebFetch 抓 https://degreesoflewditycn.miraheze.org/wiki/模块列表
     （直接脚本抓取会被 Miraheze 反爬 403，必须走 WebFetch 工具通道）
  2. AI 把表格条目整理成 JSON 存到文件，格式:
     [{"name": "万能的智能手机", "date": "2026/10/16", "version": "v0.3.91",
       "github": "https://github.com/..."}, ...]
  3. 本脚本拿这份 JSON 对比 work/mod_manifest.json 的本地版本。

用法:
  python check_mod_updates.py --wiki-json wiki_entries.json   # 对比并出报告
  python check_mod_updates.py --list                          # 列出需要 AI 抓取的 wiki 名称
  python check_mod_updates.py --apply                         # 把 wiki 版本写回清单（确认无误后）
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, 'mod_manifest.json')


def _verkey(v):
    parts = re.findall(r'\d+', v or '')
    return [int(x) for x in parts] or [0]


def load_manifest():
    return json.load(open(MANIFEST, encoding='utf-8'))


def compare(entries, manifest):
    rows = []
    by_name = {}
    for m in entries:
        by_name.setdefault(m.get('name', '').strip(), m)
    for e in manifest['mods']:
        wn = e.get('wiki_name')
        row = {'file': e['file'], 'wiki_name': wn or '', 'local_ver': e.get('local_version', '')}
        if not wn:
            row['status'] = 'no_mapping'
            rows.append(row)
            continue
        w = by_name.get(wn)
        if not w:
            row['status'] = 'wiki_missing'
            rows.append(row)
            continue
        wv = str(w.get('version') or '').strip().lstrip('vV')
        lv = str(e.get('local_version') or '').strip().lstrip('vV')
        row.update(wiki_ver=wv, wiki_date=w.get('date', ''), github=w.get('github', ''))
        if not wv or not lv or re.search(r'[a-zA-Z]', wv) or '.' not in wv:
            row['status'] = 'check_manually'
        elif _verkey(wv) > _verkey(lv):
            row['status'] = 'UPDATE'
        elif _verkey(wv) < _verkey(lv):
            row['status'] = 'local_newer'
        else:
            row['status'] = 'latest'
        rows.append(row)
    return rows


def main():
    man = load_manifest()
    if '--list' in sys.argv:
        print('需要抓取的 wiki 名称（WebFetch 提示词用）:')
        for e in man['mods']:
            if e.get('wiki_name'):
                print('  ' + e['wiki_name'])
        return
    if '--wiki-json' in sys.argv:
        path = sys.argv[sys.argv.index('--wiki-json') + 1]
        entries = json.load(open(path, encoding='utf-8'))
        rows = compare(entries, man)
        order = {'UPDATE': 0, 'check_manually': 1, 'wiki_missing': 2, 'no_mapping': 3,
                 'local_newer': 4, 'latest': 5}
        rows.sort(key=lambda r: order.get(r['status'], 9))
        out = os.path.join(HERE, 'mod_update_report.json')
        json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('%-42s %-14s %-12s %s' % ('mod', '状态', '本地', 'wiki'))
        for r in rows:
            print('%-42s %-14s %-12s %s %s' % (
                os.path.basename(r['file']), r['status'], r.get('local_ver', ''),
                r.get('wiki_ver', ''), r.get('wiki_date', '')))
        n_up = sum(1 for r in rows if r['status'] == 'UPDATE')
        print('\n可用更新: %d | 报告: %s' % (n_up, out))
        return
    print(__doc__)


if __name__ == '__main__':
    main()
