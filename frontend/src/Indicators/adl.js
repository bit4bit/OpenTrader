/**
 * Accumulation/Distribution Line (ADL) Indicator
 * Matches TradingView logic: cumulative money flow volume, no inputs.
 *
 * MFM = ((Close - Low) - (High - Close)) / (High - Low)  (0 when High == Low)
 * MFV = MFM * Volume
 * ADL = ADL(prev) + MFV
 */

function isValid(val) {
    return typeof val === 'number' && isFinite(val) && val !== null;
}

/**
 * Format large cumulative volume values like TradingView:
 * 1.23K / 4.56M / 7.89B / 1.23T (handles negatives)
 */
export function formatADLValue(val) {
    if (!isValid(val)) return '';
    const sign = val < 0 ? '-' : '';
    const abs = Math.abs(val);
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(2) + 'K';
    return sign + abs.toFixed(2);
}

/**
 * Compute Accumulation/Distribution for a whole dataset.
 *
 * @param {Array} data - Array of OHLCV objects
 * @returns {Array} - Array of { time, value }
 */
export function computeADL(data) {
    if (!data || data.length === 0) return [];

    const results = [];
    let adl = 0;

    for (let i = 0; i < data.length; i++) {
        const { high, low, close, volume } = data[i];

        if (!isValid(high) || !isValid(low) || !isValid(close)) continue;

        const range = high - low;
        const mfm = range === 0 ? 0 : ((close - low) - (high - close)) / range;
        const mfv = mfm * (isValid(volume) ? volume : 0);

        adl += mfv;
        results.push({ time: data[i].time, value: adl });
    }

    return results;
}
