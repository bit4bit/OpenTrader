import { describe, it, expect } from 'vitest';
import { volumeChangeAt } from '../volumeChange';

const bars = [
    { time: 100, volume: 200 },
    { time: 200, volume: 400 },
    { time: 300, volume: 300 },
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
