// Anchored VWAP from a clicked bar: the click's unix time is the exact
// anchor; the date-only string is the settings-input fallback.
import { findNearestBar } from './barSearch';

export function anchoredVwapInputs(time) {
    const d = new Date(time * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return {
        anchorDate: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
        anchorBar: time,
    };
}

// Eraser hit-test for anchored VWAP lines: of the visible date-anchored
// vwap indicators, the one whose line is closest to the clicked price at
// the clicked bar (within tolerancePx on the y axis). Returns its id.
export function erasableVwapAt(indicators, resultsById, evt, { priceToY }, tolerancePx = 10) {
    if (evt?.time == null || evt?.price == null) return null;
    const clickY = priceToY(evt.price);
    if (clickY == null) return null;
    let best = null;
    let bestDist = Infinity;
    for (const ind of indicators) {
        if (ind.type !== 'vwap' || ind.anchor !== 'date' || ind.visible === false) continue;
        const bars = resultsById?.[ind.id]?.plots?.[0]?.series ?? [];
        const bar = findNearestBar(bars.map(b => ({ time: b.time, close: b.value })), evt.time);
        if (!bar || bar.price == null) continue;
        const y = priceToY(bar.price);
        if (y == null) continue;
        const dist = Math.abs(y - clickY);
        if (dist < bestDist) {
            bestDist = dist;
            best = ind.id;
        }
    }
    return best != null && bestDist <= tolerancePx ? best : null;
}