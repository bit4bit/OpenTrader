"""Benchmark index membership providers.

Abstraction over sources that can answer "which benchmark indexes contain
stock X". Providers expose the index -> constituents direction only; this
module inverts the map to stock -> indexes and caches it on disk (like the
market data catalogs), so lookups never hit the source per request.

Swapping sources means adding a provider class here and pointing the
`index_membership_provider` key of config.json at it — the rest of the
stack only sees memberships_for().
"""
import csv
import io
import json
import logging
import time

import requests
from django.conf import settings

from . import registry

logger = logging.getLogger(__name__)

CACHE_PATH = settings.WORKING_DIR / 'cache' / 'index_membership.json'
DEFAULT_CACHE_TTL = 24 * 3600
REQUEST_TIMEOUT = 15

_cache = {'fetched_at': None, 'map': None}


def normalize_symbol(symbol):
    """Canonical form for membership matching: Yahoo uses dashes
    (BRK-B) while constituent lists tend to use dots (BRK.B)."""
    return (symbol or '').strip().upper().replace('.', '-')


class IndexMembershipProvider:
    """Contract: list supported indexes and fetch their constituents.

    indexes()   -> [{code, name, yahoo}]  yahoo = symbol the market data
                   providers understand when fetching index history.
    constituents(code) -> [stock symbols]
    """

    def __init__(self, **config):
        self.config = config

    def indexes(self):
        raise NotImplementedError

    def constituents(self, code):
        raise NotImplementedError


class GitHubIndexConstituentsProvider(IndexMembershipProvider):
    """Constituents published by https://github.com/yfiua/index-constituents
    (GitHub Pages CSV, auto-updated monthly, Yahoo-consistent symbols)."""

    BASE_URL = 'https://yfiua.github.io/index-constituents'

    INDEXES = [
        {'code': 'sp500', 'name': 'S&P 500', 'yahoo': '^GSPC'},
        {'code': 'nasdaq100', 'name': 'NASDAQ 100', 'yahoo': '^NDX'},
        {'code': 'dowjones', 'name': 'Dow Jones', 'yahoo': '^DJI'},
        {'code': 'dax', 'name': 'DAX', 'yahoo': '^GDAXI'},
        {'code': 'ftse100', 'name': 'FTSE 100', 'yahoo': '^FTSE'},
        {'code': 'ftsemib', 'name': 'FTSE MIB', 'yahoo': 'FTSEMIB.MI'},
        {'code': 'hsi', 'name': 'Hang Seng Index', 'yahoo': '^HSI'},
        {'code': 'csi300', 'name': 'CSI 300', 'yahoo': '000300.SS'},
        {'code': 'csi500', 'name': 'CSI 500', 'yahoo': '000905.SS'},
        {'code': 'csi1000', 'name': 'CSI 1000', 'yahoo': '000852.SS'},
        {'code': 'sse', 'name': 'SSE Composite', 'yahoo': '000001.SS'},
        {'code': 'szse', 'name': 'SZSE Component', 'yahoo': '399001.SZ'},
    ]

    def indexes(self):
        return self.INDEXES

    def constituents(self, code):
        url = f'{self.BASE_URL}/constituents-{code}.csv'
        response = requests.get(url, timeout=REQUEST_TIMEOUT,
                                headers={'User-Agent': 'OpenTrader'})
        response.raise_for_status()
        rows = csv.DictReader(io.StringIO(response.text))
        return [row['Symbol'] for row in rows if row.get('Symbol')]


PROVIDER_CLASSES = {
    'github': GitHubIndexConstituentsProvider,
}


def get_provider():
    config = registry.get_config()
    name = config.get('index_membership_provider', 'github')
    provider_config = config.get('index_membership_providers', {}).get(name, {})
    if name not in PROVIDER_CLASSES:
        raise KeyError(f'Unknown index membership provider: {name}')
    return PROVIDER_CLASSES[name](**provider_config)


def _cache_ttl():
    config = registry.get_config()
    return int(config.get('index_membership_cache_ttl') or DEFAULT_CACHE_TTL)


def _read_disk_cache():
    try:
        with open(CACHE_PATH) as f:
            payload = json.load(f)
        if isinstance(payload, dict) and isinstance(payload.get('map'), dict):
            return payload
    except (OSError, ValueError):
        pass
    return None


def _write_disk_cache(entry):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_PATH.with_suffix('.tmp')
    with open(tmp, 'w') as f:
        json.dump(entry, f)
    tmp.replace(CACHE_PATH)


def membership_map():
    """Inverted {normalized stock symbol: [{code, name, yahoo}]}, cached."""
    now = time.time()
    ttl = _cache_ttl()
    if _cache['fetched_at'] and now - _cache['fetched_at'] < ttl:
        return _cache['map']

    disk = _read_disk_cache()
    if disk and now - disk['fetched_at'] < ttl:
        _cache['fetched_at'] = now
        _cache['map'] = disk['map']
        return disk['map']

    try:
        provider = get_provider()
        inverted = {}
        for index in provider.indexes():
            for symbol in provider.constituents(index['code']):
                inverted.setdefault(normalize_symbol(symbol), []).append({
                    'code': index['code'],
                    'name': index['name'],
                    'yahoo': index['yahoo'],
                })
        _cache['fetched_at'] = now
        _cache['map'] = inverted
        _write_disk_cache({'fetched_at': now, 'map': inverted})
        return inverted
    except Exception as e:
        logger.warning('Index membership fetch failed: %s', e)
        if disk:
            logger.info('Serving stale index membership')
            _cache['fetched_at'] = now
            _cache['map'] = disk['map']
            return disk['map']
        raise


def memberships_for(symbol):
    """All benchmark indexes containing the given stock symbol."""
    return membership_map().get(normalize_symbol(symbol), [])
