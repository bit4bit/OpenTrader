// QoQ EPS change in percent for the earnings pane legend — additional
// information, not a plotted series: percent values on the EPS axis would
// distort the pane scale. Uses the same nearest-bar snap rule as the
// earnings indicator script, so the hovered report matches the drawn bar.
// When the crosshair isn't on a report bar (or no hover), falls back to
// the latest report.
export function qoqEpsChangeAt(data, quarters, time) {
    if (!data || data.length === 0) return null;
    const reported = (quarters || [])
        .filter(q => q.epsActual != null && isFinite(Date.parse(q.date) / 1000))
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    if (reported.length === 0) return null;

    const snapped = reported.map(q => {
        const ts = Date.parse(q.date) / 1000;
        let lo = 0, hi = data.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (data[mid].time < ts) lo = mid + 1; else hi = mid;
        }
        const best = lo > 0 && Math.abs(data[lo - 1].time - ts) <= Math.abs(data[lo].time - ts)
            ? data[lo - 1]
            : data[lo];
        return { time: best.time, actual: q.epsActual, date: q.date };
    });

    let prev = null;
    const changes = snapped.map(({ time: barTime, actual, date }) => {
        // Growth against |prev| keeps the sign of the improvement when the
        // base quarter is negative.
        const change = prev != null ? ((actual - prev) / Math.abs(prev)) * 100 : null;
        prev = actual;
        return { time: barTime, change, date };
    });

    const hovered = time != null && changes.some(c => c.time === time)
        ? changes.find(c => c.time === time)
        : null;
    if (hovered) return hovered.change != null ? hovered : null;
    for (let i = changes.length - 1; i >= 0; i--) {
        if (changes[i].change != null) return changes[i];
    }
    return null;
}
