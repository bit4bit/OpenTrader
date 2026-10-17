// Percent difference of the chart price to an overlay line's value at the
// same bar (e.g. the close vs its SMA): how far the price sits from the
// line, in percent of the line's value.
export function priceDiffPercent(price, value) {
    if (price == null || value == null || value === 0) return null;
    return ((price - value) / value) * 100;
}

// Close-to-close change of the hovered bar vs the previous bar's close,
// in percent of the previous close.
export function closeChangePercent(bars, time) {
    if (!bars?.length || time == null) return null;
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].time < time) lo = mid + 1; else hi = mid;
    }
    if (bars[lo].time !== time || lo === 0) return null;
    const current = bars[lo].close;
    const previous = bars[lo - 1].close;
    if (current == null || previous == null || previous === 0) return null;
    return (current / previous - 1) * 100;
}

// Rate of change of an overlay line bar-over-bar: its value at the hovered
// bar vs the previous bar's value, in percent.
export function adjacentChangePercent(series, time) {
    if (!series?.length || time == null) return null;
    let lo = 0, hi = series.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (series[mid].time < time) lo = mid + 1; else hi = mid;
    }
    if (series[lo].time !== time || lo === 0) return null;
    const current = series[lo].value;
    const previous = series[lo - 1].value;
    if (current == null || previous == null || previous === 0) return null;
    return (current / previous - 1) * 100;
}
