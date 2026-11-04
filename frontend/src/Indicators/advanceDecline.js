/**
 * Advance-Decline Line Indicator
 *
 * Market breadth over a basket of symbols: cumulative (advancing - declining)
 * counts. On each bar time a symbol advances when its close is above its
 * previous close, declines when below, unchanged or missing symbols contribute
 * nothing:   ADL = ADL(prev) + advances - declines
 *
 * Computed on the union of all constituent bar times, so indexes and symbols
 * with staggered timestamps still align.
 */

function isValid(val) {
    return typeof val === 'number' && isFinite(val);
}

/**
 * @param {Object} barsBySymbol - { symbol: [OHLCV bars sorted by time] }
 * @param {Array} symbols - [{ symbol, enabled }]
 * @returns {Array} - [{ time, value }] on the union of all symbol bar times
 */
export function computeAdvanceDecline(barsBySymbol, symbols) {
    const series = (symbols || [])
        .filter(s => s.symbol && s.enabled !== false)
        .map(s => (barsBySymbol?.[s.symbol] || [])
            .filter(b => isValid(b.close))
            .map(b => ({ time: b.time, close: b.close })));

    if (series.length === 0) return [];

    const times = [...new Set(series.flatMap(s => s.map(b => b.time)))].sort((a, b) => a - b);
    const closes = series.map(s => new Map(s.map(b => [b.time, b.close])));

    const results = [];
    const prevClose = series.map(() => null);
    let adl = 0;

    for (const time of times) {
        let net = 0;
        for (let i = 0; i < series.length; i++) {
            const close = closes[i].get(time);
            if (!isValid(close)) continue;
            if (isValid(prevClose[i])) {
                if (close > prevClose[i]) net += 1;
                else if (close < prevClose[i]) net -= 1;
            }
            prevClose[i] = close;
        }
        adl += net;
        results.push({ time, value: adl });
    }

    return results;
}