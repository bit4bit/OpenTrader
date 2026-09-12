/**
 * ta: standard library exposed to custom indicator scripts.
 *
 * All functions operate on plain aligned arrays (number | null) and return
 * aligned arrays of the same length, so results can be plotted directly.
 * Built-in indicator modules are reused where their output shape allows it.
 */
import { computeRSI } from '../rsi';
import { computeMACD } from '../macd';
import { computeATR } from '../atr';

function isValid(v) {
    return typeof v === 'number' && isFinite(v);
}

function rolling(src, length, fn) {
    const out = new Array(src.length).fill(null);
    for (let i = length - 1; i < src.length; i++) {
        const window = src.slice(i - length + 1, i + 1);
        if (window.every(isValid)) out[i] = fn(window);
    }
    return out;
}

function ema(src, length) {
    const out = new Array(src.length).fill(null);
    const k = 2 / (length + 1);
    let prev = null;
    let seed = 0;
    for (let i = 0; i < src.length; i++) {
        const v = src[i];
        if (!isValid(v)) continue;
        if (prev === null) {
            if (i < length - 1) { seed += v; continue; }
            seed += v;
            prev = seed / length;
        } else {
            prev = v * k + prev * (1 - k);
        }
        out[i] = prev;
    }
    return out;
}

function stdev(src, length) {
    return rolling(src, length, (w) => {
        const mean = w.reduce((a, b) => a + b, 0) / w.length;
        return Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length);
    });
}

export function buildTa(data) {
    const times = data.map(d => d.time);

    // Adapter: built-in compute fns take (data-with-time, ...) and return
    // {time, value}[]; convert back to aligned arrays.
    function align(bars) {
        const out = new Array(data.length).fill(null);
        const indexByTime = new Map(times.map((t, i) => [t, i]));
        for (const p of bars) {
            const i = indexByTime.get(p.time);
            if (i !== undefined) out[i] = p.value;
        }
        return out;
    }

    return {
        sma: (src, length) => rolling(src, length, w => w.reduce((a, b) => a + b, 0) / w.length),
        ema,
        stdev,
        highest: (src, length) => rolling(src, length, w => Math.max(...w)),
        lowest: (src, length) => rolling(src, length, w => Math.min(...w)),
        change: (src, length = 1) => src.map((v, i) =>
            isValid(v) && isValid(src[i - length]) ? v - src[i - length] : null),
        crossover: (a, b) => a.map((v, i) =>
            i > 0 && isValid(v) && isValid(b[i]) && isValid(a[i - 1]) && isValid(b[i - 1])
                && a[i - 1] <= b[i - 1] && v > b[i]),
        crossunder: (a, b) => a.map((v, i) =>
            i > 0 && isValid(v) && isValid(b[i]) && isValid(a[i - 1]) && isValid(b[i - 1])
                && a[i - 1] >= b[i - 1] && v < b[i]),
        hlc3: () => data.map(d => isValid(d.high) && isValid(d.low) && isValid(d.close)
            ? (d.high + d.low + d.close) / 3 : null),
        ohlc4: () => data.map(d => [d.open, d.high, d.low, d.close].every(isValid)
            ? (d.open + d.high + d.low + d.close) / 4 : null),

        rsi: (src, length = 14) => {
            const fakeData = src.map((v, i) => ({
                time: times[i], open: v, high: v, low: v, close: v, volume: null,
            }));
            return align(computeRSI(fakeData, { length, source: 'close' }).rsi);
        },
        macd: (src, fastLength = 12, slowLength = 26, signalLength = 9) => {
            const fakeData = src.map((v, i) => ({
                time: times[i], open: v, high: v, low: v, close: v, volume: null,
            }));
            const res = computeMACD(fakeData, { fastLength, slowLength, signalLength });
            return {
                macd: align(res.macd),
                signal: align(res.signal),
                histogram: align(res.histogram),
            };
        },
        atr: (length = 14) => align(computeATR(data, { length })),
        bb: (src, length = 20, mult = 2) => {
            const basis = rolling(src, length, w => w.reduce((a, b) => a + b, 0) / w.length);
            const sd = stdev(src, length);
            return {
                basis,
                upper: basis.map((v, i) => isValid(v) && isValid(sd[i]) ? v + mult * sd[i] : null),
                lower: basis.map((v, i) => isValid(v) && isValid(sd[i]) ? v - mult * sd[i] : null),
            };
        },
        stoch: (high, low, close, kLength = 14, dLength = 3) => {
            const k = close.map((c, i) => {
                if (i < kLength - 1) return null;
                const hh = high.slice(i - kLength + 1, i + 1);
                const ll = low.slice(i - kLength + 1, i + 1);
                if (![c, ...hh, ...ll].every(isValid)) return null;
                const max = Math.max(...hh);
                const min = Math.min(...ll);
                return max === min ? 50 : ((c - min) / (max - min)) * 100;
            });
            return { k, d: rolling(k, dLength, w => w.reduce((a, b) => a + b, 0) / w.length) };
        },
    };
}
