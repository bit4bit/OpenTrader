import { describe, it, expect } from 'vitest';
import { computeVWAP } from '../vwap';

const utc = (y, m, d, h = 0) => Date.UTC(y, m, d, h) / 1000;

/** Hourly bar whose hlc3 is close (open=close, high=close+1, low=close-1 -> hlc3=close). */
function bar(time, close, volume) {
    return { time, open: close, high: close + 1, low: close - 1, close, volume };
}

const day1 = [
    bar(utc(2024, 0, 2, 10), 10, 100),
    bar(utc(2024, 0, 2, 11), 12, 100),
    bar(utc(2024, 0, 2, 12), 14, 200),
];
const day2 = [bar(utc(2024, 0, 3, 10), 20, 100)];

describe('computeVWAP', () => {
    it('session anchor resets each UTC day', () => {
        const res = computeVWAP([...day1, ...day2], { anchor: 'session' });
        // Day 1: 10 -> (10*100+12*100)/200 -> (1000+1200+2800)/400
        // Day 2 resets: back to the bar's own price.
        expect(res.map(p => p.value)).toEqual([10, 11, 12.5, 20]);
    });

    it('week anchor resets each Monday UTC and weekend bars join their week', () => {
        // 2024-01-01 is a Monday.
        const data = [
            bar(utc(2024, 0, 1), 10, 100),   // Mon W1
            bar(utc(2024, 0, 4), 20, 300),    // Thu W1
            bar(utc(2024, 0, 6), 25, 100),    // Sat W1 (crypto/gap-fill bar)
            bar(utc(2024, 0, 8), 30, 100),    // Mon W2: reset
        ];
        const res = computeVWAP(data, { anchor: 'week' });
        expect(res.map(p => p.value)).toEqual([
            10,
            (1000 + 6000) / 400,
            (1000 + 6000 + 2500) / 500,
            30,
        ]);
    });

    it('month and year anchors reset at their boundaries', () => {
        const data = [
            bar(utc(2023, 11, 31), 10, 100),
            bar(utc(2024, 0, 1), 20, 100),
            bar(utc(2024, 0, 2), 30, 100),
        ];
        expect(computeVWAP(data, { anchor: 'month' }).map(p => p.value)).toEqual([10, 20, 25]);
        // Jan 1 and Jan 2 accumulate within the year; Dec 31 belongs to 2023.
        expect(computeVWAP(data, { anchor: 'year' }).map(p => p.value)).toEqual([10, 20, 25]);
        const yearData = [
            bar(utc(2024, 0, 1), 10, 100),
            bar(utc(2024, 11, 15), 30, 100),
            bar(utc(2025, 0, 1), 50, 100),
        ];
        expect(computeVWAP(yearData, { anchor: 'year' }).map(p => p.value)).toEqual([10, 20, 50]);
    });

    it('anchorTime starts the line at the first bar at/after the anchor', () => {
        const data = [...day1, ...day2];
        // Anchor exactly on the second bar; the line keeps accumulating
        // across later sessions (anchored VWAP never resets).
        const exact = computeVWAP(data, { anchorTime: utc(2024, 0, 2, 11) });
        expect(exact.map(p => p.time)).toEqual(data.slice(1).map(d => d.time));
        expect(exact.map(p => p.value)).toEqual([12, 4000 / 300, 6000 / 400]);
        // Anchor between bars snaps forward to the next bar (11:30 -> 12:00).
        const between = computeVWAP(data, { anchorTime: utc(2024, 0, 2, 11) + 1800 });
        expect(between.map(p => p.time)).toEqual(data.slice(2).map(d => d.time));
        expect(between.map(p => p.value)).toEqual([14, 4800 / 300]);
        // Anchor past the last bar -> empty.
        expect(computeVWAP(data, { anchorTime: utc(2030, 0, 1) })).toEqual([]);
    });

    it('zero and missing volume carry the level forward; all-zero volume stays empty', () => {
        const data = [
            bar(utc(2024, 0, 2, 10), 10, 100),
            bar(utc(2024, 0, 2, 11), 20, 0),
            bar(utc(2024, 0, 2, 12), 30, 100),
        ];
        const res = computeVWAP(data, { anchor: 'session' });
        expect(res.map(p => p.value)).toEqual([10, 10, (1000 + 3000) / 200]);
        const missingVolume = [
            { time: utc(2024, 0, 2, 10), open: 10, high: 11, low: 9, close: 10, volume: null },
        ];
        expect(computeVWAP(missingVolume, { anchor: 'session' })).toEqual([]);
        const zeroVolume = data.map(d => ({ ...d, volume: 0 }));
        expect(computeVWAP(zeroVolume, { anchor: 'session' })).toEqual([]);
    });

    it('invalid bars do not produce non-finite values', () => {
        const data = [
            bar(utc(2024, 0, 2, 10), 10, 100),
            { time: utc(2024, 0, 2, 11), open: NaN, high: NaN, low: NaN, close: NaN, volume: 100 },
            bar(utc(2024, 0, 2, 12), 14, 200),
        ];
        const res = computeVWAP(data, { anchor: 'session' });
        // The NaN bar carries the previous level; the chain continues.
        expect(res.map(p => p.value)).toEqual([10, 10, 3800 / 300]);
        for (const p of res) expect(Number.isFinite(p.value)).toBe(true);
    });

    it('supports price sources other than hlc3', () => {
        const data = [bar(utc(2024, 0, 2, 10), 10, 100), bar(utc(2024, 0, 3, 10), 20, 100)];
        expect(computeVWAP(data, { source: 'close' }).map(p => p.value)).toEqual([10, 20]);
        expect(computeVWAP(data, { source: 'hl2' }).map(p => p.value)).toEqual([10, 20]);
        expect(computeVWAP(data, { source: 'ohlc4' }).map(p => p.value)).toEqual([10, 20]);
    });

    it('unknown anchor without anchorTime returns empty', () => {
        expect(computeVWAP(day1, { anchor: 'date' })).toEqual([]);
        expect(computeVWAP(day1, { anchor: 'decade' })).toEqual([]);
    });

    it('returns an empty array for empty data', () => {
        expect(computeVWAP([], {})).toEqual([]);
        expect(computeVWAP(null, {})).toEqual([]);
    });

    it('does not mutate the input bars', () => {
        const input = [...day1, ...day2].map(d => ({ ...d }));
        const snapshot = JSON.stringify(input);
        computeVWAP(input, { anchor: 'session' });
        computeVWAP(input, { anchorTime: input[1].time });
        expect(JSON.stringify(input)).toBe(snapshot);
    });
});
