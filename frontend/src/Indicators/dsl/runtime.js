/**
 * Custom indicator script runtime.
 *
 * Scripts are plain JavaScript executed with shadowed globals (no window,
 * document, fetch, ...). They receive OHLCV arrays, the `ta` stdlib, typed
 * `input.*` helpers and a `plot()` function, and produce time-aligned series
 * that Chart.jsx renders like built-in indicators.
 *
 * Two-pass model:
 *   discoverInputs(code)  -> input schema for the settings UI
 *   runScript(code, data, values) -> plot descriptors for rendering
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
        const key = `input_${declaring.schema.length}`;
        declaring.schema.push({ key, type, label, default: def, ...opts });
        return values && key in values ? values[key] : def;
    };
    return {
        int: (label, def = 10, opts = {}) => declare('int', label, def, opts),
        float: (label, def = 1.0, opts = {}) => declare('float', label, def, opts),
        bool: (label, def = false) => declare('bool', label, def),
        string: (label, def = '') => declare('string', label, def),
        color: (label, def = '#2962ff') => declare('color', label, def),
        source: (label, def = 'close') => sources[declare('source', label, def)] ?? sources.close,
    };
}

function buildSources(data) {
    if (!data) return new Proxy({}, { get: () => [] });
    const col = (fn) => data.map(fn);
    return {
        open: col(d => d.open),
        high: col(d => d.high),
        low: col(d => d.low),
        close: col(d => d.close),
        hl2: col(d => (d.high + d.low) / 2),
        hlc3: col(d => (d.high + d.low + d.close) / 3),
        ohlc4: col(d => (d.open + d.high + d.low + d.close) / 4),
        hlcc4: col(d => (d.high + d.low + d.close * 2) / 4),
        volume: col(d => d.volume),
    };
}

function compile(code) {
    const params = [
        'open', 'high', 'low', 'close', 'volume', 'time',
        'ta', 'input', 'plot', ...SHADOWED_GLOBALS,
    ];
    return new Function(...params, `'use strict';\n${code}`);
}

function execute(code, data, values, collectPlots) {
    const declaring = { schema: [] };
    const plots = [];
    const sources = buildSources(data);
    const input = makeInput(declaring, values, sources);
    const plot = collectPlots
        ? (series, opts = {}) => plots.push({ series, ...opts })
        : () => {};

    const fn = compile(code);
    fn(
        data?.map(d => d.open) ?? [],
        data?.map(d => d.high) ?? [],
        data?.map(d => d.low) ?? [],
        data?.map(d => d.close) ?? [],
        data?.map(d => d.volume) ?? [],
        data?.map(d => d.time) ?? [],
        buildTa(data ?? []),
        input,
        plot,
    );
    return { schema: declaring.schema, plots };
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
        const { schema } = execute(code, null, null, false);
        return { schema, error: null };
    } catch (e) {
        return { schema: [], error: e.message };
    }
}

/**
 * Run a script against OHLCV data with resolved input values; returns
 * { overlays: [{title, color, series}], panes: [...], error }.
 */
export function runScript(code, data, values = {}) {
    try {
        const { plots } = execute(code, data, values, true);
        const times = data.map(d => d.time);
        const rendered = plots.map((p, i) => ({
            title: p.title || `Plot ${i + 1}`,
            color: p.color || '#2962ff',
            series: toBars(p.series, times),
            overlay: p.overlay !== false,
        }));
        return {
            overlays: rendered.filter(p => p.overlay),
            panes: rendered.filter(p => !p.overlay),
            error: null,
        };
    } catch (e) {
        return { overlays: [], panes: [], error: e.message };
    }
}
