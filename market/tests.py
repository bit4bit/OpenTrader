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

from django.test import TestCase

from market.providers import registry
from market.providers import index_membership
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
