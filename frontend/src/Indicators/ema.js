import { getSourceValue } from './sma';

/**
 * Computes EMA for a whole dataset.
 *
 * Seeded with the SMA of the first `length` valid source values (matching
 * TradingView and the ta.ema DSL primitive), then EMA recursion:
 * ema[i] = k * src[i] + (1 - k) * ema[i-1], k = 2 / (length + 1).
 * Invalid source values are skipped, not zeroed.
 */
export function computeEMA(data, length, source) {
    if (!data || data.length < length) return [];

    const k = 2 / (length + 1);
    const out = [];
    let prev = null;
    let seed = 0;
    let seedCount = 0;

    for (let i = 0; i < data.length; i++) {
        const val = getSourceValue(data[i], source, i, data, length);
        if (val === null) continue;

        if (prev === null) {
            seed += val;
            seedCount++;
            if (seedCount < length) continue;
            prev = seed / length;
        } else {
            prev = val * k + prev * (1 - k);
        }

        if (data[i].time != null) {
            out.push({ time: data[i].time, value: prev });
        }
    }

    return out;
}
