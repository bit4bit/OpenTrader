"""Quarterly earnings history (report date, EPS estimate/actual, surprise)
used by earnings indicators.

Lives next to symbol_info.py because the shape is identical: a fetch
abstraction with a 24h disk cache, swapped via config.json
`earnings_provider`. The view layer only sees earnings_for(symbol,
provider). Yahoo's earnings_dates (past + upcoming quarterly reports) is
the only source today; providers without earnings (crypto) return an
empty list.
"""
import json
import logging
import time

import yfinance as yf
from django.conf import settings

from . import registry

logger = logging.getLogger(__name__)

CACHE_PATH = settings.WORKING_DIR / 'cache' / 'symbol_earnings.json'
DEFAULT_CACHE_TTL = 24 * 3600


def normalize_symbol(symbol):
    return (symbol or '').strip().upper()


class EarningsProvider:
    """Contract: fetch(symbol) -> {'quarters': [{date, eps_estimate,
    eps_actual, surprise_pct}, ...]} sorted by report date ascending.

    Report dates are ISO day strings (the intraday hour is Yahoo's report
    release time, not a chart bar time). Missing data -> None, not a
    missing key; upcoming reports have eps_actual/surprise_pct = None.
    """

    def __init__(self, **config):
        self.config = config

    def fetch(self, symbol):
        raise NotImplementedError


class YahooEarningsDatesProvider(EarningsProvider):
    """yfinance earnings_dates: past and upcoming quarterly EPS reports."""

    def fetch(self, symbol):
        frame = yf.Ticker(symbol).get_earnings_dates(limit=40, offset=0)
        if frame is None or frame.empty:
            return {'quarters': []}

        def _as_float(value):
            if value is None:
                return None
            try:
                if hasattr(value, 'item'):
                    value = value.item()
                num = float(value)
                return num if num == num else None
            except (TypeError, ValueError):
                return None

        quarters = []
        for report_date, row in frame.iterrows():
            if report_date is None or str(report_date) == 'NaT':
                continue
            quarters.append({
                'date': report_date.date().isoformat(),
                'eps_estimate': _as_float(row.get('EPS Estimate')),
                'eps_actual': _as_float(row.get('Reported EPS')),
                'surprise_pct': _as_float(row.get('Surprise(%)')),
            })
        quarters.sort(key=lambda q: q['date'])
        return {'quarters': quarters}


PROVIDER_CLASSES = {
    'yahoo_earnings_dates': YahooEarningsDatesProvider,
}


def get_provider(name):
    config = registry.get_config()
    providers_config = config.get('earnings_providers', {})
    if name not in PROVIDER_CLASSES:
        raise KeyError(f'Unknown earnings provider: {name}')
    return PROVIDER_CLASSES[name](**providers_config.get(name, {}))


def provider_for_market_provider(market_provider_name):
    """Map a market data provider name to its earnings source. Yahoo ->
    yahoo_earnings_dates; crypto providers (kraken) have no earnings and
    return an empty list."""
    return {
        'yahoo': 'yahoo_earnings_dates',
    }.get(market_provider_name)


def _cache_ttl():
    config = registry.get_config()
    return int(config.get('earnings_cache_ttl') or DEFAULT_CACHE_TTL)


def _read_disk_cache():
    try:
        with open(CACHE_PATH) as f:
            payload = json.load(f)
        if isinstance(payload, dict) and isinstance(payload.get('entries'), dict):
            return payload
    except (OSError, ValueError):
        pass
    return None


def _write_disk_cache(payload):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_PATH.with_suffix('.tmp')
    with open(tmp, 'w') as f:
        json.dump(payload, f)
    tmp.replace(CACHE_PATH)


_inflight = {}


def earnings_for(symbol, market_provider_name):
    """Return {'quarters': [...]} for the given symbol. Cached in-process
    and on disk (24h TTL). Providers without earnings return an empty
    list. Errors return the stale disk cache when available so a Yahoo
    outage doesn't blank earnings indicators.
    """
    if not symbol:
        return {'quarters': []}

    earnings_provider_name = provider_for_market_provider(market_provider_name)
    if not earnings_provider_name:
        return {'quarters': []}

    key = (normalize_symbol(symbol), earnings_provider_name)
    now = time.time()
    ttl = _cache_ttl()

    cached = _inflight.get(key)
    if cached and now - cached['fetched_at'] < ttl:
        return cached['earnings']

    disk = _read_disk_cache()
    disk_entry = disk and disk['entries'].get(f'{key[0]}|{key[1]}')
    if disk_entry and now - disk_entry['fetched_at'] < ttl:
        _inflight[key] = disk_entry
        return disk_entry['earnings']

    try:
        earnings = get_provider(earnings_provider_name).fetch(symbol)
    except Exception as e:
        logger.warning('Earnings fetch failed for %s (%s): %s', symbol, earnings_provider_name, e)
        if disk_entry:
            logger.info('Serving stale earnings for %s', symbol)
            _inflight[key] = disk_entry
            return disk_entry['earnings']
        return {'quarters': []}

    entry = {'fetched_at': now, 'earnings': earnings}
    _inflight[key] = entry

    if disk is None:
        disk = {'fetched_at': now, 'entries': {}}
    disk['fetched_at'] = now
    disk['entries'][f'{key[0]}|{key[1]}'] = entry
    try:
        _write_disk_cache(disk)
    except OSError as e:
        logger.warning('Failed to persist earnings cache: %s', e)

    return earnings
