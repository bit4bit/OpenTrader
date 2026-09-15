// Display label for one indicator instance, shared by the active-indicators
// list and the per-group settings panels.
export function indicatorLabel(groupType, ind, idx) {
    switch (groupType) {
        case 'custom': return ind.name || 'Custom Script';
        case 'sma': return `SMA ${idx + 1}`;
        case 'rsi': return `RSI (${ind.length})`;
        case 'macd': return 'Normalized MACD';
        case 'volume_profile': return `Volume Profile (${ind.priceBins})`;
        case 'bb': return `BB (${ind.length}, ${ind.stdDev})`;
        case 'stoch': return `Stoch (${ind.length}, ${ind.dLength})`;
        case 'supertrend': return `Supertrend (${ind.atrLength}, ${ind.factor})`;
        case 'atr': return `ATR (${ind.length})`;
        case 'ichimoku': return 'Ichimoku Cloud';
        case 'tsi': return `TSI (${ind.longLength}, ${ind.shortLength}, ${ind.signalLength})`;
        case 'ad': return 'Accum/Dist';
        case 'smi': return `SMI (${(ind.constituents || []).length} symbols)`;
        case 'w52': return `52W High/Low (${ind.basis === 'close' ? 'Close' : 'Highs/Lows'})`;
        case 'volume': return 'Volume';
        case 'vol_sma': return `Vol SMA (${ind.length})`;
        default: return 'Indicator';
    }
}
