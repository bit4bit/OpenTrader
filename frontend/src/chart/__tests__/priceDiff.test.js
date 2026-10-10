import { describe, it, expect } from 'vitest';
import { priceDiffPercent } from '../priceDiff';

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
