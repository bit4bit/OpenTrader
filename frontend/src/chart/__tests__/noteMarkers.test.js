import { describe, it, expect } from 'vitest';
import {
    noteTime,
    notesForSymbol,
    noteScreenPos,
    buildNoteShapes,
    NOTE_COLOR,
} from '../noteMarkers';

const ENTRY_BAR_TIME = 1767312000; // 2026-01-02T00:00:00Z
const CANDLES = [
    { time: ENTRY_BAR_TIME - 86400, open: 90, high: 108, low: 84, close: 100 },
    { time: ENTRY_BAR_TIME, open: 100, high: 110, low: 85, close: 105 },
    { time: ENTRY_BAR_TIME + 86400, open: 105, high: 112, low: 95, close: 108 },
];

const ctx = (overrides = {}) => ({
    timeToX: t => 100 + ((t / 86400) % 600),
    priceToY: p => 500 - p,
    width: 800,
    interval: '1d',
    candles: CANDLES,
    ...overrides,
});

describe('noteTime', () => {
    it('converts an ISO datetime to epoch seconds', () => {
        expect(noteTime('2026-01-02T00:00:00Z', '1d')).toBe(ENTRY_BAR_TIME);
    });

    it('snaps intraday times to UTC midnight for daily intervals', () => {
        expect(noteTime('2026-01-02T14:30:00Z', '1d')).toBe(ENTRY_BAR_TIME);
        expect(noteTime('2026-01-02T14:30:00Z', '1wk')).toBe(ENTRY_BAR_TIME);
    });

    it('keeps the time for intraday intervals', () => {
        expect(noteTime('2026-01-02T14:30:00Z', '15m'))
            .toBe(ENTRY_BAR_TIME + 14 * 3600 + 30 * 60);
    });

    it('returns null without a date or for invalid input', () => {
        expect(noteTime(null, '1d')).toBeNull();
        expect(noteTime('not-a-date', '1d')).toBeNull();
    });
});

describe('notesForSymbol', () => {
    const notes = [
        { id: 1, symbol: 'AAPL', pinned_at: '2026-01-02T00:00:00Z' },
        { id: 2, symbol: 'msft', pinned_at: '2026-01-02T00:00:00Z' },
        { id: 3, symbol: 'AAPL', pinned_at: null },
        { id: 4, symbol: 'msft', pinned_at: '2026-01-02T00:00:00Z' },
    ];

    it('keeps only pinned notes of the symbol, case-insensitively', () => {
        expect(notesForSymbol(notes, 'aapl').map(n => n.id)).toEqual([1]);
        expect(notesForSymbol(notes, 'MSFT').map(n => n.id)).toEqual([2, 4]);
    });

    it('matches nothing without a symbol', () => {
        expect(notesForSymbol(notes, '')).toEqual([]);
        expect(notesForSymbol(notes, null)).toEqual([]);
    });
});

describe('noteScreenPos', () => {
    it('pins above the pinned bar\'s high', () => {
        const pos = noteScreenPos(
            { pinned_at: '2026-01-02T14:30:00Z' },
            ctx()
        );
        const x = 100 + ((ENTRY_BAR_TIME / 86400) % 600);
        expect(pos).toEqual({ x, y: 500 - 110 - 3 - 5 });
    });

    it('snaps a weekend pin (daily interval) to the previous trading bar', () => {
        const pos = noteScreenPos(
            { pinned_at: '2026-01-03T00:00:00Z' }, // Saturday: snaps to 01-02
            ctx({ candles: CANDLES.slice(0, 2) })
        );
        const x = 100 + ((ENTRY_BAR_TIME / 86400) % 600);
        expect(pos).toEqual({ x, y: 500 - 110 - 3 - 5 });
    });

    it('returns null when no bar is within snapping distance of the pin', () => {
        const pos = noteScreenPos(
            { pinned_at: '2000-01-01T00:00:00Z' },
            ctx()
        );
        expect(pos).toBeNull();
    });

    it('returns null when the pinned bar is off-screen', () => {
        const pos = noteScreenPos(
            { pinned_at: '2026-01-02T00:00:00Z' },
            ctx({ width: 105 })
        );
        expect(pos).toBeNull();
    });
});

describe('buildNoteShapes', () => {
    it('draws a circle with the N marker above the pinned bar', () => {
        const shapes = buildNoteShapes(
            [{ id: 1, pinned_at: '2026-01-02T14:30:00Z' }],
            ctx()
        );
        const x = 100 + ((ENTRY_BAR_TIME / 86400) % 600);
        expect(shapes).toHaveLength(2);
        expect(shapes[0]).toEqual({
            kind: 'circle', cx: x, cy: 382, r: 5,
            style: { fill: NOTE_COLOR, stroke: '#131722', strokeWidth: 1 },
        });
        expect(shapes[1]).toMatchObject({ kind: 'text', text: 'N' });
    });

    it('skips notes without an on-screen pin', () => {
        const shapes = buildNoteShapes(
            [{ id: 1, pinned_at: '2000-01-01T00:00:00Z' }],
            ctx()
        );
        expect(shapes).toEqual([]);
    });});
