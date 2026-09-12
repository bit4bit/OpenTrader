import { describe, it, expect } from 'vitest';
import { findNearestBar } from '../barSearch';

const bars = [
    { time: 10, close: 100 },
    { time: 20, close: 200 },
    { time: 30, close: 300 },
];

describe('findNearestBar', () => {
    it('returns null for empty data', () => {
        expect(findNearestBar([], 15)).toBeNull();
    });

    it('finds exact matches', () => {
        expect(findNearestBar(bars, 20)).toEqual({ time: 20, price: 200 });
    });

    it('snaps to the nearest bar on either side', () => {
        expect(findNearestBar(bars, 24)).toEqual({ time: 20, price: 200 });
        expect(findNearestBar(bars, 26)).toEqual({ time: 30, price: 300 });
    });

    it('prefers the earlier bar on an exact tie', () => {
        expect(findNearestBar(bars, 25)).toEqual({ time: 20, price: 200 });
    });

    it('clamps to the edges', () => {
        expect(findNearestBar(bars, 0)).toEqual({ time: 10, price: 100 });
        expect(findNearestBar(bars, 999)).toEqual({ time: 30, price: 300 });
    });
});
