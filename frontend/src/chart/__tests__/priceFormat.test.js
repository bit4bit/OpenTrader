import { describe, it, expect } from 'vitest';
import { priceFormatForDecimals, formatPriceValue, DEFAULT_PRICE_DECIMALS } from '../priceFormat';

describe('priceFormatForDecimals', () => {
    it('matches the lightweight-charts price format shape', () => {
        expect(priceFormatForDecimals(5)).toEqual({ type: 'price', precision: 5, minMove: 0.00001 });
        expect(priceFormatForDecimals(2)).toEqual({ type: 'price', precision: 2, minMove: 0.01 });
    });

    it('falls back to the default precision', () => {
        expect(priceFormatForDecimals()).toEqual(priceFormatForDecimals(DEFAULT_PRICE_DECIMALS));
        expect(priceFormatForDecimals(undefined)).toEqual(priceFormatForDecimals(DEFAULT_PRICE_DECIMALS));
    });
});

describe('formatPriceValue', () => {
    it('formats with the given precision', () => {
        expect(formatPriceValue(0.12345, 5)).toBe('0.12345');
        expect(formatPriceValue(0.12345, 2)).toBe('0.12');
    });

    it('falls back to the default precision', () => {
        expect(formatPriceValue(0.12345)).toBe('0.12');
    });

    it('returns an empty string for null prices', () => {
        expect(formatPriceValue(null, 5)).toBe('');
    });
});
