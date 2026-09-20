// Volume statistics for the bar under the crosshair, computed from the
// bar data alone (bars sorted by time ascending; `time` matched exactly —
// the crosshair snaps to bar times in every engine).

function barIndexAt(bars, time) {
    if (!bars?.length || time == null) return -1;
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].time < time) lo = mid + 1; else hi = mid;
    }
    return bars[lo].time === time ? lo : -1;
}

// Change of the volume bar vs the previous bar, as a quantity delta and a
// percent of the previous bar's volume.
export function volumeChangeAt(bars, time) {
    const idx = barIndexAt(bars, time);
    if (idx <= 0) return null;
    const current = bars[idx].volume;
    const previous = bars[idx - 1].volume;
    if (current == null || previous == null || previous === 0) return null;
    const delta = current - previous;
    return { delta, percent: (delta / previous) * 100 };
}

// Buy fraction of one bar estimated from the close's position in the bar's
// range (no bid/ask data from the providers). Bars with no range split 50/50.
function buyFractionOf(bar) {
    const range = bar.high - bar.low;
    return range > 0 ? (bar.close - bar.low) / range : 0.5;
}

// Estimate of bought vs sold volume within one bar: the split and the signed
// distance between both as a percent of the bar's total volume
// (+ = buy-dominant, − = sell-dominant).
export function volumeSplitAt(bars, time) {
    const idx = barIndexAt(bars, time);
    const bar = idx >= 0 ? bars[idx] : null;
    if (!bar || bar.volume == null) return null;
    const bought = bar.volume * buyFractionOf(bar);
    const sold = bar.volume - bought;
    return {
        bought,
        sold,
        percent: ((bought - sold) / bar.volume) * 100,
    };
}

// Cumulative bought vs sold volume from the first bar up to and including
// the bar at `time`, same estimate as volumeSplitAt.
export function volumeSplitTotal(bars, time) {
    const idx = barIndexAt(bars, time);
    if (idx < 0) return null;
    let bought = 0, total = 0;
    for (let i = 0; i <= idx; i++) {
        const bar = bars[i];
        if (bar.volume == null) continue;
        bought += bar.volume * buyFractionOf(bar);
        total += bar.volume;
    }
    if (total === 0) return null;
    const sold = total - bought;
    return {
        bought,
        sold,
        percent: ((bought - sold) / total) * 100,
    };
}
