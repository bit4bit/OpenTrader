import { describe, it, expect } from 'vitest';
import { measureStats, measureContains, formatMeasureVolume, formatMeasureDate } from '../measureStats';

const bars = [
    { time: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { time: 200, open: 11, high: 13, low: 10, close: 12, volume: 500 },
    { time: 300, open: 12, high: 14, low: 8, close: 9, volume: 300 },
    { time: 400, open: 9, high: 10, low: 7, close: 8, volume: 200 },
];

describe('measureStats', () => {
    it('aggregates the full window (inclusive at both ends)', () => {
        const stats = measureStats(bars, 100, 400);
        expect(stats.barCount).toBe(4);
        expect(stats.avgOpen).toBeCloseTo(10.5);
        expect(stats.avgHigh).toBeCloseTo(12.25);
        expect(stats.avgLow).toBeCloseTo(8.5);
        expect(stats.avgClose).toBeCloseTo(10);
        expect(stats.avgPrice).toBeCloseTo(10.25);
        expect(stats.avgVolume).toBeCloseTo(275);
        expect(stats.totalVolume).toBe(1100);
        expect(stats.boughtVolume).toBeCloseTo(100 * 2 / 3 + 500 * 2 / 3 + 300 / 6 + 200 / 3);
        expect(stats.soldVolume).toBeCloseTo(1100 - (100 * 2 / 3 + 500 * 2 / 3 + 300 / 6 + 200 / 3));
        expect(stats.maxVolume).toEqual({ volume: 500, time: 200 });
        expect(stats.minVolume).toEqual({ volume: 100, time: 100 });
        expect(stats.greenBars).toBe(2);
        expect(stats.redBars).toBe(2);
    });

    it('accepts reversed endpoints', () => {
        expect(measureStats(bars, 400, 100)).toEqual(measureStats(bars, 100, 400));
    });

    it('excludes bars outside the window', () => {
        const stats = measureStats(bars, 150, 350);
        expect(stats.barCount).toBe(2);
        expect(stats.greenBars).toBe(1);
        expect(stats.redBars).toBe(1);
        expect(stats.maxVolume).toEqual({ volume: 500, time: 200 });
    });

    it('supports a single-bar window', () => {
        const stats = measureStats(bars, 300, 300);
        expect(stats.barCount).toBe(1);
        expect(stats.avgOpen).toBe(12);
        expect(stats.maxVolume).toEqual({ volume: 300, time: 300 });
        expect(stats.minVolume).toEqual({ volume: 300, time: 300 });
    });

    it('returns null when the window is empty', () => {
        expect(measureStats(bars, 500, 600)).toBeNull();
        expect(measureStats([], 100, 400)).toBeNull();
        expect(measureStats(bars, null, 400)).toBeNull();
    });

    it('reports null volume stats when bars carry no volume', () => {
        const noVolume = bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
        const stats = measureStats(noVolume, 100, 400);
        expect(stats.barCount).toBe(4);
        expect(stats.avgVolume).toBeNull();
        expect(stats.totalVolume).toBeNull();
        expect(stats.boughtVolume).toBeNull();
        expect(stats.soldVolume).toBeNull();
        expect(stats.maxVolume).toBeNull();
        expect(stats.minVolume).toBeNull();
    });
});

describe('measureContains', () => {
    const d = { type: 'measure', p1: { time: 100, price: 8 }, p2: { time: 300, price: 14 } };

    it('contains points inside the time/price window, edges included', () => {
        expect(measureContains(d, 100, 8)).toBe(true);
        expect(measureContains(d, 300, 14)).toBe(true);
        expect(measureContains(d, 200, 11)).toBe(true);
    });

    it('rejects points outside either dimension', () => {
        expect(measureContains(d, 99, 11)).toBe(false);
        expect(measureContains(d, 301, 11)).toBe(false);
        expect(measureContains(d, 200, 7)).toBe(false);
        expect(measureContains(d, 200, 15)).toBe(false);
    });

    it('ignores other drawings and missing coordinates', () => {
        expect(measureContains(null, 200, 11)).toBe(false);
        expect(measureContains({ type: 'rectangle', p1: d.p1, p2: d.p2 }, 200, 11)).toBe(false);
        expect(measureContains(d, null, 11)).toBe(false);
        expect(measureContains(d, 200, null)).toBe(false);
    });
});

describe('formatMeasureVolume', () => {
    it('compacts thousands, millions and billions', () => {
        expect(formatMeasureVolume(999)).toBe('999');
        expect(formatMeasureVolume(1234)).toBe('1.23K');
        expect(formatMeasureVolume(1500000)).toBe('1.50M');
        expect(formatMeasureVolume(2500000000)).toBe('2.50B');
        expect(formatMeasureVolume(null)).toBe('—');
    });
});

describe('formatMeasureDate', () => {
    const time = Date.UTC(2026, 9, 14, 9, 30) / 1000;

    it('formats a UTC date on daily-and-above intervals', () => {
        expect(formatMeasureDate(time, '1d')).toBe('14 Oct 26');
        expect(formatMeasureDate(time)).toBe('14 Oct 26');
    });

    it('appends the time-of-day on intraday intervals', () => {
        expect(formatMeasureDate(time, '1h')).toBe('14 Oct 26 09:30');
    });
});
