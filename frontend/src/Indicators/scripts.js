/**
 * Built-in indicators expressed as DSL scripts.
 *
 * Every migratable indicator is defined here as a script template: a list
 * of typed fields (which drive both the settings UI and the input
 * declarations) plus a body that plots via the runtime primitives. The
 * per-indicator config in the session layout is unchanged — field keys map
 * directly to config properties, and scriptValues() resolves them into
 * runtime input values.
 *
 * This registry is also the single source of truth for CREATING indicators:
 * title (display name), singleton (one instance per chart) and config
 * (default properties) drive the search list, the panel titles and
 * addIndicators().
 */

import { SMA_COLORS } from './sma';

const SCRIPTS = {
    sma: {
        title: 'Simple Moving Average',
        singleton: false,
        fields: [
            { key: 'length', label: 'Length', type: 'int', default: 20, min: 1, max: 500 },
            { key: 'source', label: 'Source', type: 'source', default: 'close' },
            { key: 'color', label: 'Color', type: 'color', default: '#2962ff' },
        ],
        // TradingView-style: adding SMA seeds the chart with a set of
        // standard lengths, the first three visible.
        create: () => [5, 10, 20, 50, 100, 200, 7, 14, 30, 150].map((length, i) => ({
            id: `sma-${i}`,
            type: 'sma',
            length,
            source: 'close',
            visible: i < 3,
            color: SMA_COLORS[i],
        })),
        body: "plot(ta.sma(source, length), { title: 'SMA ' + length, color })",
    },
    volume: {
        title: 'Volume',
        id: 'volume-main',
        pane: true,
        fields: [
            { key: 'upColor', label: 'Up Color', type: 'color', default: '#26a69a' },
            { key: 'downColor', label: 'Down Color', type: 'color', default: '#ef5350' },
        ],
        body: "plot(volume.map(v => v ?? 0), { title: 'Volume', color: upColor, style: 'histogram', overlay: false, colors: close.map((c, i) => c >= open[i] ? upColor : downColor), lastValueVisible: false })",
    },
    vol_sma: {
        title: 'Volume SMA',
        id: 'vol-sma-main',
        paneType: 'volume',
        fields: [
            { key: 'length', label: 'Length', type: 'int', default: 20, min: 1, max: 500 },
            { key: 'color', label: 'Color', type: 'color', default: '#ff9800' },
        ],
        body: "plot(ta.sma(volume, length), { title: 'Vol SMA ' + length, color, overlay: false, lastValueVisible: false })",
    },
    rsi: {
        title: 'Relative Strength Index',
        id: 'rsi-main',
        singleton: false,
        pane: true,
        fields: [
            { key: 'length', label: 'Length', type: 'int', default: 14, min: 1, max: 500 },
            { key: 'source', label: 'Source', type: 'source', default: 'close' },
            { key: 'smoothingLength', label: 'Smoothing', type: 'int', default: 10, min: 1, max: 500 },
            { key: 'showBB', label: 'Show Bands', type: 'bool', default: true },
            { key: 'color', label: 'Color', type: 'color', default: '#2962ff' },
            { key: 'smoothColor', label: 'Smooth Color', type: 'color', default: '#ff9800' },
            { key: 'bbColor', label: 'Bands Color', type: 'color', default: 'rgba(255, 255, 255, 0.3)' },
        ],
        body: [
            "const r = ta.rsi(source, length)",
            "const smoothed = ta.sma(r, smoothingLength)",
            "const bbBasis = ta.sma(smoothed, smoothingLength)",
            "const sd = ta.stdev(smoothed, smoothingLength)",
            "plot(r, { title: 'RSI ' + length, color, overlay: false })",
            "plot(smoothed, { title: 'MA ' + smoothingLength, color: smoothColor, overlay: false })",
            "plot(showBB ? bbBasis.map((v, i) => v != null && sd[i] != null ? v + 2 * sd[i] : null) : [], { title: 'BB Upper', color: bbColor, overlay: false, lineStyle: 'dashed' })",
            "plot(showBB ? bbBasis.map((v, i) => v != null && sd[i] != null ? v - 2 * sd[i] : null) : [], { title: 'BB Lower', color: bbColor, overlay: false, lineStyle: 'dashed' })",
            "plot(time.map(() => 70), { title: '70', color: 'rgba(255,255,255,0.1)', overlay: false })",
            "plot(time.map(() => 30), { title: '30', color: 'rgba(255,255,255,0.1)', overlay: false })",
        ].join('\n'),
    },
    macd: {
        title: 'Normalized MACD',
        id: 'macd-main',
        pane: true,
        fields: [
            { key: 'fastLength', label: 'Fast Length', type: 'int', default: 12, min: 1, max: 500 },
            { key: 'slowLength', label: 'Slow Length', type: 'int', default: 26, min: 1, max: 500 },
            { key: 'signalLength', label: 'Signal Length', type: 'int', default: 9, min: 1, max: 500 },
            { key: 'normLookback', label: 'Norm Lookback', type: 'int', default: 100, min: 1, max: 2000 },
            { key: 'color', label: 'MACD Color', type: 'color', default: '#2962ff' },
            { key: 'signalColor', label: 'Signal Color', type: 'color', default: '#ff9800' },
        ],
        body: [
            "const m = ta.macd(close, fastLength, slowLength, signalLength, normLookback)",
            "plot(m.macd, { title: 'MACD', color, overlay: false })",
            "plot(m.signal, { title: 'Signal', color: signalColor, overlay: false })",
            "plot(m.histogram, { title: 'Histogram', overlay: false, style: 'histogram' })",
            "plot(time.map(() => 0), { title: 'Zero', color: 'rgba(255,255,255,0.1)', overlay: false })",
        ].join('\n'),
    },
    bb: {
        title: 'Bollinger Bands',
        id: 'bb-main',
        fields: [
            { key: 'length', label: 'Length', type: 'int', default: 20, min: 1, max: 500 },
            { key: 'stdDev', label: 'Std Dev', type: 'float', default: 2, min: 0.1, step: 0.1 },
            { key: 'source', label: 'Source', type: 'source', default: 'close' },
            { key: 'showPriceLabels', label: 'Show Price Labels', type: 'bool', default: true },
            { key: 'basisColor', label: 'Basis Color', type: 'color', default: '#2962ff' },
            { key: 'upperColor', label: 'Upper Color', type: 'color', default: '#ff9800' },
            { key: 'lowerColor', label: 'Lower Color', type: 'color', default: '#ff9800' },
            { key: 'fillColor', label: 'Fill Color', type: 'color', default: 'rgba(41, 98, 255, 0.1)' },
        ],
        body: [
            "const b = ta.bb(source, length, stdDev)",
            "plot(b.basis, { title: 'Basis', color: basisColor, lineWidth: 1.2, lastValueVisible: showPriceLabels })",
            "const upper = plot(b.upper, { title: 'Upper', color: upperColor, lineWidth: 1, lastValueVisible: showPriceLabels })",
            "const lower = plot(b.lower, { title: 'Lower', color: lowerColor, lineWidth: 1, lastValueVisible: showPriceLabels })",
            "fill(upper, lower, { color: fillColor })",
        ].join('\n'),
    },
    stoch: {
        title: 'Stochastic Oscillator',
        id: 'stoch-main',
        pane: true,
        fields: [
            { key: 'length', label: '%K Length', type: 'int', default: 14, min: 1, max: 500 },
            { key: 'dLength', label: '%D Length', type: 'int', default: 3, min: 1, max: 500 },
            { key: 'upperLine', label: 'Upper Line', type: 'int', default: 80, min: 0, max: 100 },
            { key: 'lowerLine', label: 'Lower Line', type: 'int', default: 20, min: 0, max: 100 },
            { key: 'kColor', label: '%K Color', type: 'color', default: '#2962ff' },
            { key: 'dColor', label: '%D Color', type: 'color', default: '#ff9800' },
        ],
        body: [
            "const s = ta.stoch(high, low, close, length, dLength)",
            "plot(s.k, { title: '%K', color: kColor, overlay: false })",
            "plot(s.d, { title: '%D', color: dColor, overlay: false })",
            "plot(time.map(() => upperLine), { title: '' + upperLine, color: 'rgba(255,255,255,0.1)', overlay: false, lineStyle: 'dashed' })",
            "plot(time.map(() => lowerLine), { title: '' + lowerLine, color: 'rgba(255,255,255,0.1)', overlay: false, lineStyle: 'dashed' })",
        ].join('\n'),
    },
    supertrend: {
        title: 'SuperTrend',
        id: 'supertrend-main',
        fields: [
            { key: 'atrLength', label: 'ATR Length', type: 'int', default: 10, min: 1, max: 500 },
            { key: 'factor', label: 'Factor', type: 'float', default: 3, min: 0.1, step: 0.1 },
            { key: 'upColor', label: 'Up Color', type: 'color', default: '#26a69a' },
            { key: 'downColor', label: 'Down Color', type: 'color', default: '#ef5350' },
        ],
        body: [
            "const st = ta.supertrend(atrLength, factor)",
            "plot(st.up, { title: 'Up', color: upColor, lineWidth: 2, lastValueVisible: false, priceLineVisible: false })",
            "plot(st.down, { title: 'Down', color: downColor, lineWidth: 2, lastValueVisible: false, priceLineVisible: false })",
        ].join('\n'),
    },
    atr: {
        title: 'Average True Range',
        id: 'atr-main',
        pane: true,
        fields: [
            { key: 'length', label: 'Length', type: 'int', default: 14, min: 1, max: 500 },
            { key: 'color', label: 'Color', type: 'color', default: '#ff5252' },
        ],
        body: "plot(ta.atr(length), { title: 'ATR ' + length, color, overlay: false })",
    },
    ad: {
        title: 'Accumulation/Distribution',
        id: 'ad-main',
        pane: true,
        fullData: true,
        fields: [
            { key: 'color', label: 'Color', type: 'color', default: '#2962ff' },
        ],
        body: "plot(ta.adl(), { title: 'Accum/Dist', color, overlay: false })",
    },
    w52: {
        title: '52 Week High/Low',
        id: 'w52-main',
        fields: [
            { key: 'basis', label: 'Basis', type: 'string', default: 'highlow', options: ['highlow', 'close'] },
            { key: 'color', label: 'Color', type: 'color', default: '#ff9800' },
        ],
        body: [
            "const r = ta.w52(basis)",
            "plot(r.high, { title: '52 Week High', color })",
            "plot(r.low, { title: '52 Week Low', color })",
        ].join('\n'),
    },
    tsi: {
        title: 'True Strength Index',
        id: 'tsi-main',
        pane: true,
        fields: [
            { key: 'longLength', label: 'Long Length', type: 'int', default: 25, min: 1, max: 500 },
            { key: 'shortLength', label: 'Short Length', type: 'int', default: 13, min: 1, max: 500 },
            { key: 'signalLength', label: 'Signal Length', type: 'int', default: 13, min: 1, max: 500 },
            { key: 'color', label: 'Color', type: 'color', default: '#2962ff' },
            { key: 'signalColor', label: 'Signal Color', type: 'color', default: '#ff9800' },
        ],
        body: [
            "const t = ta.tsi(longLength, shortLength, signalLength)",
            "plot(t.tsi, { title: 'TSI', color, overlay: false })",
            "plot(t.signal, { title: 'Signal', color: signalColor, overlay: false, lineWidth: 1.2 })",
            "plot(time.map(() => 0), { title: 'Zero', color: 'rgba(255,255,255,0.1)', overlay: false })",
            "plot(time.map(() => 25), { title: '25', color: 'rgba(255,255,255,0.05)', overlay: false, lineStyle: 'dashed' })",
            "plot(time.map(() => -25), { title: '-25', color: 'rgba(255,255,255,0.05)', overlay: false, lineStyle: 'dashed' })",
        ].join('\n'),
    },
    ichimoku: {
        title: 'Ichimoku Cloud',
        id: 'ichimoku-main',
        fields: [
            { key: 'conversionLength', label: 'Conversion', type: 'int', default: 9, min: 1, max: 500 },
            { key: 'baseLength', label: 'Base', type: 'int', default: 26, min: 1, max: 500 },
            { key: 'spanBLength', label: 'Span B', type: 'int', default: 52, min: 1, max: 500 },
            { key: 'laggingLength', label: 'Lagging', type: 'int', default: 26, min: 1, max: 500 },
            { key: 'tenkanColor', label: 'Tenkan Color', type: 'color', default: '#2962ff' },
            { key: 'kijunColor', label: 'Kijun Color', type: 'color', default: '#ff9800' },
            { key: 'spanAColor', label: 'Span A Color', type: 'color', default: 'rgba(38, 166, 154, 0.4)' },
            { key: 'spanBColor', label: 'Span B Color', type: 'color', default: 'rgba(239, 83, 80, 0.4)' },
            { key: 'chikouColor', label: 'Chikou Color', type: 'color', default: '#9c27b0' },
        ],
        body: [
            "const i = ta.ichimoku(conversionLength, baseLength, spanBLength, laggingLength)",
            "plot(i.tenkan, { title: 'Tenkan', color: tenkanColor, lineWidth: 1 })",
            "plot(i.kijun, { title: 'Kijun', color: kijunColor, lineWidth: 1 })",
            "const spanA = plot(i.spanA, { title: 'Span A', color: spanAColor, lineWidth: 1 })",
            "const spanB = plot(i.spanB, { title: 'Span B', color: spanBColor, lineWidth: 1 })",
            "plot(i.chikou, { title: 'Chikou', color: chikouColor, lineWidth: 1 })",
            "fill(spanA, spanB, { color: spanAColor, colorAlt: spanBColor })",
        ].join('\n'),
    },
    volume_profile: {
        title: 'Volume Profile / HD',
        id: 'vp-main',
        fields: [
            { key: 'priceBins', label: 'Bins', type: 'int', default: 40, min: 10, max: 200 },
            { key: 'color', label: 'Color', type: 'color', default: 'rgba(38, 166, 154, 0.4)' },
        ],
        body: "histogram(ta.volumeProfile(priceBins), { color })",
    },
    vp: {
        title: 'Volume Profile',
        id: 'vp-main',
        singleton: false,
        fields: [
            { key: 'priceBins', label: 'Bins', type: 'int', default: 40, min: 10, max: 200 },
            { key: 'color', label: 'Color', type: 'color', default: 'rgba(38, 166, 154, 0.2)' },
        ],
        body: "histogram(ta.volumeProfile(priceBins), { color })",
    },
    smi: {
        title: 'Simple Market Index',
        id: 'smi-main',
        pane: true,
        fields: [
            { key: 'baseValue', label: 'Base', type: 'int', default: 100, min: 1 },
            { key: 'color', label: 'Color', type: 'color', default: '#4fc3f7' },
            { key: 'constituents', label: 'Constituents', type: 'symbols', default: [
                { symbol: 'AAPL', weight: 0.5, enabled: true },
                { symbol: 'MSFT', weight: 0.5, enabled: true },
            ] },
        ],
        body: "plot(ta.marketIndex(constituents, baseValue), { title: 'SMI', color, overlay: false, lineWidth: 2 })",
    },
};

export const SCRIPT_TYPES = Object.keys(SCRIPTS);

/** All indicator types (scriptable + built-in) in registry order. */
export const INDICATOR_TYPES = Object.keys(SCRIPTS);

export function indicatorTitle(type) {
    return SCRIPTS[type]?.title ?? type;
}

function inputLine(field) {
    const opts = [];
    if (field.min != null) opts.push(`min: ${field.min}`);
    if (field.max != null) opts.push(`max: ${field.max}`);
    if (field.step != null) opts.push(`step: ${field.step}`);
    opts.push(`key: ${JSON.stringify(field.key)}`);
    return `const ${field.key} = input.${field.type}(${JSON.stringify(field.label)}, ${JSON.stringify(field.default)}, { ${opts.join(', ')} })`;
}

/** Full script source for a built-in type. */
export function scriptCode(type) {
    const entry = SCRIPTS[type];
    if (!entry) return null;
    return entry.fields.map(inputLine).join('\n') + '\n' + entry.body + '\n';
}

/** Resolve an indicator config into runtime input values. */
export function scriptValues(type, ind) {
    const entry = SCRIPTS[type];
    if (!entry || !ind) return {};
    const values = {};
    entry.fields.forEach(f => {
        values[f.key] = ind[f.key] ?? f.default;
    });
    return values;
}

/** Field schema for the settings UI (labels, types, bounds). */
export function scriptFields(type) {
    return SCRIPTS[type]?.fields ?? null;
}

export function isScriptPane(type) {
    return !!SCRIPTS[type]?.pane || !!SCRIPTS[type]?.paneType;
}

/** Pane a script renders into: its own type unless it shares one (paneType). */
export function scriptPaneType(type) {
    return SCRIPTS[type]?.paneType ?? type;
}

export function needsFullData(type) {
    return !!SCRIPTS[type]?.fullData;
}

/** Default creation config for an indicator type (field defaults applied). */
export function createIndicator(type) {
    const entry = SCRIPTS[type];
    if (!entry) return null;
    if (entry.create) return entry.create();
    const config = { visible: true, ...(entry.config ?? {}) };
    (entry.fields ?? []).forEach(f => {
        if (config[f.key] === undefined) config[f.key] = f.default;
    });
    return {
        id: entry.id ?? `${type}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        ...config,
    };
}

export function isSingleton(type) {
    const entry = SCRIPTS[type];
    return !!entry && entry.singleton !== false;
}