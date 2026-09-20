// Change of the volume bar at `time` vs the previous bar, as a quantity
// delta and a percent of the previous bar's volume. Bars are sorted by
// time ascending; `time` is matched exactly (the crosshair snaps to bar
// times in every engine). Null when there is no previous bar or no volume.
export function volumeChangeAt(bars, time) {
    if (!bars?.length || time == null) return null;
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].time < time) lo = mid + 1; else hi = mid;
    }
    if (bars[lo].time !== time) return null;
    const current = bars[lo].volume;
    const previous = bars[lo - 1]?.volume;
    if (lo === 0 || current == null || previous == null || previous === 0) return null;
    const delta = current - previous;
    return { delta, percent: (delta / previous) * 100 };
}
