"""Behavior-driven tests for the provider abstraction.

Given/When/Then scenarios exercised through the real stack:
config.json on disk -> registry -> disk-cached catalogs -> views.
Only external boundaries are stubbed: Kraken's HTTP API (requests.get)
and Yahoo's API (yf.screen / yf.Search / yf.Ticker). Database, config
parsing, routing, and the disk cache run for real.
"""
import json
import time
from unittest import mock

import pandas as pd
from django.test import TestCase

from market.providers import registry
from market.providers import index_membership
from market.providers import symbol_info
from market.providers import earnings
from market.providers.kraken import KrakenMarketProvider
from market.providers.yahoo import YahooMarketProvider


def kraken_asset_pairs():
    return {
        'error': [],
        'result': {
            'XXBTZUSD': {'wsname': 'XBT/USD', 'altname': 'XBTUSD', 'base': 'XBT',
                         'quote': 'ZUSD', 'status': 'online'},
            'XETHZUSD': {'wsname': 'ETH/USD', 'altname': 'ETHUSD', 'base': 'XETH',
                         'quote': 'ZUSD', 'status': 'online'},
            'XBADZUSD': {'wsname': 'BAD/USD', 'altname': 'BADUSD', 'base': 'XBAD',
                         'quote': 'ZUSD', 'status': 'cancel_only'},
        },
    }


def kraken_ohlc():
    return {
        'error': [],
        'result': {
            'XXBTZUSD': [
                [1600000000, '100.5', '110.0', '95.0', '105.0', '105.0', '12.5', 100],
                [1600000060, '105.0', '115.0', '100.0', '112.0', '112.0', '8.0', 60],
            ],
        },
    }


def yahoo_quote(symbol, name, quote_type='EQUITY', sector=None):
    return {
        'symbol': symbol, 'shortName': name, 'longName': name + ' Inc.',
        'quoteType': quote_type, 'fullExchangeName': 'Nasdaq', 'exchange': 'NMS',
        'sector': sector,
    }


def fake_response(payload):
    response = mock.Mock()
    response.raise_for_status = lambda: None
    response.json.return_value = payload
    return response


def kraken_http(asset_pairs=None, ohlc=None):
    """Stub the external Kraken REST API, dispatching by URL path."""
    pairs = asset_pairs if asset_pairs is not None else kraken_asset_pairs()
    candles = ohlc if ohlc is not None else kraken_ohlc()

    def fake_get(url, params=None, timeout=None):
        if url.endswith('/AssetPairs'):
            return fake_response(pairs)
        if url.endswith('/OHLC'):
            return fake_response(candles)
        raise AssertionError(f'Unexpected Kraken URL: {url}')

    return mock.patch('market.providers.kraken.requests.get', side_effect=fake_get)


def yahoo_screen(quotes):
    return mock.patch('market.providers.yahoo.yf.screen', return_value={'quotes': quotes})


def yahoo_search(quotes):
    search = mock.Mock()
    search.quotes = quotes
    return mock.patch('market.providers.yahoo.yf.Search', return_value=search)


class ProviderScenarioTestCase(TestCase):
    """Real config file, real registry, real disk cache; fresh per scenario."""

    def setUp(self):
        self.config_path = registry.CONFIG_PATH.parent / 'config-test.json'
        self.cache_dir = registry.CACHE_DIR.parent / 'cache-test'
        self._orig_config_path = registry.CONFIG_PATH
        self._orig_cache_dir = registry.CACHE_DIR
        registry.CONFIG_PATH = self.config_path
        registry.CACHE_DIR = self.cache_dir / 'providers'
        self.reset_registry_state()

    def tearDown(self):
        self.reset_registry_state()
        registry.CONFIG_PATH = self._orig_config_path
        registry.CACHE_DIR = self._orig_cache_dir

    def reset_registry_state(self):
        registry._config_cache.update({'mtime': None, 'config': None})
        registry._provider_cache.clear()
        registry._catalog_cache.clear()
        self.cache_dir = self.cache_dir.parent / f'cache-test-{self.id()}'
        registry.CACHE_DIR = self.cache_dir / 'providers'

    def given_config(self, providers, provider_order=None):
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(json.dumps({
            'provider_order': provider_order or list(providers),
            'providers': providers,
        }))

    def tearDown(self):
        self.reset_registry_state()
        import shutil
        shutil.rmtree(self.cache_dir, ignore_errors=True)
        self.config_path.unlink(missing_ok=True)
        registry.CONFIG_PATH = self._orig_config_path
        registry.CACHE_DIR = self._orig_cache_dir


class ConfigBehavior(ProviderScenarioTestCase):
    def test_no_config_file_configures_kraken_and_yahoo(self):
        self.assertEqual(registry.get_configured_provider_names(), ['kraken', 'yahoo'])

    def test_malformed_config_falls_back_to_defaults(self):
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text('{ not valid json')
        self.assertEqual(registry.get_configured_provider_names(), ['kraken', 'yahoo'])

    def test_unknown_provider_names_are_ignored(self):
        self.given_config({'yahoo': {}, 'bogus': {}}, provider_order=['bogus', 'yahoo'])
        self.assertEqual(registry.get_configured_provider_names(), ['yahoo'])

    def test_custom_provider_order_is_respected(self):
        self.given_config({'yahoo': {}, 'kraken': {}}, provider_order=['kraken', 'yahoo'])
        self.assertEqual(registry.get_configured_provider_names(), ['kraken', 'yahoo'])

    def test_provider_config_block_reaches_the_provider(self):
        self.given_config({'kraken': {'api_key': 'secret', 'username': 'trader'}})
        provider = registry.get_provider('kraken')
        self.assertIsInstance(provider, KrakenMarketProvider)
        self.assertEqual(provider.config, {'api_key': 'secret', 'username': 'trader'})

    def test_config_change_replaces_cached_provider_instances(self):
        self.given_config({'kraken': {'api_key': 'one'}})
        first = registry.get_provider('kraken')
        self.given_config({'kraken': {'api_key': 'two'}})
        second = registry.get_provider('kraken')
        self.assertIsNot(first, second)
        self.assertEqual(second.config, {'api_key': 'two'})


class KrakenCatalogBehavior(ProviderScenarioTestCase):
    def setUp(self):
        super().setUp()
        self.given_config({'kraken': {}})

    def test_catalog_lists_online_pairs_with_uniform_metadata(self):
        with kraken_http():
            catalog = registry.get_catalog('kraken')
        symbols = [e['symbol'] for e in catalog]
        self.assertIn('XBT/USD', symbols)
        self.assertNotIn('BAD/USD', symbols)
        entry = next(e for e in catalog if e['symbol'] == 'XBT/USD')
        self.assertEqual(entry, {
            'symbol': 'XBT/USD', 'name': 'XBTUSD', 'fullname': 'XBT/USD',
            'type': 'CRYPTOCURRENCY', 'exchange': 'Kraken',
            'sector': 'Cryptocurrency', 'pair_key': 'XXBTZUSD', 'provider': 'kraken',
        })

    def test_catalog_is_cached_on_disk_and_not_refetched(self):
        with kraken_http() as api:
            registry.get_catalog('kraken')
            self.assertEqual(api.call_count, 1)
            registry.get_catalog('kraken')
            self.assertEqual(api.call_count, 1)
        cache_file = registry.CACHE_DIR / 'kraken.json'
        self.assertTrue(cache_file.exists())
        payload = json.loads(cache_file.read_text())
        self.assertEqual(payload['symbols'][0]['symbol'], 'XBT/USD')

    def test_stale_catalog_is_served_when_the_api_is_down(self):
        registry.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        stale = {
            'fetched_at': 0,
            'symbols': [{'symbol': 'XBT/USD', 'provider': 'kraken'}],
        }
        (registry.CACHE_DIR / 'kraken.json').write_text(json.dumps(stale))
        down = mock.patch('market.providers.kraken.requests.get',
                          side_effect=RuntimeError('network down'))
        with down:
            catalog = registry.get_catalog('kraken')
        self.assertEqual(catalog, stale['symbols'])

    def test_search_filters_the_real_catalog(self):
        with kraken_http():
            results = registry.get_provider('kraken').search('xbt')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['symbol'], 'XBT/USD')

    def test_history_maps_kraken_candles_to_ohlcv(self):
        with kraken_http():
            df = registry.get_provider('kraken').get_history('XBT/USD', '1m')
        self.assertEqual(list(df.columns), ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'])
        self.assertAlmostEqual(df.iloc[0]['Close'], 105.0)
        self.assertAlmostEqual(df.iloc[1]['Volume'], 8.0)

    def test_unsupported_interval_returns_no_candles(self):
        with kraken_http():
            self.assertTrue(registry.get_provider('kraken').get_history('XBT/USD', '1mo').empty)


class YahooCatalogBehavior(ProviderScenarioTestCase):
    def setUp(self):
        super().setUp()
        self.given_config({'yahoo': {}})

    def test_catalog_merges_screener_results_with_seeded_symbols(self):
        with yahoo_screen([yahoo_quote('AAPL', 'Apple')]):
            catalog = registry.get_catalog('yahoo')
        entries = {e['symbol']: e for e in catalog}
        self.assertIn('AAPL', entries)
        self.assertEqual(entries['AAPL']['fullname'], 'Apple Inc.')
        self.assertIn('BTC-USD', entries)
        self.assertEqual(entries['BTC-USD']['sector'], 'Cryptocurrency')

    def test_search_returns_uniform_entries_and_persists_them_for_routing(self):
        with kraken_http(), yahoo_search([yahoo_quote('TSLA', 'Tesla')]):
            results = registry.search_all('Tesla')
        self.assertEqual(results[0]['symbol'], 'TSLA')
        self.assertEqual(results[0]['provider'], 'yahoo')
        # a searched symbol becomes resolvable without an explicit provider
        provider, meta = registry.resolve_provider('TSLA')
        self.assertEqual(meta['provider'], 'yahoo')
        cache_file = registry.CACHE_DIR / 'yahoo.json'
        payload = json.loads(cache_file.read_text())
        self.assertIn('TSLA', [e['symbol'] for e in payload['symbols']])


    def test_searched_symbols_survive_a_catalog_refresh(self):
        with yahoo_screen([yahoo_quote('AAPL', 'Apple')]):
            registry.get_catalog('yahoo')
        with yahoo_search([yahoo_quote('JST-USD', 'JST', quote_type='CRYPTOCURRENCY')]):
            registry.search_all('JST')
        provider, meta = registry.resolve_provider('JST-USD')
        self.assertEqual(meta['provider'], 'yahoo')

        # TTL expires: refresh fetches only screener data again, but the
        # searched symbol must still resolve afterwards.
        expired = mock.patch('time.time', return_value=time.time() + 7200)
        with expired, yahoo_screen([yahoo_quote('AAPL', 'Apple')]):
            registry.get_catalog('yahoo')
        provider, meta = registry.resolve_provider('JST-USD')
        self.assertEqual(meta['provider'], 'yahoo')


    def test_worker_with_stale_memory_sees_symbols_another_worker_merged(self):
        # gunicorn runs several worker processes, each with its own memory
        # catalog cache. Worker B serves a chart, warming its memory copy;
        # worker A then merges a searched symbol straight to disk. Worker B's
        # next resolution must pick the merge up instead of 404ing.
        with yahoo_screen([yahoo_quote('AAPL', 'Apple')]):
            registry.get_catalog('yahoo')  # worker B warms its memory copy
        with yahoo_search([yahoo_quote('JST-USD', 'JST', quote_type='CRYPTOCURRENCY')]):
            registry.search_all('JST')     # worker A merges to disk

        provider, meta = registry.resolve_provider('JST-USD')
        self.assertEqual(meta['provider'], 'yahoo')


class SymbolRoutingBehavior(ProviderScenarioTestCase):
    def setUp(self):
        super().setUp()
        self.given_config({'kraken': {}, 'yahoo': {}}, provider_order=['kraken', 'yahoo'])

    def test_first_provider_owning_the_symbol_wins(self):
        with kraken_http():
            provider, meta = registry.resolve_provider('XBT/USD')
        self.assertIsInstance(provider, KrakenMarketProvider)
        self.assertEqual(meta['provider'], 'kraken')

    def test_symbol_missing_from_the_first_provider_falls_to_the_next(self):
        with kraken_http(), yahoo_search([yahoo_quote('AAPL', 'Apple')]):
            registry.search_all('Apple')
        provider, meta = registry.resolve_provider('AAPL')
        self.assertEqual(meta['provider'], 'yahoo')

    def test_unlisted_symbol_is_not_supported(self):
        with kraken_http():
            with self.assertRaises(registry.SymbolNotSupported):
                registry.resolve_provider('NOPE/USD')

    def test_explicit_provider_must_own_the_symbol(self):
        with kraken_http(), yahoo_search([yahoo_quote('AAPL', 'Apple')]):
            registry.search_all('Apple')
            provider, meta = registry.resolve_provider('AAPL', 'yahoo')
            self.assertEqual(meta['provider'], 'yahoo')
            with self.assertRaises(registry.SymbolNotSupported):
                registry.resolve_provider('AAPL', 'kraken')


class HistoryApiBehavior(ProviderScenarioTestCase):
    def test_kraken_candles_reach_the_client_as_lightweight_charts_bars(self):
        self.given_config({'kraken': {}})
        with kraken_http():
            response = self.client.get('/api/history/', {'symbol': 'XBT/USD', 'interval': '1m'})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]['time'], 1600000000)
        self.assertEqual(data[0]['open'], 100.5)
        self.assertEqual(data[0]['high'], 110.0)
        self.assertEqual(data[0]['low'], 95.0)
        self.assertEqual(data[0]['close'], 105.0)
        self.assertEqual(data[0]['volume'], 12.5)

    def test_free_text_symbol_resolves_without_a_prior_search(self):
        # The SMI constituent editor submits bare free-text symbols; the user
        # never searches first. An unknown symbol must self-heal: search once,
        # merge the result into the catalogs, then resolve.
        with kraken_http(), yahoo_search([yahoo_quote('JST-USD', 'JST', quote_type='CRYPTOCURRENCY')]):
            response = self.client.get('/api/history/',
                                       {'symbol': 'JST-USD', 'interval': '1d', 'range': 'max'})
        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(response.json()), 0)

    def test_unsupported_symbol_returns_404(self):
        self.given_config({'kraken': {}})
        with kraken_http():
            response = self.client.get('/api/history/', {'symbol': 'NOPE/USD', 'interval': '1m'})
        self.assertEqual(response.status_code, 404)
        self.assertIn('not supported', response.json()['error'])

    def test_provider_param_selects_the_provider_explicitly(self):
        self.given_config({'kraken': {}})
        with kraken_http():
            response = self.client.get('/api/history/',
                                       {'symbol': 'XBT/USD', 'interval': '1m', 'provider': 'kraken'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]['close'], 105.0)

    def test_unknown_provider_param_returns_400(self):
        self.given_config({'kraken': {}})
        response = self.client.get('/api/history/',
                                   {'symbol': 'XBT/USD', 'interval': '1m', 'provider': 'bogus'})
        self.assertEqual(response.status_code, 400)

    def test_history_without_candles_returns_404(self):
        self.given_config({'kraken': {}})
        with kraken_http(asset_pairs=kraken_asset_pairs(), ohlc={'error': [], 'result': {}}):
            response = self.client.get('/api/history/', {'symbol': 'XBT/USD', 'interval': '1m'})
        self.assertEqual(response.status_code, 404)


class SearchApiBehavior(ProviderScenarioTestCase):
    def test_search_merges_results_across_providers(self):
        self.given_config({'kraken': {}, 'yahoo': {}})
        with kraken_http(), yahoo_search([yahoo_quote('TSLA', 'Tesla')]):
            crypto = self.client.get('/api/search/', {'q': 'xbt'}).json()
            stocks = self.client.get('/api/search/', {'q': 'TSLA'}).json()
        self.assertEqual(crypto[0]['provider'], 'kraken')
        self.assertEqual(stocks[0]['provider'], 'yahoo')

    def test_empty_query_returns_no_results(self):
        self.assertEqual(self.client.get('/api/search/').json(), [])


class SymbolsApiBehavior(ProviderScenarioTestCase):
    def test_symbols_endpoint_returns_the_full_catalog_with_provider(self):
        self.given_config({'kraken': {}})
        with kraken_http():
            response = self.client.get('/api/symbols/', {'provider': 'kraken'})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(all(e['provider'] == 'kraken' for e in data))
        self.assertIn('XBT/USD', [e['symbol'] for e in data])

    def test_symbols_endpoint_without_param_merges_configured_providers(self):
        self.given_config({'kraken': {}, 'yahoo': {}})
        with kraken_http(), yahoo_screen([yahoo_quote('AAPL', 'Apple')]):
            response = self.client.get('/api/symbols/')
        data = response.json()
        providers = {e['provider'] for e in data}
        self.assertEqual(providers, {'kraken', 'yahoo'})

    def test_symbols_endpoint_for_unknown_provider_errors(self):
        response = self.client.get('/api/symbols/', {'provider': 'bogus'})
        self.assertEqual(response.status_code, 500)

class ProviderConfigBehavior(ProviderScenarioTestCase):
    def test_price_decimals_default_to_the_provider_class(self):
        response = self.client.get('/api/providers/config/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'price_decimals': {'kraken': 5, 'yahoo': 2}})

    def test_price_decimals_are_overridable_per_provider(self):
        self.given_config({'kraken': {'price_decimals': 3}, 'yahoo': {'price_decimals': 4}})
        response = self.client.get('/api/providers/config/')
        self.assertEqual(response.json(), {'price_decimals': {'kraken': 3, 'yahoo': 4}})


class IndexMembershipBehavior(TestCase):
    """Constituents HTTP stubbed; inversion, caching and the API endpoint real."""

    CSV = {
        'constituents-sp500.csv': 'Symbol,Name\nAAPL,Apple\nBRK.B,Berkshire\nMSFT,Microsoft\n',
        'constituents-nasdaq100.csv': 'Symbol,Name\nAAPL,Apple\nMSFT,Microsoft\n',
        'constituents-dowjones.csv': 'Symbol,Name\nMSFT,Microsoft\n',
    }

    def setUp(self):
        self._orig_cache_path = index_membership.CACHE_PATH
        index_membership.CACHE_PATH = self._orig_cache_path.parent / f'index-membership-test-{self.id()}.json'
        self._reset()

    def tearDown(self):
        self._reset()
        index_membership.CACHE_PATH.unlink(missing_ok=True)
        index_membership.CACHE_PATH = self._orig_cache_path

    def _reset(self):
        index_membership._cache.update({'fetched_at': None, 'map': None})

    def github_http(self):
        def fake_get(url, timeout=None, headers=None):
            name = url.rsplit('/', 1)[-1]
            response = mock.Mock()
            response.text = self.CSV.get(name, 'Symbol,Name\n')
            response.raise_for_status = lambda: None
            return response
        return mock.patch('market.providers.index_membership.requests.get', side_effect=fake_get)

    def test_memberships_are_inverted_and_normalized(self):
        with self.github_http():
            result = index_membership.memberships_for('aapl')
        self.assertEqual(result, [
            {'code': 'sp500', 'name': 'S&P 500', 'yahoo': '^GSPC'},
            {'code': 'nasdaq100', 'name': 'NASDAQ 100', 'yahoo': '^NDX'},
        ])

    def test_dot_symbols_match_dashed_yahoo_symbols(self):
        with self.github_http():
            self.assertEqual([i['code'] for i in index_membership.memberships_for('BRK-B')], ['sp500'])
            self.assertEqual([i['code'] for i in index_membership.memberships_for('MSFT')],
                             ['sp500', 'nasdaq100', 'dowjones'])

    def test_unknown_symbol_returns_empty(self):
        with self.github_http():
            self.assertEqual(index_membership.memberships_for('NOPE'), [])

    def test_map_is_cached_on_disk_and_not_refetched(self):
        with self.github_http() as api:
            index_membership.memberships_for('AAPL')
            self._reset()
            index_membership.memberships_for('AAPL')
        self.assertEqual(api.call_count, len(index_membership.GitHubIndexConstituentsProvider.INDEXES))
        self.assertTrue(index_membership.CACHE_PATH.exists())

    def test_fetch_failure_serves_stale_cache(self):
        with self.github_http():
            fresh = index_membership.memberships_for('AAPL')
        self._reset()
        with mock.patch('market.providers.index_membership.requests.get', side_effect=RuntimeError('down')):
            self.assertEqual(index_membership.memberships_for('AAPL'), fresh)

    def test_endpoint_returns_memberships(self):
        with self.github_http():
            response = self.client.get('/api/index-membership/', {'symbol': 'AAPL'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'symbol': 'AAPL', 'indexes': [
            {'code': 'sp500', 'name': 'S&P 500', 'yahoo': '^GSPC'},
            {'code': 'nasdaq100', 'name': 'NASDAQ 100', 'yahoo': '^NDX'},
        ]})

    def test_endpoint_requires_symbol(self):
        response = self.client.get('/api/index-membership/')
        self.assertEqual(response.status_code, 400)


class YahooGetInfoBehavior(TestCase):
    """Provider-level get_info() converts yfinance fast_info scalars into
    the flat {shares_outstanding, market_cap} dict the symbol_info layer
    expects. We don't talk to Yahoo here — only to yfinance.Ticker()."""

    def _fast_info(self, shares=None, market_cap=None):
        fast = mock.Mock()
        fast.shares = shares
        fast.market_cap = market_cap
        return fast

    def test_yahoo_get_info_returns_integer_shares_and_market_cap(self):
        provider = YahooMarketProvider()
        with mock.patch.object(provider, '_screener', return_value=[]), \
             mock.patch('market.providers.yahoo.yf.Ticker') as ticker:
            ticker.return_value.fast_info = self._fast_info(shares=15_000_000_000, market_cap=2_500_000_000_000)
            info = provider.get_info('AAPL')
        self.assertEqual(info, {'shares_outstanding': 15_000_000_000, 'market_cap': 2_500_000_000_000})

    def test_yahoo_get_info_handles_missing_fields(self):
        provider = YahooMarketProvider()
        with mock.patch('market.providers.yahoo.yf.Ticker') as ticker:
            ticker.return_value.fast_info = self._fast_info(shares=None, market_cap=None)
            info = provider.get_info('AAPL')
        self.assertEqual(info, {'shares_outstanding': None, 'market_cap': None})

    def test_kraken_get_info_is_empty(self):
        provider = KrakenMarketProvider()
        self.assertEqual(provider.get_info('XBT/USD'), {})


class SymbolInfoBehavior(ProviderScenarioTestCase):
    """Disk-cached fundamentals: Yahoo fast_info is the source, Kraken
    bypasses the cache entirely because it has no fundamentals."""

    def setUp(self):
        super().setUp()
        self._orig_cache_path = symbol_info.CACHE_PATH
        symbol_info.CACHE_PATH = self._orig_cache_path.parent / f'symbol-info-test-{self.id()}.json'
        self._reset()

    def tearDown(self):
        self._reset()
        symbol_info.CACHE_PATH.unlink(missing_ok=True)
        symbol_info.CACHE_PATH = self._orig_cache_path

    def _reset(self):
        symbol_info._inflight.clear()

    def _stub_yahoo(self, **fast_info_kwargs):
        fast = mock.Mock()
        fast.shares = fast_info_kwargs.get('shares')
        fast.market_cap = fast_info_kwargs.get('market_cap')
        info = {'trailingEps': fast_info_kwargs.get('trailing_eps')}
        return mock.patch(
            'market.providers.symbol_info.yf.Ticker',
            return_value=mock.Mock(fast_info=fast, info=info),
        )

    def test_yahoo_info_for_returns_shares_outstanding_and_market_cap(self):
        self.given_config({'yahoo': {}})
        with self._stub_yahoo(shares=15_000_000_000, market_cap=2_500_000_000_000, trailing_eps=6.5):
            info = symbol_info.info_for('AAPL', 'yahoo')
        self.assertEqual(info, {
            'shares_outstanding': 15_000_000_000,
            'market_cap': 2_500_000_000_000,
            'trailing_eps': 6.5,
        })

    def test_yahoo_info_for_handles_missing_trailing_eps(self):
        self.given_config({'yahoo': {}})
        with self._stub_yahoo(shares=15_000_000_000):
            info = symbol_info.info_for('AAPL', 'yahoo')
        self.assertEqual(info['trailing_eps'], None)

    def test_yahoo_info_for_refetches_cache_entries_from_older_schema(self):
        # Entries written before a schema bump (no version tag) lack the new
        # fields; they must be treated as expired and refetched.
        self.given_config({'yahoo': {}})
        symbol_info._write_disk_cache({
            'fetched_at': time.time(),
            'entries': {'AAPL|yahoo_fast_info': {
                'fetched_at': time.time(),
                'info': {'shares_outstanding': 1, 'market_cap': 2},
            }},
        })
        with self._stub_yahoo(shares=15_000_000_000, market_cap=2_500_000_000_000, trailing_eps=6.5) as ticker:
            info = symbol_info.info_for('AAPL', 'yahoo')
            self.assertEqual(ticker.call_count, 1)
        self.assertEqual(info, {
            'shares_outstanding': 15_000_000_000,
            'market_cap': 2_500_000_000_000,
            'trailing_eps': 6.5,
        })

    def test_yahoo_info_for_is_cached_on_disk_and_not_refetched(self):
        self.given_config({'yahoo': {}})
        with self._stub_yahoo(shares=15_000_000_000) as ticker:
            symbol_info.info_for('AAPL', 'yahoo')
            self.assertEqual(ticker.call_count, 1)
            symbol_info.info_for('AAPL', 'yahoo')
            self.assertEqual(ticker.call_count, 1)
        self.assertTrue(symbol_info.CACHE_PATH.exists())

    def test_yahoo_fetch_failure_serves_stale_cache(self):
        self.given_config({'yahoo': {}})
        with self._stub_yahoo(shares=15_000_000_000):
            fresh = symbol_info.info_for('AAPL', 'yahoo')
        self._reset()
        broken = mock.patch('market.providers.symbol_info.yf.Ticker', side_effect=RuntimeError('down'))
        with broken:
            self.assertEqual(symbol_info.info_for('AAPL', 'yahoo'), fresh)

    def test_kraken_info_for_is_empty_without_touching_yahoo(self):
        self.given_config({'kraken': {}})
        with mock.patch('market.providers.symbol_info.yf.Ticker') as ticker:
            info = symbol_info.info_for('XBT/USD', 'kraken')
            ticker.assert_not_called()
        self.assertEqual(info, {})


class SymbolInfoApiBehavior(ProviderScenarioTestCase):
    def setUp(self):
        super().setUp()
        self._orig_cache_path = symbol_info.CACHE_PATH
        symbol_info.CACHE_PATH = self._orig_cache_path.parent / f'symbol-info-api-{self.id()}.json'
        symbol_info._inflight.clear()

    def tearDown(self):
        symbol_info._inflight.clear()
        symbol_info.CACHE_PATH.unlink(missing_ok=True)
        symbol_info.CACHE_PATH = self._orig_cache_path

    def _stub_yahoo(self, shares, market_cap, trailing_eps=6.5):
        fast = mock.Mock(shares=shares, market_cap=market_cap)
        ticker = mock.Mock(fast_info=fast, info={'trailingEps': trailing_eps})
        return mock.patch('market.providers.symbol_info.yf.Ticker', return_value=ticker)

    def test_endpoint_returns_yahoo_fundamentals(self):
        self.given_config({'yahoo': {}})
        with self._stub_yahoo(shares=15_000_000_000, market_cap=2_500_000_000_000, trailing_eps=6.5):
            response = self.client.get('/api/symbol/info/', {'symbol': 'AAPL', 'provider': 'yahoo'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'symbol': 'AAPL',
            'provider': 'yahoo',
            'shares_outstanding': 15_000_000_000,
            'market_cap': 2_500_000_000_000,
            'trailing_eps': 6.5,
        })

    def test_endpoint_returns_empty_dict_for_kraken(self):
        self.given_config({'kraken': {}})
        response = self.client.get('/api/symbol/info/', {'symbol': 'XBT/USD', 'provider': 'kraken'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'symbol': 'XBT/USD', 'provider': 'kraken'})

    def test_endpoint_requires_symbol(self):
        response = self.client.get('/api/symbol/info/')
        self.assertEqual(response.status_code, 400)

    def test_endpoint_404_for_unsupported_symbol(self):
        self.given_config({'yahoo': {}})
        response = self.client.get('/api/symbol/info/', {'symbol': 'NOPE'})
        self.assertEqual(response.status_code, 404)


class EarningsBehavior(ProviderScenarioTestCase):
    """Disk-cached quarterly earnings: Yahoo earnings_dates is the source,
    Kraken returns an empty list because crypto has no earnings."""
    def setUp(self):
        super().setUp()
        self._orig_cache_path = earnings.CACHE_PATH
        earnings.CACHE_PATH = self._orig_cache_path.parent / f'symbol-earnings-{self.id()}.json'
        earnings._inflight.clear()

    def tearDown(self):
        earnings._inflight.clear()
        earnings.CACHE_PATH.unlink(missing_ok=True)
        earnings.CACHE_PATH = self._orig_cache_path

    def _stub_yahoo(self, rows):
        # rows: [(report_date, estimate, actual, surprise)] in the raw
        # yfinance column order.
        frame = pd.DataFrame(
            {
                'EPS Estimate': [r[1] for r in rows],
                'Reported EPS': [r[2] for r in rows],
                'Surprise(%)': [r[3] for r in rows],
            },
            index=pd.DatetimeIndex([r[0] for r in rows], name='Earnings Date'),
        )
        ticker = mock.Mock()
        ticker.get_earnings_dates.return_value = frame
        return mock.patch('market.providers.earnings.yf.Ticker', return_value=ticker)

    def test_yahoo_earnings_for_returns_sorted_quarters_with_none_for_unreported(self):
        self.given_config({'yahoo': {}})
        with self._stub_yahoo([
            ('2024-04-30', 1.0, 1.2, 20.0),
            ('2024-01-30', 1.0, 0.9, -10.0),
            ('2024-07-30', 1.1, None, None),
        ]) as ticker:
            result = earnings.earnings_for('AAPL', 'yahoo')
            self.assertEqual(ticker.return_value.get_earnings_dates.call_count, 1)
        self.assertEqual(result, {'quarters': [
            {'date': '2024-01-30', 'eps_estimate': 1.0, 'eps_actual': 0.9, 'surprise_pct': -10.0},
            {'date': '2024-04-30', 'eps_estimate': 1.0, 'eps_actual': 1.2, 'surprise_pct': 20.0},
            {'date': '2024-07-30', 'eps_estimate': 1.1, 'eps_actual': None, 'surprise_pct': None},
        ]})

    def test_yahoo_earnings_for_is_cached_on_disk_and_not_refetched(self):
        self.given_config({'yahoo': {}})
        with self._stub_yahoo([('2024-01-30', 1.0, 1.2, 20.0)]) as ticker:
            earnings.earnings_for('AAPL', 'yahoo')
            self.assertEqual(ticker.return_value.get_earnings_dates.call_count, 1)
            earnings.earnings_for('AAPL', 'yahoo')
            self.assertEqual(ticker.return_value.get_earnings_dates.call_count, 1)
        self.assertTrue(earnings.CACHE_PATH.exists())

    def test_kraken_earnings_for_is_empty_without_touching_yahoo(self):
        self.given_config({'kraken': {}})
        with mock.patch('market.providers.earnings.yf.Ticker') as ticker:
            result = earnings.earnings_for('XBT/USD', 'kraken')
            ticker.assert_not_called()
        self.assertEqual(result, {'quarters': []})


class EarningsApiBehavior(ProviderScenarioTestCase):
    def setUp(self):
        super().setUp()
        self._orig_cache_path = earnings.CACHE_PATH
        earnings.CACHE_PATH = self._orig_cache_path.parent / f'symbol-earnings-api-{self.id()}.json'
        earnings._inflight.clear()

    def tearDown(self):
        earnings._inflight.clear()
        earnings.CACHE_PATH.unlink(missing_ok=True)
        earnings.CACHE_PATH = self._orig_cache_path

    def test_endpoint_returns_yahoo_earnings(self):
        self.given_config({'yahoo': {}})
        frame = pd.DataFrame(
            {
                'EPS Estimate': [1.0],
                'Reported EPS': [1.2],
                'Surprise(%)': [20.0],
            },
            index=pd.DatetimeIndex(['2024-04-30'], name='Earnings Date'),
        )
        ticker = mock.Mock()
        ticker.get_earnings_dates.return_value = frame
        with mock.patch('market.providers.earnings.yf.Ticker', return_value=ticker):
            response = self.client.get('/api/symbol/earnings/', {'symbol': 'AAPL', 'provider': 'yahoo'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'symbol': 'AAPL',
            'provider': 'yahoo',
            'quarters': [
                {'date': '2024-04-30', 'eps_estimate': 1.0, 'eps_actual': 1.2, 'surprise_pct': 20.0},
            ],
        })

    def test_endpoint_returns_empty_list_for_kraken(self):
        self.given_config({'kraken': {}})
        response = self.client.get('/api/symbol/earnings/', {'symbol': 'XBT/USD', 'provider': 'kraken'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'symbol': 'XBT/USD', 'provider': 'kraken', 'quarters': []})

    def test_endpoint_requires_symbol(self):
        response = self.client.get('/api/symbol/earnings/')
        self.assertEqual(response.status_code, 400)
