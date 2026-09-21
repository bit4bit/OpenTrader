import { describe, it, expect } from 'vitest';
import { buildWeekendShapes, WEEKEND_CANDLE_COLOR } from '../weekendShapes';
import { fillGapRows } from '../gapFill';

const DAY = 86400;
const FRI = Date.UTC(2024, 0, 5) / 1000;
const MON = Date.UTC(2024, 0, 8) / 1000;

// Linear converter: 10px per day, price 50 -> y 500.
const ctx = {
    timeToX: t => (t - FRI) / DAY * 10,
    priceToY: p => p * 10,
};

describe('buildWeekendShapes', () => {
    it('draws a gray dash for each placeholder row', () => {
        const rows = fillGapRows([
            { time: FRI, open: 100, high: 100, low: 100, close: 100, volume: 100 },
            { time: MON, open: 110, high: 110, low: 110, close: 110, volume: 100 },
        ], '1d');
        const shapes = buildWeekendShapes(rows, '1d', ctx);
        expect(shapes).toHaveLength(2);
        expect(shapes[0]).toMatchObject({
            kind: 'line',
            y1: 1000,
            y2: 1000,
            style: { stroke: WEEKEND_CANDLE_COLOR, strokeWidth: 2 },
        });
        // Body spans a third of the 10px bar width around the bar center.
        expect(shapes[0].x2 - shapes[0].x1).toBeCloseTo(10 / 3);
        expect((shapes[0].x1 + shapes[0].x2) / 2).toBe(10);
        expect((shapes[1].x1 + shapes[1].x2) / 2).toBe(20);
    });

    it('supports line rows and skips real bars', () => {
        const rows = fillGapRows([{ time: FRI, value: 100 }, { time: MON, value: 110 }], '1d');
        const shapes = buildWeekendShapes(rows, '1d', ctx);
        expect(shapes).toHaveLength(2);
        expect(shapes[0].y1).toBe(1000);
    });

    it('returns nothing for intraday intervals and off-screen bars', () => {
        const rows = fillGapRows([
            { time: FRI, open: 100, high: 100, low: 100, close: 100, volume: 100 },
            { time: MON, open: 110, high: 110, low: 110, close: 110, volume: 100 },
        ], '1d');
        expect(buildWeekendShapes(rows, '1h', ctx)).toEqual([]);
        const offScreen = { timeToX: () => null, priceToY: () => 500 };
        expect(buildWeekendShapes(rows, '1d', offScreen)).toEqual([]);
    });
});
