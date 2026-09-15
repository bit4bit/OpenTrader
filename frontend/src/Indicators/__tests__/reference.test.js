/**
 * Reference-vector tests: every indicator is compared against values produced
 * by an INDEPENDENT implementation of the canonical formulas (Python
 * generator, see referenceVectors.json header note in git history). Unlike
 * the golden snapshots — which pin current behavior — these pin CORRECT
 * behavior, so a formula regression fails here even if snapshots are updated.
 *
 * To regenerate after an intentional formula change:
 *   cd frontend && python3 scripts/generate_indicator_reference.py
 */
import { describe, it, expect } from 'vitest';
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
import ref from './referenceVectors.json';

const REL_TOL = 1e-9;

function expectSeries(actual, expected, { absTol = null } = {}) {
    expect(actual.length, 'series length').toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
        expect(actual[i].time, `time at ${i}`).toBe(expected[i].time);
        const a = actual[i].value;
        const e = expected[i].value;
        const tol = absTol ?? Math.max(1, Math.abs(e)) * REL_TOL;
        expect(Math.abs(a - e), `value at ${i} (t=${expected[i].time}): ${a} vs ${e}`).toBeLessThanOrEqual(tol);
    }
}

describe('reference vectors (independent implementation)', () => {
    it('sma', () => {
        expectSeries(computeSMA(DATA, 20, 'close'), ref.sma20close);
        expectSeries(computeSMA(DATA, 7, 'hlc3'), ref.sma7hlc3);
        expectSeries(computeSMA(DATA, 10, 'volume'), ref.sma10volume);
    });

    it('rsi (Wilder) + SMA smoothing + BB on smoothed', () => {
        const r = computeRSI(DATA, { length: 14, source: 'close', smoothingType: 'SMA', smoothingLength: 10 });
        expectSeries(r.rsi, ref.rsi14);
        expectSeries(r.smoothed, ref.rsiSmoothed10);
        expectSeries(r.bbUpper, ref.rsiBBupper);
        expectSeries(r.bbLower, ref.rsiBBlower);
    });

    it('macd (normalized)', () => {
        const r = computeMACD(DATA, { fastLength: 12, slowLength: 26, signalLength: 9, normLookback: 100 });
        expectSeries(r.macd, ref.macdNorm);
        expectSeries(r.signal, ref.macdSignalNorm);
        expectSeries(r.histogram, ref.macdHistNorm);
    });

    it('bollinger', () => {
        const r = computeBollingerBands(DATA, { length: 20, stdDev: 2, source: 'Close' });
        expectSeries(r.basis, ref.bbBasis);
        expectSeries(r.upper, ref.bbUpper);
        expectSeries(r.lower, ref.bbLower);
    });

    it('stochastic (rounded to 2 decimals by the module)', () => {
        const r = computeStochastic(DATA, { length: 14, dLength: 3 });
        expectSeries(r.k, ref.stochK, { absTol: 0.006 });
        expectSeries(r.d, ref.stochD, { absTol: 0.006 });
    });

    it('supertrend (Wilder ATR)', () => {
        const r = computeSuperTrend(DATA, { atrLength: 10, factor: 3 });
        expect(r.length).toBe(ref.supertrend.length);
        for (let i = 0; i < ref.supertrend.length; i++) {
            expect(r[i].time).toBe(ref.supertrend[i].time);
            expect(r[i].trend, `trend at ${i}`).toBe(ref.supertrend[i].trend);
            expect(Math.abs(r[i].value - ref.supertrend[i].value)).toBeLessThanOrEqual(Math.abs(ref.supertrend[i].value) * REL_TOL);
        }
    });

    it('atr (Wilder)', () => {
        expectSeries(computeATR(DATA, { length: 14 }), ref.atr14);
    });

    it('adl', () => {
        expectSeries(computeADL(DATA), ref.adl);
    });

    it('w52', () => {
        const hl = computeW52(DATA, { basis: 'highlow' });
        expectSeries(hl.high, ref.w52High_highlow);
        expectSeries(hl.low, ref.w52Low_highlow);
        const c = computeW52(DATA, { basis: 'close' });
        expectSeries(c.high, ref.w52High_close);
        expectSeries(c.low, ref.w52Low_close);
    });

    it('tsi', () => {
        const r = computeTSI(DATA, { longLength: 25, shortLength: 13, signalLength: 13 });
        expectSeries(r.tsi, ref.tsi);
        expectSeries(r.signal, ref.tsiSignal);
    });

    it('ichimoku', () => {
        const r = computeIchimoku(DATA, { conversionLength: 9, baseLength: 26, spanBLength: 52, laggingLength: 26 });
        expectSeries(r.tenkan, ref.ichimokuTenkan);
        expectSeries(r.kijun, ref.ichimokuKijun);
        expectSeries(r.spanA, ref.ichimokuSpanA);
        expectSeries(r.spanB, ref.ichimokuSpanB);
        expectSeries(r.chikou, ref.ichimokuChikou);
    });

    it('volume_profile', () => {
        const r = computeVolumeProfile(DATA, { priceBins: 40 });
        expect(r.length).toBe(ref.volumeProfile.length);
        for (let i = 0; i < ref.volumeProfile.length; i++) {
            expect(r[i].volume, `bin ${i} volume`).toBe(ref.volumeProfile[i].volume);
            expect(Math.abs(r[i].low - ref.volumeProfile[i].low)).toBeLessThanOrEqual(Math.abs(ref.volumeProfile[i].low) * REL_TOL);
            expect(Math.abs(r[i].high - ref.volumeProfile[i].high)).toBeLessThanOrEqual(Math.abs(ref.volumeProfile[i].high) * REL_TOL);
            expect(Math.abs(r[i].normalizedVolume - ref.volumeProfile[i].normalizedVolume)).toBeLessThanOrEqual(REL_TOL);
        }
    });

    it('smi', () => {
        const half = Math.floor(DATA.length / 2);
        const barsBySymbol = {
            AAPL: DATA.slice(0, half),
            MSFT: DATA.slice(half).map((d, i) => ({ ...d, time: DATA[i].time })),
        };
        const r = computeMarketIndex(barsBySymbol, [
            { symbol: 'AAPL', weight: 0.5, enabled: true },
            { symbol: 'MSFT', weight: 0.5, enabled: true },
        ], 100);
        expectSeries(r, ref.smi);
    });
});
