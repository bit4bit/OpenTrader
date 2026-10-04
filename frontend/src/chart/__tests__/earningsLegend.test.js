import { describe, it, expect } from 'vitest';
import { qoqEpsChangeAt } from '../earningsLegend';

// Midnight-aligned bar times so date-only report strings snap exactly.
const day = (offset) => 1704067200 + offset * 86400;
const data = [0, 1, 2, 3, 4].map(d => ({ time: day(d), open: 10, close: 10 }));

// Reports at bars 0/1/2/4: growth, decline, growth again.
const quarters = [
    { date: iso(day(0)), epsEstimate: 1.0, epsActual: 1.0, surprisePct: 0 },
    { date: iso(day(1)), epsEstimate: 1.0, epsActual: 1.5, surprisePct: 50 },
    { date: iso(day(2)), epsEstimate: 1.0, epsActual: 1.2, surprisePct: 20 },
    { date: iso(day(4)), epsEstimate: 1.0, epsActual: 1.44, surprisePct: 44 },
];

function iso(epochSeconds) {
    return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

describe('qoqEpsChangeAt', () => {
    it('returns the change of the report snapped to the hovered bar', () => {
        expect(qoqEpsChangeAt(data, quarters, day(1))).toMatchObject({ change: 50, date: iso(day(1)) });
        expect(qoqEpsChangeAt(data, quarters, day(2)).change).toBeCloseTo(-20, 9);
        expect(qoqEpsChangeAt(data, quarters, day(4))).toMatchObject({ change: 20, date: iso(day(4)) });
    });

    it('falls back to the latest change off report bars', () => {
        expect(qoqEpsChangeAt(data, quarters, day(3)).change).toBe(20);
        expect(qoqEpsChangeAt(data, quarters, null).change).toBe(20);
    });

    it('returns null without reports or data', () => {
        expect(qoqEpsChangeAt(data, [], day(1))).toBeNull();
        expect(qoqEpsChangeAt([], quarters, day(1))).toBeNull();
        expect(qoqEpsChangeAt(data, [], null)).toBeNull();
    });

    it('keeps the improvement sign when the base quarter is negative', () => {
        const negative = [
            { date: iso(day(0)), epsEstimate: null, epsActual: -0.2 },
            { date: iso(day(1)), epsEstimate: null, epsActual: -0.1 },
        ];
        expect(qoqEpsChangeAt(data, negative, null).change).toBe(50);
    });
});
