import { describe, it, expect } from 'vitest';
import { computeBenchmarkLine } from '../benchmarkIndex';

const DAY = 86400;
const times = [0, DAY, 2 * DAY, 3 * DAY, 4 * DAY].map(t => t + 1700000000);

describe('computeBenchmarkLine', () => {
    it('rebases to baseValue at the first aligned bar', () => {
        const indexBars = [
            { time: times[0], close: 50 },
            { time: times[1], close: 100 },
            { time: times[2], close: 25 },
        ];
        expect(computeBenchmarkLine(indexBars, times)).toEqual([100, 200, 50, 50, 50]);
    });

    it('carries the latest close as-of for bars between index bars', () => {
        const indexBars = [
            { time: times[0], close: 10 },
            { time: times[3], close: 20 },
        ];
        // Bars 1-2 predate the second index close: they carry the first.
        expect(computeBenchmarkLine(indexBars, times)).toEqual([100, 100, 100, 200, 200]);
    });

    it('leads with nulls until the first index bar', () => {
        const indexBars = [{ time: times[2], close: 10 }, { time: times[3], close: 20 }];
        expect(computeBenchmarkLine(indexBars, times)).toEqual([null, null, 100, 200, 200]);
    });

    it('accepts index bars slightly late within tolerance', () => {
        // Daily index stamped 4h after the chart's UTC-midnight bar.
        const indexBars = [
            { time: times[0] + 4 * 3600, close: 10 },
            { time: times[1] + 4 * 3600, close: 20 },
        ];
        expect(computeBenchmarkLine(indexBars, times, 12 * 3600)).toEqual([100, 200, 200, 200, 200]);
        // Without tolerance the first bar has no value yet.
        expect(computeBenchmarkLine(indexBars, times, 0)).toEqual([null, 100, 200, 200, 200]);
    });

    it('skips invalid closes when anchoring', () => {
        const indexBars = [
            { time: times[0], close: null },
            { time: times[1], close: 10 },
            { time: times[2], close: 30 },
        ];
        expect(computeBenchmarkLine(indexBars, times)).toEqual([null, 100, 300, 300, 300]);
    });

    it('handles empty inputs', () => {
        expect(computeBenchmarkLine([], times)).toEqual([null, null, null, null, null]);
        expect(computeBenchmarkLine(null, [])).toEqual([]);
    });

    it('does not mutate its inputs', () => {
        const indexBars = [{ time: times[0], close: 10 }, { time: times[1], close: 20 }];
        const snapshot = JSON.stringify({ indexBars, times });
        computeBenchmarkLine(indexBars, times, DAY / 2, 1000);
        expect(JSON.stringify({ indexBars, times })).toBe(snapshot);
    });
});
