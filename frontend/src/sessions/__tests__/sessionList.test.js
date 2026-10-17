import { describe, it, expect } from 'vitest';
import {
    sessionsInView,
    folderViewId,
    folderIdFromView,
    filterByQuery,
    sortSessions,
    countSessions,
} from '../sessionList';

const folders = [
    { id: 1, name: 'Tech' },
    { id: 2, name: 'Macro' },
];

const sessions = [
    { id: 1, name: 'AAPL daily', folder: 1, favorite: true, portfolio: false, updated_at: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'BTC swing', folder: null, favorite: false, portfolio: true, updated_at: '2026-03-01T00:00:00Z' },
    { id: 3, name: 'SPY macro', folder: 2, favorite: false, portfolio: false, updated_at: '2026-02-01T00:00:00Z' },
];

describe('sessionsInView', () => {
    it('returns all sessions for the all view', () => {
        expect(sessionsInView(sessions, 'all')).toEqual(sessions);
    });

    it('filters favorites, portfolio and uncategorized views', () => {
        expect(sessionsInView(sessions, 'favorites').map(s => s.id)).toEqual([1]);
        expect(sessionsInView(sessions, 'portfolio').map(s => s.id)).toEqual([2]);
        expect(sessionsInView(sessions, 'uncategorized').map(s => s.id)).toEqual([2]);
    });

    it('filters by folder view id', () => {
        expect(sessionsInView(sessions, folderViewId(1)).map(s => s.id)).toEqual([1]);
    });

    it('falls back to all sessions for unknown views', () => {
        expect(sessionsInView(sessions, 'nonsense')).toEqual(sessions);
    });
});

describe('folderIdFromView', () => {
    it('round-trips folderViewId', () => {
        expect(folderIdFromView(folderViewId(7))).toBe(7);
    });

    it('returns null for smart views', () => {
        expect(folderIdFromView('all')).toBeNull();
        expect(folderIdFromView('favorites')).toBeNull();
    });
});

describe('filterByQuery', () => {
    it('matches session names case-insensitively', () => {
        expect(filterByQuery(sessions, folders, 'aapl').map(s => s.id)).toEqual([1]);
    });

    it('matches sessions by folder name', () => {
        expect(filterByQuery(sessions, folders, 'tech').map(s => s.id)).toEqual([1]);
    });

    it('returns all sessions when the query is blank', () => {
        expect(filterByQuery(sessions, folders, '')).toEqual(sessions);
        expect(filterByQuery(sessions, folders, '   ')).toEqual(sessions);
    });
});

describe('sortSessions', () => {
    it('sorts by last updated descending by default', () => {
        expect(sortSessions(sessions, 'recent').map(s => s.id)).toEqual([2, 3, 1]);
    });

    it('sorts by name', () => {
        expect(sortSessions(sessions, 'name').map(s => s.id)).toEqual([1, 2, 3]);
    });

    it('does not mutate the input', () => {
        const input = [...sessions];
        sortSessions(sessions, 'name');
        expect(sessions).toEqual(input);
    });
});

describe('countSessions', () => {
    it('counts sessions per folder and smart views', () => {
        expect(countSessions(sessions, folders)).toEqual({
            byFolder: new Map([[1, 1], [2, 1]]),
            uncategorized: 1,
            favorites: 1,
            portfolio: 1,
            total: 3,
        });
    });

    it('ignores sessions pointing at missing folders', () => {
        const orphan = [{ id: 4, name: 'orphan', folder: 99, favorite: false, portfolio: false, updated_at: null }];
        const counts = countSessions(orphan, folders);
        expect(counts.uncategorized).toBe(0);
        expect(counts.total).toBe(1);
    });
});
