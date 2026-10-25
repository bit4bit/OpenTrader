import { describe, it, expect } from 'vitest';
import {
    viewportKey,
    indexOfTime,
    captureViewport,
    restoreViewport,
    sameViewport,
} from '../viewport';

const row = (time) => ({ time });

describe('viewportKey', () => {
    it('identifies symbol, provider and interval', () => {
        expect(viewportKey('AAPL', null, '1d')).toBe('AAPL--1d');
        expect(viewportKey('BTC', 'kraken', '1h')).toBe('BTC-kraken-1h');
    });
});

describe('indexOfTime', () => {
    const rows = [100, 200, 300, 400].map(row);

    it('finds the index of the exact bar', () => {
        expect(indexOfTime(rows, 200)).toBe(1);
    });

    it('returns the last bar at or before the time', () => {
        expect(indexOfTime(rows, 250)).toBe(1);
    });

    it('returns -1 when every bar is later', () => {
        expect(indexOfTime(rows, 50)).toBe(-1);
        expect(indexOfTime(rows, null)).toBe(-1);
        expect(indexOfTime([], 100)).toBe(-1);
    });
});

describe('captureViewport', () => {
    const rows = [100, 200, 300, 400, 500].map(row);

    it('captures the anchor bar, offset and bar count', () => {
        expect(captureViewport({ from: 1.5, to: 4.5 }, rows)).toEqual({
            fromTime: 200,
            fromOffset: 0.5,
            bars: 3,
        });
    });

    it('anchors a left-edge whitespace window on the first bar', () => {
        expect(captureViewport({ from: -2, to: 1 }, rows)).toEqual({
            fromTime: 100,
            fromOffset: -2,
            bars: 3,
        });
    });

    it('anchors a right-edge window on the last bar', () => {
        expect(captureViewport({ from: 5, to: 8 }, rows)).toEqual({
            fromTime: 500,
            fromOffset: 1,
            bars: 3,
        });
    });

    it('returns null without a range or rows', () => {
        expect(captureViewport(null, rows)).toBe(null);
        expect(captureViewport({ from: 0, to: 1 }, [])).toBe(null);
    });
});

describe('restoreViewport', () => {
    const bars = [100, 200, 300, 400, 500, 600].map(row);
    const viewport = { fromTime: 300, fromOffset: 0.25, bars: 4 };

    it('rebuilds the same logical range', () => {
        expect(restoreViewport(viewport, bars)).toEqual({ from: 2.25, to: 6.25 });
    });

    it('survives prepended history', () => {
        const older = [50, 75].map(row).concat(bars);
        expect(restoreViewport(viewport, older)).toEqual({ from: 4.25, to: 8.25 });
    });

    it('returns null when the anchor is not loaded yet', () => {
        const later = [400, 500].map(row);
        expect(restoreViewport(viewport, later)).toBe(null);
    });

    it('returns null without a viewport or rows', () => {
        expect(restoreViewport(null, bars)).toBe(null);
        expect(restoreViewport(viewport, [])).toBe(null);
    });
});

describe('sameViewport', () => {
    it('compares the window fields', () => {
        const a = { fromTime: 300, fromOffset: 0.25, bars: 4 };
        expect(sameViewport(a, { fromTime: 300, fromOffset: 0.25, bars: 4 })).toBe(true);
        expect(sameViewport(a, { fromTime: 300, fromOffset: 0.5, bars: 4 })).toBe(false);
        expect(sameViewport(a, { fromTime: 300, fromOffset: 0.25, bars: 5 })).toBe(false);
        expect(sameViewport(null, a)).toBe(false);
        expect(sameViewport(a, a)).toBe(true);
    });
});
