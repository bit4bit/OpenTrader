import { describe, it, expect } from 'vitest';
import {
    REPLAY_SPEEDS,
    replayTickMs,
    sliceReplayData,
    nextReplayTime,
    replayCursorFor,
    replayStartError,
    defaultReplayTime,
    parseReplayInput,
    replayInputValue,
} from '../replay';

const bar = (time) => ({ time, close: time });
const bars = (times) => times.map(bar);

describe('sliceReplayData', () => {
    const rows = bars([100, 200, 300, 400]);

    it('shows only the bars at or before the cursor', () => {
        expect(sliceReplayData(rows, 250).map(r => r.time)).toEqual([100, 200]);
    });

    it('includes the cursor bar itself', () => {
        expect(sliceReplayData(rows, 300).map(r => r.time)).toEqual([100, 200, 300]);
    });

    it('reveals everything past the last bar', () => {
        expect(sliceReplayData(rows, 999)).toEqual(rows);
    });

    it('hides everything when the cursor precedes the history', () => {
        expect(sliceReplayData(rows, 50)).toEqual([]);
    });

    it('passes rows through untouched without a cursor', () => {
        expect(sliceReplayData(rows, null)).toEqual(rows);
        expect(sliceReplayData([], 100)).toEqual([]);
        expect(sliceReplayData(null, 100)).toEqual([]);
    });
});

describe('nextReplayTime', () => {
    const rows = bars([100, 200, 300, 400]);

    it('is the first hidden bar after the cursor', () => {
        expect(nextReplayTime(rows, 200)).toBe(300);
        expect(nextReplayTime(rows, 250)).toBe(300);
    });

    it('is the first bar when the cursor precedes the history', () => {
        expect(nextReplayTime(rows, 50)).toBe(100);
    });

    it('is null at the end of the loaded history', () => {
        expect(nextReplayTime(rows, 400)).toBeNull();
        expect(nextReplayTime(rows, 999)).toBeNull();
        expect(nextReplayTime([], 100)).toBeNull();
        expect(nextReplayTime(rows, null)).toBeNull();
    });
});

describe('replayCursorFor', () => {
    const rows = bars([100, 200, 300]);

    it('snaps to the bar at or before the wanted time', () => {
        expect(replayCursorFor(rows, 250)).toBe(200);
        expect(replayCursorFor(rows, 300)).toBe(300);
    });

    it('keeps older times raw so missing history can load around them', () => {
        expect(replayCursorFor(rows, 50)).toBe(50);
        expect(replayCursorFor([], 50)).toBe(50);
    });
});

describe('replayStartError', () => {
    const rows = bars([100, 200, 300]);

    it('rejects a missing time', () => {
        expect(replayStartError(rows, null)).toMatch(/date/i);
        expect(replayStartError(rows, Number.NaN)).toMatch(/date/i);
    });

    it('rejects a time after the last bar', () => {
        expect(replayStartError(rows, 400)).toMatch(/no bars/i);
    });

    it('accepts anything on or before the last bar', () => {
        expect(replayStartError(rows, 300)).toBeNull();
        expect(replayStartError(rows, 50)).toBeNull();
        expect(replayStartError([], 1000)).toBeNull();
    });
});

describe('defaultReplayTime', () => {
    it('is 100 bars back from the end', () => {
        expect(defaultReplayTime(bars([1, 2, 3]))).toBe(1);
        const long = bars(Array.from({ length: 150 }, (_, i) => i + 1));
        expect(defaultReplayTime(long)).toBe(51);
    });

    it('is null without data', () => {
        expect(defaultReplayTime([])).toBeNull();
        expect(defaultReplayTime(null)).toBeNull();
    });
});

describe('replayTickMs', () => {
    it('paces the clock at one bar per tick at the given speed', () => {
        expect(replayTickMs(1)).toBe(1000);
        expect(replayTickMs(2)).toBe(500);
        expect(replayTickMs(0.5)).toBe(2000);
        expect(replayTickMs(8)).toBe(125);
    });

    it('offers a spread of speeds', () => {
        expect(REPLAY_SPEEDS).toContain(1);
        expect(REPLAY_SPEEDS[0]).toBeLessThan(1);
        expect(REPLAY_SPEEDS[REPLAY_SPEEDS.length - 1]).toBeGreaterThan(4);
    });
});

describe('datetime input helpers', () => {
    it('parses a datetime-local value as UTC', () => {
        expect(parseReplayInput('2024-01-15T00:00')).toBe(1705276800);
        expect(parseReplayInput('2024-01-15T09:30:00')).toBe(1705311000);
    });

    it('formats a bar time back as a UTC input value', () => {
        expect(replayInputValue(1705276800)).toBe('2024-01-15T00:00');
        expect(replayInputValue(1705311000)).toBe('2024-01-15T09:30');
    });

    it('round-trips through both helpers', () => {
        expect(parseReplayInput(replayInputValue(1705311000))).toBe(1705311000);
    });

    it('tolerates missing input', () => {
        expect(parseReplayInput('')).toBeNull();
        expect(replayInputValue(null)).toBe('');
    });
});
