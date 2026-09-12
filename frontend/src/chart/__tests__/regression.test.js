import { describe, it, expect } from 'vitest';
import { linearRegression, maxDeviation, stdError, timeWindowIndices } from '../regression';

describe('linearRegression', () => {
    it('fits a perfect line exactly', () => {
        const { slope, intercept } = linearRegression([3, 5, 7, 9]);
        expect(slope).toBeCloseTo(2);
        expect(intercept).toBeCloseTo(3);
    });

    it('fits a flat line', () => {
        const { slope, intercept } = linearRegression([4, 4, 4]);
        expect(slope).toBeCloseTo(0);
        expect(intercept).toBeCloseTo(4);
    });

    it('returns null for degenerate input', () => {
        expect(linearRegression([1])).toBeNull();
        expect(linearRegression([])).toBeNull();
    });
});

describe('deviation measures', () => {
    it('computes max absolute deviation', () => {
        expect(maxDeviation([0, 5, 0], 0, 2)).toBe(3);
    });

    it('computes zero std error for a perfect fit', () => {
        expect(stdError([3, 5, 7], 2, 3)).toBeCloseTo(0);
    });

    it('computes RMSE otherwise', () => {
        expect(stdError([0, 2], 0, 0)).toBeCloseTo(Math.sqrt(2));
    });
});

describe('timeWindowIndices', () => {
    const bars = [10, 20, 30, 40, 50].map(t => ({ time: t }));

    it('finds the inclusive index range within a time window', () => {
        expect(timeWindowIndices(bars, 15, 45)).toEqual({ start: 1, end: 3 });
    });

    it('accepts exact boundary matches', () => {
        expect(timeWindowIndices(bars, 20, 40)).toEqual({ start: 1, end: 3 });
    });

    it('returns null when the window has fewer than two bars', () => {
        expect(timeWindowIndices(bars, 21, 29)).toBeNull();
        expect(timeWindowIndices(bars, 60, 70)).toBeNull();
    });
});
