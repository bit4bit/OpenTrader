// Nearest bar to a time via binary search (bars sorted by time).
// Returns { time, price } of the closest bar's close, or null when empty.
export function findNearestBar(bars, time) {
    if (bars.length === 0) return null;
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].time < time) lo = mid + 1; else hi = mid;
    }
    const prev = bars[lo - 1];
    const best = prev && Math.abs(prev.time - time) <= Math.abs(bars[lo].time - time) ? prev : bars[lo];
    return { time: best.time, price: best.close };
}
