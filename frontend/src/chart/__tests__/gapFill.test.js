import { describe, it, expect } from 'vitest';
import { fillGapRows } from '../gapFill';

const DAY = 86400;
const FRI = Date.UTC(2024, 0, 5) / 1000; // 2024-01-05 Friday
const MON = Date.UTC(2024, 0, 8) / 1000; // 2024-01-08 Monday

const candle = (time, close) => ({ time, open: close, high: close, low: close, close, volume: 100 });

describe('fillGapRows', () => {
    it('fills weekend gaps with doji placeholders at the previous close', () => {
        const rows = [candle(FRI, 100), candle(MON, 110)];
        const filled = fillGapRows(rows, '1d');
        expect(filled.map(r => r.time)).toEqual([FRI, FRI + DAY, FRI + 2 * DAY, MON]);
        expect(filled[1]).toMatchObject({ open: 100, high: 100, low: 100, close: 100, volume: 0, placeholder: true });
        expect(filled[0].placeholder).toBeUndefined();
        expect(filled[3].placeholder).toBeUndefined();
        expect(filled[3]).toEqual(candle(MON, 110));
    });

    it('leaves consecutive trading days untouched', () => {
        const rows = [candle(FRI, 100), candle(FRI + DAY, 101)];
        expect(fillGapRows(rows, '1d')).toEqual(rows);
    });

    it('returns the input for intraday and monthly intervals', () => {
        const rows = [candle(FRI, 100), candle(FRI + 30 * DAY, 110)];
        expect(fillGapRows(rows, '1h')).toBe(rows);
        expect(fillGapRows(rows, '1mo')).toBe(rows);
    });

    it('returns the input when fewer than two rows', () => {
        const rows = [candle(FRI, 100)];
        expect(fillGapRows(rows, '1d')).toBe(rows);
    });

    it('fills line rows with the previous value', () => {
        const rows = [{ time: FRI, value: 100 }, { time: MON, value: 110 }];
        const filled = fillGapRows(rows, '1d');
        expect(filled).toEqual([
            { time: FRI, value: 100 },
            { time: FRI + DAY, value: 100, placeholder: true },
            { time: FRI + 2 * DAY, value: 100, placeholder: true },
            { time: MON, value: 110 },
        ]);
    });

    it('caps absurd gaps instead of flooding placeholders', () => {
        const rows = [candle(FRI, 100), candle(FRI + 1000 * DAY, 110)];
        const filled = fillGapRows(rows, '1d');
        // 1 real bar + 400 placeholders + 1 real bar
        expect(filled.length).toBe(402);
    });
});
