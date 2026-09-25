import { describe, it, expect } from 'vitest';
import { buyFractionOf, computeBuyVolume } from '../tradingActivity';

describe('buyFractionOf', () => {
    it('is 1 when the close is at the high and 0 at the low', () => {
        expect(buyFractionOf({ high: 12, low: 9, close: 12 })).toBe(1);
        expect(buyFractionOf({ high: 12, low: 9, close: 9 })).toBe(0);
    });

    it('is proportional to the close position within the range', () => {
        expect(buyFractionOf({ high: 13.5, low: 10, close: 11 })).toBeCloseTo(1 / 3.5);
    });

    it('splits 50/50 when the bar has no range', () => {
        expect(buyFractionOf({ high: 10, low: 10, close: 10 })).toBe(0.5);
    });
});

describe('computeBuyVolume', () => {
    const data = [
        { time: 100, high: 12, low: 9, close: 11, volume: 200 },
        { time: 200, high: 14, low: 10, close: 10, volume: 400 },
        { time: 300, high: 10, low: 10, close: 10, volume: null },
    ];

    it('estimates bought volume per bar', () => {
        const result = computeBuyVolume(data);
        expect(result[0]).toEqual({ time: 100, value: 200 * (2 / 3) });
        expect(result[1]).toEqual({ time: 200, value: 0 });
        expect(result[2]).toEqual({ time: 300, value: 0 });
    });
});
