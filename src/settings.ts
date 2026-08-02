"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const FONT_LIST = [
    "Segoe UI", "Segoe UI Light", "Segoe UI Semibold", "Arial", "Arial Black",
    "Calibri", "Cambria", "Candara", "Consolas", "Corbel", "Courier New",
    "Georgia", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"
].map(f => ({ value: f, displayName: f }));

/**
 * Chart Options — the two settings that reshape the whole chart: orientation and value scale.
 */
class ChartOptionsCardSettings extends FormattingSettingsCard {
    chartOrientation = new formattingSettings.ItemDropdown({
        name: "chartOrientation",
        displayName: "Chart Orientation",
        displayNameKey: "Prop_ChartOrientation",
        items: [
            { value: "vertical", displayName: "Vertical" },
            { value: "horizontal", displayName: "Horizontal" }
        ],
        value: { value: "vertical", displayName: "Vertical" }
    });

    valueCompression = new formattingSettings.NumUpDown({
        name: "valueCompression",
        displayName: "Value compression (0 = default; can go beyond ±100)",
        displayNameKey: "Prop_ValueCompression",
        value: 0,
        options: {
            minValue: { type: 0, value: -300 },
            maxValue: { type: 1, value: 300 }
        }
    });

    name: string = "chartOptions";
    displayName: string = "Chart Options";
    displayNameKey: string = "Card_ChartOptions";
    slices: Array<FormattingSettingsSlice> = [this.chartOrientation, this.valueCompression];
}

/**
 * Data Colors — sentiment-based bar colors, matching the native "Data colors" card convention.
 */
class DataColorsCardSettings extends FormattingSettingsCard {
    sentimentsShow = new formattingSettings.ToggleSwitch({
        name: "sentimentsShow",
        displayName: "Format using Sentiments",
        displayNameKey: "Prop_SentimentsShow",
        value: true
    });

    colorIncrease = new formattingSettings.ColorPicker({
        name: "colorIncrease",
        displayName: "Increase color",
        displayNameKey: "Prop_ColorIncrease",
        value: { value: "#2E8540" }
    });

    colorDecrease = new formattingSettings.ColorPicker({
        name: "colorDecrease",
        displayName: "Decrease color",
        displayNameKey: "Prop_ColorDecrease",
        value: { value: "#B00020" }
    });

    colorTotal = new formattingSettings.ColorPicker({
        name: "colorTotal",
        displayName: "Total color",
        displayNameKey: "Prop_ColorTotal",
        value: { value: "#1F3864" }
    });

    colorOthers = new formattingSettings.ColorPicker({
        name: "colorOthers",
        displayName: "\"Others\" color",
        displayNameKey: "Prop_ColorOthers",
        value: { value: "#8C8C8C" }
    });

    name: string = "dataColors";
    displayName: string = "Data Colors";
    displayNameKey: string = "Card_DataColors";
    slices: Array<FormattingSettingsSlice> = [
        this.sentimentsShow, this.colorIncrease, this.colorDecrease, this.colorTotal, this.colorOthers
    ];
}

/**
 * Breakdown card — Top N / manual mode, bar count, "Others" label
 * NOTE: the actual per-category visible/hidden list (manual mode) is a dynamically
 * generated set of slices, built in visual.ts from the real distinct category values —
 * it is intentionally NOT declared statically here.
 */
class BreakdownCardSettings extends FormattingSettingsCard {
    breakdownMode = new formattingSettings.ItemDropdown({
        name: "breakdownMode",
        displayName: "Mode",
        displayNameKey: "Prop_BreakdownMode",
        items: [
            { value: "auto", displayName: "Auto (Top N)" },
            { value: "manual", displayName: "Manual selection" }
        ],
        value: { value: "auto", displayName: "Auto (Top N)" }
    });

    breakdownBarCount = new formattingSettings.NumUpDown({
        name: "breakdownBarCount",
        displayName: "Number of bars",
        displayNameKey: "Prop_BreakdownBarCount",
        value: 6,
        options: {
            minValue: { type: 0, value: 2 },
            maxValue: { type: 1, value: 25 }
        }
    });

    othersLabel = new formattingSettings.TextInput({
        name: "othersLabel",
        displayName: "\"Others\" label",
        displayNameKey: "Prop_OthersLabel",
        value: "Others",
        placeholder: "Others"
    });

    breakdownShowTotal = new formattingSettings.ToggleSwitch({
        name: "breakdownShowTotal",
        displayName: "Show total bar alongside breakdown",
        displayNameKey: "Prop_BreakdownShowTotal",
        value: true
    });

    breakdownTotalPosition = new formattingSettings.ItemDropdown({
        name: "breakdownTotalPosition",
        displayName: "Total position",
        displayNameKey: "Prop_BreakdownTotalPosition",
        items: [
            { value: "left", displayName: "Left" },
            { value: "right", displayName: "Right" }
        ],
        value: { value: "right", displayName: "Right" }
    });

    name: string = "breakdown";
    displayName: string = "Breakdown";
    displayNameKey: string = "Card_Breakdown";
    slices: Array<FormattingSettingsSlice> = [
        this.breakdownMode, this.breakdownBarCount, this.othersLabel,
        this.breakdownShowTotal, this.breakdownTotalPosition
    ];
}

/**
 * Category Axis card — the KPI/pillar name axis: font, wrap vs rotate, spacing.
 * Matters most in horizontal orientation, where this becomes the left-side label column.
 */
class CategoryAxisCardSettings extends FormattingSettingsCard {
    axisFontSize = new formattingSettings.NumUpDown({
        name: "axisFontSize",
        displayName: "Font size",
        displayNameKey: "Prop_AxisFontSize",
        value: 10
    });

    axisFontColor = new formattingSettings.ColorPicker({
        name: "axisFontColor",
        displayName: "Font color",
        displayNameKey: "Prop_AxisFontColor",
        value: { value: "#404040" }
    });

    axisFontFamily = new formattingSettings.ItemDropdown({
        name: "axisFontFamily",
        displayName: "Font family",
        displayNameKey: "Prop_AxisFontFamily",
        items: FONT_LIST,
        value: { value: "Segoe UI", displayName: "Segoe UI" }
    });

    axisWrapText = new formattingSettings.ToggleSwitch({
        name: "axisWrapText",
        displayName: "Wrap text (instead of rotating)",
        displayNameKey: "Prop_AxisWrapText",
        value: true
    });

    axisLabelRotation = new formattingSettings.NumUpDown({
        name: "axisLabelRotation",
        displayName: "Rotation (°, used when wrap is off)",
        displayNameKey: "Prop_AxisLabelRotation",
        value: -20,
        options: {
            minValue: { type: 0, value: -90 },
            maxValue: { type: 1, value: 90 }
        }
    });

    axisLabelMaxWidth = new formattingSettings.NumUpDown({
        name: "axisLabelMaxWidth",
        displayName: "Label max width (px)",
        displayNameKey: "Prop_AxisLabelMaxWidth",
        value: 90,
        options: {
            minValue: { type: 0, value: 30 },
            maxValue: { type: 1, value: 400 }
        }
    });

    axisLabelPadding = new formattingSettings.NumUpDown({
        name: "axisLabelPadding",
        displayName: "Spacing (px)",
        displayNameKey: "Prop_AxisLabelPadding",
        value: 6,
        options: {
            minValue: { type: 0, value: 0 },
            maxValue: { type: 1, value: 60 }
        }
    });

    axisTickPadding = new formattingSettings.NumUpDown({
        name: "axisTickPadding",
        displayName: "Distance from axis line (px)",
        displayNameKey: "Prop_AxisTickPadding",
        value: 8,
        options: {
            minValue: { type: 0, value: 0 },
            maxValue: { type: 1, value: 50 }
        }
    });

    name: string = "categoryAxis";
    displayName: string = "Category Axis";
    displayNameKey: string = "Card_CategoryAxis";
    slices: Array<FormattingSettingsSlice> = [
        this.axisFontSize, this.axisFontColor, this.axisFontFamily,
        this.axisWrapText, this.axisLabelRotation, this.axisLabelMaxWidth, this.axisLabelPadding, this.axisTickPadding
    ];
}

/**
 * Gridlines card — value-axis reference lines (horizontal in vertical mode, vertical in horizontal mode)
 */
class GridlinesCardSettings extends FormattingSettingsCard {
    gridlinesShow = new formattingSettings.ToggleSwitch({
        name: "gridlinesShow",
        displayName: "Show",
        displayNameKey: "Prop_GridlinesShow",
        value: false
    });

    gridlinesColor = new formattingSettings.ColorPicker({
        name: "gridlinesColor",
        displayName: "Color",
        displayNameKey: "Prop_GridlinesColor",
        value: { value: "#E6E6E6" }
    });

    gridlinesWidth = new formattingSettings.NumUpDown({
        name: "gridlinesWidth",
        displayName: "Width",
        displayNameKey: "Prop_GridlinesWidth",
        value: 1,
        options: {
            minValue: { type: 0, value: 1 },
            maxValue: { type: 1, value: 5 }
        }
    });

    gridlinesStyle = new formattingSettings.ItemDropdown({
        name: "gridlinesStyle",
        displayName: "Style",
        displayNameKey: "Prop_GridlinesStyle",
        items: [
            { value: "solid", displayName: "Solid" },
            { value: "dashed", displayName: "Dashed" },
            { value: "dotted", displayName: "Dotted" }
        ],
        value: { value: "solid", displayName: "Solid" }
    });

    name: string = "gridlines";
    displayName: string = "Gridlines";
    displayNameKey: string = "Card_Gridlines";
    slices: Array<FormattingSettingsSlice> = [this.gridlinesShow, this.gridlinesColor, this.gridlinesWidth, this.gridlinesStyle];
}

/**
 * Data Labels card — the value shown on/above each bar (matches native "Data labels" naming)
 */
class DataLabelsCardSettings extends FormattingSettingsCard {
    labelsShow = new formattingSettings.ToggleSwitch({
        name: "labelsShow",
        displayName: "Show",
        displayNameKey: "Prop_LabelsShow",
        value: true
    });

    labelsFontSize = new formattingSettings.NumUpDown({
        name: "labelsFontSize",
        displayName: "Font size",
        displayNameKey: "Prop_LabelsFontSize",
        value: 10
    });

    labelsColor = new formattingSettings.ColorPicker({
        name: "labelsColor",
        displayName: "Color",
        displayNameKey: "Prop_LabelsColor",
        value: { value: "#404040" }
    });

    labelsPosition = new formattingSettings.ItemDropdown({
        name: "labelsPosition",
        displayName: "Position",
        displayNameKey: "Prop_LabelsPosition",
        items: [
            { value: "outsideEnd", displayName: "Outside end" },
            { value: "inside", displayName: "Inside" }
        ],
        value: { value: "outsideEnd", displayName: "Outside end" }
    });

    labelsBackgroundShow = new formattingSettings.ToggleSwitch({
        name: "labelsBackgroundShow",
        displayName: "Show background",
        displayNameKey: "Prop_LabelsBackgroundShow",
        value: false
    });

    labelsBackgroundColor = new formattingSettings.ColorPicker({
        name: "labelsBackgroundColor",
        displayName: "Background color",
        displayNameKey: "Prop_LabelsBackgroundColor",
        value: { value: "#FFFFFF" }
    });

    labelsBackgroundTransparency = new formattingSettings.NumUpDown({
        name: "labelsBackgroundTransparency",
        displayName: "Background transparency (%)",
        displayNameKey: "Prop_LabelsBackgroundTransparency",
        value: 20,
        options: {
            minValue: { type: 0, value: 0 },
            maxValue: { type: 1, value: 100 }
        }
    });

    name: string = "dataLabels";
    displayName: string = "Data Labels";
    displayNameKey: string = "Card_DataLabels";
    slices: Array<FormattingSettingsSlice> = [
        this.labelsShow, this.labelsFontSize, this.labelsColor, this.labelsPosition,
        this.labelsBackgroundShow, this.labelsBackgroundColor, this.labelsBackgroundTransparency
    ];
}

/**
 * Connectors card — the dotted/dashed lines linking bar tops
 */
class ConnectorsCardSettings extends FormattingSettingsCard {
    connectorsShow = new formattingSettings.ToggleSwitch({
        name: "connectorsShow",
        displayName: "Show",
        displayNameKey: "Prop_ConnectorsShow",
        value: true
    });

    connectorsStrokeWidth = new formattingSettings.NumUpDown({
        name: "connectorsStrokeWidth",
        displayName: "Stroke width",
        displayNameKey: "Prop_ConnectorsStrokeWidth",
        value: 1,
        options: {
            minValue: { type: 0, value: 1 },
            maxValue: { type: 1, value: 10 }
        }
    });

    connectorsStyle = new formattingSettings.ItemDropdown({
        name: "connectorsStyle",
        displayName: "Style",
        displayNameKey: "Prop_ConnectorsStyle",
        items: [
            { value: "dashed", displayName: "Dashed" },
            { value: "dotted", displayName: "Dotted" },
            { value: "solid", displayName: "Solid" }
        ],
        value: { value: "dashed", displayName: "Dashed" }
    });

    connectorsColor = new formattingSettings.ColorPicker({
        name: "connectorsColor",
        displayName: "Color",
        displayNameKey: "Prop_ConnectorsColor",
        value: { value: "#808080" }
    });

    name: string = "connectors";
    displayName: string = "Connectors";
    displayNameKey: string = "Card_Connectors";
    slices: Array<FormattingSettingsSlice> = [
        this.connectorsShow, this.connectorsStrokeWidth, this.connectorsStyle, this.connectorsColor
    ];
}

/**
 * Callout Formatting card — SHARED style for every variance callout instance (the actual
 * anchors/positions live in CalloutAnchorsCard in visual.ts, since there can be several).
 * Named distinctly from "Callouts" (the anchors list) so the pane never shows two entries with
 * near-identical names.
 */
class CalloutCardSettings extends FormattingSettingsCard {
    calloutBridgeShow = new formattingSettings.ToggleSwitch({
        name: "calloutBridgeShow",
        displayName: "Show bridge lines",
        displayNameKey: "Prop_CalloutBridgeShow",
        value: true
    });

    calloutBoxShow = new formattingSettings.ToggleSwitch({
        name: "calloutBoxShow",
        displayName: "Show box around value",
        displayNameKey: "Prop_CalloutBoxShow",
        value: true
    });

    calloutValuePosition = new formattingSettings.ItemDropdown({
        name: "calloutValuePosition",
        displayName: "Value position",
        displayNameKey: "Prop_CalloutValuePosition",
        items: [
            { value: "left", displayName: "Left" },
            { value: "center", displayName: "Center (over bridge)" }
        ],
        value: { value: "center", displayName: "Center (over bridge)" }
    });

    calloutBridgeAutoColor = new formattingSettings.ToggleSwitch({
        name: "calloutBridgeAutoColor",
        displayName: "Bridge color follows variation",
        displayNameKey: "Prop_CalloutBridgeAutoColor",
        value: true
    });

    calloutBridgeColor = new formattingSettings.ColorPicker({
        name: "calloutBridgeColor",
        displayName: "Bridge color (when not auto)",
        displayNameKey: "Prop_CalloutBridgeColor",
        value: { value: "#808080" }
    });

    calloutBridgeWidth = new formattingSettings.NumUpDown({
        name: "calloutBridgeWidth",
        displayName: "Bridge line width",
        displayNameKey: "Prop_CalloutBridgeWidth",
        value: 1,
        options: {
            minValue: { type: 0, value: 1 },
            maxValue: { type: 1, value: 10 }
        }
    });

    calloutBridgeStyle = new formattingSettings.ItemDropdown({
        name: "calloutBridgeStyle",
        displayName: "Bridge line style",
        displayNameKey: "Prop_CalloutBridgeStyle",
        items: [
            { value: "solid", displayName: "Solid" },
            { value: "dashed", displayName: "Dashed" },
            { value: "dotted", displayName: "Dotted" }
        ],
        value: { value: "solid", displayName: "Solid" }
    });

    calloutValueShowAbsolute = new formattingSettings.ToggleSwitch({
        name: "calloutValueShowAbsolute",
        displayName: "Show absolute value",
        displayNameKey: "Prop_CalloutValueShowAbsolute",
        value: true
    });

    calloutValueShowPercent = new formattingSettings.ToggleSwitch({
        name: "calloutValueShowPercent",
        displayName: "Show percentage",
        displayNameKey: "Prop_CalloutValueShowPercent",
        value: true
    });

    calloutValueAutoColor = new formattingSettings.ToggleSwitch({
        name: "calloutValueAutoColor",
        displayName: "Value color follows variation",
        displayNameKey: "Prop_CalloutValueAutoColor",
        value: true
    });

    calloutValueColor = new formattingSettings.ColorPicker({
        name: "calloutValueColor",
        displayName: "Value color (when not auto)",
        displayNameKey: "Prop_CalloutValueColor",
        value: { value: "#404040" }
    });

    calloutValueFontSize = new formattingSettings.NumUpDown({
        name: "calloutValueFontSize",
        displayName: "Value font size",
        displayNameKey: "Prop_CalloutValueFontSize",
        value: 13
    });

    calloutValueBold = new formattingSettings.ToggleSwitch({
        name: "calloutValueBold",
        displayName: "Bold",
        displayNameKey: "Prop_CalloutValueBold",
        value: true
    });

    calloutValueFontFamily = new formattingSettings.ItemDropdown({
        name: "calloutValueFontFamily",
        displayName: "Value font family",
        displayNameKey: "Prop_CalloutValueFontFamily",
        items: FONT_LIST,
        value: { value: "Segoe UI", displayName: "Segoe UI" }
    });

    name: string = "calloutSettings";
    displayName: string = "Callout Formatting";
    displayNameKey: string = "Card_CalloutFormatting";
    slices: Array<FormattingSettingsSlice> = [
        this.calloutValuePosition, this.calloutBridgeShow, this.calloutBoxShow,
        this.calloutBridgeAutoColor, this.calloutBridgeColor, this.calloutBridgeWidth, this.calloutBridgeStyle,
        this.calloutValueShowAbsolute, this.calloutValueShowPercent,
        this.calloutValueAutoColor, this.calloutValueColor, this.calloutValueFontSize,
        this.calloutValueBold, this.calloutValueFontFamily
    ];
}

/**
* Visual settings model — card order here is the order shown in the formatting pane, laid out to
* roughly match how native Power BI visuals group things: chart-shaping options and colors first,
* then this visual's own data-structure card (Breakdown), then axis/gridlines/labels/connectors
* (the usual native block), and the callout cards last since they're the most specialized feature.
* "Pillars" (built dynamically in visual.ts) is prepended in front of this array at render time;
* "Breakdown Categories" and "Callouts" (also dynamic) are inserted next to Breakdown and
* Callout Formatting respectively — see Visual.update().
*/
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    chartOptionsCard = new ChartOptionsCardSettings();
    dataColorsCard = new DataColorsCardSettings();
    breakdownCard = new BreakdownCardSettings();
    categoryAxisCard = new CategoryAxisCardSettings();
    gridlinesCard = new GridlinesCardSettings();
    dataLabelsCard = new DataLabelsCardSettings();
    connectorsCard = new ConnectorsCardSettings();
    calloutCard = new CalloutCardSettings();

    cards: formattingSettings.SimpleCard[] = [
        this.chartOptionsCard, this.dataColorsCard, this.breakdownCard,
        this.categoryAxisCard, this.gridlinesCard, this.dataLabelsCard,
        this.connectorsCard, this.calloutCard
    ];
}
