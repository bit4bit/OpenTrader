"""Per-symbol quotes (price, day change, volume change vs the 10-day
average, 52-week range) rendered in the session manager's quote strips.

Lives next to symbol_info.py because the shape is identical: a fetch
abstraction with a disk cache swapped via config. It differs only in the
TTL — quotes must stay near-live, so the default is a short window
(`quote_cache_ttl`, seconds). The view layer only sees quote_for(symbol,
provider). Crypto providers have no quote source and return {}.
"""
import json
import logging
import time
from datetime import date, datetime, timedelta, timezone

import yfinance as yf
from django.conf import settings

from . import registry
from .symbol_info import normalize_symbol, _as_number
from .kraken import KrakenMarketProvider
from .kraken_futures import KrakenFuturesMarketProvider

logger = logging.getLogger(__name__)

CACHE_PATH = settings.WORKING_DIR / 'cache' / 'quote.json'
DEFAULT_CACHE_TTL = 60
REQUEST_TIMEOUT = 15
HISTORY_PERIOD = '14mo'
# Bumped when the cached dict schema gains a field: entries written by an
# older version are treated as expired so new fields don't stay missing
# until the TTL lapses.
CACHE_VERSION = 2

QUOTE_FIELDS = (
    'price', 'previous_close', 'day_change', 'day_change_pct',
    'week_change', 'week_change_pct',
    'month_change', 'month_change_pct',
    'quarter_change', 'quarter_change_pct',
    'volume', 'volume_change_pct', 'year_high', 'year_low',
)


def _as_int(value):
    return _as_number(value, int)


def _as_float(value):
    return _as_number(value, float)


def _change(base, total):
    return None if base in (None, 0) or total is None else round(total - base, 6)


def _change_pct(base, change):
    return None if base in (None, 0) or change is None else round(change / base * 100, 3)


def _period_starts(today):
    """Start of the current week (Monday), month and quarter."""
    return {
        'week': today - timedelta(days=today.weekday()),
        'month': today.replace(day=1),
        'quarter': today.replace(day=1, month=(today.month - 1) // 3 * 3 + 1),
    }


def _changes_from_bars(bars, price, today=None):
    """bars ascend as (date, close). Change of the current price vs the last
    close strictly before the current week/month/quarter. Deliberately not
    precise intraday: the anchor is the last completed period's close."""
    changes = {
        f'{name}_{suffix}': None
        for name in ('week', 'month', 'quarter')
        for suffix in ('change', 'change_pct')
    }
    if not bars:
        return changes
    today = today or date.today()
    for name, start in _period_starts(today).items():
        anchor = _last_close_before(bars, start)
        change = _change(anchor, price)
        changes[f'{name}_change'] = change
        changes[f'{name}_change_pct'] = _change_pct(anchor, change)
    return changes


def _last_close_before(bars, start):
    """Close of the most recent bar strictly before `start` (bars ascend by
    date). The largest close would pick an unrelated peak."""
    before = [(bar_date, close) for bar_date, close in bars if bar_date < start]
    return before[-1][1] if before else None


def _period_changes(ticker, price, today=None):
    try:
        df = ticker.history(period=HISTORY_PERIOD, interval='1d', auto_adjust=False)
    except Exception as e:
        logger.warning('Quote history fetch failed: %s', e)
        return _changes_from_bars([], price)
    if df is None or df.empty:
        return _changes_from_bars([], price)

    bars = [(ts.date(), close) for ts, close in zip(df.index, df['Close'])
            if close == close and abs(close) != float('inf')]
    return _changes_from_bars(bars, price, today)


class QuoteProvider:
    """Contract: fetch(symbol) -> {price, previous_close, day_change, ...}.

    Return values are raw scalars; the cache layer preserves them. Missing
    data -> None (not a missing key), so callers can distinguish "not
    available" from "no quote".
    """

    def __init__(self, **config):
        self.config = config

    def fetch(self, symbol):
        raise NotImplementedError


class YahooQuoteProvider(QuoteProvider):
    """yfinance fast_info wrapper, the same source the price chart uses."""

    def fetch(self, symbol):
        ticker = yf.Ticker(symbol)
        fast = ticker.fast_info

        price = _as_float(getattr(fast, 'last_price', None))
        previous_close = _as_float(getattr(fast, 'previous_close', None))
        volume = _as_int(getattr(fast, 'last_volume', None))
        avg_volume = _as_int(getattr(fast, 'ten_day_average_volume', None))
        day_change = _change(previous_close, price)

        return {
            'price': price,
            'previous_close': previous_close,
            'day_change': day_change,
            'day_change_pct': _change_pct(previous_close, day_change),
            **_period_changes(ticker, price),
            'volume': volume,
            'volume_change_pct': _change_pct(avg_volume, _change(avg_volume, volume)),
            'year_high': _as_float(getattr(fast, 'year_high', None)),
            'year_low': _as_float(getattr(fast, 'year_low', None)),
        }


def quote_from_daily_bars(bars, price=None, volume=None):
    """Full quote for (date, high, low, close, volume) bars ascending.

    Deliberately not precise intraday (the caller overrides price/volume
    with live-tick values when its API offers them): anchors are the last
    completed period's closes, the 52-week range comes from the bar
    highs/lows, average volume from the last 10 daily bars.
    """
    if not bars:
        return {}
    price = bars[-1][3] if price is None else price
    volume = bars[-1][4] if volume is None else volume
    last_close = bars[-1][3]
    previous_close = bars[-2][3]
    year_start = date.today() - timedelta(days=365)
    recent = [bar for bar in bars if bar[0] >= year_start]
    avg_volume = sum(bar[4] for bar in bars[-10:]) / min(10, len(bars))
    day_change = _change(previous_close, price)

    return {
        'price': price,
        'previous_close': previous_close,
        'day_change': day_change,
        'day_change_pct': _change_pct(previous_close, day_change),
        **_changes_from_bars([(bar[0], bar[3]) for bar in bars], price),
        'volume': volume,
        'volume_change_pct': _change_pct(avg_volume, _change(avg_volume, volume)),
        'year_high': max(bar[1] for bar in recent),
        'year_low': min(bar[2] for bar in recent),
    }


class KrakenSpotQuoteProvider(QuoteProvider):
    """Kraken spot: Ticker for the live price, 1440-minute OHLC for the
    rest (anchors, 52-week range, volume)."""

    def fetch(self, symbol):
        market = KrakenMarketProvider()
        pair = market._pair_key(symbol)
        ticker = market._get('/Ticker', {'pair': pair})
        entry = next(iter(ticker.values()))
        last_price = _as_float((entry.get('c') or [None])[0])
        volume = _as_float((entry.get('v') or [None, None])[1])

        rows = market._get('/OHLC', {'pair': pair, 'interval': 1440})
        ohlc = next((v for v in rows.values() if isinstance(v, list)), [])
        bars = [
            (datetime.fromtimestamp(row[0], tz=timezone.utc).date(),
             _as_float(row[2]), _as_float(row[3]), _as_float(row[4]), _as_float(row[6]))
            for row in ohlc
        ]
        bars = [bar for bar in bars if None not in bar]
        return quote_from_daily_bars(bars, price=last_price, volume=volume)


class KrakenFuturesQuoteProvider(QuoteProvider):
    """Kraken Futures: daily trade candles; the last close doubles as the
    live price (the charts API publishes no sub-day last-trade here)."""

    def fetch(self, symbol):
        market = KrakenFuturesMarketProvider()
        payload = market._get(f'/api/charts/v1/trade/{symbol}/1d')
        bars = [
            (datetime.fromtimestamp(candle['time'] / 1000, tz=timezone.utc).date(),
             _as_float(candle.get('high')), _as_float(candle.get('low')),
             _as_float(candle.get('close')), _as_float(candle.get('volume')))
            for candle in payload.get('candles') or []
        ]
        bars = [bar for bar in bars if None not in bar]
        return quote_from_daily_bars(bars)


PROVIDER_CLASSES = {
    'yahoo_fast_info': YahooQuoteProvider,
    'kraken_spot': KrakenSpotQuoteProvider,
    'kraken_futures': KrakenFuturesQuoteProvider,
}

QUOTE_PROVIDER_BY_MARKET = {
    'yahoo': 'yahoo_fast_info',
    'kraken': 'kraken_spot',
    'kraken_futures': 'kraken_futures',
}


def provider_for_market_provider(market_provider_name):
    # Quote coverage mirrors the market providers: Yahoo (stocks) through
    # its fast_info, both Kraken APIs through their daily candles.
    return QUOTE_PROVIDER_BY_MARKET.get(market_provider_name)


def get_provider(name):
    config = registry.get_config()
    providers_config = config.get('symbol_info_providers', {})
    if name not in PROVIDER_CLASSES:
        raise KeyError(f'Unknown quote provider: {name}')
    return PROVIDER_CLASSES[name](**providers_config.get(name, {}))


def _cache_ttl():
    config = registry.get_config()
    value = config.get('quote_cache_ttl')
    # 0 is a legal TTL (refetch on every call), so test for None, not falsy.
    return int(value) if value is not None else DEFAULT_CACHE_TTL


def _read_disk_cache():
    try:
        with open(CACHE_PATH) as f:
            payload = json.load(f)
        if isinstance(payload, dict) and isinstance(payload.get('entries'), dict):
            return payload
    except (OSError, ValueError):
        pass
    return None


def _entry_fresh(entry, now, ttl):
    """A cached entry is usable only within the TTL and if it was written
    by the current schema version (older entries lack new fields)."""
    return bool(entry) and entry.get('version') == CACHE_VERSION and now - entry['fetched_at'] < ttl


def _write_disk_cache(payload):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_PATH.with_suffix('.tmp')
    with open(tmp, 'w') as f:
        json.dump(payload, f)
    tmp.replace(CACHE_PATH)


_inflight = {}


def quote_for(symbol, market_provider_name):
    """Return {price, previous_close, day_change, ...} for the given symbol.

    Cached in-process and on disk for a short TTL. Crypto providers return
    {} — there's no quote source. Errors return the stale disk cache when
    available so a Yahoo outage doesn't blank the quote strips.
    """
    if not symbol:
        return {}

    quote_provider_name = provider_for_market_provider(market_provider_name)
    if not quote_provider_name:
        return {}

    key = (normalize_symbol(symbol), quote_provider_name)
    now = time.time()
    ttl = _cache_ttl()

    cached = _inflight.get(key)
    if _entry_fresh(cached, now, ttl):
        return cached['quote']

    disk = _read_disk_cache()
    disk_entry = disk and disk['entries'].get(f'{key[0]}|{key[1]}')
    if _entry_fresh(disk_entry, now, ttl):
        _inflight[key] = disk_entry
        return disk_entry['quote']

    try:
        entry_quote = get_provider(quote_provider_name).fetch(symbol)
    except Exception as e:
        logger.warning('Quote fetch failed for %s (%s): %s', symbol, quote_provider_name, e)
        if disk_entry:
            logger.info('Serving stale quote for %s', symbol)
            _inflight[key] = disk_entry
            return disk_entry['quote']
        return {}

    entry = {'version': CACHE_VERSION, 'fetched_at': now, 'quote': entry_quote}
    _inflight[key] = entry

    if disk is None:
        disk = {'fetched_at': now, 'entries': {}}
    disk['fetched_at'] = now
    disk['entries'][f'{key[0]}|{key[1]}'] = entry
    try:
        _write_disk_cache(disk)
    except OSError as e:
        logger.warning('Failed to persist quote cache: %s', e)

    return entry_quote
