import { describe, it, expect } from 'vitest';
import {
    tagViewId,
    tagFromView,
    symbolViewId,
    symbolFromView,
    notesInView,
    filterByQuery,
    sortNotes,
    tagsWithCounts,
    symbolsWithCounts,
    countNotes,
} from '../noteList';

const notes = [
    { id: 1, symbol: 'AAPL', pinned_at: '2026-01-02T10:00:00Z', text: 'breakout retest', tags: ['thesis'], favorite: false, created_at: '2026-01-02T10:00:00Z', updated_at: '2026-01-02T10:00:00Z' },
    { id: 2, symbol: 'MSFT', pinned_at: null, text: 'trimmed into earnings', tags: ['earnings'], favorite: true, created_at: '2026-02-01T09:00:00Z', updated_at: '2026-02-01T09:00:00Z' },
    { id: 3, symbol: 'AAPL', pinned_at: '2026-03-05T14:00:00Z', text: 'gap fill watch', tags: [], favorite: false, created_at: '2026-03-05T14:00:00Z', updated_at: '2026-03-05T14:00:00Z' },
    { id: 4, symbol: '', pinned_at: null, text: 'macro diary', tags: ['thesis'], favorite: true, created_at: '2026-02-10T08:00:00Z', updated_at: '2026-02-10T08:00:00Z' },
];

describe('view ids', () => {
    it('round-trips tag and symbol view ids', () => {
        expect(tagFromView(tagViewId('earnings'))).toBe('earnings');
        expect(tagFromView('all')).toBeNull();
        expect(symbolFromView(symbolViewId('AAPL'))).toBe('AAPL');
        expect(symbolFromView('all')).toBeNull();
    });
});

describe('notesInView', () => {
    it('filters by tag case-insensitively', () => {
        expect(notesInView(notes, tagViewId('THESIS')).map(n => n.id)).toEqual([1, 4]);
        expect(notesInView(notes, tagViewId('earnings')).map(n => n.id)).toEqual([2]);
        expect(notesInView(notes, tagViewId('nope'))).toEqual([]);
    });

    it('filters by symbol case-insensitively', () => {
        expect(notesInView(notes, symbolViewId('aapl')).map(n => n.id)).toEqual([1, 3]);
        expect(notesInView(notes, symbolViewId('msft')).map(n => n.id)).toEqual([2]);
    });

    it('splits the smart views', () => {
        expect(notesInView(notes, 'favorites').map(n => n.id)).toEqual([2, 4]);
        expect(notesInView(notes, 'dated').map(n => n.id)).toEqual([1, 3]);
        expect(notesInView(notes, 'undated').map(n => n.id)).toEqual([2, 4]);
        expect(notesInView(notes, 'journal').map(n => n.id)).toEqual([4]);
    });

    it('falls back to all', () => {
        expect(notesInView(notes, 'nope')).toHaveLength(4);
    });
});

describe('filterByQuery', () => {
    it('matches symbol, text or tag', () => {
        expect(filterByQuery(notes, 'aap').map(n => n.id)).toEqual([1, 3]);
        expect(filterByQuery(notes, 'earnings').map(n => n.id)).toEqual([2]);
        expect(filterByQuery(notes, 'thesis').map(n => n.id)).toEqual([1, 4]);
        expect(filterByQuery(notes, '  ')).toBe(notes);
    });
});

describe('sortNotes', () => {
    it('sorts by recency of pin date, falling back to updated_at', () => {
        expect(sortNotes(notes, 'recent').map(n => n.id)).toEqual([3, 4, 2, 1]);
    });

    it('sorts by symbol then date, journal last', () => {
        expect(sortNotes(notes, 'symbol').map(n => n.id)).toEqual([1, 3, 2, 4]);
    });
});

describe('tagsWithCounts', () => {
    it('counts tags in first-seen spelling', () => {
        const tagged = [
            { tags: ['Thesis'] },
            { tags: ['thesis', 'earnings'] },
            { tags: [] },
        ];
        expect(tagsWithCounts(tagged)).toEqual([
            { tag: 'earnings', count: 1 },
            { tag: 'Thesis', count: 2 },
        ]);
    });
});

describe('symbolsWithCounts', () => {
    it('counts symbols, excluding journal notes', () => {
        expect(symbolsWithCounts(notes)).toEqual([
            { symbol: 'AAPL', count: 2 },
            { symbol: 'MSFT', count: 1 },
        ]);
    });
});

describe('countNotes', () => {
    it('counts by view', () => {
        expect(countNotes(notes)).toEqual({
            favorites: 2,
            dated: 2,
            undated: 2,
            journal: 1,
            total: 4,
        });
    });
});
