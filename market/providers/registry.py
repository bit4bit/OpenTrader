import hashlib
import json
import logging
import os
import time

from django.conf import settings

from .kraken import KrakenMarketProvider
from .yahoo import YahooMarketProvider

logger = logging.getLogger(__name__)

PROVIDER_CLASSES = {
    'yahoo': YahooMarketProvider,
    'kraken': KrakenMarketProvider,
}

DEFAULT_CONFIG = {
    'provider_order': ['kraken', 'yahoo'],
    'providers': {'kraken': {}, 'yahoo': {}},
}

CONFIG_PATH = settings.WORKING_DIR / 'config.json'
CACHE_DIR = settings.WORKING_DIR / 'cache' / 'providers'
DEFAULT_CACHE_TTL = 3600

_config_cache = {'mtime': None, 'config': None}
_provider_cache = {}
_catalog_cache = {}


class SymbolNotSupported(Exception):
    pass


def _load_config():
    try:
        mtime = CONFIG_PATH.stat().st_mtime
    except OSError:
        return dict(DEFAULT_CONFIG)
    if _config_cache['mtime'] == mtime:
        return _config_cache['config']
    try:
        with open(CONFIG_PATH) as f:
            config = json.load(f)
    except (OSError, ValueError) as e:
        logger.warning('Failed to parse %s (%s); using defaults', CONFIG_PATH, e)
        return dict(DEFAULT_CONFIG)
    if not isinstance(config, dict) or not config.get('providers'):
        config = dict(DEFAULT_CONFIG)
    _config_cache['mtime'] = mtime
    _config_cache['config'] = config
    _invalidate_caches(config)
    return config


def _invalidate_caches(config):
    new_cache = {}
    for name in config.get('providers', {}):
        if name in _catalog_cache:
            new_cache[name] = _catalog_cache[name]
    _catalog_cache.clear()
    _catalog_cache.update(new_cache)
    _provider_cache.clear()


def get_configured_provider_names():
    config = _load_config()
    configured = config.get('providers', {})
    names = [n for n in config.get('provider_order', [])
             if n in configured and n in PROVIDER_CLASSES]
    if names:
        return names
    return [n for n in configured if n in PROVIDER_CLASSES]


def get_provider(name):
    config = _load_config()
    provider_config = config.get('providers', {}).get(name)
    if provider_config is None or name not in PROVIDER_CLASSES:
        raise KeyError(f'Unknown provider: {name}')
    fingerprint = json.dumps(provider_config, sort_keys=True)
    cache_key = (name, fingerprint)
    if cache_key not in _provider_cache:
        _provider_cache[cache_key] = PROVIDER_CLASSES[name](**provider_config)
    return _provider_cache[cache_key]


def _cache_path(name):
    return CACHE_DIR / f'{name}.json'


def _cache_ttl(name, config):
    return int(config.get('providers', {}).get(name, {}).get('cache_ttl') or DEFAULT_CACHE_TTL)


def get_catalog(name):
    config = _load_config()
    provider = get_provider(name)
    ttl = _cache_ttl(name, config)
    now = time.time()
    cached = _catalog_cache.get(name)
    if cached and now - cached['fetched_at'] < ttl:
        return cached['symbols']

    path = _cache_path(name)
    disk = _read_disk_cache(path)
    if disk and now - disk['fetched_at'] < ttl:
        _catalog_cache[name] = disk
        return disk['symbols']

    try:
        symbols = _stamp(provider.symbols(), name)
        entry = {'fetched_at': now, 'symbols': symbols}
        _write_disk_cache(path, entry)
        _catalog_cache[name] = entry
        return symbols
    except Exception as e:
        logger.warning('Catalog fetch failed for provider %s: %s', name, e)
        if disk:
            logger.info('Serving stale catalog for provider %s', name)
            _catalog_cache[name] = disk
            return disk['symbols']
        raise


def _stamp(symbols, name):
    return [{**entry, 'provider': name} for entry in symbols]


def _read_disk_cache(path):
    try:
        with open(path) as f:
            payload = json.load(f)
        if isinstance(payload, dict) and isinstance(payload.get('symbols'), list):
            return payload
    except (OSError, ValueError):
        pass
    return None


def _write_disk_cache(path, entry):
    os.makedirs(path.parent, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    with open(tmp, 'w') as f:
        json.dump(entry, f)
    os.replace(tmp, path)


def resolve_provider(symbol, provider_name=None):
    """Return (provider, metadata) for a symbol, or raise SymbolNotSupported."""
    if provider_name:
        for entry in get_catalog(provider_name):
            if entry['symbol'] == symbol:
                return get_provider(provider_name), entry
        raise SymbolNotSupported(f'Symbol {symbol} is not supported by provider {provider_name}')
    errors = []
    for name in get_configured_provider_names():
        try:
            catalog = get_catalog(name)
        except Exception as e:
            errors.append(f'{name}: {e}')
            continue
        for entry in catalog:
            if entry['symbol'] == symbol:
                return get_provider(name), entry
    if errors:
        logger.warning('Provider resolution errors for %s: %s', symbol, '; '.join(errors))
    raise SymbolNotSupported(f'Symbol {symbol} is not supported by the configured providers')


def search_all(query):
    results = {}
    for name in get_configured_provider_names():
        try:
            provider = get_provider(name)
            for entry in provider.search(query):
                stamped = {**entry, 'provider': name}
                results.setdefault(entry['symbol'], stamped)
        except Exception as e:
            logger.warning('Search failed for provider %s: %s', name, e)
    _merge_search_results(results)
    return list(results.values())


def _merge_search_results(results):
    """Persist search hits into each provider's catalog so they route later."""
    by_provider = {}
    for entry in results.values():
        by_provider.setdefault(entry['provider'], []).append(entry)
    for name, entries in by_provider.items():
        try:
            catalog = get_catalog(name)
        except Exception:
            continue
        known = {e['symbol'] for e in catalog}
        additions = [e for e in entries if e['symbol'] not in known]
        if not additions:
            continue
        merged = catalog + additions
        entry = {'fetched_at': time.time(), 'symbols': merged}
        _catalog_cache[name] = entry
        try:
            _write_disk_cache(_cache_path(name), entry)
        except OSError as e:
            logger.warning('Failed to persist catalog merge for %s: %s', name, e)


def providers_config_hash():
    config = _load_config()
    return hashlib.md5(json.dumps(config, sort_keys=True).encode()).hexdigest()