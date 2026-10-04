/**
 * Equivalence tests: every migrated built-in indicator, run through the
 * DSL runtime (script registry -> runScript), must produce the same
 * numbers as the original compute modules captured in golden.test.js.
 */
import { describe, it, expect } from 'vitest';
import { runScript } from '../dsl/runtime';
import { scriptCode, scriptValues } from '../scripts';
import { computeSMA } from '../sma';
import { computeEMA } from '../ema';
import { computeRSI } from '../rsi';
import { computeMACD } from '../macd';
import { computeBollingerBands } from '../bollinger';
import { computeStochastic } from '../stoch';
import { computeSuperTrend } from '../supertrend';
import { computeATR } from '../atr';
import { computeADL } from '../adl';
import { computeW52 } from '../w52';
import { computePriceLevel } from '../priceLevel';
import { computeTSI } from '../tsi';
import { computeIchimoku } from '../ichimoku';
import { computeVolumeProfile } from '../volumeProfile';
import { computeMarketIndex } from '../marketIndex';
import { computeBenchmarkLine } from '../benchmarkIndex';
import { computeBuyVolume } from '../tradingActivity';
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

    it('ema', () => {
        const config = { length: 21, source: 'close', color: '#123456' };
        expectSameBars(plotOf(run('ema', config), 'EMA'), computeEMA(DATA, 21, 'close'));
        const hlc3 = { length: 7, source: 'hlc3' };
        expectSameBars(plotOf(run('ema', hlc3), 'EMA'), computeEMA(DATA, 7, 'hlc3'));
        const vol = { length: 10, source: 'volume' };
        expectSameBars(plotOf(run('ema', vol), 'EMA'), computeEMA(DATA, 10, 'volume'));
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

    it('price_level', () => {
        const config = { length: 10, unit: 'day', source: 'high', aggregation: 'max', color: '#123456' };
        const result = run('price_level', config);
        // The plot is a flat line at the trailing level of the latest bar.
        const expected = computePriceLevel(DATA, config);
        const level = expected[expected.length - 1].value;
        const plot = plotOf(result, '10D High');
        expect(plot).toHaveLength(DATA.length);
        plot.forEach(bar => expect(bar.value).toBe(level));
        expect(result.plots[0].priceLineVisible).toBe(false);
        // Title reflects unit and source.
        const weekly = run('price_level', { length: 52, unit: 'week', source: 'close', aggregation: 'min' });
        expect(weekly.plots[0].title).toBe('52W Close');
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

    it('volume', () => {
        const result = run('volume', { upColor: '#0f0', downColor: '#f00' });
        const plot = plotOf(result, 'Volume');
        expect(result.plots[0].style).toBe('histogram');
        expect(plot).toHaveLength(DATA.length);
        plot.forEach((bar, i) => {
            expect(bar.value).toBe(DATA[i].volume ?? 0);
            const expectedColor = DATA[i].close >= DATA[i].open ? '#0f0' : '#f00';
            expect(bar.color).toBe(expectedColor);
        });
    });

    it('volume % of shares mode re-expresses bars as turnover', () => {
        const so = 1_000_000;
        const result = runScript(
            scriptCode('volume'),
            DATA,
            scriptValues('volume', { upColor: '#0f0', downColor: '#f00', pctShares: true, missingColor: '#888' }),
            {},
            { sharesOutstanding: so },
        );
        expect(result.error).toBeNull();
        const plot = plotOf(result, 'Volume % of Shares');
        expect(plot).toHaveLength(DATA.length);
        plot.forEach((bar, i) => {
            expect(bar.value).toBeCloseTo((DATA[i].volume / so) * 100, 9);
            expect(bar.color).toBe(DATA[i].close >= DATA[i].open ? '#0f0' : '#f00');
        });
    });

    it('volume % of shares mode falls back to raw volume without a share count', () => {
        const result = runScript(
            scriptCode('volume'),
            DATA,
            scriptValues('volume', { upColor: '#0f0', downColor: '#f00', pctShares: true, missingColor: '#888' }),
            {},
            {},
        );
        expect(result.error).toBeNull();
        const plot = plotOf(result, 'Volume (no shares data)');
        expect(plot).toHaveLength(DATA.length);
        plot.forEach((bar, i) => {
            expect(bar.value).toBe(DATA[i].volume ?? 0);
            expect(bar.color).toBe('#888');
        });
    });

    it('vol_sma matches the volume units in both modes', () => {
        // Raw mode: SMA over share counts, unchanged behavior.
        const raw = run('vol_sma', { length: 10, color: '#ff9800' });
        expectSameBars(plotOf(raw, 'Vol SMA'), computeSMA(DATA, 10, 'volume'));

        // % of shares mode: the pane y-scale is turnover %, so the SMA
        // must average the scaled series, not the raw counts.
        const so = 1_000_000;
        const scaledData = DATA.map(d => ({ ...d, volume: (d.volume / so) * 100 }));
        const pct = runScript(
            scriptCode('vol_sma'),
            DATA,
            scriptValues('vol_sma', { length: 10, color: '#ff9800' }),
            {},
            { volumePctShares: true, sharesOutstanding: so },
        );
        expect(pct.error).toBeNull();
        expectSameBars(plotOf(pct, 'Vol SMA'), computeSMA(scaledData, 10, 'volume'), 1e-9);
    });

    it('vol_ema matches the volume units in both modes', () => {
        const raw = run('vol_ema', { length: 8, color: '#9c27b0' });
        expectSameBars(plotOf(raw, 'Vol EMA'), computeEMA(DATA, 8, 'volume'));

        const so = 1_000_000;
        const scaledData = DATA.map(d => ({ ...d, volume: (d.volume / so) * 100 }));
        const pct = runScript(
            scriptCode('vol_ema'),
            DATA,
            scriptValues('vol_ema', { length: 8, color: '#9c27b0' }),
            {},
            { volumePctShares: true, sharesOutstanding: so },
        );
        expect(pct.error).toBeNull();
        expectSameBars(plotOf(pct, 'Vol EMA'), computeEMA(scaledData, 8, 'volume'), 1e-9);
    });

    it('trading_activity', () => {
        const result = run('trading_activity', { buyColor: '#0f0', sellColor: '#f00' });
        expect(result.plots).toHaveLength(2);
        expect(result.plots[0].style).toBe('histogram');
        expect(result.plots[1].style).toBe('histogram');
        expect(result.plots[0].color).toBe('#f00');
        expect(result.plots[1].color).toBe('#0f0');
        // Sellers base bar carries the full volume; Buyers overlay the split.
        expectSameBars(result.plots[0].series, DATA.map(d => ({ time: d.time, value: d.volume ?? 0 })));
        expectSameBars(result.plots[1].series, computeBuyVolume(DATA));
    });

    it('pe', () => {
        const eps = 2.5;
        const withEps = runScript(
            scriptCode('pe'), DATA,
            scriptValues('pe', { color: '#2962ff' }),
            {},
            { trailingEps: eps },
        );
        expect(withEps.error).toBeNull();
        expectSameBars(plotOf(withEps, 'P/E'), DATA.map(d => ({ time: d.time, value: d.close / eps })));
        expect(withEps.plots[0].overlay).toBe(false);
    });

    it('pe without EPS data plots an empty series', () => {
        const noEps = runScript(scriptCode('pe'), DATA, scriptValues('pe', { color: '#2962ff' }), {}, {});
        expect(noEps.error).toBeNull();
        const plot = plotOf(noEps, 'P/E (no EPS data)');
        expect(plot).toHaveLength(0);
    });

    it('earnings', () => {
        const dayOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);
        const quarters = [
            { date: dayOf(DATA[0].time), epsEstimate: 1.0, epsActual: 1.2, surprisePct: 20 },
            { date: dayOf(DATA[1].time), epsEstimate: 1.0, epsActual: 0.9, surprisePct: -10 },
            { date: dayOf(DATA[2].time), epsEstimate: 1.1, epsActual: null, surprisePct: null },
        ];
        const config = { beatColor: '#0f0', missColor: '#f00', estimateColor: '#888' };
        const result = runScript(
            scriptCode('earnings'), DATA,
            scriptValues('earnings', config),
            {},
            { earnings: quarters },
        );
        expect(result.error).toBeNull();
        expect(result.plots[0].style).toBe('histogram');
        // Report dates snap to the nearest chart bar: actuals at bars 0/1,
        // the upcoming report leaves the actual series empty there.
        const actual = plotOf(result, 'EPS Actual');
        expect(actual.map(b => [b.time, b.value])).toEqual([
            [DATA[0].time, 1.2],
            [DATA[1].time, 0.9],
        ]);
        expect(actual[0].color).toBe('#0f0');
        expect(actual[1].color).toBe('#f00');
        // Estimates line carries all three reports, upcoming included.
        const estimate = plotOf(result, 'EPS Estimate');
        expect(estimate.map(b => b.value)).toEqual([1.0, 1.0, 1.1]);
        // Runtime maps 'dashed' to the engine's dashed enum value.
        expect(result.plots[1].lineStyle).toBe(2);
        // First report has no previous quarter to compare against; the
        // change is percent growth against |prev|.
        const change = plotOf(result, 'EPS Change QoQ %');
        expect(change.map(b => b.time)).toEqual([DATA[1].time]);
        expect(change[0].value).toBeCloseTo(-25, 9);
        expect(change[0].color).toBe('#f00');
    });

    it('earnings without reports plots empty series', () => {
        const result = runScript(scriptCode('earnings'), DATA, scriptValues('earnings', {}), {}, {});
        expect(result.error).toBeNull();
        expect(plotOf(result, 'EPS Actual')).toHaveLength(0);
        expect(plotOf(result, 'EPS Estimate')).toHaveLength(0);
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

    it('smi aligns constituents whose bar times use another exchange convention', () => {
        // Milan dailies at 22:00 UTC vs chart bars at 00:00 UTC: same
        // trading day, different timestamps — must still align.
        const offset = 22 * 3600;
        const barsBySymbol = {
            'R2US.MI': DATA.map(d => ({ ...d, time: d.time + offset })),
        };
        const constituents = [{ symbol: 'R2US.MI', weight: 1, enabled: true }];
        const result = runScript(
            scriptCode('smi'), DATA,
            scriptValues('smi', { baseValue: 100, color: '#4fc3f7', constituents }),
            barsBySymbol,
        );
        expect(result.error).toBeNull();
        const plot = plotOf(result, 'SMI');
        expect(plot.filter(b => b.value !== null).length).toBeGreaterThan(DATA.length / 2);
    });

    it('benchmark', () => {
        const times = DATA.map(d => d.time);
        const diffs = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
        const tolerance = diffs[diffs.length >> 1] / 2;
        const barsBySymbol = {
            '^GSPC': DATA.map((d, i) => ({ time: d.time, close: 100 + i })),
            '^NDX': DATA.map((d, i) => ({ time: d.time, close: 200 - i })),
        };
        const indexes = [
            { symbol: '^GSPC', name: 'S&P 500', enabled: true },
            { symbol: '^NDX', name: 'NASDAQ 100', enabled: true },
            { symbol: '^DJI', name: 'Dow Jones', enabled: false },
        ];
        const result = runScript(
            scriptCode('benchmark'), DATA,
            scriptValues('benchmark', { baseValue: 100, indexes }),
            barsBySymbol,
        );
        expect(result.error).toBeNull();
        // Disabled index produces no plot; palette assigns colors by position.
        expect(result.plots.length).toBe(2);
        expect(result.plots[0].color).toBe('#4fc3f7');
        expect(result.plots[1].color).toBe('#f4c542');
        // toBars() drops null-valued points, so expected bars must too.
        const expectedBars = (bars) => computeBenchmarkLine(bars, times, tolerance, 100)
            .map((value, i) => ({ time: times[i], value }))
            .filter(b => b.value !== null);
        expectSameBars(plotOf(result, 'S&P 500'), expectedBars(barsBySymbol['^GSPC']));
        expectSameBars(plotOf(result, 'NASDAQ 100'), expectedBars(barsBySymbol['^NDX']));
    });
});