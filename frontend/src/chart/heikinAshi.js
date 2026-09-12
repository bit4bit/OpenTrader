// Compute Heikin-Ashi candles from OHLCV data
export function computeHeikinAshi(data) {
    const ha = [];
    for (let i = 0; i < data.length; i++) {
        const curr = data[i];
        const haClose = (curr.open + curr.high + curr.low + curr.close) / 4;
        const haOpen = i === 0
            ? (curr.open + curr.close) / 2
            : (ha[i - 1].open + ha[i - 1].close) / 2;
        const haHigh = Math.max(curr.high, haOpen, haClose);
        const haLow = Math.min(curr.low, haOpen, haClose);
        ha.push({ time: curr.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
    }
    return ha;
}

// Shape the loaded bars for the active price series type.
export function priceSeriesData(data, chartType) {
    if (chartType === 'heikin') return computeHeikinAshi(data);
    if (chartType === 'line') return data.map(d => ({ time: d.time, value: d.close }));
    return data;
}
