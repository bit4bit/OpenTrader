// Snap quarterly earnings reports onto chart bars — the single rule
// shared by the earnings indicator script (Indicators/dsl/ta.js) and the
// pane legend (chart/earningsLegend.js) so the two never disagree.
//
// A report attaches FORWARD to the first bar at-or-after its date (the
// session of its own trading day; nearest-bar snapping would instead pull
// it onto the previous day's bar whenever bar times are not
// midnight-aligned). Reports farther than the tolerance (at least three
// days, else twice the median bar spacing) are DROPPED — including
// out-of-loaded-range ones, which must not clamp onto the edge bar.
// The QoQ change is percent growth against |prev| so the sign of the
// improvement survives a negative base quarter.
export function snapEarningsReports(data, quarters) {
    if (!data || data.length === 0) return [];

    const times = data.map(d => d.time);
    const diffs = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    const spacing = diffs.length ? diffs[diffs.length >> 1] : 86400;
    const tolerance = Math.max(spacing * 2, 3 * 86400);

    // First bar at-or-after ts, when within tolerance.
    const sessionIndex = (ts) => {
        let lo = 0, hi = times.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (times[mid] < ts) lo = mid + 1; else hi = mid;
        }
        return times[lo] >= ts && times[lo] - ts <= tolerance ? lo : null;
    };

    let prevActual = null;
    const sorted = [...(quarters || [])]
        .filter(q => q && isFinite(Date.parse(q?.date) / 1000))
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

    const snapped = [];
    for (const q of sorted) {
        const ts = Date.parse(q.date) / 1000;
        const index = sessionIndex(ts);
        if (q.epsActual != null) {
            // Growth against |prev| keeps the sign of the improvement when
            // the base quarter is negative.
            const change = prevActual != null
                ? ((q.epsActual - prevActual) / Math.abs(prevActual)) * 100
                : null;
            if (index != null) snapped.push({ index, date: q.date, epsEstimate: q.epsEstimate, epsActual: q.epsActual, change });
            prevActual = q.epsActual;
        } else if (q.epsEstimate != null && index != null) {
            snapped.push({ index, date: q.date, epsEstimate: q.epsEstimate, epsActual: null, change: null });
        }
    }
    return snapped;
}
