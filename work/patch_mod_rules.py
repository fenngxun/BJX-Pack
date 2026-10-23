"""Surgical rewrite of TweeReplacer rules in B1 adapted mod zips.

Fixes 20 do_patch anchor failures found at runtime:
- 14 rules re-anchored to actual 0.5.10.12 (+bjx i18n) passage text
- 6 rules dropped (0.5 restructure made them unportable / redundant)

Idempotent: keyed by each rule's original findString inside its mod zip.
Run update_mod_inject.py afterwards to re-inject.
"""
import io
import json
import os
import shutil
import zipfile

MODDIR = r'C:\Users\79403\Desktop\dol\mod'

# The re-anchored findStrings below must match the *host* passage text. In
# 0.5.12.13 several macros gained arguments (e.g. <<passoutshop "cafe">>) and
# some passages were reshaped, so a couple of literals are host-dependent.
NEWHOST = '0.5.12.13' in os.environ.get('DOL_REF', '')
if NEWHOST:
    PASSOUT = '<<passoutshop "cafe">>'
else:
    PASSOUT = '<<passoutshop>>'

# (zip, original_findString_prefix, action) ; action = dict(new_find, new_replace)
# or None meaning "delete this rule"
PATCHES = {
    'More.Love.Interests.Mod.mod.adapted.mod.zip': [
        {
            'match_find': '<<set _loveIntStart1 to $loveInterest.primary>>\n\t\t<<set _loveIntStart2 to $loveInterest.secondary>>\n\t\t<<set _loveIntStart3 to $loveInterest.tertiary>>\n\t\t<div id="loveInterest" class="settingsToggleItem">\n\t\t\t<div class="gold bold">你认为谁是你的恋人？</div>\n\t\t\t<<loveInterest>>\n\t\t</div>\n\t\t<<loveInterestFunction>>',
            'match_passage': 'Widgets Attitudes',
            'new_find': '<<set _loveIntStart1 to $loveInterest.primary>>\n\t\t<<set _loveIntStart2 to $loveInterest.secondary>>\n\t\t<<set _loveIntStart3 to $loveInterest.tertiary>>\n\t\t<div id="loveInterest" class="settingsToggleItem">\n\t\t\t<div class="gold bold">Who do you consider to be your love interest?</div>\n\t\t\t<<loveInterest>>\n\t\t</div>\n\t\t<<loveInterestFunction>>',
            'new_replace': "<div class='settingsToggleItem'><<moreLoveInterest>></div>",
        },
    ],
    'TimeHourglass.mod.adapted.mod.zip': [
        {
            'match_find': '<<link [[继续|Dance Studio]]>><<endevent>><</link>>',
            'match_passage': 'Dancing Lesson',
            'delete': True,  # Next-rule already produced the intended branch
        },
        {
            'match_find': '<<if $dance_job_intro>>',
            'match_passage': 'Dance Studio',
            'new_find': '\t<<if Time.openingHours() and $exposed lt 1>>\n\t\t<<if $danceStudio.jobOffered>>',
            'new_replace': '\t<<if Time.openingHours() and $exposed lt 1>>\n\t\t<<charlyafterconcert>>\n\t\t<<if $danceStudio.jobOffered>>',
        },
        {
            'match_find': '\t<<if $openinghours is 1 and $exposed lt 1 and $oceanbreezejob is 1>>',
            'match_passage': 'Ocean Breeze',
            'new_find': '\n<<if $stress gte $stressmax>>\n\t' + PASSOUT,
            'new_replace': '\n<<caferandompassive>>\n<<if $stress gte $stressmax>>\n\t' + PASSOUT,
        },
    ],
    'V0.1.240302.mod.adapted.mod.zip': [
        {
            'match_find': '<<farmicon "meadow">><<link [[进入草地 (0:30)|Meadow]]>><<pass 30>><</link>>',
            'match_passage': 'Coast Path Farmland',
            'new_find': '<<farmicon "meadow">><<link [[Enter the meadow (0:30)|Meadow]]>><<pass 30>><</link>>',
            'new_replace': '<<run initFishModel()>><<icon "fishing.png">><<link [[钓鱼 (0:10)|Go Fishing Coast Path]]>><<pass 10>><</link>><br>\n\t<<farmicon "meadow">><<link [[Enter the meadow (0:30)|Meadow]]>><<pass 30>><</link>>',
        },
        {
            'match_find': '<<barbicon>><<link [[离开|Barb Street]]>><</link>>',
            'match_passage': 'Flats',
            'new_find': '<<barbicon>><<link [[Leave|Barb Street]]>><</link>>',
            'new_replace': '<<run initFishModel()>><<icon "fishing.png">><<link [[钓鱼 (0:10)|Go Fishing Canal]]>><<pass 10>><</link>>\n\t<br>\n\t<<barbicon>><<link [[Leave|Barb Street]]>><</link>>',
        },
    ],
    'DoL-cummilk-5.5.9.9.adapted.mod.zip': [
        {
            'match_find': '<<tending_give _args[0] `setup.plants[_args[0]].multiplier * $_amount`>>',
            'match_passage': 'Widgets Kitchen',
            'delete': True,  # 0.5 foodstuff restructure; pair rule also dropped
        },
        {
            'match_find': '<<wearProp setup.plants[_args[0]].handheld>>',
            'match_passage': 'Widgets Kitchen',
            'delete': True,  # 0.5 already has wearProp logic ($phase2)
        },
        {
            'match_find': '"amount": $plants[$_type].amount}',
            'match_passage': 'Widgets Tending',
            'delete': True,  # tending rewritten ($tendingvars/plot system)
        },
        {
            'match_find': '<<set $plants[$_type].amount += (_args[1] ? _args[1] : 1)>>',
            'match_passage': 'Widgets Tending',
            'delete': True,
        },
    ],
    'InTheEdenAfterSunset.adapted.mod.zip': [
        {
            'match_find': '<br>\n\n<<elseif ($edenfreedom is 2 and $edendays gte 8 and Time.hour gte 6)',
            'match_passage': 'Eden Clearing',
            'delete': True,  # 0.5 Eden Clearing restructured (edenCagedEscape)
        },
        {
            'match_find': '<</if>>\n</div>',
            'match_passage': 'Cabin Actions',
            'delete': True,  # 0.5 ends with nextPassageCheck blocks, no </div>
        },
    ],
    'WhitneyExpansion.adapted.mod.zip': [
        {
            'match_find': '<<set $daily.whitney.text += 1>><</if>><</link>>\n\t\t\t\t<br><br>\n\t\t\t<</if>>\n\t\t<</if>>',
            'match_passage': 'Park',
            'new_find': '<<set $daily.whitney.text += 1>><</if>><</link>>\n\t\t\t\t<br><br>\n\t\t\t<</if>>',
            'new_replace': '<<set $daily.whitney.text += 1>><</if>><</link>>\n\t\t\t\t<br><br>\n\t\t\t<</if>>\n<<if $Whitney_SecretBase is 1>>\n<<icon "SecretBase.png">><<link [[秘密基地|SecretBase Entrance]]>><<endevent>><</link>>\n<br><br>\n<</if>>',
        },
        {
            'match_find': 'Whitney Flirt]]>><<set $daily.whitney.flirt to 1>><<pass 15>><<npcincr Whitney love 1>><<npcincr Whitney lust 1>><<handheldon 1>><</link>><<promiscuous1>><<glove>><<glust>>',
            'match_passage': 'Widgets Whitney',
            'new_find': 'Whitney Flirt]]>><<set $daily.whitney.flirt to 1>><<pass 15>><<npcincr Whitney love 1>><<npcincr Whitney lust 1>><</link>><<promiscuous1>><<glove>><<glust>>',
            'new_replace': 'Whitney Flirt]]>><<set $daily.whitney.flirt to 1>><<pass 15>><<npcincr Whitney love 1>><<npcincr Whitney lust 1>><</link>><<promiscuous1>><<glove>><<glust>>\n\t\t\t\t<br>\n\t\t\t<<elseif $whitneyromance is 1 and $passage isnot "Whitney Flirt">>\n\t\t\t\t<<brothelicon>><<link [[调情 (0:15)|Whitney Flirt mod]]>><<pass 15>><<npcincr Whitney love 1>><<npcincr Whitney lust 1>><</link>><<promiscuous1>><<glove>><<glust>>',
        },
        {
            'match_find': '\t<</if>>\n\t<br><br>\n\t<<whitneyoptions>>',
            'match_passage': 'Whitney Chat',
            'new_find': '\t\t<</if>>\n\t\t<br><br>\n\t\t<<whitneyoptions>>',
            'new_replace': '\t\t<</if>>\n\t\t<</if>>\n\t\t<br><br>\n\t\t<<if $phase_mod is 3>>\n\t\t<<else>>\n\t\t<<whitneyoptions>>\n\t\t<</if>>',
        },
        {
            'match_find': '<<else>>\n\t\t<<He>>',
            'match_passage': 'Whitney Chat',
            'new_find': '<<else>>\n\t\t\t<<He>> stays silent',
            'new_replace': '<<else>>\n\t\t<<if $Whitney_TeachMasturbation isnot 1 and $awareness < 200 and $promiscuity < 15 and !$daily.Whitney_TeachMasturbation>>\n\t\t<<set $phase_mod to 3>>\n\t\t<<WhitneyTeachMasturbation>>\n\t\t<<else>>\n\t\t\t<<He>> stays silent',
        },
    ],
    "Wraith.sReflection.mod.adapted.mod.zip": [
        {
            'match_find': '本游戏及相关作品不得在任何缺乏年龄验证机制的平台上传播。',
            'match_passage': 'Start',
            'new_find': 'This game and works relating to it should not be shared on any platform that lacks age verification.',
            'new_replace': "This game and works relating to it should not be shared on any platform that lacks age verification.<br><span class='wraith'>你看到我了。</span>",
        },
        {
            'match_find': '<i>没有目的的排队等候是毫无意义的。</i>',
            'match_passage': 'Town Hall',
            'new_find': '<i>It would be pointless to wait in line without a goal in mind.</i>',
            'new_replace': "<i>It would be pointless to wait in line without a goal in mind.</i><<if $HelpAsk is 3>><br><br><span class='green'>米奇已经为你提供了帮助，你可以尝试行动了。</span><</if>>",
        },
        {
            'match_find': '有一个基座。\n<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound">>',
            'match_passage': 'Lake Ruin Plinth',
            'new_find': 'in a small room with a plinth.\n<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound">>',
            'new_replace': 'in a small room with a plinth.\n<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound" or $necklaceThief is "return">>',
        },
        {
            'match_find': '除了基座<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound">>',
            'match_passage': 'Lake Ruin Plinth',
            'new_find': 'besides the plinth<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound">>',
            'new_replace': 'besides the plinth<<if $museumAntiques.antiques.antiqueivorynecklace is "notFound" or $necklaceThief is "return">>',
        },
    ],
}

# ReplacePatcher js rules to drop entirely: fileName -> reason
# fish-config.js: 钓鱼人生 has no lootTables concept in 0.5.10.12 port (paleBone/paleHair
# catch feature is unportable without the 0.4.3.3 fishing mod's config file).
REPLACEPATCHER_DELS = {
    "Wraith.sReflection.mod.adapted.mod.zip": ('fish-config.js',),
}


def patch_zip(rel, patches, rp_dels):
    path = os.path.join(MODDIR, rel)
    bak = path + '.pre-surgery'
    if os.path.exists(bak):
        # always re-operate from the pristine backup (idempotent surgery)
        shutil.copy2(bak, path)
    else:
        shutil.copy2(path, bak)
    zin = zipfile.ZipFile(path)
    boot = json.loads(zin.read('boot.json').decode('utf-8'))
    applied = []
    for a in boot.get('addonPlugin') or []:
        if a.get('modName') == 'ReplacePatcher' and rp_dels:
            params = a.get('params') or {}
            js = params.get('js') or []
            kept_js = []
            for r in js:
                if r.get('fileName') in rp_dels:
                    applied.append('DELRP [%s] %s' % (r.get('fileName'), str(r.get('from'))[:50]))
                else:
                    kept_js.append(r)
            params['js'] = kept_js
        if a.get('modName') != 'TweeReplacer':
            continue
        kept = []
        for p in a.get('params') or []:
            fs = p.get('findString')
            hit = None
            for spec in patches:
                if fs == spec['match_find'] and p.get('passage') == spec['match_passage']:
                    hit = spec
                    break
            if hit is None:
                kept.append(p)
                continue
            if hit.get('delete'):
                applied.append('DEL  [%s] %s' % (hit['match_passage'], hit['match_find'][:50]))
            else:
                p['findString'] = hit['new_find']
                p['replace'] = hit['new_replace']
                kept.append(p)
                applied.append('FIX  [%s] %s' % (hit['match_passage'], hit['new_find'][:50]))
            # mark spec consumed
            hit['_done'] = True
        a['params'] = kept
    missed = [s for s in patches if not s.get('_done')]
    if missed:
        raise SystemExit('MISS in %s: %r' % (rel, [(m['match_passage'], m['match_find'][:40]) for m in missed]))
    # rewrite zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zout:
        zout.writestr('boot.json', json.dumps(boot, ensure_ascii=False, indent=1))
        for item in zin.infolist():
            if item.filename == 'boot.json':
                continue
            zout.writestr(item, zin.read(item.filename))
    zin.close()
    open(path, 'wb').write(buf.getvalue())
    return applied


def main():
    total = 0
    for rel, patches in PATCHES.items():
        rp_dels = REPLACEPATCHER_DELS.get(rel, ())
        applied = patch_zip(rel, patches, rp_dels)
        print('== %s (%d rules)' % (rel, len(applied)))
        for line in applied:
            print('   ' + line)
        total += len(applied)
    print('TOTAL: %d rules patched' % total)
    return 0


if __name__ == '__main__':
    main()