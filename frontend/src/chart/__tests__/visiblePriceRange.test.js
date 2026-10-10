import { describe, it, expect } from 'vitest';
import { visiblePriceRange } from '../visiblePriceRange';

const bars = [
    { time: 100, open: 10, high: 12, low: 9, close: 11 },
    { time: 200, open: 11, high: 14, low: 10, close: 13 },
    { time: 300, open: 13, high: 13.5, low: 10, close: 11 },
    { time: 400, open: 11, high: 15, low: 10.5, close: 14 },
];

describe('visiblePriceRange', () => {
    it('returns the window extremes and the spread as a percent of the low', () => {
        expect(visiblePriceRange(bars, 100, 200).low).toBe(9);
        expect(visiblePriceRange(bars, 100, 200).high).toBe(14);
        expect(visiblePriceRange(bars, 100, 200).percent).toBeCloseTo(55.5556, 3);
        expect(visiblePriceRange(bars, 200, 300)).toEqual({ low: 10, high: 14, percent: 40 });
    });

    it('includes the boundary times', () => {
        expect(visiblePriceRange(bars, 200, 200)).toEqual({ low: 10, high: 14, percent: 40 });
    });

    it('skips bars with a missing high or low', () => {
        const partial = [
            { time: 100, high: 20 },
            { time: 200, low: 5 },
            { time: 300, open: 1, high: 10, low: 6, close: 8 },
        ];
        expect(visiblePriceRange(partial, 100, 300)).toEqual({ low: 5, high: 20, percent: 300 });
    });

    it('returns null for empty or missing input', () => {
        expect(visiblePriceRange([], 100, 200)).toBeNull();
        expect(visiblePriceRange(null, 100, 200)).toBeNull();
        expect(visiblePriceRange(bars, null, 200)).toBeNull();
        expect(visiblePriceRange(bars, 100, null)).toBeNull();
    });

    it('returns null for an empty or inverted window', () => {
        expect(visiblePriceRange(bars, 500, 600)).toBeNull();
        expect(visiblePriceRange(bars, 300, 100)).toBeNull();
    });

    it('returns null when the low is zero or negative', () => {
        expect(visiblePriceRange([{ time: 1, high: 5, low: 0 }], 1, 1)).toBeNull();
        expect(visiblePriceRange([{ time: 1, high: 5, low: -2 }], 1, 1)).toBeNull();
    });
});
