/**
 * Custom indicator script runtime.
 *
 * Scripts are plain JavaScript executed with shadowed globals (no window,
 * document, fetch, ...). They receive OHLCV arrays, the `ta` stdlib, typed
 * `input.*` helpers and `plot()`/`fill()` functions, and produce
 * time-aligned series that Chart.jsx renders like built-in indicators.
 *
 * Two-pass model:
 *   discoverInputs(code)  -> input schema for the settings UI
 *   runScript(code, data, values, barsBySymbol) -> render descriptors
 *
 * plot(series, opts) returns a handle usable in fill(a, b, opts) to shade
 * the area between two plots. opts: { title, color, overlay=true,
 * lineWidth, style='line'|'histogram', lineStyle='solid'|'dashed' }.
 * histogram(bins, { color }) draws a horizontal price-by-volume profile on
 * the price pane (bins: [{low, high, normalizedVolume}] from
 * ta.volumeProfile). barsBySymbol feeds multi-symbol helpers like
 * ta.marketIndex.
 */
import { buildTa } from './ta';

const SHADOWED_GLOBALS = [
    'window', 'document', 'globalThis', 'self', 'top', 'parent', 'frames',
    'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage',
    'indexedDB', 'navigator', 'location', 'alert', 'confirm', 'prompt',
    'setTimeout', 'setInterval', 'requestAnimationFrame', 'importScripts',
];

function makeInput(declaring, values, sources) {
    const declare = (type, label, def, opts = {}) => {
        const key = opts.key ?? `input_${declaring.schema.length}`;
        const { key: _ignored, ...schemaOpts } = opts;
        declaring.schema.push({ key, type, label, default: def, ...schemaOpts });
        return values && key in values ? values[key] : def;
    };
    return {
        int: (label, def = 10, opts = {}) => declare('int', label, def, opts),
        float: (label, def = 1.0, opts = {}) => declare('float', label, def, opts),
        bool: (label, def = false, opts = {}) => declare('bool', label, def, opts),
        string: (label, def = '', opts = {}) => declare('string', label, def, opts),
        color: (label, def = '#2962ff', opts = {}) => declare('color', label, def, opts),
        source: (label, def = 'close', opts = {}) => sources[declare('source', label, def, opts)] ?? sources.close,
        symbols: (label, def = [], opts = {}) => declare('symbols', label, def, opts),
    };
}

function buildSources(data) {
    if (!data) return new Proxy({}, { get: () => [] });
    const col = (fn) => data.map(fn);
    const volume = col(d => d.volume);
    return {
        open: col(d => d.open),
        high: col(d => d.high),
        low: col(d => d.low),
        close: col(d => d.close),
        hl2: col(d => (d.high + d.low) / 2),
        hlc3: col(d => (d.high + d.low + d.close) / 3),
        ohlc4: col(d => (d.open + d.high + d.low + d.close) / 4),
        hlcc4: col(d => (d.high + d.low + d.close * 2) / 4),
        volume,
        // In the DSL a volume MA is spelled ta.sma(volume, n); the raw
        // volume series is provided for the volume_ma source key.
        volume_ma: volume,
    };
}

function compile(code) {
    const params = [
        'open', 'high', 'low', 'close', 'volume', 'time',
        'ta', 'input', 'plot', 'fill', 'histogram', ...SHADOWED_GLOBALS,
    ];
    return new Function(...params, `'use strict';\n${code}`);
}

function execute(code, data, values, barsBySymbol, collectPlots) {
    const declaring = { schema: [] };
    const plots = [];
    const fills = [];
    const histograms = [];
    const input = makeInput(declaring, values, buildSources(data));
    const plot = collectPlots
        ? (series, opts = {}) => {
            plots.push({ series, ...opts });
            return { plotIndex: plots.length - 1 };
        }
        : () => ({ plotIndex: -1 });
    const fill = collectPlots
        ? (a, b, opts = {}) => fills.push({ a: a.plotIndex, b: b.plotIndex, ...opts })
        : () => {};
    const histogram = collectPlots
        ? (bins, opts = {}) => { if (Array.isArray(bins)) histograms.push({ bins, ...opts }); }
        : () => {};

    const fn = compile(code);
    fn(
        data?.map(d => d.open) ?? [],
        data?.map(d => d.high) ?? [],
        data?.map(d => d.low) ?? [],
        data?.map(d => d.close) ?? [],
        data?.map(d => d.volume) ?? [],
        data?.map(d => d.time) ?? [],
        buildTa(data ?? [], barsBySymbol ?? {}),
        input,
        plot,
        fill,
        histogram,
    );
    return { schema: declaring.schema, plots, fills, histograms };
}

function isValid(v) {
    return typeof v === 'number' && isFinite(v);
}

function toBars(series, times) {
    if (!Array.isArray(series)) return [];
    const bars = [];
    let lastTime = -Infinity;
    for (let i = 0; i < Math.min(series.length, times.length); i++) {
        if (isValid(series[i]) && times[i] != null && times[i] > lastTime) {
            bars.push({ time: times[i], value: series[i] });
            lastTime = times[i];
        }
    }
    return bars;
}

/**
 * Run a script in schema mode against no data; returns
 * { schema: [{key, type, label, default, ...}], error }.
 */
export function discoverInputs(code) {
    try {
        const { schema } = execute(code, null, null, null, false);
        return { schema, error: null };
    } catch (e) {
        return { schema: [], error: e.message };
    }
}

/**
 * Run a script against OHLCV data with resolved input values; returns
 * { plots: [{title, color, style, lineStyle, overlay, series}],
 *   fills: [{a, b, color, colorAlt}],  // a/b = indices into plots
 *   histograms: [{bins, color}],       // price-by-volume profiles
 *   error }.
 */
export function runScript(code, data, values = {}, barsBySymbol = {}) {
    try {
        const { plots, fills, histograms } = execute(code, data, values, barsBySymbol, true);
        const times = data.map(d => d.time);
        const rendered = plots.map((p, i) => ({
            title: p.title || `Plot ${i + 1}`,
            color: p.color || '#2962ff',
            style: p.style === 'histogram' ? 'histogram' : 'line',
            lineStyle: p.lineStyle === 'dashed' ? 2 : 0,
            lineWidth: typeof p.lineWidth === 'number' ? p.lineWidth : null,
            overlay: p.overlay !== false,
            lastValueVisible: p.lastValueVisible,
            priceLineVisible: p.priceLineVisible,
            series: toBars(p.series, times),
        }));
        const validFills = fills
            .filter(f => rendered[f.a]?.overlay && rendered[f.b]?.overlay)
            .map(f => ({
                a: f.a,
                b: f.b,
                color: f.color || 'rgba(41, 98, 255, 0.1)',
                colorAlt: f.colorAlt || null,
            }));
        return {
            plots: rendered,
            fills: validFills,
            histograms: histograms.map(h => ({
                bins: h.bins,
                color: h.color || 'rgba(38, 166, 154, 0.4)',
            })),
            error: null,
        };
    } catch (e) {
        return { plots: [], fills: [], histograms: [], error: e.message };
    }
}
