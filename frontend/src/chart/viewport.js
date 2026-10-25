// Viewport (zoom + pan) persistence for a chart.
//
// The visible window lives in the engine as a logical range (bar indices),
// but those indices shift whenever bars are prepended or appended. The
// persisted form therefore anchors the window on a bar *time* plus the
// fractional offset and the width of the window (in bars), so the same
// view is restored on the next load whatever the loaded bar window is.

// Key identifying the data a viewport belongs to (symbol + provider +
// interval): a chart keeps one viewport per symbol/interval it displays.
export const viewportKey = (symbol, provider, interval) =>
    `${symbol || ''}-${provider || ''}-${interval || ''}`;

// Index of the last bar at or before `time`; -1 when every bar is later.
export function indexOfTime(rows, time) {
    if (!rows || rows.length === 0 || time == null) return -1;
    let lo = 0;
    let hi = rows.length - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (rows[mid].time <= time) {
            found = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found;
}

// Logical range -> persisted viewport (anchor bar, offset, window width).
export function captureViewport(range, rows) {
    if (!range || !rows || rows.length === 0) return null;
    const fromIndex = Math.min(Math.max(Math.floor(range.from), 0), rows.length - 1);
    return {
        fromTime: rows[fromIndex].time,
        fromOffset: range.from - fromIndex,
        bars: range.to - range.from,
    };
}

// Persisted viewport -> logical range for the currently loaded rows.
// Returns null when the viewport starts before the loaded history: the
// caller loads the missing bars and tries again.
export function restoreViewport(viewport, rows) {
    if (!viewport || !rows || rows.length === 0) return null;
    if (viewport.fromTime < rows[0].time) return null;
    const index = indexOfTime(rows, viewport.fromTime);
    if (index < 0) return null;
    const from = index + (viewport.fromOffset || 0);
    return { from, to: from + viewport.bars };
}

// True when two viewports describe the same window.
export function sameViewport(a, b) {
    if (!a || !b) return a === b;
    return a.fromTime === b.fromTime
        && a.fromOffset === b.fromOffset
        && a.bars === b.bars;
}
