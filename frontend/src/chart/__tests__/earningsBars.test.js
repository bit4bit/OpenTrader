import { describe, it, expect } from 'vitest';
import { snapEarningsReports } from '../earningsBars';

const day = (offset) => 1704067200 + offset * 86400;
const iso = (epochSeconds) => new Date(epochSeconds * 1000).toISOString().slice(0, 10);
const data = [0, 1, 2, 3, 4].map(d => ({ time: day(d), open: 10, close: 10 }));

describe('snapEarningsReports', () => {
    it('snaps report dates to the first bar of their session', () => {
        const quarters = [
            { date: iso(day(0)), epsEstimate: 1.0, epsActual: 1.0 },
            { date: iso(day(2)), epsEstimate: 1.1, epsActual: 1.2 },
        ];
        const snapped = snapEarningsReports(data, quarters);
        expect(snapped).toHaveLength(2);
        expect(snapped[0]).toMatchObject({ index: 0, date: iso(day(0)), epsActual: 1.0, change: null });
        expect(snapped[1]).toMatchObject({ index: 2, date: iso(day(2)), epsActual: 1.2 });
        expect(snapped[1].change).toBeCloseTo(20, 9);
    });

    it('attaches consecutive-day reports to their own bars when bar times are not midnight-aligned', () => {
        // Yahoo dailies at 22:13 UTC: nearest-bar snapping would pull both
        // Nov-14 and Nov-15 reports onto the Nov-14 bar.
        const shifted = [0, 1, 2].map(d => ({ time: 1700000000 + d * 86400, open: 10, close: 10 }));
        const quarters = [
            { date: '2023-11-14', epsEstimate: 1.0, epsActual: 1.2 },
            { date: '2023-11-15', epsEstimate: 1.0, epsActual: 0.9 },
        ];
        const snapped = snapEarningsReports(shifted, quarters);
        expect(snapped.map(r => r.index)).toEqual([0, 1]);
    });

    it('drops reports outside the loaded bar range instead of clamping them onto the edge bar', () => {
        // The initial chart load covers a short window; quarters before the
        // first bar must not pile onto it.
        const quarters = [
            { date: iso(day(0) - 90 * 86400), epsEstimate: 1.0, epsActual: 1.0 },
            { date: iso(day(0) - 30 * 86400), epsEstimate: 1.0, epsActual: 1.1 },
        ];
        expect(snapEarningsReports(data, quarters)).toEqual([]);
    });

    it('computes change against the previous actual even when that quarter is out of range', () => {
        const quarters = [
            { date: iso(day(0) - 90 * 86400), epsEstimate: null, epsActual: 1.0 },
            { date: iso(day(1)), epsEstimate: null, epsActual: 1.5 },
        ];
        const snapped = snapEarningsReports(data, quarters);
        expect(snapped).toHaveLength(1);
        expect(snapped[0].change).toBe(50);
    });

    it('keeps upcoming reports (estimate only) and drops quarters without values', () => {
        const quarters = [
            { date: iso(day(0)), epsEstimate: null, epsActual: null },
            { date: iso(day(1)), epsEstimate: 1.1, epsActual: null },
        ];
        expect(snapEarningsReports(data, quarters)).toEqual([
            { index: 1, date: iso(day(1)), epsEstimate: 1.1, epsActual: null, change: null },
        ]);
    });

    it('keeps the improvement sign when the base quarter is negative', () => {
        const quarters = [
            { date: iso(day(0)), epsEstimate: null, epsActual: -0.2 },
            { date: iso(day(1)), epsEstimate: null, epsActual: -0.1 },
        ];
        expect(snapEarningsReports(data, quarters)[1].change).toBe(50);
    });
});
