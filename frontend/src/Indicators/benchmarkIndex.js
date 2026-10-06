/**
 * Benchmark index line: a foreign symbol's close rebased to the chart's
 * first bar (100 = index and chart start together), for comparing a stock
 * against the benchmark indexes it belongs to.
 */

function isValid(v) {
    return typeof v === 'number' && isFinite(v);
}

/**
 * As-of alignment: each chart bar gets the latest index close at or before
 * the bar time (+ tolerance), so daily indexes stay continuous on intraday
 * charts. Returns the index's real closes, (number | null)[] of length
 * times.length.
 */
export function alignedIndexCloses(indexBars, times, tolerance = 0) {
    const closes = (indexBars || []).filter(b => b && isValid(b.close));
    const out = new Array(times.length).fill(null);
    let j = 0;
    for (let i = 0; i < times.length; i++) {
        while (j < closes.length && closes[j].time <= times[i] + tolerance) j++;
        if (j === 0) continue;
        out[i] = closes[j - 1].close;
    }
    return out;
}

/**
 * Benchmark index line: the aligned index closes rebased to the first
 * aligned bar (100 = index and chart start together), for comparing a stock
 * against the benchmark indexes it belongs to.
 *
 * @param {Array} indexBars - [{ time, close }] sorted by time
 * @param {Array} times - chart bar times (sorted)
 * @param {number} tolerance - seconds an index bar may be late and still count
 *   for the current bar (half the median chart bar spacing)
 * @param {number} baseValue - anchor value at the first aligned bar
 * @returns {Array} - aligned (number | null)[] of length times.length
 */
export function computeBenchmarkLine(indexBars, times, tolerance = 0, baseValue = 100) {
    const closes = alignedIndexCloses(indexBars, times, tolerance);
    const out = new Array(times.length).fill(null);
    let anchor = null;
    for (let i = 0; i < closes.length; i++) {
        if (closes[i] == null) continue;
        if (anchor === null) anchor = closes[i];
        out[i] = baseValue * closes[i] / anchor;
    }
    return out;
}
