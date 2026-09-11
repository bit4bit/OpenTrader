/**
 * 52 Week High/Low Indicator
 * Port of the TradingView Pine script:
 *
 *   weekly_hh = security(tickerid, "W", highest(high, 52), lookahead=barmerge.lookahead_on)
 *   weekly_ll = security(tickerid, "W", lowest(low, 52), lookahead=barmerge.lookahead_on)
 *   weekly_hc = security(tickerid, "W", highest(close, 52), lookahead=barmerge.lookahead_on)
 *   weekly_lc = security(tickerid, "W", lowest(close, 52), lookahead=barmerge.lookahead_on)
 *
 * i.e. for every bar, the highest high (or close) and lowest low (or close)
 * over the last 52 calendar weeks, including the current developing week
 * (lookahead_on). Weeks start Monday 00:00 UTC.
 */

function isValid(val) {
    return typeof val === 'number' && isFinite(val) && val !== null;
}

const WEEK_SEC = 7 * 24 * 60 * 60;

/**
 * Monday 00:00 UTC of the week containing the given unix timestamp (seconds).
 */
function weekStart(t) {
    const d = new Date(t * 1000);
    const day = (d.getUTCDay() + 6) % 7; // days since Monday
    const midnight = t - (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds());
    return midnight - day * 86400;
}

/**
 * Compute 52 week high/low for a whole dataset.
 *
 * @param {Array} data - Array of OHLCV objects (time ascending, unix seconds)
 * @param {Object} settings - { basis: 'highlow' | 'close' }
 * @returns {{ high: Array<{time, value}>, low: Array<{time, value}> }}
 */
export function computeW52(data, settings = {}) {
    const { basis = 'highlow' } = settings;
    const result = { high: [], low: [] };
    if (!data || data.length === 0) return result;

    const useClose = basis === 'close';
    const hiVal = (d) => useClose ? d.close : d.high;
    const loVal = (d) => useClose ? d.close : d.low;

    // Monotonic deques for sliding-window max/min over a 52-week window.
    const maxDeque = []; // indices, hiVal descending
    const minDeque = []; // indices, loVal ascending

    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const t = d.time;
        // Window: start of current bar's week minus 51 full weeks
        const ws = weekStart(t);
        const windowStart = ws - 51 * WEEK_SEC;

        const hv = hiVal(d);
        const lv = loVal(d);

        if (isValid(hv)) {
            while (maxDeque.length && hiVal(data[maxDeque[maxDeque.length - 1]]) <= hv) maxDeque.pop();
            maxDeque.push(i);
        }
        if (isValid(lv)) {
            while (minDeque.length && loVal(data[minDeque[minDeque.length - 1]]) >= lv) minDeque.pop();
            minDeque.push(i);
        }

        // Evict bars older than the window
        while (maxDeque.length && data[maxDeque[0]].time < windowStart) maxDeque.shift();
        while (minDeque.length && data[minDeque[0]].time < windowStart) minDeque.shift();

        if (maxDeque.length && minDeque.length) {
            result.high.push({ time: t, value: hiVal(data[maxDeque[0]]) });
            result.low.push({ time: t, value: loVal(data[minDeque[0]]) });
        }
    }

    return result;
}
