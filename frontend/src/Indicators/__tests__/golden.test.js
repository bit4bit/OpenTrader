/**
 * Golden snapshot tests for all indicator compute functions.
 *
 * These capture the CURRENT behavior of every indicator on a deterministic
 * dataset. The DSL migration must keep producing the same numbers — the
 * equivalence tests in scripts.test.js compare script outputs against these
 * same snapshots.
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

// Deterministic pseudo-random walk (LCG), 120 bars of OHLCV.
export function makeData(length = 120) {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const data = [];
    let close = 100;
    for (let i = 0; i < length; i++) {
        const drift = (rand() - 0.48) * 4;
        const open = close;
        close = Math.max(1, close + drift);
        const high = Math.max(open, close) + rand() * 2;
        const low = Math.min(open, close) - rand() * 2;
        data.push({
            time: 1700000000 + i * 86400,
            open, high, low, close,
            volume: 1000000 + Math.floor(rand() * 500000),
        });
    }
    return data;
}

export const DATA = makeData();

describe('golden snapshots', () => {
    it('sma', () => {
        expect(computeSMA(DATA, 20, 'close')).toMatchSnapshot();
        expect(computeSMA(DATA, 7, 'hlc3')).toMatchSnapshot();
        expect(computeSMA(DATA, 10, 'volume')).toMatchSnapshot();
    });

    it('rsi', () => {
        expect(computeRSI(DATA, {
            length: 14, source: 'close', smoothingType: 'SMA', smoothingLength: 10,
        })).toMatchSnapshot();
    });

    it('macd', () => {
        expect(computeMACD(DATA, { fastLength: 12, slowLength: 26, signalLength: 9, normLookback: 100 })).toMatchSnapshot();
    });

    it('bollinger', () => {
        expect(computeBollingerBands(DATA, { length: 20, stdDev: 2, source: 'Close' })).toMatchSnapshot();
    });

    it('stoch', () => {
        expect(computeStochastic(DATA, { length: 14, dLength: 3 })).toMatchSnapshot();
    });

    it('supertrend', () => {
        expect(computeSuperTrend(DATA, { atrLength: 10, factor: 3 })).toMatchSnapshot();
    });

    it('atr', () => {
        expect(computeATR(DATA, { length: 14 })).toMatchSnapshot();
    });

    it('adl', () => {
        expect(computeADL(DATA)).toMatchSnapshot();
    });

    it('w52', () => {
        expect(computeW52(DATA, { basis: 'highlow' })).toMatchSnapshot();
        expect(computeW52(DATA, { basis: 'close' })).toMatchSnapshot();
    });

    it('tsi', () => {
        expect(computeTSI(DATA, { longLength: 25, shortLength: 13, signalLength: 13 })).toMatchSnapshot();
    });

    it('ichimoku', () => {
        expect(computeIchimoku(DATA, {
            conversionLength: 9, baseLength: 26, spanBLength: 52, laggingLength: 26,
        })).toMatchSnapshot();
    });

    it('volume_profile', () => {
        expect(computeVolumeProfile(DATA, { priceBins: 40 })).toMatchSnapshot();
    });

    it('smi', () => {
        const half = Math.floor(DATA.length / 2);
        const barsBySymbol = {
            AAPL: DATA.slice(0, half),
            MSFT: DATA.slice(half).map((d, i) => ({ ...d, time: DATA[i].time })),
        };
        expect(computeMarketIndex(barsBySymbol, [
            { symbol: 'AAPL', weight: 0.5, enabled: true },
            { symbol: 'MSFT', weight: 0.5, enabled: true },
        ], 100)).toMatchSnapshot();
    });
});
