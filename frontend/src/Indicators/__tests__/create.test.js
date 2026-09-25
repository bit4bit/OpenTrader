/**
 * Creation mechanism tests: addIndicators() via the script registry must
 * produce the same default configs the old hardcoded factories did.
 */
import { describe, it, expect } from 'vitest';
import { addIndicators } from '../actions';
import { INDICATOR_TYPES, indicatorTitle, isSingleton } from '../scripts';

describe('indicator creation', () => {
    it('sma seeds the standard length set, first three visible', () => {
        const created = addIndicators([], 'sma');
        expect(created).toHaveLength(10);
        expect(created.map(i => i.length)).toEqual([50, 150, 200, 5, 10, 20, 100, 7, 14, 30]);
        expect(created.map(i => i.visible)).toEqual([true, true, true, ...new Array(7).fill(false)]);
        expect(created.map(i => i.source).every(s => s === 'close')).toBe(true);
        expect(created[0].id).toBe('sma-0');
    });

    it('registry defaults match the old factory configs', () => {
        expect(addIndicators([], 'rsi')).toEqual([{
            id: 'rsi-main', type: 'rsi',
            length: 14, source: 'close', smoothingLength: 10, showBB: true,
            color: '#2962ff', smoothColor: '#ff9800', bbColor: 'rgba(255, 255, 255, 0.3)',
            visible: true,
        }]);
        expect(addIndicators([], 'macd')).toEqual([{
            id: 'macd-main', type: 'macd',
            fastLength: 12, slowLength: 26, signalLength: 9, normLookback: 100,
            color: '#2962ff', signalColor: '#ff9800', visible: true,
        }]);
        expect(addIndicators([], 'bb')).toEqual([{
            id: 'bb-main', type: 'bb',
            length: 20, stdDev: 2, source: 'close', showPriceLabels: true,
            basisColor: '#2962ff', upperColor: '#ff9800', lowerColor: '#ff9800',
            fillColor: 'rgba(41, 98, 255, 0.1)', visible: true,
        }]);
        expect(addIndicators([], 'stoch')).toEqual([{
            id: 'stoch-main', type: 'stoch',
            length: 14, dLength: 3, upperLine: 80, lowerLine: 20,
            kColor: '#2962ff', dColor: '#ff9800', visible: true,
        }]);
        expect(addIndicators([], 'supertrend')).toEqual([{
            id: 'supertrend-main', type: 'supertrend',
            atrLength: 10, factor: 3, upColor: '#26a69a', downColor: '#ef5350',
            visible: true,
        }]);
        expect(addIndicators([], 'atr')).toEqual([{
            id: 'atr-main', type: 'atr', length: 14, color: '#ff5252', visible: true,
        }]);
        expect(addIndicators([], 'ad')).toEqual([{
            id: 'ad-main', type: 'ad', color: '#2962ff', visible: true,
        }]);
        expect(addIndicators([], 'w52')).toEqual([{
            id: 'w52-main', type: 'w52', basis: 'highlow', color: '#ff9800', visible: true,
        }]);
        expect(addIndicators([], 'tsi')).toEqual([{
            id: 'tsi-main', type: 'tsi',
            longLength: 25, shortLength: 13, signalLength: 13,
            color: '#2962ff', signalColor: '#ff9800', visible: true,
        }]);
        expect(addIndicators([], 'ichimoku')).toEqual([{
            id: 'ichimoku-main', type: 'ichimoku',
            conversionLength: 9, baseLength: 26, spanBLength: 52, laggingLength: 26,
            tenkanColor: '#2962ff', kijunColor: '#ff9800',
            spanAColor: 'rgba(38, 166, 154, 0.4)', spanBColor: 'rgba(239, 83, 80, 0.4)',
            chikouColor: '#9c27b0', visible: true,
        }]);
        expect(addIndicators([], 'trading_activity')).toEqual([{
            id: 'trading-activity-main', type: 'trading_activity',
            buyColor: '#26a69a', sellColor: '#ef5350', visible: true,
        }]);
        expect(addIndicators([], 'vol_sma')).toEqual([{
            id: 'vol-sma-main', type: 'vol_sma', length: 20, color: '#ff9800', visible: true,
        }]);
        expect(addIndicators([], 'volume_profile')).toEqual([{
            id: 'vp-main', type: 'volume_profile', priceBins: 40,
            color: 'rgba(38, 166, 154, 0.4)', visible: true,
        }]);
        expect(addIndicators([], 'smi')).toEqual([{
            id: 'smi-main', type: 'smi', baseValue: 100,
            constituents: [
                { symbol: 'AAPL', weight: 0.5, enabled: true },
                { symbol: 'MSFT', weight: 0.5, enabled: true },
            ],
            color: '#4fc3f7', visible: true,
        }]);
    });

    it('singletons are not added twice, non-singletons are', () => {
        const once = addIndicators(addIndicators([], 'macd'), 'macd');
        expect(once).toHaveLength(1);
        const rsiTwice = addIndicators(addIndicators([], 'rsi'), 'rsi');
        expect(rsiTwice).toHaveLength(2);
        const smaTwice = addIndicators(addIndicators([], 'sma'), 'sma');
        expect(smaTwice).toHaveLength(20);
        expect(isSingleton('vp')).toBe(false);
        expect(isSingleton('smi')).toBe(true);
    });

    it('registry lists every indicator with a title', () => {
        expect(INDICATOR_TYPES.length).toBeGreaterThanOrEqual(15);
        INDICATOR_TYPES.forEach(t => expect(indicatorTitle(t)).toBeTruthy());
    });
});