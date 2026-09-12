import { describe, it, expect } from 'vitest';
import { computeHeikinAshi, priceSeriesData } from '../heikinAshi';

const bars = [
    { time: 1, open: 10, high: 14, low: 9, close: 12, volume: 100 },
    { time: 2, open: 12, high: 16, low: 11, close: 15, volume: 100 },
];

describe('computeHeikinAshi', () => {
    it('seeds the first candle from the raw open/close midpoint', () => {
        const ha = computeHeikinAshi(bars);
        expect(ha[0].open).toBe(11);
        expect(ha[0].close).toBe((10 + 14 + 9 + 12) / 4);
        expect(ha[0].high).toBe(14);
        expect(ha[0].low).toBe(9);
        expect(ha[0].time).toBe(1);
    });

    it('chains subsequent opens from the previous HA candle', () => {
        const ha = computeHeikinAshi(bars);
        expect(ha[1].open).toBe((ha[0].open + ha[0].close) / 2);
        expect(ha[1].high).toBe(Math.max(16, ha[1].open, ha[1].close));
        expect(ha[1].low).toBe(Math.min(11, ha[1].open, ha[1].close));
    });
});

describe('priceSeriesData', () => {
    it('returns raw bars for candles', () => {
        expect(priceSeriesData(bars, 'candles')).toBe(bars);
    });

    it('maps bars to close points for line charts', () => {
        expect(priceSeriesData(bars, 'line')).toEqual([
            { time: 1, value: 12 },
            { time: 2, value: 15 },
        ]);
    });

    it('computes HA candles for heikin', () => {
        expect(priceSeriesData(bars, 'heikin')).toEqual(computeHeikinAshi(bars));
    });
});
