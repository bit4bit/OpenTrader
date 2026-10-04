// QoQ EPS change in percent for the earnings pane legend — additional
// information, not a plotted series: percent values on the EPS axis would
// distort the pane scale. Uses the shared snap rule (chart/earningsBars.js)
// so the chip always matches the drawn bars; falls back to the latest
// report when the crosshair isn't on a report bar.
import { snapEarningsReports } from './earningsBars';

export function qoqEpsChangeAt(data, quarters, time) {
    const reports = snapEarningsReports(data, quarters);
    if (reports.length === 0) return null;

    if (time != null) {
        const hovered = reports.find(r => data[r.index].time === time && r.change != null);
        if (hovered) return hovered;
    }
    for (let i = reports.length - 1; i >= 0; i--) {
        if (reports[i].change != null) return reports[i];
    }
    return null;
}
