# -*- coding: utf-8 -*-
"""Generate museum twee files for the BJX ant-island mod.

Base: vanilla 0.5.10.12 museumAntiques.twee + loc-museum/main.twee "Widgets Museum" passage.
Inject: BJX antiques (19 kinds: 11 ant-island + 8 bunker/bog/scroll/mushroom),
take/return system (greed cup only), and museum talk passages named
"Museum " + <chinese name> to match the data-driven museumtalk widget
of 0.5.10.12.
"""
import io
import os

REF = r"C:\Users\79403\Desktop\dol\refs\dol-0.5.10.12-target\game"
OUT = r"C:\Users\79403\Desktop\dol\work\bjx-pack\tweeFileList"

# 19 BJX antiques: key -> icon (all icons reuse vanilla 0.5.10.12 assets)
BJX_ANTIQUES = [
    ("antiquecannonball", "antiques/antique-artillery.png"),
    ("antiquearttablet", "antiques/antique-disc.png"),
    ("antiqueterracottastatue", "antiques/antique-brass-statuette.png"),
    ("antiqueredvial", "antiques/antique-crystal-pink.png"),
    ("antiquetribemask", "antiques/antique-silver-mask.png"),
    ("antiqueebonystatuette", "antiques/antique-figurine.png"),
    ("antiqueglacierplant", "antiques/antique-forest-gem.png"),
    ("antiquebullion", "antiques/antique-gold-ring.png"),
    ("antiquereal", "antiques/antique-silver-coin.png"),
    ("antiqueindigo", "antiques/antique-crystal.png"),
    ("antiquegreed", "antiques/antique-silver-goblet.png"),
    ("antiqueliquor", "antiques/antique-tea.png"),
    ("antiquebogplate", "antiques/antique-disc.png"),
    ("antiquebogbone", "antiques/antique-horn.png"),
    ("antiquebogtool", "antiques/antique-cane.png"),
    ("antiquebunkertablet", "antiques/antique-fetish.png"),
    ("antiquebunkertag", "antiques/antique-gold-amulet.png"),
    ("antiquescroll", "antiques/antique-map.png"),
    ("antiquemushroom", "antiques/antique-ivory-statuette.png"),
]
BJX_KEYS = [k for k, _ in BJX_ANTIQUES]

MARK_BEGIN = "/* BJX ant island mod */"
MARK_END = "/* BJX ant island end */"


def wrap(block_lines):
    body = "\n".join(block_lines)
    return MARK_BEGIN + "\n" + body + "\n" + MARK_END


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)
    print("wrote", p, len(s), "chars")


# ---------------------------------------------------------------------------
# 1. bjx-museum-antiques.twee  (replaces vanilla museumAntiques.twee passages)
# ---------------------------------------------------------------------------
def gen_museum_antiques():
    src = read(os.path.join(REF, "overworld-town", "loc-museum", "museumAntiques.twee"))
    out = src

    # 1a. Museum Look around: add "take" case before the "stolen" case of antiques
    #     switch (the antiques one is followed by a museum-empty icon)
    anchor = ('\t\t\t\t<<case "stolen">>\n'
              '\t\t\t\t\t<div class="item" @tooltip="_museumAntiqueText[_labelM].stolen">')
    assert out.count(anchor) == 1, "take-case anchor not unique"
    take_case = wrap([
        '\t\t\t\t<<case "take">>',
        '\t\t\t\t\t<div class="item" tooltip="被你带走了。">',
        '\t\t\t\t\t\t<<icon "museum-empty.png">>',
        '\t\t\t\t\t</div>',
    ])
    out = out.replace(anchor, take_case + "\n" + anchor)

    # 1c. 捐满 10 件后，可向温特「请求讲解」三神器（passage 在 bjx-hunter.twee）
    hint_anchor = '<<if _possibleHints.length gt 0>>'
    assert out.count(hint_anchor) == 1, 'hints anchor'
    out = out.replace(hint_anchor,
        '/* BJX：捐满 10 件后可请求讲解古代遗物。 */\n'
        '<<if ($museumAntiques.museumCount ?? 0) gte 10 and ($bjxRelicLore ?? 0) isnot 1>>\n'
        '\t<br>\n'
        '\t<<link [[向温特请教古代遗物|BJX Relic Lore]]>><</link>>\n'
        '<</if>>\n\n' + hint_anchor, 1)

    # 1b. museumAntiqueStatus: museum<->take transition
    anchor = ('\t\t\t<</switch>>\n'
              '\t\t<</if>>\n'
              '\t<</if>>\n'
              '<</widget>>\n'
              '\n'
              '<<widget "museumPaintingGet">>')
    assert out.count(anchor) == 1, "status anchor not unique"
    block = wrap([
        '\t\t<<elseif ($museumAntiques.antiques[_args[0]] is "museum" and _args[1] is "take")',
        '\t\tor ($museumAntiques.antiques[_args[0]] is "take" and _args[1] is "museum")>>',
        '\t\t\t<<set $museumAntiques.antiques[_args[0]] to _args[1]>>',
        '\t\t\t<<switch _args[1]>>',
        '\t\t\t\t<<case "take">><<set $museumAntiques.museumCount-->>',
        '\t\t\t\t<<case "museum">><<set $museumAntiques.museumCount++>>',
        '\t\t\t<</switch>>',
    ])
    out = out.replace(
        '\t\t\t<</switch>>\n\t\t<</if>>\n\t<</if>>\n<</widget>>',
        '\t\t\t<</switch>>\n' + block + '\n\t\t<</if>>\n\t<</if>>\n<</widget>>')

    # 1c. museumAntiqueText: append BJX text object + merge (outside the undef guard,
    #     same as BJX original, so a rebuilt object always regains BJX entries)
    text_entries = []
    text_data = {
        "antiquecannonball": (
            '"这是为一个古老的炮弹而留," 温特一边说着一边指向一个空基座。 "试着海岸附近看看吧。"',
            "那枚炮弹正放在基座上。",
            "大炮弹",
            '"一颗旧炮弹，也许是在岸边的某个地方找到的。"'),
        "antiquearttablet": (
            '"为古老的石碑而留，"温特指着一个空基座说，"在部落时代的某个地方也许能找到一个。"',
            "旧艺术碑正放在一个垫子上展示。",
            "艺术碑",
            '"一块古老的艺术碑。也许来自古文明。"'),
        "antiqueterracottastatue": (
            '"为古老的陶俑而留，"温特指着一个空基座说，"也许能在沙漠里找到一个。"',
            "这座陶俑安放在陈列柜里。",
            "陶俑",
            '"一座古老的陶俑。也许来自远离现代文明的地方。"'),
        "antiqueredvial": (
            '"某种古老而又奇特的东西，"温特沉思了一会儿，指向一个空的基座。"在一个很遥远的地方。"',
            "红色小瓶就摆在那里。",
            "红色小瓶",
            '"一个奇怪的物体。也许来自非常遥远的地方。"'),
        "antiquetribemask": (
            '"某种部落面具，"温特一边说着，一边指了指空空如也的基座，"也许能在过去有部落的地方找到一个。"',
            "部落面具戴在一个人体模特的脸上。",
            "部落面具",
            '"一个古老的部落面具，也许来自一个远离现代文明的地方。"'),
        "antiqueebonystatuette": (
            '"一件黑檀木雕像，"温特一边说着，一边指了指空空如也的基座，"也许能在过去有部落的地方找到一个。"',
            "黑檀木雕像安放在一个底座上。",
            "乌木雕像",
            '"一个古老的乌木雕像，也许来自远离现代文明的地方。"'),
        "antiqueglacierplant": (
            '"为了一种古老的植物。"温特指着一个空基座说，"试着寻找一个可以保存的地方。"',
            "小树苗在陈列柜里休息。",
            "古代植物",
            '"一种古老的植物，也许来自冰河时代。"'),
        "antiquebullion": (
            '"为了一根金条而留，"温特指着一个空基座说，"试着去找一个可能藏有宝藏的地方。"',
            "古旧的金条放在一个陈列柜里。",
            "古旧金条",
            '"一跟金条，也许失落在了海上。"'),
        "antiquereal": (
            '"为了一枚来自远方的原始硬币，"温特指着一个空基座说，"试试潜水吧，很多古老的宝藏最终都会沉入海底。"',
            "这枚原始的硬币正在展出。",
            "原始硬币",
            '"一枚原始银币，也许在水下沉船里。"'),
        "antiqueindigo": (
            '"为了一瓶稀有染料而留，"温特指着一个空基座说，"对于这一点，我建议去探索一些古老的遗址。"',
            "那瓶靛蓝染料放在一个陈列柜里。",
            "靛蓝染料",
            '"一瓶染料，也许存在于某处遗址。"'),
        "antiquegreed": (
            '"一个黄金做成的杯子。"温特指着一个空基座说，"据说谁拥有它就能拥有无尽的财富，据说在某个神秘的小岛深处？"',
            "贪婪之杯被锁在一个不透明的展柜里。",
            "贪婪之杯",
            '"一个黄金做成的杯子，杯子中不断往外喷吐钱币，让人有种据为己有的冲动。"'),
        "antiqueliquor": (
            '"传说中永远也喝不完的酒瓶，据说是某位公爵的最爱，" 温特一边说着一边指向一个空着的基座: "不过那位公爵早已死去，居住的庄园也废弃了。"',
            "无尽酒瓶被放在了垫子上。",
            "无尽酒瓶",
            '"传说中永远也喝不完的酒瓶，可能在公爵死后遗留在庄园里的某处。"'),
        "antiquebogplate": (
            '"这是为一块古旧的钢板所留的," 温特一边说着一边指向一个空基座。 "也许能在某地找到别人丢失的。"',
            "那块钢板正放在基座上。",
            "古旧的钢板",
            '"一块古老的钢板，可能会在沼泽中找到。"'),
        "antiquebogbone": (
            '"一个较为精致的老骨头，"温特一边说着一边指了指一个空的基座。"去城南的沼泽看看吧。"',
            "那块老骨头正安放在基座上。",
            "古骨",
            '"一根古旧的骨头，大概遗失在了沼泽之中。"'),
        "antiquebogtool": (
            '"一个老农具," 温特一边说着一边指向一个空基座。 "过去的农民们会把一些坏掉或者太旧的丢掉，现在那里变成了沼泽。"',
            "老旧的农具正放在展柜里。",
            "老旧农具",
            '"一把古老的农具，大概丢失在了沼泽。"'),
        "antiquebunkertablet": (
            '"这是为一块石碑而留下的," 温特一边说着一边指向一个空基座。 "我听说过这个东西的消息。"<br><br><<He>>转身离开。 "听说垃圾填埋场的深处有一个地堡，有空的话可以去看看。"',
            "奇特的石碑被放了展柜处。",
            "奇特的石碑",
            '"一块古旧的石碑，也许在某个地堡里。"'),
        "antiquebunkertag": (
            '"一个身份的证明," 温特一边说着一边指向一个空基座。 "你可能会在某个废弃建筑里找到它。"',
            "那块破旧的狗牌正放在基座上。",
            "狗牌",
            '"一种古老的身份证明，也许地堡里会有什么线索。"'),
        "antiquescroll": (
            '"一卷古老的卷轴。"温特指着一个空基座说，"传说写在上面的文字具有神奇的魔力，或许埋藏在某座废弃的地堡里。"',
            "言灵卷轴被工整地放在展台上。",
            "言灵卷轴",
            '"一卷古老的卷轴，传说写在上面的文字具有神奇的魔力。"'),
        "antiquemushroom": (
            '"一颗石头雕刻的蘑菇神像。"温特指着一个空基座说，"据说有着操纵性欲的力量，或许它会藏在沼泽里？唔，只是一种直觉。"',
            "蘑菇神像竖立在展台上。",
            "蘑菇神像",
            '"一颗石头雕刻的蘑菇神像，据说有着操纵性欲的力量。"'),
    }
    for key, icon in BJX_ANTIQUES:
        hint, museum, name, journal = text_data[key]
        text_entries.append(
            '\t\t"' + key + '":{\n'
            '\t\t\thint:`' + hint + '`,\n'
            '\t\t\tmuseum:"' + museum + '",\n'
            '\t\t\tname:"' + name + '",\n'
            '\t\t\tjournal: `' + journal + '`,\n'
            '\t\t\ticon: "' + icon + '"\n'
            '\t\t}')
    block = wrap([
        '<<set _museumAntiqueText_bjx to {',
        ",\n".join(text_entries),
        '}>>',
        '<<run $.extend(_museumAntiqueText, _museumAntiqueText_bjx)>>',
    ])
    anchor = '<</if>>\n<</widget>>\n\n<<widget "museumPaintingText">>'
    assert out.count(anchor) == 1, "text widget anchor not unique"
    out = out.replace(anchor, '<</if>>\n' + block + '\n<</widget>>\n\n<<widget "museumPaintingText">>')

    # 1d. updateMuseumAntiques: seed $options.bjx_antiques FIRST (inject_early.js
    #     only sets it after the first DOM render, too late for the gameStartOnly
    #     variable init), then register BJX keys (idempotent notFound seeding),
    #     before maxCount is computed
    lines = [
        '<<if $options is undefined>><<set $options to {}>><</if>>',
        '<<if $options.bjx_antiques is undefined>><<set $options.bjx_antiques to true>><</if>>',
        '<<if $options.bjx_antiques>>',
    ]
    for key in BJX_KEYS:
        lines.append('\t<<if $museumAntiques.antiques.' + key + ' is undefined>>')
        lines.append('\t\t<<set $museumAntiques.antiques.' + key + ' to "notFound">>')
        lines.append('\t<</if>>')
    lines.append('<</if>>')
    block = wrap(lines)
    anchor = '\t/*Should be the last to always run*/\n\t<<set $museumAntiques.maxCount'
    assert out.count(anchor) == 1, "update anchor not unique"
    out = out.replace(anchor, '\t' + block + '\n' + anchor)

    write(os.path.join(OUT, "bjx-museum-antiques.twee"), out)


# ---------------------------------------------------------------------------
# 2. bjx-museum-widgets.twee  (replaces vanilla "Widgets Museum [widget]" passage)
# ---------------------------------------------------------------------------
def gen_museum_widgets():
    src = read(os.path.join(REF, "overworld-town", "loc-museum", "main.twee"))
    lines = src.split("\n")
    # passage spans from line 0 (:: Widgets Museum [widget]) to the line
    # before ":: Museum Lock"
    end_idx = next(i for i, l in enumerate(lines) if l.startswith(":: Museum Lock"))
    widget_passage = "\n".join(lines[:end_idx]).rstrip("\n") + "\n"
    out = widget_passage

    # 2a. museumdonate: append BJX antiques to the sell list
    anchor = '\t<<museumAntiqueStatus "antiquegoldmask" "talk">>\n<</widget>>'
    assert out.count(anchor) == 1, "donate anchor not unique"
    extra = "\n".join('\t<<museumAntiqueStatus "' + k + '" "talk">>' for k in BJX_KEYS)
    block = wrap([extra])
    out = out.replace(anchor, '\t<<museumAntiqueStatus "antiquegoldmask" "talk">>\n' + block + '\n<</widget>>')

    # 2b. museumtalk: render take/return links at the END of the widget BODY.
    #     The widget passage is wikified at boot; bare macro calls OUTSIDE a
    #     widget body would execute before the 2c definitions register and
    #     abort boot with "macro <<museumtake>> does not exist".
    tail = '<</widget>>'
    assert out.rstrip().endswith(tail), "museumtalk tail anchor not found"
    idx = out.rfind(tail)
    block = wrap([
        '\t<<if $options.bjx_antiques>>',
        '\t\t<<museumtake>>',
        '\t\t<<museumreturn>>',
        '\t<</if>>',
    ])
    out = out[:idx] + block + '\n' + out[idx:]

    # 2c. new widgets: museumtake / museumreturn (greed cup only, island module)
    block = wrap([
        '<<widget "museumtake">>',
        '\t<<if $money gte 500000 and $museumAntiques.antiques.antiquegreed is "museum">>',
        '\t\t<<link [[带走贪婪之杯 (£5000)|Museum Take]]>><<set $money -= 500000>><<museumAntiqueStatus "antiquegreed" "take">><<npcincr Winter love -1>><</link>><<llove>>',
        '\t\t<br>',
        '\t<</if>>',
        '<</widget>>',
        '',
        '<<widget "museumreturn">>',
        '\t<<if $museumAntiques.antiques.antiquegreed is "take">>',
        '\t\t<<link [[归还贪婪之杯 (£5000)|Museum Return]]>><<set $money += 500000>><<museumAntiqueStatus "antiquegreed" "museum">><<npcincr Winter love 1>><</link>><<glove>>',
        '\t\t<br>',
        '\t<</if>>',
        '<</widget>>',
    ])
    out = out + "\n" + block + "\n"

    write(os.path.join(OUT, "bjx-museum-widgets.twee"), out)


# ---------------------------------------------------------------------------
# 3. bjx-museum-talk.twee  (new passages)
# ---------------------------------------------------------------------------
def gen_museum_talk():
    talks = {
        "antiquecannonball": ("大炮弹", '"这看起来像个旧炮弹。"温特说，"可能在上个世纪的一次海战中使用过。"'),
        "antiquearttablet": ("艺术碑", '"这看起来像一幅旧的手绘画。"温特说，"是被画在这块旧石碑上的。"'),
        "antiqueterracottastatue": ("陶俑", '"这似乎是某种陶俑。"温特说，"它看起来像是用在当地人的什么宴会仪式上的。"'),
        "antiqueredvial": ("红色小瓶", '"这是什么？"温特望着玻璃瓶里的不名液体，"我可以接手它，但不要再捡这样奇怪的东西了，连我都不知道这里面有什么。"'),
        "antiquetribemask": ("部落面具", '"看起来像一个古老的部落仪式面具。"温特说，"上面的颜料是用来描绘信息的，似乎传达了哀悼的含义。"'),
        "antiqueebonystatuette": ("乌木雕像", '"啊，一尊古老的乌木雕像。"温特说，"看起来质量也很好。"'),
        "antiqueglacierplant": ("古代植物", '"嗯，这些种子是什么？"温特问道。<<He>>在回来之前花了几分钟检查种子。"它看起来和现代物种相似，但也有一些明显的区别。"'),
        "antiquebullion": ("古旧金条", '"这个硬邦邦的老旧条块是什么？"温特问道，<<He>>拿起一块纱布，摩擦起条块的外壳，不一会里面露出了闪亮的光芒。"看起来像是一块金条，如果它没有贬值太多的话，应该能卖出一个不错的价格。"'),
        "antiquereal": ("原始硬币", '"嗯，这些是什么硬币？"温特问道，<<He>>花了几分钟检查硬币。"应该是读作：\'卡罗尔和约翰·雷吉斯\'，这似乎可以追溯到15世纪早期国王查理一世统治时期。"'),
        "antiqueindigo": ("靛蓝染料", '"粉末？"温特疑惑道，<<He>>从柜台下面取出一副眼镜，仔细检查瓶子。"看起来是一瓶密封的靛蓝染料，即使在今天，天然靛蓝也很罕见，所以这似乎是一个相当大的发现。"'),
        "antiquegreed": ("贪婪之杯", '"这就是传说中的贪婪之杯？"温特盯着眼前的黄金杯子，呼吸逐渐粗重，眼睛变得赤红。试着用手抚摸。"快，快把它给我，它应该属于我。"直到你用布蒙住，温特才恢复正常。'),
        "antiqueliquor": ("无尽酒瓶", '"这是传说中的无尽酒瓶，据说里面的葡萄酒永远也喝不完，是某位古老公爵的珍藏。"温特说，"坦白说，我很惊讶一瓶酒能保留到现在。"'),
        "antiquebogplate": ("古旧的钢板", '"好像是块古老的钢板。"温特说道，"不怎么罕见，但看起来保存得很好。"'),
        "antiquebogbone": ("古骨", '"这看起来是某种保存完好的骨头。"温特说道， "我们还不太确定它是什么，但我们的期望值很高。"'),
        "antiquebogtool": ("老旧农具", '"这个倒是挺常见的。"温特说道， "这只是一件旧农具，一定是掉进了泥里。"'),
        "antiquebunkertablet": ("奇特的石碑", '"真是不可思议的发现。"温特说，"我知道镇上各地以及古时候的大多数语言，但这块碑文上的文字我却不怎么了解。"'),
        "antiquebunkertag": ("狗牌", '"这似乎是某种身份证明。"温特说，"这本书用一种奇怪的语言写成，但却与我们现在使用的有许多相似之处。"'),
        "antiquescroll": ("言灵卷轴", '"这是，传说中的言灵卷轴？"温特说道。"传说写在它上面的文字具有神奇的力量，但很多人尝试过后都是徒劳无功。或许需要某种古老的魔文？谁知道。"'),
        "antiquemushroom": ("蘑菇神像", '"一颗蘑菇神像？"温特观察着上面神秘的花纹，试着用手抚摸。突然蘑菇神像亮起紫光，从你身上吸走了什么，温特身体一抖，裤子湿了一片。"这，这太邪恶了，我建议还是不要使用这种东西。"<<set $arousal to 0>><<larousal>>'),
    }
    parts = []
    header = ("/* BJX ant island mod: museum dialogue passages.\n"
              "   Passage names follow the 0.5.10.12 data-driven museumtalk rule:\n"
              "   \"Museum \" + _museumAntiqueText[key].name  */\n")
    parts.append(header)

    parts.append(":: Museum Take\n"
                 "<<set $outside to 0>><<set $location to \"museum\">><<effects>>\n"
                 "<<npc Winter>><<person1>>\"你要带走它？\"温特皱眉思索了一阵。\"好吧，毕竟是你找到的东西。但要记住，这是珍贵的古董，请好好地保护它。\"温特嘱咐道。\"另外，我要收取押金，这是必要的手续，别担心，待你归还时会退给你的。\"\n"
                 "<br><br>\n\n"
                 "<<link [[继续|Museum]]>><<endevent>><</link>>\n\n")
    parts.append(":: Museum Return\n"
                 "<<set $outside to 0>><<set $location to \"museum\">><<effects>>\n"
                 "<<npc Winter>><<person1>>\"谢天谢地，你把它带回来了。\"温特小心接过古董，仔细观察着。\"没有任何新的损伤，看来你有好好爱护它。\"温特笑了起来。\"好了，接下来就交给我吧，我会把它收好的，这是你的押金。\"\n"
                 "<br><br>\n\n"
                 "<<link [[继续|Museum]]>><<endevent>><</link>>\n\n")

    for key, (name, text) in talks.items():
        parts.append(":: Museum " + name + "\n"
                     "<<set $outside to 0>><<set $location to \"museum\">><<effects>>\n"
                     "<<npc Winter>><<person1>><<museumClearHint \"" + key + "\">>\n"
                     + text + "\n"
                     "<br><br>\n\n"
                     "<<link [[继续|Museum]]>><<endevent>><</link>>\n\n")

    write(os.path.join(OUT, "bjx-museum-talk.twee"), "".join(parts))


if __name__ == "__main__":
    gen_museum_antiques()
    gen_museum_widgets()
    gen_museum_talk()
    print("done")