/**
 * ta: standard library exposed to indicator scripts.
 *
 * All functions operate on plain aligned arrays (number | null) and return
 * aligned arrays of the same length, so results can be plotted directly.
 * Wherever a built-in indicator module exists, it is reused verbatim (via
 * the align() adapter) so script results match the golden outputs exactly.
 */
import { computeRSI } from '../rsi';
import { computeMACD } from '../macd';
import { computeATR } from '../atr';
import { computeBollingerBands } from '../bollinger';
import { computeStochastic } from '../stoch';
import { computeSuperTrend } from '../supertrend';
import { computeADL } from '../adl';
import { computeW52 } from '../w52';
import { computeTSI } from '../tsi';
import { computeIchimoku } from '../ichimoku';
import { computeVolumeProfile } from '../volumeProfile';
import { computeMarketIndex } from '../marketIndex';

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

export function buildTa(data, barsBySymbol = {}) {
    const times = data.map(d => d.time);

    // Adapter: built-in compute fns take OHLCV objects and return
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

    // Wrap a compute fn that only needs a single source series.
    const fromSource = (src) => src.map((v, i) => ({
        time: times[i], open: v, high: v, low: v, close: v, volume: null,
    }));

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

        rsi: (src, length = 14) =>
            align(computeRSI(fromSource(src), { length, source: 'close' }).rsi),
        macd: (src, fastLength = 12, slowLength = 26, signalLength = 9, normLookback = 100) => {
            const res = computeMACD(fromSource(src), { fastLength, slowLength, signalLength, normLookback });
            return {
                macd: align(res.macd),
                signal: align(res.signal),
                histogram: align(res.histogram),
            };
        },
        bb: (src, length = 20, stdDev = 2) => {
            const res = computeBollingerBands(fromSource(src), { length, stdDev, source: 'close' });
            return { basis: align(res.basis), upper: align(res.upper), lower: align(res.lower) };
        },
        stoch: (high, low, close, length = 14, dLength = 3) => {
            const fakeData = close.map((c, i) => ({
                time: times[i], open: c, high: high[i], low: low[i], close: c, volume: null,
            }));
            const res = computeStochastic(fakeData, { length, dLength });
            return { k: align(res.k), d: align(res.d) };
        },
        atr: (length = 14) => align(computeATR(data, { length })),
        adl: () => align(computeADL(data)),
        tsi: (longLength = 25, shortLength = 13, signalLength = 13) => {
            const res = computeTSI(data, { longLength, shortLength, signalLength });
            return { tsi: align(res.tsi), signal: align(res.signal) };
        },
        w52: (basis = 'highlow') => {
            const res = computeW52(data, { basis });
            return { high: align(res.high), low: align(res.low) };
        },
        supertrend: (atrLength = 10, factor = 3) => {
            const res = computeSuperTrend(data, { atrLength, factor });
            const up = new Array(data.length).fill(null);
            const down = new Array(data.length).fill(null);
            const indexByTime = new Map(times.map((t, i) => [t, i]));
            for (const p of res) {
                const i = indexByTime.get(p.time);
                if (i === undefined) continue;
                if (p.trend === 1) up[i] = p.value;
                else down[i] = p.value;
            }
            return { up, down };
        },
        ichimoku: (conversionLength = 9, baseLength = 26, spanBLength = 52, laggingLength = 26) => {
            const res = computeIchimoku(data, { conversionLength, baseLength, spanBLength, laggingLength });
            return {
                tenkan: align(res.tenkan),
                kijun: align(res.kijun),
                spanA: align(res.spanA),
                spanB: align(res.spanB),
                chikou: align(res.chikou),
            };
        },

        // Price-by-volume bins for the histogram() primitive.
        volumeProfile: (priceBins = 40) => computeVolumeProfile(data, { priceBins }),

        // Multi-symbol weighted index, aligned to the chart's bar times.
        marketIndex: (constituents, baseValue = 100) =>
            align(computeMarketIndex(barsBySymbol, constituents, baseValue)),
    };
}
