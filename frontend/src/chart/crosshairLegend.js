// Build the crosshair legend payload: the price bar plus one entry per
// indicator plot, in plot declaration order. `readSeriesValue` abstracts the
// library's param.seriesData.get(series) lookup. A plot entry with legend
// metadata ({ byTime, base }) displays those values instead — a rebased
// overlay (benchmark index) shows the foreign symbol's own price, plus its
// change relative to base.
export function buildLegendResults(priceBar, genericSeries, readSeriesValue, volumeChange = null, volumeSplit = null, volumeSplitTotal = null, hoverTime = null) {
    const results = { price: priceBar ?? null, generic: {}, volumeChange, volumeSplit, volumeSplitTotal };
    Object.entries(genericSeries).forEach(([id, seriesArr]) => {
        results.generic[id] = seriesArr.map(entry => {
            const value = entry.legend && hoverTime != null
                ? entry.legend.byTime.get(hoverTime) ?? null
                : readSeriesValue(entry.series)?.value ?? null;
            const change = entry.legend && entry.legend.base != null && entry.legend.base !== 0
                && value != null
                ? value / entry.legend.base - 1
                : null;
            return { title: entry.title, color: entry.color, value, change };
        });
    });
    return results;
}
