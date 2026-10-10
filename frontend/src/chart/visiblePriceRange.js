// Price extremes of the visible time window (the current zoom scale):
// the lowest low, the highest high, and the spread between both as a
// percent of the low. Bars with a missing high or low are skipped.
export function visiblePriceRange(bars, fromTime, toTime) {
    if (!bars?.length || fromTime == null || toTime == null || fromTime > toTime) return null;
    let low = Infinity;
    let high = -Infinity;
    for (const bar of bars) {
        if (bar.time < fromTime) continue;
        if (bar.time > toTime) break;
        if (bar.low != null && bar.low < low) low = bar.low;
        if (bar.high != null && bar.high > high) high = bar.high;
    }
    if (low === Infinity || high === -Infinity || low <= 0) return null;
    return { low, high, percent: ((high - low) / low) * 100 };
}
