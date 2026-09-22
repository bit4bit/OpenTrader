/**
 * Price Level Indicator
 *
 * Generalizes the 52 Week High/Low calendar-window logic (w52.js) to any
 * (unit, length, source, aggregation) combination: for every bar, the max
 * (or min) of the chosen price field over the last `length` calendar
 * periods (days / Monday-UTC weeks / months), including the current
 * developing period.
 */

function isValid(val) {
    return typeof val === 'number' && isFinite(val) && val !== null;
}

const DAY_SEC = 24 * 60 * 60;
const WEEK_SEC = 7 * DAY_SEC;

function dayStart(t) {
    const d = new Date(t * 1000);
    return t - (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds());
}

/**
 * Monday 00:00 UTC of the week containing the given unix timestamp (seconds).
 */
function weekStart(t) {
    const day = (new Date(t * 1000).getUTCDay() + 6) % 7; // days since Monday
    return dayStart(t) - day * DAY_SEC;
}

function monthStart(t) {
    const d = new Date(t * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
}

function windowStart(t, unit, length) {
    // Start of the window covering `length` periods ending with the
    // current one. Date.UTC normalizes out-of-range months, so stepping
    // back across year boundaries works.
    if (unit === 'month') {
        const d = new Date(monthStart(t) * 1000);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (length - 1), 1) / 1000;
    }
    const periodSec = unit === 'week' ? WEEK_SEC : DAY_SEC;
    const start = unit === 'week' ? weekStart(t) : dayStart(t);
    return start - (length - 1) * periodSec;
}

/**
 * Compute the trailing price level for a whole dataset.
 *
 * @param {Array} data - Array of OHLCV objects (time ascending, unix seconds)
 * @param {Object} settings - { unit: 'day'|'week'|'month', length, source, aggregation: 'max'|'min' }
 * @returns {Array<{time, value}>}
 */
export function computePriceLevel(data, settings = {}) {
    const { unit = 'week', length = 52, source = 'high', aggregation = 'max' } = settings;
    const result = [];
    if (!data || data.length === 0) return result;

    const wantMin = aggregation === 'min';
    const val = (d) => d[source];

    // Monotonic deque for sliding-window max/min over the calendar window.
    const deque = []; // indices, val descending for max, ascending for min

    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const ws = windowStart(d.time, unit, length);
        const v = val(d);

        if (isValid(v)) {
            while (deque.length) {
                const back = val(data[deque[deque.length - 1]]);
                if (wantMin ? back >= v : back <= v) deque.pop();
                else break;
            }
            deque.push(i);
        }

        // Evict bars older than the window
        while (deque.length && data[deque[0]].time < ws) deque.shift();

        if (deque.length) result.push({ time: d.time, value: val(data[deque[0]]) });
    }

    return result;
}
