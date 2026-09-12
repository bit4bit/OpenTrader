import { describe, it, expect } from 'vitest';
import {
    computeActivePaneTypes,
    paneIndexOf,
    paneStretchFactors,
    computeRenderableIds,
    isScriptIndicator,
    scriptPaneKey,
    sliceToWindow,
} from '../paneLayout';

const ind = (type, extra = {}) => ({ id: extra.id ?? `${type}-0`, type, visible: true, ...extra });

describe('computeActivePaneTypes', () => {
    it('keeps canonical pane order regardless of indicator order', () => {
        const types = computeActivePaneTypes([ind('macd'), ind('rsi')], []);
        expect(types).toEqual(['rsi', 'macd']);
    });

    it('ignores hidden indicators and appends custom pane ids', () => {
        const types = computeActivePaneTypes([ind('rsi', { visible: false }), ind('macd')], ['custom-1']);
        expect(types).toEqual(['macd', 'custom-1']);
    });
});

describe('pane layout math', () => {
    it('indexes panes after the price pane', () => {
        expect(paneIndexOf(['rsi', 'macd'], 'macd')).toBe(2);
        expect(paneIndexOf(['rsi', 'macd'], 'unknown')).toBe(0);
    });

    it('gives the price pane 3x stretch', () => {
        expect(paneStretchFactors(1)).toEqual([3]);
        expect(paneStretchFactors(3)).toEqual([3, 1, 1]);
    });
});

describe('computeRenderableIds', () => {
    it('keeps only visible indicators with error-free results', () => {
        const indicators = [
            ind('sma'),
            ind('rsi', { visible: false }),
            ind('macd'),
            ind('atr'),
        ];
        const resultsById = {
            'sma-0': { plots: [] },
            'macd-0': { error: 'boom' },
            'atr-0': { plots: [] },
        };
        expect([...computeRenderableIds(indicators, resultsById)]).toEqual(['sma-0', 'atr-0']);
    });
});

describe('script indicators', () => {
    it('classifies custom scripts as script indicators', () => {
        expect(isScriptIndicator(ind('custom'))).toBe(true);
        expect(isScriptIndicator(ind('rsi'))).toBe(true);
        expect(isScriptIndicator(ind('unknownType'))).toBe(false);
    });

    it('keys custom panes by indicator id', () => {
        expect(scriptPaneKey(ind('custom', { id: 'custom-7' }))).toBe('custom-custom-7');
        expect(scriptPaneKey(ind('rsi'))).toBe('rsi');
    });
});

describe('sliceToWindow', () => {
    const series = [
        { time: 1, value: 10 },
        { time: 2, value: 20 },
        { time: 3, value: 30 },
    ];

    it('slices cumulative indicators to the loaded window', () => {
        expect(sliceToWindow(series, 'ad', 2)).toEqual([
            { time: 2, value: 20 },
            { time: 3, value: 30 },
        ]);
    });

    it('returns full series for non-cumulative types or without a window', () => {
        expect(sliceToWindow(series, 'rsi', 2)).toBe(series);
        expect(sliceToWindow(series, 'ad', null)).toBe(series);
    });
});
