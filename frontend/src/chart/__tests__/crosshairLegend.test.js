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
        expect(results.generic['rsi-0']).toEqual([{ title: 'RSI', color: '#7e57c2', value: 55 }]);
        expect(results.generic['macd-0']).toEqual([
            { title: 'MACD', color: '#2962ff', value: 1.5 },
            { title: 'Signal', color: '#ff6d00', value: null },
        ]);
    });

    it('tolerates a missing price bar', () => {
        const results = buildLegendResults(undefined, {}, () => undefined);
        expect(results).toEqual({ price: null, generic: {} });
    });
});
