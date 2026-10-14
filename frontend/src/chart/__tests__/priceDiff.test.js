import { describe, it, expect } from 'vitest';
import { priceDiffPercent, adjacentChangePercent } from '../priceDiff';

describe('priceDiffPercent', () => {
    it('returns the signed percent of the price relative to the value', () => {
        expect(priceDiffPercent(105, 100)).toBe(5);
        expect(priceDiffPercent(95, 100)).toBe(-5);
        expect(priceDiffPercent(100, 100)).toBe(0);
    });

    it('returns null for missing or zero inputs', () => {
        expect(priceDiffPercent(null, 100)).toBeNull();
        expect(priceDiffPercent(undefined, 100)).toBeNull();
        expect(priceDiffPercent(100, null)).toBeNull();
        expect(priceDiffPercent(100, 0)).toBeNull();
    });
});

describe('adjacentChangePercent', () => {
    const series = [
        { time: 10, value: 100 },
        { time: 20, value: 105 },
        { time: 30, value: 110 },
    ];

    it('returns the signed percent between the value at the time and the previous bar', () => {
        expect(adjacentChangePercent(series, 20)).toBeCloseTo(5, 9);
        expect(adjacentChangePercent(series, 30)).toBeCloseTo(4.7619, 4);
    });

    it('returns null for the first bar, a time not on the series, or missing values', () => {
        expect(adjacentChangePercent(series, 10)).toBeNull();
        expect(adjacentChangePercent(series, 15)).toBeNull();
        expect(adjacentChangePercent([], 20)).toBeNull();
        expect(adjacentChangePercent(null, 20)).toBeNull();
        expect(adjacentChangePercent([{ time: 10, value: null }, { time: 20, value: 105 }], 20)).toBeNull();
    });

    it('returns null when the previous value is zero', () => {
        expect(adjacentChangePercent([{ time: 10, value: 0 }, { time: 20, value: 105 }], 20)).toBeNull();
    });
});
