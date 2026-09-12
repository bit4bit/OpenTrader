// Build the crosshair legend payload: the price bar plus one entry per
// indicator plot, in plot declaration order. `readSeriesValue` abstracts the
// library's param.seriesData.get(series) lookup.
export function buildLegendResults(priceBar, genericSeries, readSeriesValue) {
    const results = { price: priceBar ?? null, generic: {} };
    Object.entries(genericSeries).forEach(([id, seriesArr]) => {
        results.generic[id] = seriesArr.map(entry => ({
            title: entry.title,
            color: entry.color,
            value: readSeriesValue(entry.series)?.value ?? null,
        }));
    });
    return results;
}
