import { GAP_FILL_STEPS } from './gapFill';

export const WEEKEND_CANDLE_COLOR = '#787b86';

const MAX_HALF_BODY = 20;

/**
 * Gray doji markers for gap-fill placeholder rows. The chart library cannot
 * color candlesticks per bar, so placeholders are drawn here as overlay
 * shapes instead. ctx: { timeToX, priceToY }.
 */
export function buildWeekendShapes(rows, interval, ctx) {
    const step = GAP_FILL_STEPS[interval];
    if (!step) return [];
    const shapes = [];
    rows.forEach(row => {
        if (!row.placeholder) return;
        const cx = ctx.timeToX(row.time);
        const price = row.close ?? row.value;
        const y = price == null ? null : ctx.priceToY(price);
        if (cx == null || y == null) return;
        const nextX = ctx.timeToX(row.time + step);
        const half = Math.min(Math.abs(nextX != null ? nextX - cx : 8) / 6, MAX_HALF_BODY);
        shapes.push({
            kind: 'line', x1: cx - half, y1: y, x2: cx + half, y2: y,
            style: { stroke: WEEKEND_CANDLE_COLOR, strokeWidth: 2 },
        });
    });
    return shapes;
}
