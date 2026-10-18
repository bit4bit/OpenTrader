import { describe, it, expect } from 'vitest';
import { anchoredVwapInputs, erasableVwapAt } from '../anchorVwap';

describe('anchoredVwapInputs', () => {
    it('derives a date-only anchor plus the exact unix anchor time', () => {
        // 2023-11-20 14:30:00 UTC
        const time = Date.parse('2023-11-20T14:30:00Z') / 1000;
        expect(anchoredVwapInputs(time)).toEqual({
            anchorDate: '2023-11-20',
            anchorBar: time,
        });
    });
});

describe('erasableVwapAt', () => {
    const indicators = [
        { id: 'vwap-a', type: 'vwap', anchor: 'date', visible: true },
        { id: 'vwap-b', type: 'vwap', anchor: 'date', visible: true },
        { id: 'vwap-hidden', type: 'vwap', anchor: 'date', visible: false },
        { id: 'vwap-session', type: 'vwap', anchor: 'session', visible: true },
        { id: 'other', type: 'sma', visible: true },
    ];
    const resultsById = {
        'vwap-a': { plots: [{ series: [{ time: 100, value: 50 }] }] },
        'vwap-b': { plots: [{ series: [{ time: 100, value: 150 }] }] },
        'vwap-hidden': { plots: [{ series: [{ time: 100, value: 75 }] }] },
    };
    // Price 50 maps to y 100, price 150 to y 300.
    const ctx = { priceToY: (p) => 100 + (p - 50) * 2 };
    const evt = { time: 100, price: 52 }; // y = 104, near vwap-a

    it('returns the closest anchored vwap line within tolerance', () => {
        expect(erasableVwapAt(indicators, resultsById, evt, ctx)).toBe('vwap-a');
    });

    it('returns null beyond tolerance', () => {
        expect(erasableVwapAt(indicators, resultsById, { time: 100, price: 120 }, ctx)).toBeNull();
    });

    it('never picks hidden or non-anchored indicators', () => {
        // Click right on the hidden line's value (75 -> y 150): only
        // vwap-a/vwap-b are candidates, both far -> null.
        expect(erasableVwapAt(indicators, resultsById, { time: 100, price: 75 }, ctx)).toBeNull();
    });
});