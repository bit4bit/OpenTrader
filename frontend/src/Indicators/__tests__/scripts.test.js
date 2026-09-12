/**
 * Equivalence tests: every migrated built-in indicator, run through the
 * DSL runtime (script registry -> runScript), must produce the same
 * numbers as the original compute modules captured in golden.test.js.
 */
import { describe, it, expect } from 'vitest';
import { runScript } from '../dsl/runtime';
import { scriptCode, scriptValues } from '../scripts';
import { computeSMA } from '../sma';
import { computeRSI } from '../rsi';
import { computeMACD } from '../macd';
import { computeBollingerBands } from '../bollinger';
import { computeStochastic } from '../stoch';
import { computeSuperTrend } from '../supertrend';
import { computeATR } from '../atr';
import { computeADL } from '../adl';
import { computeW52 } from '../w52';
import { computeTSI } from '../tsi';
import { computeIchimoku } from '../ichimoku';
import { computeVolumeProfile } from '../volumeProfile';
import { computeMarketIndex } from '../marketIndex';
import { DATA } from './golden.test';

const closeTolerance = 1e-9;

function expectSameBars(actual, expected, tolerance = closeTolerance) {
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
        expect(actual[i].time).toBe(expected[i].time);
        if (expected[i].value === null) expect(actual[i].value).toBeNull();
        else expect(Math.abs(actual[i].value - expected[i].value)).toBeLessThanOrEqual(tolerance);
    }
}

function plotOf(result, title) {
    const p = result.plots.find(p => p.title.startsWith(title));
    if (!p) throw new Error(`plot ${title} not found in ${result.plots.map(p => p.title)}`);
    return p.series;
}

function run(type, config) {
    const result = runScript(scriptCode(type), DATA, scriptValues(type, config));
    expect(result.error).toBeNull();
    return result;
}

describe('script equivalence', () => {
    it('sma', () => {
        const config = { length: 20, source: 'close', color: '#123456' };
        expectSameBars(plotOf(run('sma', config), 'SMA'), computeSMA(DATA, 20, 'close'));
        const hlc3 = { length: 7, source: 'hlc3' };
        expectSameBars(plotOf(run('sma', hlc3), 'SMA'), computeSMA(DATA, 7, 'hlc3'));
        const vol = { length: 10, source: 'volume' };
        expectSameBars(plotOf(run('sma', vol), 'SMA'), computeSMA(DATA, 10, 'volume'));
    });

    it('rsi', () => {
        const config = {
            length: 14, source: 'close', smoothingLength: 10, showBB: true,
            color: '#1', smoothColor: '#2', bbColor: '#3',
        };
        const result = run('rsi', config);
        const expected = computeRSI(DATA, { length: 14, source: 'close', smoothingType: 'SMA', smoothingLength: 10 });
        expectSameBars(plotOf(result, 'RSI'), expected.rsi);
        expectSameBars(plotOf(result, 'MA'), expected.smoothed);
        expectSameBars(plotOf(result, 'BB Upper'), expected.bbUpper);
        expectSameBars(plotOf(result, 'BB Lower'), expected.bbLower);
        expect(result.plots.length).toBe(6);
    });

    it('macd', () => {
        const config = { fastLength: 12, slowLength: 26, signalLength: 9, normLookback: 100 };
        const result = run('macd', config);
        const expected = computeMACD(DATA, config);
        expectSameBars(plotOf(result, 'MACD'), expected.macd);
        expectSameBars(plotOf(result, 'Signal'), expected.signal);
        expectSameBars(plotOf(result, 'Histogram'), expected.histogram);
        expect(plotOf(result, 'Histogram')).toBe(result.plots[2].series);
        expect(result.plots[2].style).toBe('histogram');
    });

    it('bollinger', () => {
        const config = { length: 20, stdDev: 2, source: 'close' };
        const result = run('bb', config);
        const expected = computeBollingerBands(DATA, { length: 20, stdDev: 2, source: 'Close' });
        expectSameBars(plotOf(result, 'Basis'), expected.basis);
        expectSameBars(plotOf(result, 'Upper'), expected.upper);
        expectSameBars(plotOf(result, 'Lower'), expected.lower);
        expect(result.fills).toEqual([{ a: 1, b: 2, color: 'rgba(41, 98, 255, 0.1)', colorAlt: null }]);
    });

    it('stoch', () => {
        const config = { length: 14, dLength: 3, upperLine: 80, lowerLine: 20 };
        const result = run('stoch', config);
        const expected = computeStochastic(DATA, config);
        expectSameBars(plotOf(result, '%K'), expected.k, 0.01);
        expectSameBars(plotOf(result, '%D'), expected.d, 0.01);
    });

    it('supertrend', () => {
        const config = { atrLength: 10, factor: 3 };
        const result = run('supertrend', config);
        const expected = computeSuperTrend(DATA, config);
        const up = expected.filter(d => d.trend === 1);
        const down = expected.filter(d => d.trend === -1);
        expectSameBars(plotOf(result, 'Up'), up);
        expectSameBars(plotOf(result, 'Down'), down);
    });

    it('atr', () => {
        expectSameBars(plotOf(run('atr', { length: 14 }), 'ATR'), computeATR(DATA, { length: 14 }));
    });

    it('ad', () => {
        expectSameBars(plotOf(run('ad', {}), 'Accum'), computeADL(DATA));
    });

    it('w52', () => {
        const highlow = run('w52', { basis: 'highlow' });
        const expectedHL = computeW52(DATA, { basis: 'highlow' });
        expectSameBars(plotOf(highlow, '52 Week High'), expectedHL.high);
        expectSameBars(plotOf(highlow, '52 Week Low'), expectedHL.low);
        const closeBasis = run('w52', { basis: 'close' });
        const expectedC = computeW52(DATA, { basis: 'close' });
        expectSameBars(plotOf(closeBasis, '52 Week High'), expectedC.high);
        expectSameBars(plotOf(closeBasis, '52 Week Low'), expectedC.low);
    });

    it('tsi', () => {
        const config = { longLength: 25, shortLength: 13, signalLength: 13 };
        const result = run('tsi', config);
        const expected = computeTSI(DATA, config);
        expectSameBars(plotOf(result, 'TSI'), expected.tsi);
        expectSameBars(plotOf(result, 'Signal'), expected.signal);
    });

    it('ichimoku', () => {
        const config = { conversionLength: 9, baseLength: 26, spanBLength: 52, laggingLength: 26 };
        const result = run('ichimoku', config);
        const expected = computeIchimoku(DATA, config);
        expectSameBars(plotOf(result, 'Tenkan'), expected.tenkan);
        expectSameBars(plotOf(result, 'Kijun'), expected.kijun);
        expectSameBars(plotOf(result, 'Span A'), expected.spanA);
        expectSameBars(plotOf(result, 'Span B'), expected.spanB);
        expectSameBars(plotOf(result, 'Chikou'), expected.chikou);
        expect(result.fills).toEqual([{
            a: 2, b: 3,
            color: 'rgba(38, 166, 154, 0.4)',
            colorAlt: 'rgba(239, 83, 80, 0.4)',
        }]);
    });

    it('volume_profile', () => {
        const result = run('volume_profile', { priceBins: 40, color: 'rgba(38, 166, 154, 0.4)' });
        expect(result.error).toBeNull();
        expect(result.plots).toEqual([]);
        expect(result.histograms).toHaveLength(1);
        expect(result.histograms[0].color).toBe('rgba(38, 166, 154, 0.4)');
        expect(result.histograms[0].bins).toEqual(computeVolumeProfile(DATA, { priceBins: 40 }));
        const vp = run('vp', { priceBins: 40, color: 'rgba(38, 166, 154, 0.2)' });
        expect(vp.histograms[0].bins).toEqual(computeVolumeProfile(DATA, { priceBins: 40 }));
    });

    it('smi', () => {
        const half = Math.floor(DATA.length / 2);
        const barsBySymbol = {
            AAPL: DATA.slice(0, half),
            MSFT: DATA.slice(half).map((d, i) => ({ ...d, time: DATA[i].time })),
        };
        const constituents = [
            { symbol: 'AAPL', weight: 0.5, enabled: true },
            { symbol: 'MSFT', weight: 0.5, enabled: true },
        ];
        const result = runScript(
            scriptCode('smi'), DATA,
            scriptValues('smi', { baseValue: 100, color: '#4fc3f7', constituents }),
            barsBySymbol,
        );
        expect(result.error).toBeNull();
        const expected = computeMarketIndex(barsBySymbol, constituents, 100);
        expectSameBars(plotOf(result, 'SMI'), expected);
    });
});