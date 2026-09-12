// Ordinary least squares over y values indexed 0..n-1.
export function linearRegression(values) {
    const n = values.length;
    if (n < 2) return null;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    values.forEach((y, x) => {
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    });
    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

// Max absolute deviation of values from the regression line.
export function maxDeviation(values, slope, intercept) {
    return values.reduce((max, y, x) => Math.max(max, Math.abs(y - (slope * x + intercept))), 0);
}

// Root-mean-square error of values against the regression line.
export function stdError(values, slope, intercept) {
    const n = values.length;
    if (n === 0) return 0;
    const sumSq = values.reduce((sum, y, x) => sum + Math.pow(y - (slope * x + intercept), 2), 0);
    return Math.sqrt(sumSq / n);
}

// Index range [start, end] of bars whose time falls within [t1, t2]
// (bars sorted by time). Returns null when the window is degenerate.
export function timeWindowIndices(bars, t1, t2) {
    let start = -1, end = -1;
    for (let i = 0; i < bars.length; i++) {
        if (start === -1 && bars[i].time >= t1) start = i;
        if (bars[i].time <= t2) end = i;
        if (bars[i].time > t2) break;
    }
    if (start === -1 || end === -1 || end <= start) return null;
    return { start, end };
}
