/* BJX ant island mod - early inject script.
 * Responsibilities (all idempotent, safe across save loads):
 *   1. Seed island story variables when missing (old saves / new game).
 *   2. Append "ant" to $BeastList (index-aligned with the _t concat inside
 *      bjx-beast-generation.twee, both driven by $BeastList.indexOf).
 *   3. Register island sub-locations via the vanilla 0.5.10.12
 *      setup.addlocation chainable API (vanilla already registers "island").
 *   4. Inject entry links into the Sea and Docks passages via MutationObserver,
 *     rendered through SugarCube.Wikifier so all vanilla macros
 *     (swimicon / swimmingdifficulty / pass / tiredness / gtiredness) behave
 *     exactly like the native twee links.
 */
(() => {
    const MOD_NAME = "bjx-ant-island";
    const MOD_VERSION = "0.1.0";

    // ---------- 1. story variables ----------
    const VAR_DEFAULTS = {
        islanddistance: 0,
        guard1: 0,
        guard2: 0,
        guard3: 0,
        sandmound: 0,
        antdig: 0,
        chill_day: 0,
        desertinn: 0,
        dailyownerwake: 0,
        redvial: 0,
        ship: 0,
        shiproom: 0
    };

    function ensureVars() {
        const V = window.V;
        if (!V) return;
        for (const key of Object.keys(VAR_DEFAULTS)) {
            if (V[key] === undefined) V[key] = VAR_DEFAULTS[key];
        }
        if (V.options && V.options.bjx_antiques === undefined) {
            V.options.bjx_antiques = true;
        }
    }

    // ---------- 2. beast list ----------
    function ensureAntBeast() {
        const V = window.V;
        if (V && Array.isArray(V.BeastList) && V.BeastList.indexOf("ant") === -1) {
            V.BeastList.push("ant");
        }
    }

    // ---------- 3. locations ----------
    function ensureLocations() {
        const setup = window.setup;
        if (!setup || typeof setup.addlocation !== "function" || !setup.locations) return;
        if (setup.locations.island === undefined) return; // vanilla init not done yet
        if (setup.locations.desert === undefined) {
            setup.addlocation("desert").parent("island").location().build();
            setup.addlocation("snowforest").parent("island").location().build();
            setup.addlocation("glacier").parent("island").location().build();
        }
        if (setup.locations.seadive === undefined) {
            setup.addlocation("seadive").parent("sea").location().inside().build();
        }
    }

    // ---------- 4. DOM entry injection ----------
    function currentPassage() {
        return window.SugarCube && window.SugarCube.State ? window.SugarCube.State.passage : null;
    }

    function renderTwee(text) {
        // Wikifier output goes into a detached inline <span> so the injected
        // icon/link/hint stay on one visual line, like native twee rendering.
        const holder = document.createElement("span");
        try {
            new window.SugarCube.Wikifier(holder, text);
        } catch (e) {
            console.error("[" + MOD_NAME + "] wikifier error:", e);
            return null;
        }
        return holder;
    }

    function findLinkByPrefix(root, prefix) {
        // debug mode prefixes every clickable link with "(N) " / "(Shift + N) ".
        const stripDbg = (t) => t.replace(/^\((?:Shift \+ )?\d+\)\s+/, "");
        const links = root.querySelectorAll("a.link-internal, a.macro-link");
        for (const a of links) {
            if (stripDbg(a.textContent.trim()).indexOf(prefix) === 0) return a;
        }
        return null;
    }

    // Insert holder as a new line after the line that contains anchor.
    function insertAfterLine(anchor, holder) {
        let node = anchor;
        while (node.nextSibling && node.nextSibling.nodeName !== "BR") node = node.nextSibling;
        const lineBreak = node.nextSibling; // the <br> ending anchor's line, or null
        const br = document.createElement("br");
        if (lineBreak) {
            lineBreak.parentNode.insertBefore(holder, lineBreak.nextSibling);
            lineBreak.parentNode.insertBefore(br, holder.nextSibling);
        } else {
            anchor.parentNode.appendChild(holder);
            anchor.parentNode.appendChild(br);
        }
    }

    // Insert holder as a new line before the line that contains anchor.
    function insertBeforeLine(anchor, holder) {
        let node = anchor;
        while (node.previousSibling && node.previousSibling.nodeName !== "BR") node = node.previousSibling;
        const br = document.createElement("br");
        anchor.parentNode.insertBefore(br, node);
        anchor.parentNode.insertBefore(holder, br);
    }

    // Sea passage: reef entry ($sea 40..50 zone), dive entry ($sea 90..99 zone).
    // Anchor: the "Swim further out" link of the current zone (absent when the
    // swim check failed, which correctly hides our links too).
    function injectSeaEntries() {
        const passageEl = document.querySelector("#passages .passage");
        if (!passageEl) return;
        const V = window.V;
        const sea = V ? V.sea : undefined;
        if (typeof sea !== "number") return;

        const anchor = findLinkByPrefix(passageEl, "Swim further out");
        if (!anchor) return;

        if (sea >= 40 && sea <= 50 && !passageEl.querySelector("#bjx-sea-reef-entry")) {
            const holder = renderTwee(
                "<<swimicon>><<link [[游向四色光芒 (0:10)|Sea Reef]]>><<pass 10>><<tiredness 2>><</link>><<gtiredness>><<swimmingdifficulty 1 300>>"
            );
            if (holder) {
                holder.id = "bjx-sea-reef-entry";
                insertAfterLine(anchor, holder);
            }
        }
        if (sea >= 90 && sea <= 99 && !passageEl.querySelector("#bjx-sea-dive-entry")) {
            const holder = renderTwee(
                "<<swimicon>><<link [[潜水 (0:10)|Sea Dive]]>><<pass 10>><<tiredness 2>><<set $phase to 0>><</link>><<gtiredness>>"
            );
            if (holder) {
                holder.id = "bjx-sea-dive-entry";
                insertAfterLine(anchor, holder);
            }
        }
    }

    // Docks passage: charter a boat to the island.
    // Vanilla condition (BJX): $money >= 100000 and $history >= 700 and $exposed <= 0.
    // Inserted before the first of the known vanilla link lines.
    const DOCKS_ANCHORS = [
        "Look for Robin",
        "Use fake ID",
        "Take job",
        "Work as a docker",
        "Ask for work",
        "Ask for raise",
        "Sneak inside"
    ];

    function injectDocksEntry() {
        const passageEl = document.querySelector("#passages .passage");
        if (!passageEl) return;
        if (passageEl.querySelector("#bjx-docks-ride-entry")) return;
        const V = window.V;
        if (!V) return;
        if (!(V.money >= 100000 && V.history >= 700 && V.exposed <= 0)) return;

        let anchor = null;
        for (const prefix of DOCKS_ANCHORS) {
            anchor = findLinkByPrefix(passageEl, prefix);
            if (anchor) break;
        }
        const holder = renderTwee(
            "<<link [[找船去四季岛 (0:20)|Docks Ride]]>><<pass 20>><</link>>"
        );
        if (!holder) return;
        holder.id = "bjx-docks-ride-entry";
        if (anchor) {
            insertBeforeLine(anchor, holder);
        } else {
            passageEl.appendChild(holder);
            passageEl.appendChild(document.createElement("br"));
        }
    }

    // ---------- main loop ----------
    function onDomChanged() {
        // Defer: let SugarCube finish the current render pass first.
        setTimeout(() => {
            try {
                ensureVars();
                ensureAntBeast();
                ensureLocations();
                const passage = currentPassage();
                if (passage === "Sea") injectSeaEntries();
                else if (passage === "Docks") injectDocksEntry();
            } catch (e) {
                console.error("[" + MOD_NAME + "] onDomChanged error:", e);
            }
        }, 0);
    }

    function boot() {
        const passages = document.getElementById("passages");
        const sc = window;
        if (!passages || !sc.SugarCube || !sc.SugarCube.State || !sc.V) {
            // ModLoader injects late; engine may not be up yet. Retry until ready.
            setTimeout(boot, 250);
            return;
        }
        if (window._bjxAntIslandObserved) return;
        window._bjxAntIslandObserved = true;
        new MutationObserver(onDomChanged).observe(passages, {
            childList: true,
            subtree: true
        });
        onDomChanged();
        console.log("[" + MOD_NAME + "] inject_early loaded", MOD_NAME, MOD_VERSION);
    }

    boot();
})();