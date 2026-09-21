// Synthetic placeholder rows for non-trading days (weekends, holidays).
// Daily-and-above bars use exchange-local dates at UTC midnight, so fixed
// steps apply; monthly intervals step variably and are left unfilled.
export const GAP_FILL_STEPS = { '1d': 86400, '5d': 432000, '1wk': 604800 };

// Guard against bad data: a gap this wide is a data problem, not a holiday.
const MAX_GAP_ROWS = 400;

const gapRow = (prev, time) =>
    'close' in prev
        ? { time, open: prev.close, high: prev.close, low: prev.close, close: prev.close, volume: 0, placeholder: true }
        : { time, value: prev.value, placeholder: true };

/**
 * Insert doji placeholder rows at each missing expected timestamp so the
 * time scale renders continuous bars across weekends/holidays. Works on
 * candle rows ({open, high, low, close}) and line rows ({value}); returns
 * the input unchanged for intraday/variable-step intervals.
 */
export function fillGapRows(rows, interval) {
    const step = GAP_FILL_STEPS[interval];
    if (!step || rows.length < 2) return rows;
    const filled = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
        const prev = filled[filled.length - 1];
        const next = rows[i];
        for (let time = prev.time + step, n = 0; time < next.time && n < MAX_GAP_ROWS; time += step, n++) {
            filled.push(gapRow(prev, time));
        }
        filled.push(next);
    }
    return filled;
}
