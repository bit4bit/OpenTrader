/**
 * VWAP / Anchored VWAP.
 *
 * VWAP = sum(price * volume) / sum(volume), accumulated from an anchor
 * point: the average price traders paid since the anchor. Calendar
 * anchors (session/week/month/year) reset at each period start — session
 * is the classic intraday VWAP, week/month/year the WTD/MTD/YTD anchored
 * VWAPs. An anchorTime anchors the line at the first bar at/after that
 * time (event anchors: swing high/low, gap, earnings).
 */
import { getSourceValue } from './sma';

function isValid(val) {
    return typeof val === 'number' && isFinite(val);
}

// Period key for a unix-seconds bar time: the accumulation resets when
// the key changes. UTC calendar boundaries; weeks start Monday so a
// holiday Monday still resets on the first bar of that week.
const ANCHOR_KEYS = {
    session: (t) => {
        const d = new Date(t * 1000);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    },
    week: (t) => {
        const d = new Date(t * 1000);
        const mondayOffset = (d.getUTCDay() + 6) % 7;
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - mondayOffset);
    },
    month: (t) => {
        const d = new Date(t * 1000);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth());
    },
    year: (t) => {
        const d = new Date(t * 1000);
        return Date.UTC(d.getUTCFullYear());
    },
};

/**
 * Compute VWAP for a whole dataset.
 *
 * @param {Array} data - OHLCV bars in ascending time order
 * @param {Object} opts
 * @param {string} opts.source - per-bar price source (default 'hlc3')
 * @param {string} opts.anchor - reset period: 'session' | 'week' | 'month' | 'year'
 * @param {number|null} opts.anchorTime - anchor at the first bar at/after this unix time
 * @returns {Array} - Array of { time, value }
 */
export function computeVWAP(data, { source = 'hlc3', anchor = 'session', anchorTime = null } = {}) {
    if (!data || data.length === 0) return [];
    const anchored = isValid(anchorTime);
    const keyOf = ANCHOR_KEYS[anchor];
    if (!anchored && !keyOf) return [];

    const results = [];
    let key = null;
    let priceVolume = 0;
    let volumeSum = 0;

    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        if (d.time == null) continue;

        if (anchored) {
            if (d.time < anchorTime) continue;
        } else {
            const k = keyOf(d.time);
            if (k !== key) {
                key = k;
                priceVolume = 0;
                volumeSum = 0;
            }
        }

        const price = getSourceValue(d, source, i, data);
        const volume = isValid(d.volume) ? d.volume : 0;
        if (price != null && isValid(price)) {
            priceVolume += price * volume;
            volumeSum += volume;
        }

        // Zero-volume bars carry the anchor's level forward: the average
        // price paid does not change when nothing trades.
        if (volumeSum > 0) results.push({ time: d.time, value: priceVolume / volumeSum });
    }

    return results;
}
