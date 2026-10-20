import { describe, it, expect } from 'vitest';
import {
    sessionSymbols,
    symbolsOfSessions,
    formatChange,
    formatDayChange,
    formatVolumeChangePct,
    formatYearRange,
    quoteDisplayFields,
} from '../quoteRow';

describe('sessionSymbols', () => {
    it('collects the distinct symbols of a session in chart order', () => {
        const session = {
            layout: {
                charts: [
                    { id: 'c1', symbol: { symbol: 'AAPL', provider: 'yahoo' } },
                    { id: 'c2', symbol: { symbol: 'MSFT', provider: 'yahoo' } },
                    { id: 'c3', symbol: { symbol: 'AAPL', provider: 'yahoo' } },
                ],
            },
        };
        expect(sessionSymbols(session)).toEqual([
            { symbol: 'AAPL', provider: 'yahoo' },
            { symbol: 'MSFT', provider: 'yahoo' },
        ]);
    });

    it('handles chart symbols stored as plain strings (older layouts)', () => {
        const session = { layout: { charts: [{ id: 'c1', symbol: 'AAPL' }] } };
        expect(sessionSymbols(session)).toEqual([{ symbol: 'AAPL', provider: null }]);
    });

    it('skips charts without a symbol', () => {
        const session = {
            layout: {
                charts: [
                    { id: 'c1' },
                    { id: 'c2', symbol: { symbol: '', provider: null } },
                    { id: 'c3', symbol: { symbol: 'AAPL', provider: 'yahoo' } },
                ],
            },
        };
        expect(sessionSymbols(session)).toEqual([{ symbol: 'AAPL', provider: 'yahoo' }]);
    });

    it('returns an empty list for a session without charts', () => {
        expect(sessionSymbols({})).toEqual([]);
        expect(sessionSymbols({ layout: { charts: [] } })).toEqual([]);
    });
});

describe('symbolsOfSessions', () => {
    it('unions the symbols of several sessions, preserving first-seen order', () => {
        expect(symbolsOfSessions([
            { layout: { charts: [{ symbol: { symbol: 'AAPL', provider: 'yahoo' } }] } },
            { layout: { charts: [{ symbol: { symbol: 'MSFT', provider: 'yahoo' } }] } },
            { layout: { charts: [{ symbol: { symbol: 'AAPL', provider: 'yahoo' } }] } },
        ])).toEqual([
            { symbol: 'AAPL', provider: 'yahoo' },
            { symbol: 'MSFT', provider: 'yahoo' },
        ]);
        expect(symbolsOfSessions([])).toEqual([]);
    });
});

describe('formatChange', () => {
    it('renders a signed change with its percentage', () => {
        expect(formatChange(6.05, 1.9)).toEqual({ tone: 'up', text: '+6.05 (+1.90%)' });
        expect(formatChange(-3.54, -1.032)).toEqual({ tone: 'down', text: '-3.54 (-1.03%)' });
        expect(formatChange(-0.73, -0.137)).toEqual({ tone: 'down', text: '-0.73 (-0.14%)' });
        expect(formatChange(0, 0)).toEqual({ tone: 'flat', text: '0.00 (0.00%)' });
    });

    it('renders an em dash when the change is missing', () => {
        expect(formatChange(null, 1.9)).toEqual({ tone: 'none', text: '—' });
        expect(formatChange(6.05, null)).toEqual({ tone: 'none', text: '—' });
        expect(formatChange(6.05, Infinity)).toEqual({ tone: 'none', text: '—' });
    });
});

describe('formatDayChange', () => {
    it('renders a green plus-signed change above the previous close', () => {
        expect(formatDayChange(151.25, 150)).toEqual({
            tone: 'up', text: '+1.25 (+0.83%)',
        });
    });

    it('renders a red minus-signed change below the previous close', () => {
        expect(formatDayChange(148.8, 150)).toEqual({
            tone: 'down', text: '-1.20 (-0.80%)',
        });
    });

    it('renders a muted zero change at the previous close', () => {
        expect(formatDayChange(150, 150)).toEqual({ tone: 'flat', text: '0.00 (0.00%)' });
    });

    it('renders an em dash when data is missing', () => {
        expect(formatDayChange(null, 150)).toEqual({ tone: 'none', text: '—' });
        expect(formatDayChange(151.25, null)).toEqual({ tone: 'none', text: '—' });
        expect(formatDayChange(151.25, 0)).toEqual({ tone: 'none', text: '—' });
    });
});

describe('formatVolumeChangePct', () => {
    it('renders the signed change vs the average volume', () => {
        expect(formatVolumeChangePct(-20.0)).toEqual({ tone: 'down', text: '-20.0%' });
        expect(formatVolumeChangePct(10.0)).toEqual({ tone: 'up', text: '+10.0%' });
    });

    it('renders a muted zero change', () => {
        expect(formatVolumeChangePct(0)).toEqual({ tone: 'flat', text: '0.0%' });
    });

    it('renders an em dash when the change is missing', () => {
        expect(formatVolumeChangePct(null)).toEqual({ tone: 'none', text: '—' });
    });
});

describe('formatYearRange', () => {
    it('renders the 52-week low — high pair', () => {
        expect(formatYearRange(182.0, 120.0)).toEqual({ tone: 'neutral', text: '120.00 — 182.00' });
    });

    it('renders an em dash when either bound is missing', () => {
        expect(formatYearRange(null, 120.0)).toEqual({ tone: 'none', text: '—' });
        expect(formatYearRange(182.0, null)).toEqual({ tone: 'none', text: '—' });
    });
});

describe('quoteDisplayFields', () => {
    it('assembles the strip fields from a backend quote', () => {
        expect(quoteDisplayFields({
            price: 151.25,
            previous_close: 150.0,
            week_change: 4.25,
            week_change_pct: 2.882,
            month_change: -11.75,
            month_change_pct: -2.5,
            quarter_change: 51.25,
            quarter_change_pct: 25.0,
            volume_change_pct: -20.0,
            year_high: 182.0,
            year_low: 120.0,
        })).toEqual({
            price: '151.25',
            dayChange: { tone: 'up', text: '+1.25 (+0.83%)' },
            weekChange: { tone: 'up', text: '+4.25 (+2.88%)' },
            monthChange: { tone: 'down', text: '-11.75 (-2.50%)' },
            quarterChange: { tone: 'up', text: '+51.25 (+25.00%)' },
            volumeChange: { tone: 'down', text: '-20.0%' },
            yearRange: { tone: 'neutral', text: '120.00 — 182.00' },
        });
    });

    it('degrades missing or failed quotes to em dashes', () => {
        expect(quoteDisplayFields(null)).toEqual({
            price: '—',
            dayChange: { tone: 'none', text: '—' },
            weekChange: { tone: 'none', text: '—' },
            monthChange: { tone: 'none', text: '—' },
            quarterChange: { tone: 'none', text: '—' },
            volumeChange: { tone: 'none', text: '—' },
            yearRange: { tone: 'none', text: '—' },
        });
    });
});
