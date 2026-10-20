"""Behavior-driven tests for session quote strips.

Given/When/Then scenarios exercised through the real stack:
- a Yahoo symbol returns current price, day change vs previous close,
  week/month/quarter change vs the last close before the current week/
  month/quarter, volume change vs the 10-day average, and the 52-week
  range (fast_info + daily history);
- quotes are served from a short-TTL disk cache (unlike the 24h
  fundamentals cache, prices must stay near-live);
- a Kraken (crypto) symbol has no quote source and returns empty fields;
- an unsupported symbol degrades to empty fields instead of failing the
  whole batch;
- the show_session_quotes preference defaults to off and persists.
Only the external boundary is stubbed: Yahoo's yf.Ticker.
"""
import datetime
import json
import time
from datetime import timezone
from unittest import mock

import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.authtoken.models import Token

from market.providers import quote, symbol_info
from market.tests import ProviderScenarioTestCase, fake_response, kraken_asset_pairs, kraken_futures_instruments


def daily_closes(days=500):
    """Calendar-daily close series ending today. Deliberately non-monotonic
    (an alternating bump): a `max(close)` anchor scan would pick an unrelated
    peak and the expected last-close-by-date anchors diverge from it."""
    today = datetime.date.today()
    dates = [today - datetime.timedelta(days=offset) for offset in range(days, -1, -1)]
    closes = [100.0 + 3.0 * index + (index % 2) * 500.0 for index in range(len(dates))]
    return dates, closes


def last_close_before(dates, closes, start):
    before = [(date, close) for date, close in zip(dates, closes) if date < start]
    return before[-1][1]


def daily_frame(days=500):
    dates, closes = daily_closes(days)
    return pd.DataFrame({'Close': closes}, index=pd.DatetimeIndex(dates))


def period_starts(today):
    week_start = today - datetime.timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    quarter_start = today.replace(day=1, month=(today.month - 1) // 3 * 3 + 1)
    return week_start, month_start, quarter_start

def stub_yahoo(frame=None, **kwargs):
    fast = mock.Mock(
        last_price=kwargs.get('price', 151.25),
        previous_close=kwargs.get('previous_close', 150.0),
        last_volume=kwargs.get('volume', 40_000_000),
        ten_day_average_volume=kwargs.get('avg_volume', 50_000_000),
        year_high=kwargs.get('year_high', 182.0),
        year_low=kwargs.get('year_low', 120.0),
    )
    ticker = mock.Mock(fast_info=fast)
    if frame is not None:
        ticker.history.return_value = frame
    return mock.patch('market.providers.quote.yf.Ticker', return_value=ticker)


KRAKEN_TICKER_FIXTURE = {'error': [], 'result': {'XXBTZUSD': {'c': ['151.25', '0.01'], 'v': ['10.0', '11.0']}}}


def crypto_bars(dates, closes):
    """(date, high, low, close, volume) per calendar day: high/low hug the
    close, volume cycles 10/11/12."""
    return [
        (date, close + 2, close - 2, close, 10.0 + (index % 3))
        for index, (date, close) in enumerate(zip(dates, closes))
    ]


def stub_kraken_http(bars):
    """Stub the Kraken public REST API (catalog, Ticker, daily OHLC) for the
    XBT/USD pair, with the fixture bars rendered as 12:00-UTC daily rows."""
    rows = [
        [int(datetime.datetime(date.year, date.month, date.day, 12, tzinfo=timezone.utc).timestamp()),
         str(close - 1), str(high), str(low), str(close), str(close), str(volume), 100]
        for (date, high, low, close, volume) in bars
    ]

    def fake_get(url, params=None, timeout=None):
        if url.endswith('/AssetPairs'):
            return fake_response(kraken_asset_pairs())
        if url.endswith('/Ticker'):
            return fake_response(KRAKEN_TICKER_FIXTURE)
        if url.endswith('/OHLC'):
            return fake_response({'error': [], 'result': {'XXBTZUSD': rows, 'last': rows[-1][0]}})
        raise AssertionError(f'Unexpected Kraken URL: {url} {params}')

    return mock.patch('market.providers.kraken.requests.get', side_effect=fake_get)


def stub_kraken_futures_http(bars):
    """Stub the Kraken Futures REST API (instruments + daily candles)."""
    candles = [
        {'time': int(datetime.datetime(date.year, date.month, date.day, 12, tzinfo=timezone.utc).timestamp() * 1000),
         'open': str(close - 1), 'high': str(high), 'low': str(low),
         'close': str(close), 'volume': str(volume)}
        for (date, high, low, close, volume) in bars
    ]

    def fake_get(url, params=None, timeout=None):
        if url.endswith('/instruments'):
            return fake_response(kraken_futures_instruments())
        if '/api/charts/v1/trade/' in url:
            return fake_response({'candles': candles})
        raise AssertionError(f'Unexpected Kraken Futures URL: {url}')

    return mock.patch('market.providers.kraken_futures.requests.get', side_effect=fake_get)


class QuoteBehavior(ProviderScenarioTestCase):
    def setUp(self):
        super().setUp()
        self._orig_cache_path = quote.CACHE_PATH
        quote.CACHE_PATH = self._orig_cache_path.parent / f'quote-test-{self.id()}.json'
        self._reset()

    def tearDown(self):
        self._reset()
        quote.CACHE_PATH.unlink(missing_ok=True)
        quote.CACHE_PATH = self._orig_cache_path

    def _reset(self):
        quote._inflight.clear()

    def test_yahoo_quote_for_returns_full_quote_fields(self):
        self.given_config({'yahoo': {}})
        frame = daily_frame()
        dates = list(frame.index.date)
        prices = list(frame['Close'])
        week_start, month_start, quarter_start = period_starts(datetime.date.today())
        with stub_yahoo(price=151.25, previous_close=150.0, volume=40_000_000,
                        avg_volume=50_000_000, year_high=182.0, year_low=120.0, frame=frame):
            entry = quote.quote_for('AAPL', 'yahoo')
        self.assertEqual(entry, {
            'price': 151.25,
            'previous_close': 150.0,
            'day_change': 1.25,
            'day_change_pct': 0.833,
            'week_change': round(151.25 - last_close_before(dates, prices, week_start), 6),
            'week_change_pct': round(
                (151.25 - last_close_before(dates, prices, week_start))
                / last_close_before(dates, prices, week_start) * 100, 3),
            'month_change': round(151.25 - last_close_before(dates, prices, month_start), 6),
            'month_change_pct': round(
                (151.25 - last_close_before(dates, prices, month_start))
                / last_close_before(dates, prices, month_start) * 100, 3),
            'quarter_change': round(151.25 - last_close_before(dates, prices, quarter_start), 6),
            'quarter_change_pct': round(
                (151.25 - last_close_before(dates, prices, quarter_start))
                / last_close_before(dates, prices, quarter_start) * 100, 3),
            'volume': 40_000_000,
            'volume_change_pct': -20.0,
            'year_high': 182.0,
            'year_low': 120.0,
        })

    def test_yahoo_quote_for_handles_missing_fields(self):
        self.given_config({'yahoo': {}})
        with stub_yahoo(price=151.25, previous_close=None, volume=None, avg_volume=None,
                        year_high=None, year_low=None):
            entry = quote.quote_for('AAPL', 'yahoo')
        self.assertEqual(entry, {
            'price': 151.25,
            'previous_close': None,
            'day_change': None,
            'day_change_pct': None,
            'week_change': None,
            'week_change_pct': None,
            'month_change': None,
            'month_change_pct': None,
            'quarter_change': None,
            'quarter_change_pct': None,
            'volume': None,
            'volume_change_pct': None,
            'year_high': None,
            'year_low': None,
        })

    def test_yahoo_quote_for_survives_a_history_fetch_failure(self):
        self.given_config({'yahoo': {}})
        with stub_yahoo(price=151.25, previous_close=150.0) as ticker:
            ticker.history.side_effect = RuntimeError('down')
            entry = quote.quote_for('AAPL', 'yahoo')
        self.assertEqual(entry['day_change'], 1.25)
        self.assertIsNone(entry['week_change'])
        self.assertIsNone(entry['month_change'])
        self.assertIsNone(entry['quarter_change'])

    def test_kraken_quote_for_combines_ticker_price_and_daily_history(self):
        self.given_config({'kraken': {}})
        dates, closes = daily_closes()
        bars = crypto_bars(dates, closes)
        with stub_yahoo() as yahoo_ticker, stub_kraken_http(bars):
            entry = quote.quote_for('XBT/USD', 'kraken')
            yahoo_ticker.assert_not_called()
        ticker_price = 151.25
        avg = sum(bar[4] for bar in bars[-10:]) / 10
        self.assertEqual(entry['price'], ticker_price)
        self.assertEqual(entry['previous_close'], closes[-2])
        self.assertEqual(entry['day_change'], round(ticker_price - closes[-2], 6))
        self.assertEqual(entry['day_change_pct'], round((ticker_price - closes[-2]) / closes[-2] * 100, 3))
        week_start, month_start, quarter_start = period_starts(datetime.date.today())
        for name, start in (('week', week_start), ('month', month_start), ('quarter', quarter_start)):
            anchor = last_close_before(dates, closes, start)
            self.assertEqual(entry[f'{name}_change'], round(ticker_price - anchor, 6))
            self.assertEqual(entry[f'{name}_change_pct'], round((ticker_price - anchor) / anchor * 100, 3))
        year_start = datetime.date.today() - datetime.timedelta(days=365)
        self.assertEqual(entry['year_high'], max(bar[1] for bar in bars if bar[0] >= year_start))
        self.assertEqual(entry['year_low'], min(bar[2] for bar in bars if bar[0] >= year_start))
        self.assertEqual(entry['volume'], 11.0)
        self.assertEqual(entry['volume_change_pct'], round((11.0 - avg) / avg * 100, 3))

    def test_kraken_quote_for_survives_an_api_failure(self):
        self.given_config({'kraken': {}})
        with mock.patch('market.providers.kraken.requests.get', side_effect=RuntimeError('down')):
            entry = quote.quote_for('XBT/USD', 'kraken')
        self.assertEqual(entry, {})

    def test_kraken_futures_quote_for_uses_daily_candles(self):
        self.given_config({'kraken_futures': {}})
        dates, closes = daily_closes()
        bars = crypto_bars(dates, closes)
        with stub_kraken_futures_http(bars), stub_yahoo() as yahoo_ticker:
            entry = quote.quote_for('PF_XBTUSD', 'kraken_futures')
            yahoo_ticker.assert_not_called()
        self.assertEqual(entry['price'], closes[-1])
        self.assertEqual(entry['previous_close'], closes[-2])
        self.assertEqual(entry['volume'], bars[-1][4])

    def test_yahoo_quote_for_is_cached_in_a_short_window_and_not_refetched(self):
        self.given_config({'yahoo': {}})
        with stub_yahoo() as ticker:
            quote.quote_for('AAPL', 'yahoo')
            self.assertEqual(ticker.call_count, 1)
            quote.quote_for('AAPL', 'yahoo')
            self.assertEqual(ticker.call_count, 1)  # fresh cache: no refetch

    def test_yahoo_quote_for_refetches_after_the_ttl_lapses(self):
        self.given_config({'yahoo': {}})
        # quote_cache_ttl is a top-level config key, next to provider_order.
        config = json.loads(self.config_path.read_text())
        config['quote_cache_ttl'] = 0
        self.config_path.write_text(json.dumps(config))
        with stub_yahoo() as ticker:
            quote.quote_for('AAPL', 'yahoo')
            self.assertEqual(ticker.call_count, 1)
            quote.quote_for('AAPL', 'yahoo')
            self.assertEqual(ticker.call_count, 2)  # ttl=0: next call refetches

    def test_yahoo_quote_for_refetches_cache_entries_from_older_schema(self):
        self.given_config({'yahoo': {}})
        quote._write_disk_cache({
            'fetched_at': time.time(),
            'entries': {'AAPL|yahoo_fast_info': {
                'fetched_at': time.time(),
                'quote': {'price': 1.0},
            }},
        })
        with stub_yahoo() as ticker:
            entry = quote.quote_for('AAPL', 'yahoo')
            self.assertEqual(ticker.call_count, 1)
        self.assertEqual(entry['price'], 151.25)

    def test_yahoo_fetch_failure_serves_stale_cache(self):
        self.given_config({'yahoo': {}})
        with stub_yahoo():
            fresh = quote.quote_for('AAPL', 'yahoo')
        self._reset()
        with mock.patch('market.providers.quote.yf.Ticker', side_effect=RuntimeError('down')):
            self.assertEqual(quote.quote_for('AAPL', 'yahoo'), fresh)


class QuoteApiBehavior(ProviderScenarioTestCase):
    """GET /api/symbol/quote/ is a batch endpoint: the session manager
    asks for every distinct symbol of the current view at once."""

    def setUp(self):
        super().setUp()
        self._orig_cache_path = quote.CACHE_PATH
        quote.CACHE_PATH = self._orig_cache_path.parent / f'quote-api-{self.id()}.json'
        quote._inflight.clear()

    def tearDown(self):
        quote._inflight.clear()
        quote.CACHE_PATH.unlink(missing_ok=True)
        quote.CACHE_PATH = self._orig_cache_path

    def test_endpoint_returns_quotes_for_a_symbol_list(self):
        self.given_config({'yahoo': {}, 'kraken': {}})
        dates, closes = daily_closes()
        bars = crypto_bars(dates, closes)
        with stub_yahoo(), stub_kraken_http(bars):
            response = self.client.get('/api/symbol/quote/', {'symbols': 'AAPL,XBT/USD'})
        self.assertEqual(response.status_code, 200)
        quotes = {entry['symbol']: entry for entry in response.json()}
        self.assertEqual(quotes['AAPL'], {
            'symbol': 'AAPL', 'provider': 'yahoo',
            'price': 151.25, 'previous_close': 150.0,
            'day_change': 1.25, 'day_change_pct': 0.833,
            'week_change': None, 'week_change_pct': None,
            'month_change': None, 'month_change_pct': None,
            'quarter_change': None, 'quarter_change_pct': None,
            'volume': 40_000_000, 'volume_change_pct': -20.0,
            'year_high': 182.0, 'year_low': 120.0,
        })
        self.assertEqual(quotes['XBT/USD']['provider'], 'kraken')
        self.assertEqual(quotes['XBT/USD']['price'], 151.25)
        self.assertEqual(quotes['XBT/USD']['previous_close'], closes[-2])

    def test_endpoint_accepts_repeated_symbols_parameters(self):
        self.given_config({'yahoo': {}})
        with stub_yahoo():
            response = self.client.get('/api/symbol/quote/', {'symbols': ['AAPL', 'MSFT']})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([entry['symbol'] for entry in response.json()], ['AAPL', 'MSFT'])

    def test_endpoint_degrades_unsupported_symbols_to_empty_fields(self):
        self.given_config({'yahoo': {}})
        with stub_yahoo():
            response = self.client.get('/api/symbol/quote/', {'symbols': 'NOPE,AAPL'})
        self.assertEqual(response.status_code, 200)
        quotes = {entry['symbol']: entry for entry in response.json()}
        self.assertIsNone(quotes['NOPE']['price'])
        self.assertEqual(quotes['AAPL']['price'], 151.25)

    def test_endpoint_requires_symbols(self):
        response = self.client.get('/api/symbol/quote/')
        self.assertEqual(response.status_code, 400)

    def test_endpoint_ignores_an_unresolved_symbol_by_deduplicating(self):
        self.given_config({'yahoo': {}})
        with stub_yahoo() as ticker:
            self.client.get('/api/symbol/quote/', {'symbols': 'AAPL'})
            self.client.get('/api/symbol/quote/', {'symbols': 'AAPL'})
            self.assertEqual(ticker.call_count, 1)  # cached across requests


class SessionQuotesPreferenceTests(TestCase):
    """The Show quotes option is a per-user preference persisted on
    UserPreference, disabled by default."""

    def setUp(self):
        self.user = User.objects.create(username='alice')
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {Token.objects.create(user=self.user).key}'

    def test_show_session_quotes_defaults_to_off(self):
        response = self.client.get('/api/preferences/')
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()['show_session_quotes'], False)

    def test_show_session_quotes_persists_via_patch(self):
        response = self.client.patch('/api/preferences/', {'show_session_quotes': True},
                                     content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()['show_session_quotes'], True)
        self.assertIs(self.user.preference.show_session_quotes, True)
