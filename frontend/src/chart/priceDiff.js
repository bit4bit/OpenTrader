// Percent difference of the chart price to an overlay line's value at the
// same bar (e.g. the close vs its SMA): how far the price sits from the
// line, in percent of the line's value.
export function priceDiffPercent(price, value) {
    if (price == null || value == null || value === 0) return null;
    return ((price - value) / value) * 100;
}
