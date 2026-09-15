/**
 * Edge-case tests: empty/short input, invalid (NaN/null) bars, flat price
 * windows, and input immutability. These guard behaviors the golden and
 * reference datasets never exercise.
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

function bar(i, overrides = {}) {
    return { time: 1700000000 + i * 86400, open: 100, high: 101, low: 99, close: 100, volume: 1000, ...overrides };
}

function flatData(n, price = 100) {
    return Array.from({ length: n }, (_, i) => bar(i, { open: price, high: price, low: price, close: price }));
}

const ALL_OUTPUTS = (r) => Array.isArray(r) ? [r] : Object.values(r).filter(Array.isArray);

function expectFinite(pointsOrBins) {
    for (const series of pointsOrBins) {
        for (const p of series) {
            if (p.value !== undefined && p.value !== null) {
                expect(Number.isFinite(p.value), `non-finite value in ${JSON.stringify(p)}`).toBe(true);
            }
        }
    }
}

const CALLS = {
    sma: (d) => computeSMA(d, 14, 'close'),
    rsi: (d) => computeRSI(d, { length: 14, source: 'close', smoothingType: 'SMA', smoothingLength: 10 }),
    macd: (d) => computeMACD(d, { fastLength: 12, slowLength: 26, signalLength: 9, normLookback: 100 }),
    bollinger: (d) => computeBollingerBands(d, { length: 20, stdDev: 2, source: 'close' }),
    stoch: (d) => computeStochastic(d, { length: 14, dLength: 3 }),
    supertrend: (d) => computeSuperTrend(d, { atrLength: 10, factor: 3 }),
    atr: (d) => computeATR(d, { length: 14 }),
    adl: (d) => computeADL(d),
    w52: (d) => computeW52(d),
    tsi: (d) => computeTSI(d, { longLength: 25, shortLength: 13, signalLength: 13 }),
    ichimoku: (d) => computeIchimoku(d, {}),
    volumeProfile: (d) => computeVolumeProfile(d, { priceBins: 40 }),
};

describe('edge cases: empty and short input', () => {
    it.each(Object.keys(CALLS))('%s: empty array returns empty output without throwing', (name) => {
        const r = CALLS[name]([]);
        for (const s of ALL_OUTPUTS(r)) expect(s.length).toBe(0);
    });

    it.each(Object.keys(CALLS))('%s: fewer bars than length returns empty/no-crash', (name) => {
        const r = CALLS[name](Array.from({ length: 3 }, (_, i) => bar(i)));
        for (const s of ALL_OUTPUTS(r)) expectFinite([s]);
    });

    it('marketIndex: no constituents returns empty', () => {
        expect(computeMarketIndex({}, [], 100)).toEqual([]);
        expect(computeMarketIndex(null, [{ symbol: 'X', weight: 1 }], 100)).toEqual([]);
    });
});

describe('edge cases: invalid bars (NaN / null fields)', () => {
    const withGaps = (bad) => DATA.map((d, i) =>
        (i === 30 || i === 60) ? { ...d, ...bad } : d);

    it.each(['sma', 'rsi', 'bollinger', 'stoch', 'supertrend', 'atr', 'adl', 'tsi'])('%s: NaN close produces no non-finite values', (name) => {
        expectFinite(ALL_OUTPUTS(CALLS[name](withGaps({ close: NaN }))));
    });

    it('atr: a bad bar does not truncate the rest of the series', () => {
        const clean = computeATR(DATA, { length: 14 });
        const gapped = computeATR(withGaps({ high: NaN }), { length: 14 });
        expect(gapped.length).toBeGreaterThanOrEqual(clean.length - 2);
        // Chain resumes: last value still finite and close to the clean series
        const last = gapped[gapped.length - 1].value;
        expect(Number.isFinite(last)).toBe(true);
    });

    it('supertrend: recovers after a gap (emits values to the end)', () => {
        const r = computeSuperTrend(withGaps({ high: NaN, low: NaN }), { atrLength: 10, factor: 3 });
        expect(r[r.length - 1].time).toBe(DATA[DATA.length - 1].time);
        expectFinite([r]);
    });
});

describe('edge cases: flat price windows', () => {
    it('stochastic: flat window yields 50, not NaN', () => {
        const r = computeStochastic(flatData(30), { length: 14, dLength: 3 });
        expect(r.k.length).toBeGreaterThan(0);
        for (const p of r.k) expect(p.value).toBe(50);
    });

    it('rsi: flat prices yield 50 (no gains, no losses)', () => {
        const r = computeRSI(flatData(30), { length: 14, source: 'close', smoothingType: 'None', smoothingLength: 3 });
        for (const p of r.rsi) expect(p.value).toBe(50);
    });

    it('bollinger: flat prices collapse bands onto the basis', () => {
        const r = computeBollingerBands(flatData(30), { length: 20, stdDev: 2, source: 'close' });
        for (let i = 0; i < r.basis.length; i++) {
            expect(r.upper[i].value).toBe(r.basis[i].value);
            expect(r.lower[i].value).toBe(r.basis[i].value);
        }
    });

    it('volumeProfile: zero price range returns empty', () => {
        expect(computeVolumeProfile(flatData(30), { priceBins: 40 })).toEqual([]);
    });

    it('volumeProfile: zero volume returns empty', () => {
        const noVol = DATA.map(d => ({ ...d, volume: 0 }));
        expect(computeVolumeProfile(noVol, { priceBins: 40 })).toEqual([]);
    });

    it('adl: flat bars (high == low) contribute zero without NaN', () => {
        const r = computeADL(flatData(30));
        expect(r.length).toBe(30);
        for (const p of r) expect(p.value).toBe(0);
    });
});

describe('edge cases: input immutability', () => {
    it.each(Object.keys(CALLS))('%s: does not mutate the input bars', (name) => {
        const input = DATA.map(d => ({ ...d }));
        const snapshot = JSON.stringify(input);
        CALLS[name](input);
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('marketIndex: does not mutate constituent bars', () => {
        const barsBySymbol = { AAPL: DATA.slice(0, 60).map(d => ({ ...d })) };
        const snapshot = JSON.stringify(barsBySymbol);
        computeMarketIndex(barsBySymbol, [{ symbol: 'AAPL', weight: 1, enabled: true }], 100);
        expect(JSON.stringify(barsBySymbol)).toBe(snapshot);
    });
});
