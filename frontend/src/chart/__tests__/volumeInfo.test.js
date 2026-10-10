import { describe, it, expect } from 'vitest';
import { volumeChangeAt, volumeSplitAt, volumeSplitTotal, volumeBarTotals, volumeSmaDiffAt } from '../volumeInfo';

const bars = [
    { time: 100, open: 10, high: 12, low: 9, close: 11, volume: 200 },
    { time: 200, open: 11, high: 14, low: 10, close: 13, volume: 400 },
    { time: 300, open: 13, high: 13.5, low: 10, close: 11, volume: 300 },
];

describe('volumeChangeAt', () => {
    it('returns delta and percent vs the previous bar', () => {
        expect(volumeChangeAt(bars, 200)).toEqual({ delta: 200, percent: 100 });
        expect(volumeChangeAt(bars, 300)).toEqual({ delta: -100, percent: -25 });
    });

    it('returns null for the first bar', () => {
        expect(volumeChangeAt(bars, 100)).toBeNull();
    });

    it('returns null for an unknown time', () => {
        expect(volumeChangeAt(bars, 250)).toBeNull();
    });

    it('returns null when previous volume is zero or missing', () => {
        expect(volumeChangeAt([{ time: 1, volume: 0 }, { time: 2, volume: 100 }], 2)).toBeNull();
        expect(volumeChangeAt([{ time: 1 }, { time: 2, volume: 100 }], 2)).toBeNull();
        expect(volumeChangeAt([{ time: 1, volume: 100 }, { time: 2 }], 2)).toBeNull();
    });

    it('returns null for empty or missing input', () => {
        expect(volumeChangeAt([], 100)).toBeNull();
        expect(volumeChangeAt(null, 100)).toBeNull();
        expect(volumeChangeAt(bars, null)).toBeNull();
    });
});

describe('volumeSmaDiffAt', () => {
    const volumeSeries = [
        { time: 100, value: 200 },
        { time: 200, value: 400 },
        { time: 300, value: 300 },
    ];
    const smaSeries = [
        { time: 100, value: 200 },
        { time: 200, value: 300 },
        { time: 300, value: 300 },
    ];

    it('returns delta and percent of the volume bar vs the SMA', () => {
        expect(volumeSmaDiffAt(volumeSeries, smaSeries, 200)).toEqual({ delta: 100, percent: (100 / 300) * 100 });
        expect(volumeSmaDiffAt(volumeSeries, smaSeries, 300)).toEqual({ delta: 0, percent: 0 });
    });

    it('returns null for an unknown time in either series', () => {
        expect(volumeSmaDiffAt(volumeSeries, smaSeries, 250)).toBeNull();
        expect(volumeSmaDiffAt(volumeSeries, [{ time: 250, value: 100 }], 250)).toBeNull();
    });

    it('returns null when the SMA value is zero, null or missing', () => {
        expect(volumeSmaDiffAt(volumeSeries, [{ time: 200, value: 0 }], 200)).toBeNull();
        expect(volumeSmaDiffAt(volumeSeries, [{ time: 200, value: null }], 200)).toBeNull();
        expect(volumeSmaDiffAt([{ time: 200, value: null }], smaSeries, 200)).toBeNull();
    });

    it('returns null for empty or missing input', () => {
        expect(volumeSmaDiffAt([], smaSeries, 200)).toBeNull();
        expect(volumeSmaDiffAt(null, smaSeries, 200)).toBeNull();
        expect(volumeSmaDiffAt(volumeSeries, [], 200)).toBeNull();
        expect(volumeSmaDiffAt(volumeSeries, smaSeries, null)).toBeNull();
    });
});

describe('volumeSplitAt', () => {
    it('splits by the close position within the bar range', () => {
        // Close at the high: all bought.
        expect(volumeSplitAt([{ time: 1, open: 10, high: 12, low: 9, close: 12, volume: 100 }], 1))
            .toEqual({ bought: 100, sold: 0, percent: 100 });
        // Close at the low of a red bar: all sold.
        expect(volumeSplitAt([{ time: 1, open: 10, high: 12, low: 9, close: 9, volume: 100 }], 1))
            .toEqual({ bought: 0, sold: 100, percent: -100 });
    });

    it('splits proportionally for a mid-range close', () => {
        // (11 - 10) / (13.5 - 10) = 2/7 bought.
        const split = volumeSplitAt(bars, 300);
        expect(split.bought).toBeCloseTo(300 * (1 / 3.5));
        expect(split.sold).toBeCloseTo(300 * (2.5 / 3.5));
        expect(split.percent).toBeCloseTo(((1 - 2.5) / 3.5) * 100);
    });

    it('splits 50/50 when the bar has no range', () => {
        expect(volumeSplitAt([{ time: 1, open: 10, high: 10, low: 10, close: 10, volume: 50 }], 1))
            .toEqual({ bought: 25, sold: 25, percent: 0 });
    });

    it('returns null for an unknown time or missing volume', () => {
        expect(volumeSplitAt(bars, 250)).toBeNull();
        expect(volumeSplitAt([{ time: 1, open: 1, high: 2, low: 0, close: 1 }], 1)).toBeNull();
        expect(volumeSplitAt([], 100)).toBeNull();
    });
});

describe('volumeSplitTotal', () => {
    it('accumulates bought and sold from the first bar to the hovered bar', () => {
        // Bar 100: (11-9)/(12-9) = 2/3 of 200; bar 200: (13-10)/(14-10) = 3/4 of 400.
        const total = volumeSplitTotal(bars, 200);
        expect(total.bought).toBeCloseTo(200 * (2 / 3) + 300);
        expect(total.sold).toBeCloseTo(200 * (1 / 3) + 100);
        expect(total.percent).toBeCloseTo(((200 * (2 / 3) + 300) - (200 * (1 / 3) + 100)) / 600 * 100);
    });

    it('stops at the hovered bar', () => {
        const atFirst = volumeSplitTotal(bars, 100);
        expect(atFirst.bought).toBeCloseTo(200 * (2 / 3));
        expect(atFirst.sold).toBeCloseTo(200 * (1 / 3));
    });

    it('skips bars with missing volume', () => {
        const total = volumeSplitTotal([
            { time: 1, open: 10, high: 12, low: 8, close: 12, volume: 100 },
            { time: 2, open: 10, high: 12, low: 8, close: 8, volume: null },
            { time: 3, open: 10, high: 12, low: 8, close: 8, volume: 100 },
        ], 3);
        expect(total.bought).toBeCloseTo(100);
        expect(total.sold).toBeCloseTo(100);
        expect(total.percent).toBeCloseTo(0);
    });

    it('returns null for an unknown time or no volume at all', () => {
        expect(volumeSplitTotal(bars, 250)).toBeNull();
        expect(volumeSplitTotal([{ time: 1, open: 1, high: 2, low: 0, close: 1 }], 1)).toBeNull();
        expect(volumeSplitTotal([], 100)).toBeNull();
    });
});

describe('volumeBarTotals', () => {
    it('counts and sums buy vs sell bars within the window', () => {
        // Bar 100: 11 >= 10 up; bar 200: 13 >= 11 up; bar 300: 11 < 13 down.
        expect(volumeBarTotals(bars, 100, 300)).toEqual({
            buyBars: 2,
            sellBars: 1,
            buyVolume: 600,
            sellVolume: 300,
            percent: ((600 - 300) / 900) * 100,
        });
    });

    it('restricts the totals to the requested window', () => {
        const window = volumeBarTotals(bars, 200, 200);
        expect(window.buyBars).toBe(1);
        expect(window.sellBars).toBe(0);
        expect(window.buyVolume).toBe(400);
    });

    it('classifies close-equals-open bars as buys, matching the bar colors', () => {
        const window = volumeBarTotals([{ time: 1, open: 10, high: 11, low: 9, close: 10, volume: 50 }], 1, 1);
        expect(window.buyBars).toBe(1);
        expect(window.sellBars).toBe(0);
    });

    it('skips bars with no volume', () => {
        const window = volumeBarTotals([
            { time: 1, open: 10, high: 11, low: 9, close: 12, volume: 0 },
            { time: 2, open: 10, high: 11, low: 9, close: 8, volume: null },
            { time: 3, open: 10, high: 11, low: 9, close: 8, volume: 100 },
        ], 1, 3);
        expect(window).toEqual({ buyBars: 0, sellBars: 1, buyVolume: 0, sellVolume: 100, percent: -100 });
    });

    it('returns null for an empty window, a reversed window, or missing input', () => {
        expect(volumeBarTotals(bars, 250, 250)).toBeNull();
        expect(volumeBarTotals(bars, 300, 100)).toBeNull();
        expect(volumeBarTotals(bars, null, 300)).toBeNull();
        expect(volumeBarTotals([], 1, 2)).toBeNull();
        expect(volumeBarTotals(null, 1, 2)).toBeNull();
    });
});
