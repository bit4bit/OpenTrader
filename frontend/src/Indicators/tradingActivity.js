// Estimated buy/sell split of a bar's volume. The providers return no
// bid/ask or per-trade side data, so buying pressure is estimated from the
// close's position in the bar's range: close at the high reads as all
// bought, at the low as all sold, linearly in between. Bars with no range
// split 50/50. Shared with the crosshair volume split (chart/volumeInfo).

export function buyFractionOf(bar) {
    const range = bar.high - bar.low;
    return range > 0 ? (bar.close - bar.low) / range : 0.5;
}

// Per-bar estimated bought volume; the sold portion is volume minus this.
export function computeBuyVolume(data) {
    return data.map(d => ({
        time: d.time,
        value: (d.volume ?? 0) * buyFractionOf(d),
    }));
}
