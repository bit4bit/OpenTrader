const charts = new Map();
let applyingSync = false;

export function registerChart(id, entry) {
    charts.set(id, entry);
    return () => charts.delete(id);
}

export function isApplyingSync() {
    return applyingSync;
}

function forEachPeer(sourceId, fn) {
    charts.forEach((entry, id) => {
        if (id === sourceId || !entry.chart) return;
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
    forEachPeer(sourceId, ({ chart }) => {
        chart.timeScale().setVisibleLogicalRange(range);
    });
}

export function broadcastCrosshair(sourceId, time, price, enabled) {
    if (!enabled || applyingSync) return;
    forEachPeer(sourceId, ({ chart, series, findNearestBar }) => {
        if (time == null || !series || !findNearestBar) {
            chart.clearCrosshairPosition?.();
            return;
        }
        const bar = findNearestBar(time);
        if (bar) {
            chart.setCrosshairPosition(bar.price, bar.time, series);
        } else {
            chart.clearCrosshairPosition?.();
        }
    });
}
