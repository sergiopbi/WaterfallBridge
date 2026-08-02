"use strict";

import powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import { formattingSettings, FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataViewValueColumn = powerbi.DataViewValueColumn;

import { VisualFormattingSettingsModel } from "./settings";

import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;
import FormattingSettingsSlice = formattingSettings.Slice;

const MAX_PILLARS = 12;

interface PillarDatum {
    displayName: string;
    queryName: string;
    rawValue: number;
    formatStr: string;
    isTotal: boolean;
    isSubtraction: boolean;
    isOthers: boolean;
    othersCount: number;
    effectiveValue: number;
    start: number;
    end: number;
    sentiment: "increase" | "decrease" | "total" | "others";
}

/**
 * ONE card ("Pillars"), one Group per bound measure — this is the supported
 * multi-instance pattern (see pbi-custom-visuals skill §2): pushing several
 * separate top-level Cards with the same capabilities.json object name only
 * renders the last one (confirmed broken in practice). A single CompositeCard
 * with N Groups, each Group's slice *property names* prefixed by pillar index
 * (p0Visible, p1Visible, ...), avoids that entirely — all properties still land
 * flat on the one "pillarSettings" object, matching capabilities.json exactly.
 */
class PillarsCard extends FormattingSettingsCompositeCard {
    name: string = "pillarSettings";
    displayName: string = "Pillars";
    displayNameKey: string = "Card_Pillars";
    groups: FormattingSettingsGroup[] = [];

    constructor(cols: DataViewValueColumn[], objects: powerbi.DataViewObjects | undefined) {
        super();
        const flat = (objects && (objects as any).pillarSettings) || {};
        this.groups = cols.slice(0, MAX_PILLARS).map((vc, i) => {
            const visible = new formattingSettings.ToggleSwitch({
                name: `p${i}Visible`, displayName: "Visible", displayNameKey: "Prop_PillarVisible", value: flat[`p${i}Visible`] ?? true
            });
            const isTotal = new formattingSettings.ToggleSwitch({
                name: `p${i}IsTotal`, displayName: "Is Total", displayNameKey: "Prop_PillarIsTotal", value: flat[`p${i}IsTotal`] ?? false
            });
            const isSubtraction = new formattingSettings.ToggleSwitch({
                name: `p${i}IsSubtraction`, displayName: "Subtraction (inverts the sign)", displayNameKey: "Prop_PillarIsSubtraction", value: flat[`p${i}IsSubtraction`] ?? false
            });
            return new FormattingSettingsGroup({
                name: `pillar${i}`,
                displayName: `${i + 1}. ${vc.source.displayName}`,
                collapsible: true,
                slices: [visible, isTotal, isSubtraction]
            });
        });
    }
}

const MAX_CATEGORIES = 30;

/**
 * ONE card ("Breakdown Categories"), ONE flat group — only shown when Breakdown mode = Manual
 * selection. Three top-level controls, each doing a genuinely different thing:
 * - "Default": the override — while on, every category counts as visible regardless of the
 *   individual toggles below (this is what a naive "Show all" would look like as a filter flag).
 * - "Select all" / "Deselect all": real one-shot actions — turning one of these on writes true/false
 *   to every individual toggle below via persistProperties, then resets itself back off. Formatting
 *   pane toggles aren't buttons, so this is the standard way to fake one.
 * Individual toggles default to OFF — with many categories it's quicker to start from nothing and
 * switch on the handful you want than to switch off everything you don't.
 */
class BreakdownCategoriesCard extends FormattingSettingsCompositeCard {
    name: string = "breakdownCategorySettings";
    displayName: string = "Breakdown Categories";
    displayNameKey: string = "Card_BreakdownCategories";
    groups: FormattingSettingsGroup[] = [];

    constructor(categoryNames: string[], objects: powerbi.DataViewObjects | undefined) {
        super();
        const flat = (objects && (objects as any).breakdownCategorySettings) || {};
        const isDefault = new formattingSettings.ToggleSwitch({
            name: "showAllCategories", displayName: "Default (ignore individual picks below)", displayNameKey: "Prop_ShowAllCategories", value: flat.showAllCategories ?? true
        });
        const selectAll = new formattingSettings.ToggleSwitch({
            name: "catSelectAll", displayName: "Select all", displayNameKey: "Prop_CatSelectAll", value: false
        });
        const deselectAll = new formattingSettings.ToggleSwitch({
            name: "catDeselectAll", displayName: "Deselect all", displayNameKey: "Prop_CatDeselectAll", value: false
        });
        const perCategory = categoryNames.slice(0, MAX_CATEGORIES).map((name, i) =>
            new formattingSettings.ToggleSwitch({
                name: `c${i}Visible`, displayName: name, value: flat[`c${i}Visible`] ?? false
            })
        );
        this.groups = [new FormattingSettingsGroup({
            name: "categories", displayName: "Categories", displayNameKey: "Group_Categories", collapsible: false,
            slices: [isDefault, selectAll, deselectAll, ...perCategory]
        })];
    }
}

const MAX_CALLOUTS = 4;

/**
 * ONE card ("Variance Callouts"), one Group per callout slot (up to MAX_CALLOUTS). Each slot has
 * its own Show/Start/End; the visual STYLE (box, bridge color/width, value formatting) stays
 * shared across all of them via the static CalloutCardSettings — repeating that per-instance would
 * be a lot of near-duplicate UI for little benefit, and isn't what was asked for here.
 */
class CalloutAnchorsCard extends FormattingSettingsCompositeCard {
    name: string = "calloutAnchors";
    displayName: string = "Variance Callouts";
    displayNameKey: string = "Card_VarianceCallouts";
    groups: FormattingSettingsGroup[] = [];

    constructor(objects: powerbi.DataViewObjects | undefined) {
        super();
        const flat = (objects && (objects as any).calloutAnchors) || {};
        this.groups = Array.from({ length: MAX_CALLOUTS }, (_, i) => {
            const show = new formattingSettings.ToggleSwitch({
                name: `co${i}Show`, displayName: "Show", displayNameKey: "Prop_CalloutShow", value: flat[`co${i}Show`] ?? (i === 0)
            });
            const start = new formattingSettings.NumUpDown({
                name: `co${i}Start`, displayName: "Start pillar (position, 1 = first)", displayNameKey: "Prop_CalloutStart",
                value: flat[`co${i}Start`] ?? 1,
                options: { minValue: { type: 0, value: 1 }, maxValue: { type: 1, value: 12 } }
            });
            const end = new formattingSettings.NumUpDown({
                name: `co${i}End`, displayName: "End pillar (position, 0 = last)", displayNameKey: "Prop_CalloutEnd",
                value: flat[`co${i}End`] ?? 0,
                options: { minValue: { type: 0, value: 0 }, maxValue: { type: 1, value: 12 } }
            });
            return new FormattingSettingsGroup({
                name: `callout${i}`, displayName: `Callout ${i + 1}`, collapsible: true,
                slices: [show, start, end]
            });
        });
    }
}

export class Visual implements IVisual {
    private events: IVisualEventService;
    private host: powerbi.extensibility.visual.IVisualHost;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private pillarsCard: PillarsCard;
    private locale: string;

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();
        this.formattingSettingsService = new FormattingSettingsService(options.host.createLocalizationManager());
        this.target = options.element;
        this.locale = options.host?.locale || "en-US";

        this.target.style.overflow = "hidden";
        this.target.setAttribute("aria-label", "Waterfall bridge chart");
        this.svg = d3.select(this.target).append("svg");
        this.svg.style("width", "100%").style("height", "100%");

        // Context menu — required for certification, and standard native-visual behavior. This
        // visual has no real per-mark selection identity (bars aren't bound to individual data
        // rows the way a category chart's are), so we bind an empty selection id to the whole
        // visual rather than skip the feature.
        this.target.addEventListener("contextmenu", (event: MouseEvent) => {
            if (this.host.hostCapabilities.allowInteractions === false) return;
            event.preventDefault();
            const emptyId = this.host.createSelectionIdBuilder().createSelectionId();
            this.selectionManager.showContextMenu(emptyId, { x: event.clientX, y: event.clientY });
        });
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel, dataView);
            const fmt = this.formattingSettings;

            const hasCategory = (dataView?.categorical?.categories?.length ?? 0) > 0;
            let pillarsCardInstance: PillarsCard | null = null;
            let categoriesCardInstance: BreakdownCategoriesCard | null = null;

            if (!hasCategory) {
                // The whole Pillars menu (visible/total/subtraction) only makes sense without a
                // breakdown dimension bound — with one, the 1-or-2 measures are automatically both
                // visible totals and the flags have no meaning, so we just don't show the card.
                const pillarCols = (dataView?.categorical?.values || []).filter(vc => vc.source.roles && vc.source.roles["measure"]);
                pillarsCardInstance = new PillarsCard(pillarCols, dataView?.metadata?.objects);
                this.pillarsCard = pillarsCardInstance;
            } else {
                const mode = fmt.breakdownCard.breakdownMode.value.value as string;
                if (mode === "manual") {
                    // "Number of bars" is meaningless once the user is picking categories by hand —
                    // swap it out for the actual category list instead.
                    fmt.breakdownCard.slices = fmt.breakdownCard.slices
                        .filter(s => s !== fmt.breakdownCard.breakdownBarCount);
                    const catCol = dataView?.categorical?.categories?.[0];
                    const categoryNames = catCol ? catCol.values.map(v => String(v)) : [];

                    // "Select all" / "Deselect all" aren't real actions in the formatting pane —
                    // toggles only persist state — so we fake a one-shot button: if either came back
                    // true, write true/false to every individual category property via
                    // persistProperties (which triggers a fresh update() shortly), reset both back to
                    // false, and also patch dataView.metadata.objects in place so THIS render already
                    // reflects the change instead of flashing the old state first.
                    const catObjects = (dataView && dataView.metadata.objects && (dataView.metadata.objects as any).breakdownCategorySettings) || {};
                    if (categoryNames.length > 0 && (catObjects.catSelectAll === true || catObjects.catDeselectAll === true)) {
                        const setTo = catObjects.catSelectAll === true;
                        const properties: { [key: string]: powerbi.DataViewPropertyValue } = {
                            catSelectAll: false, catDeselectAll: false
                        };
                        categoryNames.forEach((_, i) => { properties[`c${i}Visible`] = setTo; });
                        this.host.persistProperties({
                            merge: [{ objectName: "breakdownCategorySettings", selector: null, properties } as any]
                        });
                        categoryNames.forEach((_, i) => { catObjects[`c${i}Visible`] = setTo; });
                        catObjects.catSelectAll = false;
                        catObjects.catDeselectAll = false;
                    }

                    categoriesCardInstance = new BreakdownCategoriesCard(categoryNames, dataView?.metadata?.objects);
                }
            }

            const calloutAnchorsCard = new CalloutAnchorsCard(dataView?.metadata?.objects);

            // Explicit, ordered assembly — mirrors how native visuals group their formatting pane:
            // chart-shaping options + colors first, this visual's own data-structure cards next,
            // then the familiar axis/gridlines/labels/connectors block, callouts last.
            const cards: formattingSettings.SimpleCard[] = [];
            if (pillarsCardInstance) cards.push(pillarsCardInstance);
            cards.push(fmt.chartOptionsCard, fmt.dataColorsCard, fmt.breakdownCard);
            if (categoriesCardInstance) cards.push(categoriesCardInstance);
            cards.push(
                fmt.categoryAxisCard, fmt.gridlinesCard, fmt.dataLabelsCard, fmt.connectorsCard,
                calloutAnchorsCard, fmt.calloutCard
            );
            fmt.cards = cards;

            this.render(dataView, options.viewport);

            this.events.renderingFinished(options);
        } catch (error) {
            this.renderError(error as Error);
            this.events.renderingFailed(options, String(error));
        }
    }

    private renderError(error: Error): void {
        this.svg.selectAll("*").remove();
        this.svg.append("text")
            .attr("x", 10).attr("y", 20)
            .attr("fill", "#B00020").attr("font-size", "11px").style("white-space", "pre")
            .text("[RENDER ERROR] " + (error?.message || String(error)));
    }

    // ---- number formatting: manual bypass (don't trust valueFormatter blindly) ----
    private parseFormatSection(section: string): { prefix: string; suffix: string } {
        const match = /[#0][#0,. ]*[#0]|[#0]/.exec(section || "");
        if (!match) return { prefix: (section || "").trim(), suffix: "" };
        return { prefix: section.slice(0, match.index), suffix: section.slice(match.index + match[0].length) };
    }

    private scaleAndSuffix(value: number): { scaled: number; unit: string } {
        const abs = Math.abs(value);
        if (abs >= 1e9) return { scaled: value / 1e9, unit: "B" };
        if (abs >= 1e6) return { scaled: value / 1e6, unit: "M" };
        if (abs >= 1e3) return { scaled: value / 1e3, unit: "K" };
        return { scaled: value, unit: "" };
    }

    private formatValue(rawValue: number, formatStr: string): string {
        const sections = (formatStr || "#,0").split(";");
        const positiveSection = sections[0] || "#,0";
        const negativeSection = sections.length > 1 ? sections[1] : null;
        const isNeg = rawValue < 0;
        const section = isNeg && negativeSection ? negativeSection : positiveSection;
        const { prefix, suffix } = this.parseFormatSection(section);
        const decimalsMatch = section.match(/\.([0]+)/);
        const decimals = decimalsMatch ? decimalsMatch[1].length : 0;
        const { scaled, unit } = this.scaleAndSuffix(rawValue);
        // Only add our own "-" when the format string has no dedicated negative section to
        // supply one itself (e.g. a plain "#,0" used for both signs). If a negative section
        // exists, trust its own literal sign/prefix instead of also prepending one — doing both
        // produced a real "-+493,6K" bug when the positive section already had a literal "+".
        const sign = isNeg && !negativeSection ? "-" : "";
        const numStr = Math.abs(scaled).toLocaleString(this.locale, {
            minimumFractionDigits: decimals, maximumFractionDigits: decimals
        });
        return `${sign}${prefix.trim()}${numStr}${unit}${suffix.trim()}`;
    }

    private getDynamicFormat(vc: DataViewValueColumn): string {
        const dyn = vc.objects && vc.objects[0] && (vc.objects[0] as any).general
            ? (vc.objects[0] as any).general.formatString : undefined;
        return dyn || vc.source.format || "#,0";
    }

    // d3's standard SVG text-wrap routine (breaks on spaces, adds tspans) — used for the category
    // axis so long KPI/pillar names don't get clipped or forced into an unreadable rotation.
    private wrapText(selection: d3.Selection<SVGTextElement, unknown, any, any>, width: number): void {
        selection.each(function () {
            const text = d3.select(this);
            const words = (text.text() || "").split(/\s+/).reverse().filter(w => w.length > 0);
            let word: string | undefined;
            let line: string[] = [];
            let lineNumber = 0;
            const lineHeightEm = 1.1;
            const xAttr = text.attr("x") || "0";
            const yAttr = text.attr("y") || "0";
            const dy = parseFloat(text.attr("dy") || "0");
            text.text(null);
            let tspan = text.append("tspan").attr("x", xAttr).attr("y", yAttr).attr("dy", dy + "em");
            while ((word = words.pop())) {
                line.push(word);
                tspan.text(line.join(" "));
                const node = tspan.node() as SVGTSpanElement;
                if (node.getComputedTextLength() > width && line.length > 1) {
                    line.pop();
                    tspan.text(line.join(" "));
                    line = [word];
                    lineNumber++;
                    tspan = text.append("tspan").attr("x", xAttr).attr("y", yAttr)
                        .attr("dy", `${lineNumber * lineHeightEm + dy}em`).text(word);
                }
            }
        });
    }

    // Builds the chained delta bars for one breakdown segment, continuing the running cumulative
    // from `runningStart` — this replaces a single anchor pillar in the main sequence.
    private buildBreakdownBars(
        items: { name: string; rawValue: number }[], formatStr: string, isSubtraction: boolean, runningStart: number,
        manualVisible: boolean[] | null = null
    ): PillarDatum[] {
        const fmt = this.formattingSettings;
        const withEffective = items.map(it => ({ ...it, effectiveValue: isSubtraction ? -it.rawValue : it.rawValue }));

        let shown: typeof withEffective;
        let othersRawSum = 0, othersEffSum = 0, othersCount = 0;

        if (manualVisible) {
            // Manual mode: whatever the user picked stays in its original order; everything else
            // folds into Others — no sorting by impact here, the user is choosing deliberately.
            shown = withEffective.filter((_, i) => manualVisible[i] !== false);
            const rest = withEffective.filter((_, i) => manualVisible[i] === false);
            othersRawSum = rest.reduce((s, it) => s + it.rawValue, 0);
            othersEffSum = rest.reduce((s, it) => s + it.effectiveValue, 0);
            othersCount = rest.length;
        } else {
            const barCount = Math.max(2, Math.round(fmt.breakdownCard.breakdownBarCount.value));
            const sorted = [...withEffective].sort((a, b) => Math.abs(b.effectiveValue) - Math.abs(a.effectiveValue));
            shown = sorted;
            if (sorted.length > barCount) {
                shown = sorted.slice(0, barCount - 1);
                const rest = sorted.slice(barCount - 1);
                othersRawSum = rest.reduce((s, it) => s + it.rawValue, 0);
                othersEffSum = rest.reduce((s, it) => s + it.effectiveValue, 0);
                othersCount = rest.length;
            }
        }

        let running = runningStart;
        const result: PillarDatum[] = [];
        shown.forEach(it => {
            const start = running, end = running + it.effectiveValue;
            running = end;
            result.push({
                displayName: it.name, queryName: `__cat__${it.name}`,
                rawValue: it.rawValue, formatStr,
                isTotal: false, isSubtraction, isOthers: false, othersCount: 0,
                effectiveValue: it.effectiveValue,
                start, end, sentiment: it.effectiveValue >= 0 ? "increase" : "decrease"
            });
        });
        if (othersCount > 0) {
            const start = running, end = running + othersEffSum;
            running = end;
            result.push({
                displayName: fmt.breakdownCard.othersLabel.value || "Others", queryName: "__cat_others__",
                rawValue: othersRawSum, formatStr,
                isTotal: false, isSubtraction: false, isOthers: true, othersCount,
                effectiveValue: othersEffSum,
                start, end, sentiment: "others"
            });
        }
        return result;
    }

    // ---- data shaping: Pillars mode, with an optional single breakdown segment ----
    // When a Breakdown Category dimension is bound, Power BI evaluates EVERY measure per category
    // row (there's no way around that within one categorical mapping) — so every pillar's `.values`
    // becomes an array of N numbers instead of one. For any pillar that ISN'T the breakdown anchor,
    // we collapse that back into a single total by summing across categories (valid for additive
    // financial measures, which this visual is built around). For the ONE pillar marked as the
    // breakdown anchor, we use its per-category array directly as the items to decompose — no
    // separate "value to break down" field needed; it's just that pillar's own measure.
    private buildPillarData(dataView: powerbi.DataView): PillarDatum[] {
        const cols = (dataView.categorical.values || []).filter(vc => vc.source.roles && vc.source.roles["measure"]).slice(0, MAX_PILLARS);
        const flat = (dataView.metadata.objects && (dataView.metadata.objects as any).pillarSettings) || {};
        const catCol = dataView.categorical.categories && dataView.categorical.categories[0];
        const categoryNames = catCol ? catCol.values.map(v => String(v)) : null;

        const breakdownMode = this.formattingSettings.breakdownCard.breakdownMode.value.value as string;
        const catFlat = (dataView.metadata.objects && (dataView.metadata.objects as any).breakdownCategorySettings) || {};
        const showAllCategories = catFlat.showAllCategories ?? true;
        const manualVisible: boolean[] | null = (breakdownMode === "manual" && categoryNames && !showAllCategories)
            ? categoryNames.map((_, idx) => catFlat[`c${idx}Visible`] ?? false)
            : null;

        const collapsedRawValue = (vc: DataViewValueColumn): number => {
            if (!categoryNames) return Number(vc.values[0]) || 0;
            return (vc.values as any[]).reduce((s, v) => s + (Number(v) || 0), 0);
        };

        // First pass: sum every hidden pillar's effective (sign-corrected) value into one "Others" bucket
        let othersSum = 0;
        let othersCount = 0;
        let othersFormat: string | undefined;
        cols.forEach((vc, i) => {
            const visible = flat[`p${i}Visible`] ?? true;
            if (visible === false) {
                const isSubtraction = flat[`p${i}IsSubtraction`] ?? false;
                const rawValue = collapsedRawValue(vc);
                othersSum += isSubtraction ? -rawValue : rawValue;
                othersCount++;
                if (!othersFormat) othersFormat = this.getDynamicFormat(vc);
            }
        });

        // ---- Auto-detect which breakdown mode applies (per the agreed rules) ----
        // 1 visible pillar + category  -> that pillar is automatically the anchor (no flag needed).
        // 2 visible pillars + category -> automatically treated as Start/End totals (PY->CY style);
        //                                  the category delta is (End's per-category value - Start's).
        // 3+ visible pillars + category -> ambiguous; needs the explicit "breakdown start" flag on
        //                                  exactly one pillar, same as before.
        const visibleIdx: number[] = [];
        cols.forEach((vc, i) => { if ((flat[`p${i}Visible`] ?? true) !== false) visibleIdx.push(i); });
        const hasCategory = !!(categoryNames && categoryNames.length > 0);

        // With a category bound, capabilities.json already caps measures at 2 — so it's always
        // exactly 1 or 2 visible pillars here, never more. No flag needed to disambiguate anymore.
        let mode: "none" | "singleAuto" | "twoAnchor" = "none";
        let singleAnchorIdx = -1;
        let twoAnchorIdx: [number, number] = [-1, -1];
        if (hasCategory) {
            if (visibleIdx.length === 1) {
                mode = "singleAuto";
                singleAnchorIdx = visibleIdx[0];
            } else if (visibleIdx.length >= 2) {
                mode = "twoAnchor";
                twoAnchorIdx = [visibleIdx[0], visibleIdx[1]];
            }
        }

        let running = 0;
        const visibleResult: PillarDatum[] = [];
        const skipIdx = new Set<number>();

        if (mode === "twoAnchor") {
            const [i1, i2] = twoAnchorIdx;
            skipIdx.add(i1); skipIdx.add(i2);
            const vc1 = cols[i1], vc2 = cols[i2];
            const totalStartRaw = collapsedRawValue(vc1);
            const totalEndRaw = collapsedRawValue(vc2);
            const formatStr = this.getDynamicFormat(vc2);
            const items = (categoryNames as string[]).map((name, idx) => ({
                name, rawValue: (Number(vc2.values[idx]) || 0) - (Number(vc1.values[idx]) || 0)
            }));
            const bars = this.buildBreakdownBars(items, formatStr, false, totalStartRaw, manualVisible);
            visibleResult.push({
                displayName: vc1.source.displayName, queryName: `${vc1.source.queryName}__total`,
                rawValue: totalStartRaw, formatStr: this.getDynamicFormat(vc1),
                isTotal: true, isSubtraction: false, isOthers: false, othersCount: 0,
                effectiveValue: totalStartRaw, start: 0, end: totalStartRaw, sentiment: "total"
            });
            visibleResult.push(...bars);
            visibleResult.push({
                displayName: vc2.source.displayName, queryName: `${vc2.source.queryName}__total`,
                rawValue: totalEndRaw, formatStr,
                isTotal: true, isSubtraction: false, isOthers: false, othersCount: 0,
                effectiveValue: totalEndRaw, start: 0, end: totalEndRaw, sentiment: "total"
            });
            running = totalEndRaw;
        }

        cols.forEach((vc, i) => {
            if (skipIdx.has(i)) return; // already emitted above (twoAnchor mode)
            const visible = flat[`p${i}Visible`] ?? true;
            if (visible === false) return; // folded into the Others bucket, appended below

            const isTotal = flat[`p${i}IsTotal`] ?? false;
            const isSubtraction = hasCategory ? false : (flat[`p${i}IsSubtraction`] ?? false);
            const isThisTheAnchor = mode === "singleAuto" && i === singleAnchorIdx;

            if (isThisTheAnchor) {
                const items = (categoryNames as string[]).map((name, idx) => ({ name, rawValue: Number(vc.values[idx]) || 0 }));
                const forwardBars = this.buildBreakdownBars(items, this.getDynamicFormat(vc), isSubtraction, running, manualVisible);
                const forwardEnd = forwardBars.length > 0 ? forwardBars[forwardBars.length - 1].end : running;

                const showTotal = this.formattingSettings.breakdownCard.breakdownShowTotal.value;
                const totalPosition = this.formattingSettings.breakdownCard.breakdownTotalPosition.value.value as string;

                if (showTotal && totalPosition === "left") {
                    // Reversed cascade: start at the total value and step DOWN through each category
                    // to the base — same bars, same order, same colors (sentiment already comes from
                    // each category's own sign, not from the walk direction), just repositioned so the
                    // sequence reads "Total, then decomposing down to zero" instead of the other way.
                    let runningRev = forwardEnd;
                    forwardBars.forEach(bar => {
                        const span = bar.end - bar.start;
                        bar.end = runningRev;
                        bar.start = runningRev - span;
                        runningRev = bar.start;
                    });
                }

                const totalRaw = collapsedRawValue(vc);
                const totalDatum: PillarDatum = {
                    displayName: vc.source.displayName, queryName: `${vc.source.queryName}__total`,
                    rawValue: totalRaw, formatStr: this.getDynamicFormat(vc),
                    isTotal: true, isSubtraction: false, isOthers: false, othersCount: 0,
                    effectiveValue: totalRaw, start: 0, end: totalRaw, sentiment: "total"
                };

                if (showTotal && totalPosition === "left") visibleResult.push(totalDatum, ...forwardBars);
                else if (showTotal) visibleResult.push(...forwardBars, totalDatum);
                else visibleResult.push(...forwardBars);

                // Whichever side the Total bar sits on (or if it's hidden), the running cumulative
                // that feeds the NEXT real pillar always continues from the true end of the cascade —
                // the Total bar is a bracketing reference, not a new cascade anchor.
                running = forwardEnd;
                return;
            }

            const rawValue = collapsedRawValue(vc);
            const effectiveValue = isSubtraction ? -rawValue : rawValue;

            let start: number, end: number, sentiment: PillarDatum["sentiment"];
            if (isTotal) {
                start = 0;
                end = rawValue;
                running = rawValue;
                sentiment = "total";
            } else {
                start = running;
                end = running + effectiveValue;
                running = end;
                sentiment = effectiveValue >= 0 ? "increase" : "decrease";
            }

            visibleResult.push({
                displayName: vc.source.displayName,
                queryName: vc.source.queryName,
                rawValue, formatStr: this.getDynamicFormat(vc),
                isTotal, isSubtraction, isOthers: false, othersCount: 0, effectiveValue,
                start, end, sentiment
            });
        });

        if (othersCount > 0) {
            // Always last — but if the sequence ends in a grand total (the common case, e.g. a
            // closing "CY" total), insert right before it rather than after, so the cascade still
            // reads left-to-right into that total instead of trailing behind it.
            const endsInTotal = visibleResult.length > 0 && visibleResult[visibleResult.length - 1].isTotal;
            const insertAt = endsInTotal ? visibleResult.length - 1 : visibleResult.length;
            const start = insertAt > 0 ? visibleResult[insertAt - 1].end : 0;
            const end = start + othersSum;
            visibleResult.splice(insertAt, 0, {
                displayName: this.formattingSettings.breakdownCard.othersLabel.value || "Others",
                queryName: "__others__",
                rawValue: othersSum, formatStr: othersFormat || "#,0",
                isTotal: false, isSubtraction: false, isOthers: true, othersCount,
                effectiveValue: othersSum,
                start, end, sentiment: "others"
            });
        }

        return visibleResult;
    }

    private render(dataView: powerbi.DataView, viewport: powerbi.IViewport): void {
        this.svg.selectAll("*").remove();

        if (!dataView?.categorical?.values || dataView.categorical.values.length === 0) {
            this.svg.append("text").attr("x", 10).attr("y", 20).attr("font-size", "12px")
                .text("Arrasta pelo menos uma medida para \"Pillars\".");
            return;
        }

        const data = this.buildPillarData(dataView);
        if (data.length === 0) {
            this.svg.append("text").attr("x", 10).attr("y", 20).attr("font-size", "12px")
                .text("Todos os pilares estão ocultos (Visible = off).");
            return;
        }

        const fmt = this.formattingSettings;
        const isHorizontal = (fmt.chartOptionsCard.chartOrientation.value.value as string) === "horizontal";

        // Callout level assignment happens here, BEFORE the margin, because the margin needs to
        // know the real max level (not just how many callouts are active) — two callouts can share
        // level 0 if their spans don't overlap, so reserving space per-callout wasted a whole level's
        // worth of blank space whenever that happened.
        const calloutFlat = (dataView.metadata.objects && (dataView.metadata.objects as any).calloutAnchors) || {};
        const calloutDefs = Array.from({ length: MAX_CALLOUTS }, (_, i) => ({
            show: calloutFlat[`co${i}Show`] ?? (i === 0),
            start: calloutFlat[`co${i}Start`] ?? 1,
            end: calloutFlat[`co${i}End`] ?? 0
        }))
            .filter(c => c.show)
            .map(c => {
                const startIdx = Math.min(Math.max(Math.round(c.start) - 1, 0), data.length - 1);
                const endRaw = Math.round(c.end);
                const endIdx = endRaw <= 0 ? data.length - 1 : Math.min(Math.max(endRaw - 1, 0), data.length - 1);
                return { lo: Math.min(startIdx, endIdx), hi: Math.max(startIdx, endIdx), startIdx, endIdx };
            })
            // Narrowest span first — when a wide one (e.g. pillar 1→3) and two narrow ones it
            // contains (1→2, 2→3) all fit, this makes the narrow pair claim the base level and
            // pushes the wide one out to its own level, matching how these brackets read visually.
            .sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo));

        // Greedy interval-to-levels assignment: each callout goes on the lowest level whose
        // existing spans don't overlap its own (touching endpoints, e.g. 1→2 and 2→3, don't count).
        const levelSpans: { lo: number; hi: number }[][] = [];
        const levelOf = calloutDefs.map(def => {
            let level = 0;
            while (levelSpans[level] && levelSpans[level].some(s => def.lo < s.hi && s.lo < def.hi)) level++;
            if (!levelSpans[level]) levelSpans[level] = [];
            levelSpans[level].push({ lo: def.lo, hi: def.hi });
            return level;
        });
        const calloutOn = calloutDefs.length > 0;
        const maxCalloutLevel = levelOf.length > 0 ? Math.max(...levelOf) : 0;

        const axisWrap = fmt.categoryAxisCard.axisWrapText.value;
        const axisMaxWidth = fmt.categoryAxisCard.axisLabelMaxWidth.value;
        const axisPadding = fmt.categoryAxisCard.axisLabelPadding.value;
        const axisTickPadding = fmt.categoryAxisCard.axisTickPadding.value;
        const axisFontSize = fmt.categoryAxisCard.axisFontSize.value;

        const margin = isHorizontal
            ? { top: 15, right: calloutOn ? 110 + maxCalloutLevel * 90 : 60, bottom: 20, left: axisMaxWidth + axisPadding + axisTickPadding + 10 }
            : {
                top: calloutOn ? 55 + maxCalloutLevel * 38 : 20, right: 20,
                bottom: axisWrap ? (axisFontSize * 3.3 + axisPadding + axisTickPadding + 10) : (axisFontSize * 2 + axisPadding + axisTickPadding + 30),
                left: 20
            };
        const width = Math.max(50, viewport.width - margin.left - margin.right);
        const height = Math.max(50, viewport.height - margin.top - margin.bottom);

        this.svg.attr("viewBox", `0 0 ${viewport.width} ${viewport.height}`).attr("preserveAspectRatio", "none");
        const g = this.svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        // Band = one slot per pillar/category bar. Value = the cumulative-total axis.
        // Vertical: band -> x (left→right), value -> y (inverted, larger value = smaller y).
        // Horizontal: band -> y (top→bottom), value -> x (not inverted, larger value = larger x).
        const bandScale = d3.scaleBand<string>()
            .domain(data.map((d, i) => `${i}`))
            .range([0, isHorizontal ? height : width])
            .padding(0.25);

        const allValues = data.flatMap(d => [d.start, d.end]);
        const vMin = Math.min(0, ...allValues);
        const vMax = Math.max(0, ...allValues);
        // NOTE: domainMin/domainMax are the tight data bounds, no padding — padding is added AFTER
        // the compression transform below (in transformed space), not here in raw value space.
        // Adding it here meant a fixed "12% of raw value" gap could turn into a huge, disproportionate
        // pixel gap once passed through a strong compression curve (a small raw gap near a very large
        // value explodes after exponentiation) — that's what was eating half the chart under extreme
        // negative compression.
        const domainMin = vMin, domainMax = vMax;

        // Single unified "value compression" control (0 = today's plain linear look, can go well
        // beyond ±100 — the curve just keeps getting more extreme, asymptotically, it never breaks).
        // Positive: a signed power curve (gamma < 1) that compresses values far from zero relative
        // to values near zero — squeezes the tall/far end of the cascade, gives more room to
        // whatever sits close to zero. Negative: the mirror curve (gamma > 1) — expands the far end
        // instead, compressing what's near zero. Which direction actually helps depends on where in
        // the cascade your small deltas happen to sit — that's exactly why it's a signed dial rather
        // than a single "more compression" checkbox. Gamma is computed exponentially (not linearly)
        // specifically so it can never hit zero or go negative, however far the dial is pushed —
        // a linear formula would eventually invert the whole scale's ordering.
        const compression = Math.max(-300, Math.min(300, fmt.chartOptionsCard.valueCompression.value));
        const t = compression / 100;
        const gamma = t >= 0 ? Math.exp(-t * 1.05) : Math.exp(-t * 0.92);
        const signedPow = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), gamma);
        const tRawMin = signedPow(domainMin);
        const tRawMax = signedPow(domainMax);
        const tPad = (tRawMax - tRawMin) * 0.12 || 1; // 12% headroom, added in transformed space
        // Padding on both ends, not just the top: negative-value labels now render below their bar
        // (see the label positioning below), which needs the same breathing room at the bottom that
        // positive labels always had at the top - without it, a bar sitting right at the domain
        // minimum had its label collide with the category axis line/labels.
        const linScale = d3.scaleLinear().domain([tRawMin - tPad, tRawMax + tPad]).range(isHorizontal ? [0, width] : [height, 0]);
        const valueScale = (v: number) => linScale(signedPow(v));
        const tickRefScale = d3.scaleLinear().domain([domainMin, domainMax]);
        const clampToDomain = (v: number) => Math.max(domainMin, Math.min(domainMax, v));

        const dashArrayFor = (style: string) => {
            if (style === "dotted") return "1,3";
            if (style === "dashed") return "5,3";
            return "0";
        };

        // Gridlines — horizontal reference lines in vertical mode, vertical in horizontal mode.
        // Drawn early so bars/labels paint over them, same as the connectors.
        if (fmt.gridlinesCard.gridlinesShow.value) {
            const gridDash = dashArrayFor(fmt.gridlinesCard.gridlinesStyle.value.value as string);
            const gridColor = fmt.gridlinesCard.gridlinesColor.value.value;
            const gridWidth = fmt.gridlinesCard.gridlinesWidth.value;
            const ticks = tickRefScale.ticks(6);
            const gridG = g.append("g").attr("class", "gridlines");
            ticks.forEach(tk => {
                const pos = valueScale(tk);
                const line = gridG.append("line")
                    .attr("stroke", gridColor).attr("stroke-width", gridWidth).attr("stroke-dasharray", gridDash);
                if (isHorizontal) line.attr("x1", pos).attr("x2", pos).attr("y1", 0).attr("y2", height);
                else line.attr("y1", pos).attr("y2", pos).attr("x1", 0).attr("x2", width);
            });
        }


        const isHighContrast = this.host.colorPalette.isHighContrast;
        const hcForeground = isHighContrast ? this.host.colorPalette.foreground.value : null;

        const colorFor = (d: PillarDatum) => {
            if (hcForeground) return hcForeground;
            if (d.sentiment === "others") return fmt.dataColorsCard.colorOthers.value.value;
            if (!fmt.dataColorsCard.sentimentsShow.value) return fmt.dataColorsCard.colorTotal.value.value;
            if (d.sentiment === "total") return fmt.dataColorsCard.colorTotal.value.value;
            if (d.sentiment === "increase") return fmt.dataColorsCard.colorIncrease.value.value;
            return fmt.dataColorsCard.colorDecrease.value.value;
        };

        // Connectors — dashed lines bridging the gap between one bar's end and the next bar's start.
        if (fmt.connectorsCard.connectorsShow.value) {
            for (let i = 0; i < data.length - 1; i++) {
                const cur = data[i];
                const next = data[i + 1];
                const bandEnd = (bandScale(`${i}`) as number) + bandScale.bandwidth();
                const bandStart = bandScale(`${i + 1}`) as number;
                // The connector belongs where the two bars visually meet. A Total bar always shows
                // its OWN absolute value (start=0, end=rawValue) regardless of whatever cumulative
                // led into it — so when either side of the pair is a Total, the joint is that
                // Total's own top (its .end), not the running value that happens to precede/follow
                // it. Between two non-total bars, use whichever of the forward/reversed pairings
                // actually matches (handles both the normal cascade and the reversed breakdown one).
                let joint: number;
                if (next.isTotal) joint = next.end;
                else if (cur.isTotal) joint = cur.end;
                else joint = Math.abs(cur.end - next.start) <= Math.abs(cur.start - next.end) ? cur.end : cur.start;
                const valuePos = valueScale(clampToDomain(joint));
                const line = g.append("line")
                    .attr("stroke", fmt.connectorsCard.connectorsColor.value.value)
                    .attr("stroke-width", fmt.connectorsCard.connectorsStrokeWidth.value)
                    .attr("stroke-dasharray", dashArrayFor(fmt.connectorsCard.connectorsStyle.value.value as string));
                if (isHorizontal) {
                    line.attr("x1", valuePos).attr("x2", valuePos).attr("y1", bandEnd).attr("y2", bandStart);
                } else {
                    line.attr("y1", valuePos).attr("y2", valuePos).attr("x1", bandEnd).attr("x2", bandStart);
                }
            }
        }

        // Pre-compute the variance callout geometry (colors/positions) now, but draw the bridge
        // LINES here — before the bars/labels — and the value box/text at the very end of render().
        // Drawing the bridge after the labels painted the vertical connector line straight over a
        // pillar's own value label; drawing it first lets bars/labels paint over it naturally.
        // The bridge/box concept is inherently a "vertical" idea (a bracket above the bars) — in
        // horizontal orientation we still show the value, just without the bridge/box geometry.
        interface CalloutInstance {
            startD: PillarDatum; endD: PillarDatum; delta: number; pct: number;
            variationColor: string; bridgeColor: string; xMid: number; bridgeY: number;
        }
        const callouts: CalloutInstance[] = [];

        // Precompute bridgeY (vertical) / bridgeX (horizontal) for every callout first — needed so
        // a strut can terminate at the bracket below it instead of always diving to the bar.
        const tallestTopPx = !isHorizontal
            ? Math.min(...data.map(d => valueScale(clampToDomain(Math.max(d.start, d.end)))))
            : 0;
        // Base clearance between the tallest bar's top and the callout bridge line, plus extra
        // room when data labels are shown above bars — the default "center" callout position sits
        // its text right on the bridge line, and without this the box/text was overlapping the
        // data label drawn just above the bar.
        const calloutClearance = 25 + (fmt.dataLabelsCard.labelsShow.value && fmt.dataLabelsCard.labelsPosition.value.value === "outsideEnd" ? 20 : 0);
        const calloutGeoms = calloutDefs.map((def, ci) => {
            const level = levelOf[ci];
            return {
                ...def, level,
                pos: isHorizontal ? width + 18 + level * 90 : tallestTopPx - calloutClearance - level * 38
            };
        });

        // A strut for anchor index `idx` at `ownLevel` should stop at the nearest LOWER-level
        // callout that shares this exact same anchor (rather than diving straight to the bar) —
        // that's what avoids several struts converging on the same spot on the bar itself.
        const strutTarget = (idx: number, ownLevel: number): number => {
            let best: { level: number; pos: number } | null = null;
            calloutGeoms.forEach(cg => {
                if (cg.level < ownLevel && (cg.startIdx === idx || cg.endIdx === idx)) {
                    if (!best || cg.level > best.level) best = { level: cg.level, pos: cg.pos };
                }
            });
            if (best) return (best as { level: number; pos: number }).pos;
            const d = data[idx];
            return valueScale(clampToDomain(Math.max(d.start, d.end)));
        };

        if (data.length > 0) {
            calloutDefs.forEach((def, ci) => {
                const level = levelOf[ci];
                const startIdx = def.startIdx, endIdx = def.endIdx;
                const startD = data[startIdx];
                const endD = data[endIdx];
                const startVal = startD.isTotal ? startD.rawValue : startD.end;
                const endVal = endD.isTotal ? endD.rawValue : endD.end;
                const delta = endVal - startVal;
                const pct = startVal !== 0 ? (delta / Math.abs(startVal)) * 100 : 0;
                const variationColor = delta >= 0 ? fmt.dataColorsCard.colorIncrease.value.value : fmt.dataColorsCard.colorDecrease.value.value;
                const bridgeColor = fmt.calloutCard.calloutBridgeAutoColor.value
                    ? variationColor : fmt.calloutCard.calloutBridgeColor.value.value;
                const bridgeDash = dashArrayFor(fmt.calloutCard.calloutBridgeStyle.value.value as string);
                const bridgeWidth = fmt.calloutCard.calloutBridgeWidth.value;

                if (!isHorizontal) {
                    const xStart = (bandScale(`${startIdx}`) as number) + bandScale.bandwidth() / 2;
                    const xEnd = (bandScale(`${endIdx}`) as number) + bandScale.bandwidth() / 2;
                    const bridgeY = tallestTopPx - calloutClearance - level * 38;
                    callouts.push({ startD, endD, delta, pct, variationColor, bridgeColor, xMid: (xStart + xEnd) / 2, bridgeY });

                    if (fmt.calloutCard.calloutBridgeShow.value && startIdx !== endIdx) {
                        const topStart = strutTarget(startIdx, level);
                        const topEnd = strutTarget(endIdx, level);
                        const bridge = g.append("g").attr("class", "callout-bridge");
                        bridge.append("line").attr("x1", xStart).attr("x2", xStart).attr("y1", bridgeY).attr("y2", topStart)
                            .attr("stroke", bridgeColor).attr("stroke-width", bridgeWidth).attr("stroke-dasharray", bridgeDash);
                        bridge.append("line").attr("x1", xEnd).attr("x2", xEnd).attr("y1", bridgeY).attr("y2", topEnd)
                            .attr("stroke", bridgeColor).attr("stroke-width", bridgeWidth).attr("stroke-dasharray", bridgeDash);
                        bridge.append("line").attr("x1", xStart).attr("x2", xEnd).attr("y1", bridgeY).attr("y2", bridgeY)
                            .attr("stroke", bridgeColor).attr("stroke-width", bridgeWidth).attr("stroke-dasharray", bridgeDash);
                    }
                } else {
                    // Mirrored bridge on the right: same bracket concept, rotated — a vertical line
                    // beyond the widest bar, with horizontal ties running out to each anchor row.
                    // Extra levels push further right instead of further up.
                    const yStart = (bandScale(`${startIdx}`) as number) + bandScale.bandwidth() / 2;
                    const yEnd = (bandScale(`${endIdx}`) as number) + bandScale.bandwidth() / 2;
                    const bridgeX = width + 18 + level * 90;
                    callouts.push({ startD, endD, delta, pct, variationColor, bridgeColor, xMid: (yStart + yEnd) / 2, bridgeY: bridgeX });

                    if (fmt.calloutCard.calloutBridgeShow.value && startIdx !== endIdx) {
                        const farStart = strutTarget(startIdx, level);
                        const farEnd = strutTarget(endIdx, level);
                        const bridge = g.append("g").attr("class", "callout-bridge");
                        bridge.append("line").attr("y1", yStart).attr("y2", yStart).attr("x1", bridgeX).attr("x2", farStart)
                            .attr("stroke", bridgeColor).attr("stroke-width", bridgeWidth).attr("stroke-dasharray", bridgeDash);
                        bridge.append("line").attr("y1", yEnd).attr("y2", yEnd).attr("x1", bridgeX).attr("x2", farEnd)
                            .attr("stroke", bridgeColor).attr("stroke-width", bridgeWidth).attr("stroke-dasharray", bridgeDash);
                        bridge.append("line").attr("y1", yStart).attr("y2", yEnd).attr("x1", bridgeX).attr("x2", bridgeX)
                            .attr("stroke", bridgeColor).attr("stroke-width", bridgeWidth).attr("stroke-dasharray", bridgeDash);
                    }
                }
            });
        }

        // Bars — clamped to the domain when in "crop totals" mode, so a Total's real magnitude
        // (millions) doesn't stretch the axis; the label still shows the true value regardless.
        const bars = g.selectAll(".pillar-bar")
            .data(data)
            .join("rect")
            .attr("class", "pillar-bar")
            .attr("fill", d => colorFor(d));

        if (isHorizontal) {
            bars.attr("y", (d, i) => bandScale(`${i}`) as number)
                .attr("height", bandScale.bandwidth())
                .attr("x", d => valueScale(clampToDomain(Math.min(d.start, d.end))))
                .attr("width", d => Math.max(1, Math.abs(
                    valueScale(clampToDomain(d.start)) - valueScale(clampToDomain(d.end)))));
        } else {
            bars.attr("x", (d, i) => bandScale(`${i}`) as number)
                .attr("width", bandScale.bandwidth())
                .attr("y", d => valueScale(clampToDomain(Math.max(d.start, d.end))))
                .attr("height", d => Math.max(1, Math.abs(
                    valueScale(clampToDomain(d.start)) - valueScale(clampToDomain(d.end)))));
        }


        const tooltipItems = (d: PillarDatum): powerbi.extensibility.VisualTooltipDataItem[] => {
            if (d.isOthers) {
                return [
                    { displayName: d.displayName, value: this.formatValue(d.effectiveValue, d.formatStr) },
                    { displayName: "Pilares ocultos agregados", value: String(d.othersCount) }
                ];
            }
            if (d.isTotal) {
                return [{ displayName: d.displayName, value: this.formatValue(d.rawValue, d.formatStr) }];
            }
            const items: powerbi.extensibility.VisualTooltipDataItem[] = [
                { displayName: d.displayName, value: this.formatValue(d.effectiveValue, d.formatStr) }
            ];
            if (d.isSubtraction) {
                items.push({
                    displayName: "Valor original",
                    value: `${this.formatValue(d.rawValue, d.formatStr)} (subtração aplicada)`
                });
            }
            return items;
        };

        bars
            .on("mouseover", (event: MouseEvent, d: PillarDatum) => {
                if (this.host.hostCapabilities.allowInteractions === false) return;
                this.host.tooltipService.show({
                    coordinates: [event.clientX, event.clientY], isTouchEvent: false, dataItems: tooltipItems(d), identities: []
                });
            })
            .on("mousemove", (event: MouseEvent, d: PillarDatum) => {
                if (this.host.hostCapabilities.allowInteractions === false) return;
                this.host.tooltipService.move({
                    coordinates: [event.clientX, event.clientY], isTouchEvent: false, dataItems: tooltipItems(d), identities: []
                });
            })
            .on("mouseleave", () => {
                this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
            });

        // Labels — value shown just beyond the "far" edge (the edge on the higher-value side) for a
        // positive value, or just beyond the "near" edge (the lower-value side) for a negative one —
        // so a negative bar's label sits below/left of it instead of floating above/right where it
        // could crowd the connector line and the bar above it, or the callout box.
        if (fmt.dataLabelsCard.labelsShow.value) {
            const position = fmt.dataLabelsCard.labelsPosition.value.value as string;
            const labelValue = (d: PillarDatum) => d.isTotal ? d.rawValue : d.effectiveValue;
            const labelText = (d: PillarDatum) => this.formatValue(labelValue(d), d.formatStr);
            const fontSize = fmt.dataLabelsCard.labelsFontSize.value;

            const labelGroups = g.selectAll(".pillar-label-g")
                .data(data)
                .join("g")
                .attr("class", "pillar-label-g")
                .attr("transform", (d, i) => {
                    const bandCenter = (bandScale(`${i}`) as number) + bandScale.bandwidth() / 2;
                    const isNeg = labelValue(d) < 0;
                    const farValuePx = valueScale(clampToDomain(Math.max(d.start, d.end)));
                    const nearValuePx = valueScale(clampToDomain(Math.min(d.start, d.end)));
                    const midValuePx = (valueScale(clampToDomain(d.start)) + valueScale(clampToDomain(d.end))) / 2;
                    if (isHorizontal) {
                        const vx = position === "inside" ? midValuePx : isNeg ? nearValuePx - 6 : farValuePx + 6;
                        return `translate(${vx},${bandCenter})`;
                    } else {
                        const vy = position === "inside"
                            ? midValuePx
                            : isNeg ? nearValuePx + 8 + fontSize * 0.7 : farValuePx - 6 - fontSize * 0.3;
                        return `translate(${bandCenter},${vy})`;
                    }
                });

            if (fmt.dataLabelsCard.labelsBackgroundShow.value) {
                labelGroups.append("rect")
                    .attr("class", "label-bg")
                    .attr("fill", fmt.dataLabelsCard.labelsBackgroundColor.value.value)
                    .attr("opacity", 1 - fmt.dataLabelsCard.labelsBackgroundTransparency.value / 100);
            }

            labelGroups.append("text")
                .attr("text-anchor", d => {
                    if (position === "inside") return "middle";
                    if (!isHorizontal) return "middle";
                    return labelValue(d) < 0 ? "end" : "start";
                })
                .attr("dominant-baseline", "middle")
                .attr("font-size", fontSize)
                .attr("fill", fmt.dataLabelsCard.labelsColor.value.value)
                .text(d => labelText(d));

            if (fmt.dataLabelsCard.labelsBackgroundShow.value) {
                // size the background rect to the rendered text bbox (needs the text in the DOM first)
                labelGroups.each(function () {
                    const grp = d3.select(this);
                    const textEl = grp.select("text").node() as SVGTextElement;
                    const rectEl = grp.select("rect").node() as SVGRectElement;
                    if (textEl && rectEl) {
                        const bbox = textEl.getBBox();
                        d3.select(rectEl)
                            .attr("x", bbox.x - 4).attr("y", bbox.y - 2)
                            .attr("width", bbox.width + 8).attr("height", bbox.height + 4);
                    }
                });
            }
        }

        // Category axis (KPI/pillar names)
        const catNames = data.map(d => d.displayName);
        const axisFontFamily = fmt.categoryAxisCard.axisFontFamily.value.value as string;
        if (isHorizontal) {
            const axisSel = g.append("g")
                .call(d3.axisLeft(bandScale).tickSize(0).tickPadding(fmt.categoryAxisCard.axisTickPadding.value).tickFormat((_, i) => catNames[i]))
                .selectAll("text")
                .attr("font-size", axisFontSize)
                .attr("fill", fmt.categoryAxisCard.axisFontColor.value.value)
                .attr("font-family", axisFontFamily);
            this.wrapText(axisSel as any, axisMaxWidth);
        } else {
            const axisSel = g.append("g")
                .attr("transform", `translate(0,${height})`)
                .call(d3.axisBottom(bandScale).tickSize(0).tickPadding(fmt.categoryAxisCard.axisTickPadding.value).tickFormat((_, i) => catNames[i]))
                .selectAll("text")
                .attr("font-size", axisFontSize)
                .attr("fill", fmt.categoryAxisCard.axisFontColor.value.value)
                .attr("font-family", axisFontFamily);
            if (axisWrap) {
                this.wrapText(axisSel as any, axisMaxWidth);
            } else {
                const rotation = fmt.categoryAxisCard.axisLabelRotation.value;
                axisSel.attr("transform", `rotate(${rotation})`)
                    .style("text-anchor", rotation < 0 ? "end" : rotation > 0 ? "start" : "middle");
            }
        }

        // Zero line — deliberately more prominent than a regular gridline (darker, slightly
        // thicker), drawn whenever the data straddles positive and negative: that's when a viewer
        // needs the one reference to immediately read a bar as "below zero" rather than just
        // "shorter than the others." Skipped when domainMin >= 0 (nothing negative in the data) -
        // in that case this line would sit exactly on top of the category axis line at the bottom,
        // which already marks zero, so drawing both is just visual clutter.
        if (domainMin < 0) {
            const zeroPx = valueScale(0);
            const zeroLine = g.append("line").attr("stroke", "#8C8C8C").attr("stroke-width", 1.5);
            if (isHorizontal) {
                zeroLine.attr("x1", zeroPx).attr("x2", zeroPx).attr("y1", 0).attr("y2", height);
            } else {
                zeroLine.attr("y1", zeroPx).attr("y2", zeroPx).attr("x1", 0).attr("x2", width);
            }
        }

        // Callout VALUES (box + text) drawn last, always the top-most layer, one per active callout.
        callouts.forEach(callout => {
            const { startD, delta, pct, variationColor, bridgeColor, xMid } = callout;
            const showAbs = fmt.calloutCard.calloutValueShowAbsolute.value;
            const showPct = fmt.calloutCard.calloutValueShowPercent.value;
            const absText = `${delta >= 0 ? "+" : ""}${this.formatValue(delta, startD.formatStr)}`;
            const pctText = `(${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
            const valueColor = fmt.calloutCard.calloutValueAutoColor.value ? variationColor : fmt.calloutCard.calloutValueColor.value.value;
            const valueFontSize = fmt.calloutCard.calloutValueFontSize.value;
            const valueFontFamily = fmt.calloutCard.calloutValueFontFamily.value.value as string || "Segoe UI";
            const valueBold = fmt.calloutCard.calloutValueBold.value ? "bold" : "normal";

            const valueG = g.append("g").attr("class", "callout-value");

            if (isHorizontal) {
                // Stacked: absolute value above, percentage below — beyond the bridge, vertically
                // centered between the two anchor rows, and each line horizontally centered against
                // the other (measured first with a temp left-aligned render, then recentered —
                // otherwise the shorter of the two lines looks lopsided/glued to the longer one).
                const lines = [showAbs ? absText : null, showPct ? pctText : null].filter(Boolean) as string[];
                const startX = callout.bridgeY + 10;
                const text = valueG.append("text")
                    .attr("text-anchor", "start")
                    .attr("font-size", valueFontSize).attr("font-family", valueFontFamily).attr("font-weight", valueBold)
                    .attr("fill", valueColor)
                    .attr("x", startX).attr("y", xMid);
                const lineHeightEm = 1.15;
                const startDy = -((lines.length - 1) * lineHeightEm) / 2;
                const tspans = lines.map((line, i) =>
                    text.append("tspan").attr("x", startX).attr("dy", `${i === 0 ? startDy : lineHeightEm}em`).text(line));
                const blockWidth = Math.max(...tspans.map(ts => (ts.node() as SVGTSpanElement).getComputedTextLength()));
                const centerX = startX + blockWidth / 2;
                tspans.forEach(ts => ts.attr("text-anchor", "middle").attr("x", centerX));
                const bbox = (text.node() as SVGTextElement).getBBox();
                valueG.insert("rect", "text")
                    .attr("x", bbox.x - 6).attr("y", bbox.y - 4)
                    .attr("width", bbox.width + 12).attr("height", bbox.height + 8)
                    .attr("fill", "white").attr("stroke", "none");
            } else {
                const valueText = [showAbs ? absText : null, showPct ? pctText : null].filter(Boolean).join("  ") || absText;
                const position = fmt.calloutCard.calloutValuePosition.value.value as string;
                const boxShow = fmt.calloutCard.calloutBoxShow.value;
                const valueX = position === "center" ? xMid : 0;
                const valueY = position === "center" ? callout.bridgeY : callout.bridgeY - 22;
                const anchor = position === "center" ? "middle" : "start";

                const text = valueG.append("text")
                    .attr("text-anchor", anchor).attr("dominant-baseline", "middle")
                    .attr("font-size", valueFontSize).attr("font-family", valueFontFamily).attr("font-weight", valueBold)
                    .attr("fill", valueColor)
                    .attr("x", valueX).attr("y", valueY)
                    .text(valueText);
                const bbox = (text.node() as SVGTextElement).getBBox();
                valueG.insert("rect", "text")
                    .attr("x", bbox.x - 8).attr("y", bbox.y - 5)
                    .attr("width", bbox.width + 16).attr("height", bbox.height + 10)
                    .attr("rx", boxShow ? 4 : 0)
                    .attr("fill", "white")
                    .attr("stroke", boxShow ? bridgeColor : "none")
                    .attr("stroke-width", boxShow ? fmt.calloutCard.calloutBridgeWidth.value : 0);
            }
        });
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
