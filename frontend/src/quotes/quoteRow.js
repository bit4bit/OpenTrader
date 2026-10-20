// Quote strips for the session manager: pure presentation logic turning
// a backend quote entry ({price, previous_close, day_change, ...}) into
// display fields, plus symbol collection from session layouts.

import { formatPriceValue, DEFAULT_PRICE_DECIMALS } from '../chart/priceFormat';

export function sessionSymbols(session) {
    const charts = session?.layout?.charts || [];
    const seen = new Map();
    for (const chart of charts) {
        const field = chart?.symbol;
        const symbol = field?.symbol ?? (typeof field === 'string' ? field : '');
        if (!symbol) continue;
        const entry = { symbol, provider: field?.provider ?? null };
        const key = `${entry.provider || ''}|${entry.symbol}`;
        if (!seen.has(key)) seen.set(key, entry);
    }
    return [...seen.values()];
}

export function symbolsOfSessions(sessions) {
    const seen = new Map();
    for (const session of sessions) {
        for (const entry of sessionSymbols(session)) {
            const key = `${entry.provider || ''}|${entry.symbol}`;
            if (!seen.has(key)) seen.set(key, entry);
        }
    }
    return [...seen.values()];
}

const signedNumber = (value, decimals) => {
    const digits = Math.abs(value).toFixed(decimals);
    return value > 0 ? `+${digits}` : value < 0 ? `-${digits}` : digits;
};

const toneFor = (change) =>
    change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

export function formatChange(change, pct, decimals = DEFAULT_PRICE_DECIMALS) {
    if (change == null || pct == null || !Number.isFinite(change) || !Number.isFinite(pct)) {
        return { tone: 'none', text: '—' };
    }
    return { tone: toneFor(change), text: `${signedNumber(change, decimals)} (${signedNumber(pct, 2)}%)` };
}

export function formatDayChange(price, previousClose, decimals = DEFAULT_PRICE_DECIMALS) {
    if (price == null || previousClose == null || previousClose === 0) {
        return { tone: 'none', text: '—' };
    }
    const change = price - previousClose;
    return formatChange(change, (change / previousClose) * 100, decimals);
}

export function formatVolumeChangePct(pct) {
    if (pct == null || !Number.isFinite(pct)) {
        return { tone: 'none', text: '—' };
    }
    return { tone: toneFor(pct), text: `${signedNumber(pct, 1)}%` };
}

export function formatYearRange(high, low, decimals = DEFAULT_PRICE_DECIMALS) {
    if (high == null || low == null) {
        return { tone: 'none', text: '—' };
    }
    return { tone: 'neutral', text: `${formatPriceValue(low, decimals)} — ${formatPriceValue(high, decimals)}` };
}

export function quoteDisplayFields(quote, decimals = DEFAULT_PRICE_DECIMALS) {
    return {
        price: quote?.price != null ? formatPriceValue(quote.price, decimals) : '—',
        dayChange: formatDayChange(quote?.price, quote?.previous_close, decimals),
        weekChange: formatChange(quote?.week_change, quote?.week_change_pct, decimals),
        monthChange: formatChange(quote?.month_change, quote?.month_change_pct, decimals),
        quarterChange: formatChange(quote?.quarter_change, quote?.quarter_change_pct, decimals),
        volumeChange: formatVolumeChangePct(quote?.volume_change_pct),
        yearRange: formatYearRange(quote?.year_high, quote?.year_low, decimals),
    };
}
