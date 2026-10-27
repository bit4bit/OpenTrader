"""Composes stored bars and provider fetches for chart history.

The interval defines the mutable region: bars strictly before the
interval floor of now are complete and answered from storage; the
provider is asked only for never-fetched immutable segments and the one
still-moving latest slot. Daily-and-longer bars carry the exchange-local
midnight that opens the bar (hours off UTC), so the tail fetch reaches
one full slot behind the boundary — the moving bar always lands inside
it.

The provider's row conversion lives here because stored rows are the
same rows the client receives: one orientation, not two.
"""
import datetime
import logging
import time
from datetime import datetime, timezone

from . import history_store

logger = logging.getLogger(__name__)

DAILY_STAMP_INTERVALS = ('1d', '5d', '1wk', '1mo', '3mo')

SLOT_SECONDS = {
    '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
    '1h': 3600, '4h': 14400, '1d': 86400, '5d': 432000, '1wk': 604800,
}

PERIOD_SECONDS = {
    '1d': 86400, '5d': 432000, '1mo': 31 * 86400, '1y': 365 * 86400,
}


class ProviderFetchFailed(Exception):
    pass


def _month_index(timestamp):
    moment = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return moment.year * 12 + moment.month - 1


def _month_start_timestamp(index):
    year, month = divmod(index, 12)
    return int(datetime(year, month + 1, 1, tzinfo=timezone.utc).timestamp())


def immutable_boundary(interval, now=None):
    """First timestamp of the still-open bar slot; bars strictly before it
    are complete. Month bars floor to a calendar month/quarter start;
    an interval without a slot floor is trusted nowhere (everything is
    mutable) so unknown intervals behave like the pre-storage view."""
    now = now or int(time.time())
    if interval in ('1mo', '3mo'):
        months = 1 if interval == '1mo' else 3
        index = _month_index(now)
        return _month_start_timestamp(index - index % months)
    slot = SLOT_SECONDS.get(interval)
    if slot is None:
        return now
    return now - now % slot


def _tail_start(interval, boundary):
    if interval in ('1mo', '3mo'):
        months = 1 if interval == '1mo' else 3
        return _month_start_timestamp(_month_index(boundary) - months)
    slot = SLOT_SECONDS.get(interval)
    return boundary - slot if slot else boundary


def _window_bounds(period, start, end, now):
    """Resolved request window [window_start, window_end): a None end is
    open (fetches up to now)."""
    if start and end:
        return int(start), int(end)
    span = PERIOD_SECONDS.get(period) if period else None
    return now - span if span else 0, None


def clean_value(value):
    if value is None or (isinstance(value, float) and value != value):
        return None
    return value


def rows_from_history(df, interval):
    """Engine-front bars from a provider history frame, ascending by time.

    Daily-and-longer bars are stamped at the exchange-local trading date
    at UTC midnight — the business-day convention charting libraries
    expect, which aligns sessions across exchanges."""
    rows = []
    if df is None or df.empty:
        return rows
    df = df.reset_index()
    for _, row in df.iterrows():
        if 'Date' in row:
            stamp = row['Date']
        elif 'Datetime' in row:
            stamp = row['Datetime']
        elif 'index' in df.columns:
            stamp = df.iloc[_]['index']
        else:
            stamp = None
        if stamp is None:
            continue

        if interval in DAILY_STAMP_INTERVALS:
            timestamp = int(datetime.combine(
                stamp.date(), datetime.min.time(), tzinfo=timezone.utc
            ).timestamp())
        else:
            timestamp = int(stamp.timestamp())

        bar = {
            'time': timestamp,
            'open': clean_value(row['Open']),
            'high': clean_value(row['High']),
            'low': clean_value(row['Low']),
            'close': clean_value(row['Close']),
            'volume': clean_value(row['Volume']),
        }
        if bar['close'] is None and bar['open'] is None:
            continue
        rows.append(bar)
    return rows


def _immutable(window_end, boundary):
    if window_end is None:
        return boundary
    return min(window_end, boundary)


def _provider_window(period, start, end):
    """The get_history kwargs the pre-storage view used: explicit seconds
    for keyed windows, the provider's own period semantics otherwise."""
    if start and end:
        return {'start': int(start), 'end': int(end)}
    return {'period': period}


def _fetch_and_upsert(provider, provider_name, symbol, interval, **kwargs):
    """Fetch from the provider and absorb it into the store. Returns
    (rows, error) — rows of None means the provider failed; storage is
    then left untouched (nothing was received)."""
    try:
        df = provider.get_history(symbol, interval, **kwargs)
    except Exception as error:
        logger.warning('Provider fetch for %s (%s %s) failed: %s',
                       symbol, provider_name, interval, error)
        return None, error
    rows = rows_from_history(df, interval)
    history_store.upsert_bars(provider_name, symbol, interval, rows)
    return rows, None


def bars_for(provider, provider_name, symbol, interval, period=None, start=None, end=None):
    """Client rows for the requested window.

    A first-ever fetch defers to the provider's own period/keyed
    semantics (same rows the pre-storage view served); after that the
    store answers everything immutable and only the moving tail touches
    the provider. Raises ProviderFetchFailed when storage cannot answer
    and the provider errored."""
    now = int(time.time())
    boundary = immutable_boundary(interval, now)
    window_start, window_end = _window_bounds(period, start, end, now)

    if not history_store.has_bars(provider_name, symbol, interval):
        rows, error = _fetch_and_upsert(
            provider, provider_name, symbol, interval,
            **_provider_window(period, start, end))
        if rows is None:
            raise ProviderFetchFailed(error)
        history_store.record_coverage(
            provider_name, symbol, interval, window_start, _immutable(window_end, boundary))
        return rows

    error = None
    for seg_start, seg_end in history_store.uncovered_segments(
            provider_name, symbol, interval, window_start, _immutable(window_end, boundary)):
        fetched, fetch_error = _fetch_and_upsert(
            provider, provider_name, symbol, interval,
            start=seg_start, end=seg_end)
        if fetched is None:
            error = fetch_error
            continue
        history_store.record_coverage(provider_name, symbol, interval, seg_start, seg_end)

    if window_end is None or window_end >= boundary:
        # The moving latest slot, plus one full slot behind the boundary
        # for exchange-midnight stamp skew: always refetched, never trusted.
        tail_start = max(window_start, _tail_start(interval, boundary))
        now_fetch_end = now if window_end is None else window_end
        if tail_start < now_fetch_end:
            _fetch_and_upsert(provider, provider_name, symbol, interval,
                              start=tail_start, end=now_fetch_end)

    rows = history_store.stored_bars(provider_name, symbol, interval, window_start, window_end)
    if not rows and error is not None:
        raise ProviderFetchFailed(error)
    return rows
