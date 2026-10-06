import { describe, it, expect } from 'vitest';
import { buildLegendResults } from '../crosshairLegend';

describe('buildLegendResults', () => {
    const genericSeries = {
        'rsi-0': [{ title: 'RSI', color: '#7e57c2', series: 's1' }],
        'macd-0': [
            { title: 'MACD', color: '#2962ff', series: 's2' },
            { title: 'Signal', color: '#ff6d00', series: 's3' },
        ],
    };

    it('collects one entry per plot in declaration order', () => {
        const values = { s1: { value: 55 }, s2: { value: 1.5 }, s3: undefined };
        const results = buildLegendResults({ close: 100 }, genericSeries, s => values[s]);
        expect(results.price).toEqual({ close: 100 });
        expect(results.generic['rsi-0']).toEqual([{ title: 'RSI', color: '#7e57c2', value: 55, change: null }]);
        expect(results.generic['macd-0']).toEqual([
            { title: 'MACD', color: '#2962ff', value: 1.5, change: null },
            { title: 'Signal', color: '#ff6d00', value: null, change: null },
        ]);
    });

    it('tolerates a missing price bar', () => {
        const results = buildLegendResults(undefined, {}, () => undefined);
        expect(results).toEqual({ price: null, generic: {}, volumeChange: null, volumeSplit: null, volumeSplitTotal: null });
    });

    it('carries the volume change through the payload', () => {
        const change = { delta: 1500, percent: 12.5 };
        const results = buildLegendResults({ close: 100 }, {}, () => undefined, change);
        expect(results.volumeChange).toEqual(change);
    });

    it('carries the volume split and split total through the payload', () => {
        const split = { bought: 800, sold: 450, percent: 28 };
        const total = { bought: 9000, sold: 7000, percent: 12.5 };
        const results = buildLegendResults({ close: 100 }, {}, () => undefined, null, split, total);
        expect(results.volumeSplit).toEqual(split);
        expect(results.volumeSplitTotal).toEqual(total);
    });

    it('prefers plot legend values over the plotted series value', () => {
        const legendSeries = [{
            title: 'EXH1.DE', color: '#4fc3f7', series: 's1',
            legend: { byTime: new Map([[10, 56.31], [20, 60]]), base: 39.48 },
        }];
        const results = buildLegendResults({ close: 100 }, { 'benchmark-0': legendSeries }, () => ({ value: 23.21 }), null, null, null, 20);
        expect(results.generic['benchmark-0']).toEqual([
            { title: 'EXH1.DE', color: '#4fc3f7', value: 60, change: 60 / 39.48 - 1 },
        ]);
    });

    it('falls back to the series value without a hover time or legend entry', () => {
        const legendSeries = [{
            title: 'EXH1.DE', color: '#4fc3f7', series: 's1',
            legend: { byTime: new Map([[10, 56.31]]), base: 39.48 },
        }];
        const noHover = buildLegendResults({ close: 100 }, { 'benchmark-0': legendSeries }, () => ({ value: 23.21 }));
        expect(noHover.generic['benchmark-0'][0].value).toBe(23.21);
        const noLegendEntry = buildLegendResults({ close: 100 }, { 'benchmark-0': legendSeries }, () => ({ value: 23.21 }), null, null, null, 20);
        expect(noLegendEntry.generic['benchmark-0'][0].value).toBeNull();
        expect(noLegendEntry.generic['benchmark-0'][0].change).toBeNull();
    });
});
