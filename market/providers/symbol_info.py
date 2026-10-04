"""Per-symbol fundamentals (shares outstanding, market cap, ...) used by
turnover-style indicators.

Lives next to index_membership.py because the shape is identical: a fetch
abstraction with a 24h disk cache, swapped via config.json
`symbol_info_provider`. The view layer only sees info_for(symbol, provider).

Yahoo's fast_info is the only first-party source we have today; the
contract is provider-agnostic so a CoinGecko-backed crypto equivalent
(or a scraped SEC EDGAR fallback) can replace Yahoo without touching
the indicators.
"""
import json
import logging
import time

import yfinance as yf
from django.conf import settings

from . import registry

logger = logging.getLogger(__name__)

CACHE_PATH = settings.WORKING_DIR / 'cache' / 'symbol_info.json'
DEFAULT_CACHE_TTL = 24 * 3600
REQUEST_TIMEOUT = 15
# Bumped when the cached dict schema gains a field: entries written by an
# older version (no / a different version tag) are treated as expired so
# new fields (e.g. trailing_eps) don't stay missing until the TTL lapses.
CACHE_VERSION = 2


def normalize_symbol(symbol):
    return (symbol or '').strip().upper()


def _as_number(value, cast):
    if value is None:
        return None
    try:
        if hasattr(value, 'item'):
            value = value.item()
        num = cast(value)
        return num if num == num and num not in (float('inf'), float('-inf')) else None
    except (TypeError, ValueError, OverflowError):
        return None


class SymbolInfoProvider:
    """Contract: fetch(symbol) -> {shares_outstanding, market_cap, ...}.

    Return values are raw scalars; the cache layer preserves them. Missing
    data -> None (not a missing key), so callers can distinguish "not
    available" from "no info".
    """

    def __init__(self, **config):
        self.config = config

    def fetch(self, symbol):
        raise NotImplementedError


class YahooFastInfoProvider(SymbolInfoProvider):
    """yfinance fast_info wrapper, the same source the price chart uses."""

    def fetch(self, symbol):
        ticker = yf.Ticker(symbol)
        fast = ticker.fast_info

        def _as_int(value):
            return _as_number(value, int)

        # fast_info has no earnings data, so trailing EPS needs the full
        # fundamentals payload; cached 24h like the rest of the info.
        try:
            info = ticker.info or {}
        except Exception as e:
            logger.warning('Yahoo info fetch failed for %s: %s', symbol, e)
            info = {}

        def _as_float(value):
            return _as_number(value, float)

        return {
            'shares_outstanding': _as_int(getattr(fast, 'shares', None)),
            'market_cap': _as_int(getattr(fast, 'market_cap', None)),
            'trailing_eps': _as_float(info.get('trailingEps')),
        }


PROVIDER_CLASSES = {
    'yahoo_fast_info': YahooFastInfoProvider,
}


def get_provider(name):
    config = registry.get_config()
    providers_config = config.get('symbol_info_providers', {})
    if name not in PROVIDER_CLASSES:
        raise KeyError(f'Unknown symbol info provider: {name}')
    return PROVIDER_CLASSES[name](**providers_config.get(name, {}))


def provider_for_market_provider(market_provider_name):
    """Map a configured market data provider name to its symbol info source.

    Yahoo -> yahoo_fast_info (the only first-party source today); crypto
    providers (kraken) have no fundamentals and return {}. Adding a new
    market provider means extending this dispatch.
    """
    return {
        'yahoo': 'yahoo_fast_info',
    }.get(market_provider_name)


def _cache_ttl():
    config = registry.get_config()
    return int(config.get('symbol_info_cache_ttl') or DEFAULT_CACHE_TTL)


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


def info_for(symbol, market_provider_name):
    """Return {shares_outstanding, market_cap, ...} for the given symbol.

    Cached in-process and on disk (24h TTL). Crypto providers return {} —
    there's nothing to fetch. Errors return the stale disk cache when
    available so a Yahoo outage doesn't blank turnover indicators.
    """
    if not symbol:
        return {}

    info_provider_name = provider_for_market_provider(market_provider_name)
    if not info_provider_name:
        return {}

    key = (normalize_symbol(symbol), info_provider_name)
    now = time.time()
    ttl = _cache_ttl()

    cached = _inflight.get(key)
    if _entry_fresh(cached, now, ttl):
        return cached['info']

    disk = _read_disk_cache()
    disk_entry = disk and disk['entries'].get(f'{key[0]}|{key[1]}')
    if _entry_fresh(disk_entry, now, ttl):
        _inflight[key] = disk_entry
        return disk_entry['info']

    try:
        info = get_provider(info_provider_name).fetch(symbol)
    except Exception as e:
        logger.warning('Symbol info fetch failed for %s (%s): %s', symbol, info_provider_name, e)
        if disk_entry:
            logger.info('Serving stale symbol info for %s', symbol)
            _inflight[key] = disk_entry
            return disk_entry['info']
        return {}

    entry = {'version': CACHE_VERSION, 'fetched_at': now, 'info': info}
    _inflight[key] = entry

    if disk is None:
        disk = {'fetched_at': now, 'entries': {}}
    disk['fetched_at'] = now
    disk['entries'][f'{key[0]}|{key[1]}'] = entry
    try:
        _write_disk_cache(disk)
    except OSError as e:
        logger.warning('Failed to persist symbol info cache: %s', e)

    return info
