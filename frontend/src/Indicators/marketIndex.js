/**
 * Simple Market Index (SMI) Indicator
 *
 * Weighted basket of symbols tracked as a single index value:
 *   pctChange_i   = (close_i / prevClose_i) - 1        per asset
 *   weighted_i    = pctChange_i * weight_i
 *   indexValue_t  = indexValue_(t-1) * (1 + sum(weighted_i))
 *
 * The index starts at baseValue on the first bar where at least one
 * constituent has both a current and previous close. Constituents missing
 * a bar (holiday/halt) contribute 0 for that step.
 */

function isValid(val) {
    return typeof val === 'number' && isFinite(val);
}

/**
 * @param {Object} barsBySymbol - { symbol: [OHLCV bars sorted by time] }
 * @param {Array} constituents - [{ symbol, weight }] weights as decimals summing to ~1
 * @param {number} baseValue - starting index value (default 100)
 * @returns {Array} - [{ time, value }] on the union of all constituent bar times
 */
export function computeMarketIndex(barsBySymbol, constituents, baseValue = 100) {
    const series = (constituents || [])
        .filter(c => c.symbol && c.enabled !== false && isValid(c.weight) && c.weight !== 0)
        .map(c => (barsBySymbol?.[c.symbol] || [])
            .filter(b => isValid(b.close))
            .map(b => ({ time: b.time, close: b.close, weight: c.weight })));

    if (series.length === 0) return [];

    const times = [...new Set(series.flatMap(s => s.map(b => b.time)))].sort((a, b) => a - b);
    const closes = series.map(s => new Map(s.map(b => [b.time, b.close])));

    const results = [];
    const prevClose = series.map(() => null);
    let indexValue = isValid(baseValue) ? baseValue : 100;
    let started = false;

    for (const time of times) {
        let weightedSum = 0;
        for (let i = 0; i < series.length; i++) {
            const close = closes[i].get(time);
            if (isValid(close)) {
                if (isValid(prevClose[i])) {
                    weightedSum += ((close / prevClose[i]) - 1) * series[i][0].weight;
                    started = true;
                }
                prevClose[i] = close;
            }
        }
        if (!started) continue;
        indexValue *= 1 + weightedSum;
        results.push({ time, value: indexValue });
    }

    return results;
}
