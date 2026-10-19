import { describe, it, expect } from 'vitest';
import {
    symbolViewId,
    symbolFromView,
    positionsInView,
    filterByQuery,
    sortPositions,
    symbolsWithCounts,
    countPositions,
} from '../positionList';

const buys = (side, symbol = 'AAPL', opened_at = null) => ({ id: Math.random(), symbol, side, opened_at });
const positions = [
    { id: 1, symbol: 'AAPL', side: 'buy', opened_at: '2026-01-02T10:00:00Z', note: 'breakout retest', created_at: '2026-01-02T10:00:00Z' },
    { id: 2, symbol: 'msft', side: 'sell', opened_at: null, note: 'trimmed into earnings', created_at: '2026-02-01T09:00:00Z' },
    { id: 3, symbol: 'AAPL', side: 'sell', opened_at: '2026-03-05T14:00:00Z', note: '', created_at: '2026-03-05T14:00:00Z' },
    { id: 4, symbol: 'TSLA', side: 'buy', opened_at: null, note: 'adding on dips', created_at: '2026-02-10T08:00:00Z' },
];

describe('symbol views', () => {
    it('round-trips a symbol view id', () => {
        expect(symbolFromView(symbolViewId('AAPL'))).toBe('AAPL');
        expect(symbolFromView('all')).toBeNull();
    });

    it('filters by symbol case-insensitively', () => {
        expect(positionsInView(positions, symbolViewId('aapl')).map(p => p.id)).toEqual([1, 3]);
        expect(positionsInView(positions, symbolViewId('msft')).map(p => p.id)).toEqual([2]);
    });
});

describe('smart views', () => {
    it('splits buys and sells', () => {
        expect(positionsInView(positions, 'buys').map(p => p.id)).toEqual([1, 4]);
        expect(positionsInView(positions, 'sells').map(p => p.id)).toEqual([2, 3]);
    });

    it('finds undated positions', () => {
        expect(positionsInView(positions, 'undated').map(p => p.id)).toEqual([2, 4]);
    });

    it('falls back to all', () => {
        expect(positionsInView(positions, 'nope')).toHaveLength(4);
    });
});

describe('filterByQuery', () => {
    it('matches symbol or note text', () => {
        expect(filterByQuery(positions, 'aap').map(p => p.id)).toEqual([1, 3]);
        expect(filterByQuery(positions, 'earnings').map(p => p.id)).toEqual([2]);
        expect(filterByQuery(positions, '  ')).toBe(positions);
    });
});

describe('sortPositions', () => {
    it('sorts by recency of open date, falling back to created_at', () => {
        expect(sortPositions(positions, 'recent').map(p => p.id)).toEqual([3, 4, 2, 1]);
    });

    it('sorts by symbol then date', () => {
        expect(sortPositions(positions, 'symbol').map(p => p.id)).toEqual([1, 3, 2, 4]);
    });
});

describe('symbolsWithCounts', () => {
    it('groups counts by symbol in symbol order', () => {
        expect(symbolsWithCounts(positions)).toEqual([
            { symbol: 'AAPL', count: 2 },
            { symbol: 'msft', count: 1 },
            { symbol: 'TSLA', count: 1 },
        ]);
    });
});

describe('countPositions', () => {
    it('counts sides and undated', () => {
        expect(countPositions(positions)).toEqual({ buys: 2, sells: 2, undated: 2, total: 4 });
    });
});
