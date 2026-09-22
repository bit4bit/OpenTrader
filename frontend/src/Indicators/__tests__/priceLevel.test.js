import { describe, it, expect } from 'vitest';
import { computePriceLevel } from '../priceLevel';
import { computeW52 } from '../w52';
import { DATA } from './golden.test';

const DAY = 86400;
const utc = (y, m, d) => Date.UTC(y, m, d) / 1000;

/** Bar with open/high/low/close derived from a base price and spread. */
function bar(time, base, spread = 1) {
    return { time, open: base, high: base + spread, low: base - spread, close: base, volume: 1 };
}

describe('computePriceLevel', () => {
    it('day windows: trailing max of highs over N calendar days', () => {
        // Ten consecutive daily bars, highs 11..20.
        const data = Array.from({ length: 10 }, (_, i) => bar(utc(2024, 0, 2) + i * DAY, 10 + i));
        const res = computePriceLevel(data, { unit: 'day', length: 3, source: 'high', aggregation: 'max' });
        expect(res).toHaveLength(10);
        // Rolling 3-bar max: high at bar i is 11 + i.
        expect(res.map(p => p.value)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    });

    it('day windows: trailing min of lows', () => {
        const data = Array.from({ length: 10 }, (_, i) => bar(utc(2024, 0, 2) + i * DAY, 10 + i));
        const res = computePriceLevel(data, { unit: 'day', length: 3, source: 'low', aggregation: 'min' });
        expect(res.map(p => p.value)).toEqual([9, 9, 9, 10, 11, 12, 13, 14, 15, 16]);
    });

    it('week windows start Monday UTC and evict bars of earlier weeks', () => {
        // 2024-01-01 is a Monday.
        const w1Mon = bar(utc(2024, 0, 1), 10);
        const w1Thu = bar(utc(2024, 0, 4), 20);
        const w2Mon = bar(utc(2024, 0, 8), 30);
        const w2Thu = bar(utc(2024, 0, 11), 40);
        const w3Mon = bar(utc(2024, 0, 15), 5);
        const data = [w1Mon, w1Thu, w2Mon, w2Thu, w3Mon];
        const res = computePriceLevel(data, { unit: 'week', length: 2, source: 'high', aggregation: 'max' });
        // W1 Thu: window starts previous Monday (no bars) -> max(11, 21) = 21
        // W2 Mon: window starts W1 Monday -> max(11, 21, 31) = 31
        // W2 Thu: window still starts W1 Monday -> max(..., 41) = 41
        // W3 Mon: window starts W2 Monday -> W1 bars evicted -> max(31, 41, 6) = 41
        expect(res.map(p => p.value)).toEqual([11, 21, 31, 41, 41]);
    });

    it('month windows handle variable month lengths', () => {
        const dec = bar(utc(2023, 11, 15), 1);
        const janA = bar(utc(2024, 0, 15), 50);
        const janB = bar(utc(2024, 0, 31), 60);
        const febA = bar(utc(2024, 1, 1), 10);
        const febB = bar(utc(2024, 1, 15), 70);
        const mar = bar(utc(2024, 2, 1), 5);
        const data = [dec, janA, janB, febA, febB, mar];
        const res = computePriceLevel(data, { unit: 'month', length: 2, source: 'high', aggregation: 'max' });
        // Dec:  only Dec (window starts Nov 1)
        // JanA: Dec + Jan (window starts Dec 1 2023)
        // JanB: Dec + Jan
        // FebA: Jan + Feb (window starts Jan 1 2024)
        // FebB: Jan + Feb
        // Mar:  Feb + Mar (window starts Feb 1)
        expect(res.map(p => p.value)).toEqual([2, 51, 61, 61, 71, 71]);
    });

    it('month windows step back across year boundaries', () => {
        const dec = bar(utc(2023, 11, 15), 100);
        const jan = bar(utc(2024, 0, 15), 1);
        const res1 = computePriceLevel([dec, jan], { unit: 'month', length: 1, source: 'high', aggregation: 'max' });
        // Length 1: each bar sees only its own month.
        expect(res1.map(p => p.value)).toEqual([101, 2]);
        const res2 = computePriceLevel([dec, jan], { unit: 'month', length: 2, source: 'high', aggregation: 'max' });
        // Length 2: January's window starts December 1st.
        expect(res2.map(p => p.value)).toEqual([101, 101]);
    });

    it('supports open and close sources', () => {
        const data = Array.from({ length: 5 }, (_, i) => bar(utc(2024, 0, 2) + i * DAY, 10 + i));
        const opens = computePriceLevel(data, { unit: 'day', length: 3, source: 'open', aggregation: 'max' });
        expect(opens.map(p => p.value)).toEqual([10, 11, 12, 13, 14]);
        const closes = computePriceLevel(data, { unit: 'day', length: 3, source: 'close', aggregation: 'min' });
        expect(closes.map(p => p.value)).toEqual([10, 10, 10, 11, 12]);
    });

    it('matches w52 for the 52-week high/low case', () => {
        const high = computePriceLevel(DATA, { unit: 'week', length: 52, source: 'high', aggregation: 'max' });
        const low = computePriceLevel(DATA, { unit: 'week', length: 52, source: 'low', aggregation: 'min' });
        const w52 = computeW52(DATA, { basis: 'highlow' });
        expect(high).toEqual(w52.high);
        expect(low).toEqual(w52.low);
    });

    it('returns an empty array for empty data', () => {
        expect(computePriceLevel([], { unit: 'week', length: 52 })).toEqual([]);
        expect(computePriceLevel(null, { unit: 'week', length: 52 })).toEqual([]);
    });
});
