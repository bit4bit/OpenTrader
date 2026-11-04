import { describe, it, expect } from 'vitest';
import { computeAdvanceDecline } from '../advanceDecline';

const day = (i, close) => ({ time: 1700000000 + i * 86400, close });

describe('computeAdvanceDecline', () => {
    it('cumulates advances minus declines across symbols', () => {
        const barsBySymbol = {
            AAPL: [day(0, 100), day(1, 101), day(2, 99), day(3, 101)],
            MSFT: [day(0, 50), day(1, 49), day(2, 48), day(3, 50)],
        };
        const symbols = [{ symbol: 'AAPL', enabled: true }, { symbol: 'MSFT', enabled: true }];
        const result = computeAdvanceDecline(barsBySymbol, symbols);
        // Bar 0 has no previous closes; bar 1: AAPL advances, MSFT declines;
        // bar 2: both decline; bar 3: both advance.
        expect(result.map(r => r.value)).toEqual([0, 0, -2, 0]);
        expect(result.map(r => r.time)).toEqual(barsBySymbol.AAPL.map(b => b.time));
    });

    it('unchanged and missing bars contribute nothing', () => {
        const barsBySymbol = {
            AAA: [day(0, 10), day(1, 10), day(2, 11)],
            // BBB has no bar at time index 1 (holiday).
            BBB: [day(0, 20), day(2, 19)],
        };
        const symbols = [{ symbol: 'AAA' }, { symbol: 'BBB' }];
        const result = computeAdvanceDecline(barsBySymbol, symbols);
        // Bar 1: AAA unchanged, BBB absent. Bar 2: AAA advances; BBB's
        // previous close is its own last close (bar 0), so 20 -> 19 declines.
        expect(result).toEqual([
            { time: day(0).time, value: 0 },
            { time: day(1).time, value: 0 },
            { time: day(2).time, value: 0 },
        ]);
    });

    it('skips disabled and empty symbols', () => {
        const barsBySymbol = {
            AAA: [day(0, 10), day(1, 11)],
            BBB: [day(0, 20), day(1, 19)],
            CCC: [],
        };
        const symbols = [
            { symbol: 'AAA', enabled: true },
            { symbol: 'BBB', enabled: false },
            { symbol: 'CCC', enabled: true },
        ];
        const result = computeAdvanceDecline(barsBySymbol, symbols);
        expect(result.map(r => r.value)).toEqual([0, 1]);
    });

    it('aligns staggered timestamps on their union of bar times', () => {
        const offset = 22 * 3600;
        const barsBySymbol = {
            AAA: [day(0, 10), day(1, 11)],
            BBB: [day(0, 20), day(1, 21)].map(b => ({ ...b, time: b.time + offset })),
        };
        const symbols = [{ symbol: 'AAA' }, { symbol: 'BBB' }];
        const result = computeAdvanceDecline(barsBySymbol, symbols);
        // Four union slots: each series counts one advance at its own pace.
        expect(result).toHaveLength(4);
        expect(result.map(r => r.value)).toEqual([0, 0, 1, 2]);
    });

    it('returns empty for no symbols or no data', () => {
        expect(computeAdvanceDecline({}, [{ symbol: 'AAA', enabled: true }])).toEqual([]);
        expect(computeAdvanceDecline({ AAA: [day(0, 10)] }, [])).toEqual([]);
        expect(computeAdvanceDecline({}, [])).toEqual([]);
    });
});