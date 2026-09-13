const charts = new Map();
let applyingSync = false;

export function registerChart(id, entry) {
    charts.set(id, entry);
    return () => charts.delete(id);
}

export function isApplyingSync() {
    return applyingSync;
}

// Sync peers are engine-agnostic entries: { setVisibleRange(range),
// showCrosshair(time | null) } — the registering chart owns the
// nearest-bar snapping and engine calls.
function forEachPeer(sourceId, fn) {
    charts.forEach((entry, id) => {
        if (id === sourceId) return;
        applyingSync = true;
        try {
            fn(entry);
        } finally {
            applyingSync = false;
        }
    });
}

export function broadcastRange(sourceId, range, enabled) {
    if (!enabled || applyingSync || !range) return;
    forEachPeer(sourceId, (entry) => {
        entry.setVisibleRange(range);
    });
}

export function broadcastCrosshair(sourceId, time, price, enabled) {
    if (!enabled || applyingSync) return;
    forEachPeer(sourceId, (entry) => {
        entry.showCrosshair(time ?? null);
    });
}
