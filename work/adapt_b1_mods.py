"""
Generic third-party mod adapter for the 0.5.10.12-v2.101.1 polyfill host.

For each source zip: rewrite dependenceInfo to [] (all providers the mods need
are built into the host or injected by us; clearing it removes DependenceChecker
version warnings like ^1.2.0 vs our TweeReplacer 1.0.0).

Also scans passage overlap vs bjx-pack declarations as a safety net.
Outputs <stem>.adapted.mod.zip in mod/.
"""
import io
import json
import os
import re
import zipfile

MODDIR = r'C:\Users\79403\Desktop\dol\mod'
BJX_BOOT = r'C:\Users\79403\Desktop\dol\work\bjx-pack\boot.json'

SOURCES = [
    'DefrockMod.mod.zip',
    'More.Love.Interests.Mod.mod.zip',
    'TimeHourglass.mod.zip',
    'V0.1.240302.mod.zip',
    'DoL-cummilk-5.5.9.9.zip',
    'Degrees-of-Lewdity-MyExhibitionismExpansion-main.zip',
    'Sydney.Bare.Study.Mod.mod.zip',
    'InTheEdenAfterSunset.zip',
    'WhitneyExpansion.zip',
    'Wraith.sReflection.mod.zip',
    'SmartPhone.Alpha-v0.3.91.1.mod.zip',
    'ReOverfits.4.1.1.mod.zip',
]


def boot_of(zf):
    names = zf.namelist()
    bn = 'boot.json' if 'boot.json' in names else next((n for n in names if n.endswith('/boot.json')), None)
    return bn


# I18nTweeReplacer 规则剪枝：index.json5 里 id 在对应语言的 find 文件里没有条目的，
# 永远匹配不到，只会在启动时刷 checkValid() / addFindItem() / addReplaceItem() 警告。
# DefrockMod 的 Vanilla1-3 就是这种（index 有、fnd_zh_cn.json5 没有）。
I18N_RULE_DROP = {
    'DefrockMod.mod.zip': [
        # index 里有、fnd_zh_cn.json5 里没有 → checkValid() 报 findItem 缺失
        ('index.json5', ['Vanilla1', 'Vanilla2', 'Vanilla3']),
        # 反向孤儿：fnd/replace 里有、index 里没有 → addFindItem()/addReplaceItem()
        # 报 idItem 缺失（每个 replace 文件各 4 条 × 2 语言 = 8 条噪音）
        ('fnd_zh_cn.json5', ['1111AE']),
        ('replace_zh_cn.json5', ['1111AE', 'Vanilla1', 'Vanilla2', 'Vanilla3']),
        ('replace_en_us.json5', ['1111AE', 'Vanilla1', 'Vanilla2', 'Vanilla3']),
    ],
}


def drop_json5_rules(txt, ids):
    for rid in ids:
        pat = re.compile(r'\{[^{}]*?id:\s*"' + re.escape(rid) + r'"[^{}]*?\}\s*,?', re.S)
        txt = pat.sub('', txt, count=1)
    return re.sub(r',\s*\]', '\n]', txt)


def passages_of(zf, boot, prefix):
    out = []
    for t in boot.get('tweeFileList', []):
        rel = prefix + t if prefix and not t.startswith(prefix) else t
        try:
            data = zf.read(rel).decode('utf-8')
        except Exception:
            continue
        for line in re.findall(r'^::\s+([^\r\n]+)', data, re.M):
            line = line.strip()
            line = re.sub(r'\s*\[[^\]]*\]\s*$', '', line)
            out.append(line.strip())
    return out


# Simple Frameworks compatibility stub: InTheEdenAfterSunset scripts call
# simpleFrameworks.addto('iModHeader'|'iModFooter', {passage, widget}) to
# mount navigation-map widgets onto Eden passages. The real Simple Frameworks
# mod is not on this host, so we shim it with a SugarCube :passagedisplay
# listener that wikifies the widget into the passage header/footer.
# Guarded: B2 的统一 SF shim（b2_adapt.py SF_SHIM，Terraria inject_early 注入）
# 定义了 window.simpleFrameworks 全量对象（modData/onInit/iMod 等）。
# 本 stub 在 scriptFileList_preload（晚于 inject_early）执行，若不守卫，
# 无条件覆盖会抹掉 onInit → Terraria ModLoaderLoadEnd 报
# 「simpleFrameworks.onInit is not a function」；且 stub 的渲染循环还会把
# SF shim 已 drain 的挂件再渲染一遍（双重渲染）。故整个 stub 仅在全局
# 不存在 simpleFrameworks 时才自建（Terraria 被禁用时仍向后兼容）。
SF_STUB = r'''(function () {
    if (window.simpleFrameworks) return;
    window.simpleFrameworks = {
        _reg: { iModHeader: [], iModFooter: [] },
        addto(slot, cfg) {
            if (!this._reg[slot]) this._reg[slot] = [];
            this._reg[slot].push(cfg);
        },
    };
    jQuery(document).on(':passagedisplay', function (ev) {
        try {
            var SC = window.SugarCube;
            var passage = (ev.detail && ev.detail.passage) || (SC && SC.State.passage);
            if (!passage) return;
            var host = document.querySelector('#passages .passage');
            if (!host) return;
            var slots = ['iModHeader', 'iModFooter'];
            for (var s = 0; s < slots.length; s++) {
                var slot = slots[s];
                var cfgs = window.simpleFrameworks._reg[slot] || [];
                for (var i = 0; i < cfgs.length; i++) {
                    var cfg = cfgs[i];
                    var ps = Array.isArray(cfg.passage) ? cfg.passage : [cfg.passage];
                    if (ps.indexOf(passage) < 0) continue;
                    var div = document.createElement('div');
                    new SugarCube.Wikifier(div, '<<' + cfg.widget + '>>');
                    if (slot === 'iModHeader') host.insertBefore(div, host.firstChild);
                    else host.appendChild(div);
                }
            }
        } catch (e) { console.error('[simpleFrameworks stub]', e); }
    });
})();
'''


def adapt(rel):
    src = os.path.join(MODDIR, rel)
    with zipfile.ZipFile(src) as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}
        bn = boot_of(zin)
    prefix = bn[:-len('boot.json')] if bn != 'boot.json' else ''
    boot = json.loads(data[bn].decode('utf-8'))
    name = boot.get('name')
    for fn, ids in I18N_RULE_DROP.get(rel, []):
        if fn not in data:
            continue
        txt = data[fn].decode('utf-8')
        new = drop_json5_rules(txt, ids)
        if new != txt:
            data[fn] = new.encode('utf-8')
            print('    dropped i18n rules %s from %s' % (ids, fn))
    old_dep = boot.get('dependenceInfo')
    ps = passages_of(zipfile.ZipFile(src), boot, prefix)
    boot['dependenceInfo'] = []
    # Simple Frameworks shim: prepend stub script ahead of consumer scripts
    stub_added = False
    if 'Simple Frameworks' in json.dumps(old_dep or []):
        stub_rel = 'code/_bjx_simpleframeworks_stub.js'
        data[prefix + stub_rel] = SF_STUB.encode('utf-8')
        names = list(names) + [prefix + stub_rel]
        preloaded = [f[len(prefix):] for f in boot.get('scriptFileList_preload', [])]
        loaded = [f[len(prefix):] for f in boot.get('scriptFileList', [])]
        boot['scriptFileList_preload'] = [stub_rel] + preloaded
        boot['scriptFileList'] = loaded
        stub_added = True
    # re-pack flattened: root-level boot.json + file lists re-rooted
    boot['tweeFileList'] = [t[len(prefix):] for t in boot.get('tweeFileList', [])]
    for key in ('scriptFileList', 'scriptFileList_preload', 'scriptFileList_earlyload',
                'scriptFileList_inject_early', 'imgFileList', 'styleFileList'):
        if key in boot and isinstance(boot[key], list):
            boot[key] = [f[len(prefix):] for f in boot[key]]
    if 'additionFile' in boot and isinstance(boot['additionFile'], list):
        boot['additionFile'] = [f[len(prefix):] for f in boot['additionFile']]
    data[bn] = json.dumps(boot, ensure_ascii=False, indent=1).encode('utf-8')
    stem = rel[:-len('.zip')] if rel.endswith('.zip') else rel
    out = os.path.join(MODDIR, stem + '.adapted.mod.zip')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zout:
        zout.writestr('boot.json', data[bn])
        for n in names:
            if n == bn or n.endswith('/'):
                continue
            rel_out = n[len(prefix):] if prefix and n.startswith(prefix) else n
            if rel_out == 'boot.json':
                continue
            zout.writestr(rel_out, data[n])
    blob = buf.getvalue()
    open(out, 'wb').write(blob)
    dep_names = [d.get('modName') for d in (old_dep or [])]
    print('%-52s -> %-40s %7d bytes  passages=%d' % (rel, os.path.basename(out), len(blob), len(ps)))
    print('    dependenceInfo: %s -> []%s' % (json.dumps(dep_names), '  [flattened]' if prefix else ''))
    if stub_added:
        print('    [simpleFrameworks stub prepended to scriptFileList_preload]')
    return name, set(ps)


def bjx_passages():
    boot = json.loads(open(BJX_BOOT, encoding='utf-8').read())
    out = set()
    src = os.path.dirname(BJX_BOOT)
    for t in boot['tweeFileList']:
        p = os.path.join(src, t.replace('/', os.sep))
        if not os.path.exists(p):
            continue
        for line in re.findall(r'^::\s+([^\r\n]+)', open(p, encoding='utf-8').read(), re.M):
            line = line.strip()
            line = re.sub(r'\s*\[[^\]]*\]\s*$', '', line)
            out.add(line.strip())
    return out


def main():
    bjx = bjx_passages()
    print('bjx-pack declares %d passages' % len(bjx))
    print()
    total = {}
    for rel in SOURCES:
        name, ps = adapt(rel)
        overlap = ps & bjx
        if overlap:
            print('    !! OVERLAP vs bjx-pack: %s' % sorted(overlap))
        total[name] = ps
    print()
    print('adapted:', len(total), 'mods')


if __name__ == '__main__':
    main()