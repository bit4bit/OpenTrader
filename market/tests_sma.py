"""Behavior-driven tests for the SMA over chart bars.

Pure scenarios: the mean-per-candle contract, warmup from candles before
the window, source rules shared with the frontend, and nulls when the
warmup is incomplete or a source lacks wicks. View scenarios run the
real stack (real registry, real disk cache, scripted provider) so the
endpoint is proven to answer over the same cached history /api/history/
serves.
"""
import time
from datetime import datetime, timezone

from django.test import TestCase
import pandas as pd

from market import history_store, sma
from market.sma import sma_series, source_value
from market.tests import ProviderScenarioTestCase, yahoo_quote, yahoo_screen, mock

DAY = 86400
NOW = int(time.time())
TODAY = NOW - NOW % DAY


def rows(stamps, closes, highs=None, lows=None):
    highs = highs or [close + 10 for close in closes]
    lows = lows or [close - 10 for close in closes]
    return [
        {'time': stamp, 'open': close - 1, 'high': high, 'low': low,
         'close': close, 'volume': 1000.0}
        for stamp, close, high, low in zip(stamps, closes, highs, lows)
    ]


def daily_frame(stamps, closes):
    return pd.DataFrame({
        'Date': [pd.Timestamp(stamp, unit='s', tz='UTC') for stamp in stamps],
        'Open': [close - 1 for close in closes],
        'High': [close + 10 for close in closes],
        'Low': [close - 10 for close in closes],
        'Close': closes,
        'Volume': [1000.0] * len(closes),
    })


class PureBehavior(TestCase):
    def test_sma_is_the_mean_of_the_period_candles_ending_at_it(self):
        stamps = [TODAY - day * DAY for day in range(4, -1, -1)]
        bars = rows(stamps, [100.0, 101.0, 102.0, 104.0, 108.0])
        result = sma_series(bars, 3, stamps[2], stamps[-1])
        self.assertEqual([v['sma'] for v in result['values']],
                         [101.0, 307.0 / 3, 104.0 + 2.0 / 3])

    def test_warmup_pulls_candles_before_the_window(self):
        stamps = [TODAY - day * DAY for day in range(4, -1, -1)]
        bars = rows(stamps, [100.0, 101.0, 102.0, 104.0, 108.0])
        result = sma_series(bars, 2, stamps[1], stamps[2])
        self.assertEqual(result['values'],
                         [{'time': stamps[1], 'sma': 100.5},
                          {'time': stamps[2], 'sma': 101.5}])

    def test_incomplete_warmup_reports_nulls_not_fewer_candles(self):
        stamps = [TODAY - DAY, TODAY]
        bars = rows(stamps, [100.0, 102.0])
        result = sma_series(bars, 2, stamps[0], stamps[-1])
        self.assertEqual(len(result['values']), 2)
        self.assertIsNone(result['values'][0]['sma'])
        self.assertEqual(result['values'][1]['sma'], 101.0)

    def test_composite_sources_follow_the_frontend_rule(self):
        bar = {'open': 10.0, 'high': 20.0, 'low': 8.0, 'close': 12.0, 'volume': 100.0}
        self.assertEqual(source_value(bar, 'hl2'), 14.0)
        self.assertEqual(source_value(bar, 'hlc3'), 40.0 / 3)
        self.assertEqual(source_value(bar, 'ohlc4'), 12.5)
        self.assertEqual(source_value(bar, 'volume'), 100.0)

    def test_error_scenarios(self):
        stamps = [TODAY - DAY, TODAY]
        bars = rows(stamps, [100.0, 102.0])
        with self.assertRaisesRegex(ValueError, 'Unknown source'):
            sma_series(bars, 2, stamps[0], stamps[-1], source='adjclose')
        with self.assertRaisesRegex(ValueError, 'number of candles'):
            sma_series(bars, 0, stamps[0], stamps[-1])
        with self.assertRaisesRegex(ValueError, 'end is before start'):
            sma_series(bars, 2, stamps[1], stamps[0])
        with self.assertRaisesRegex(ValueError, 'No candles in range'):
            sma_series([], 2, stamps[0], stamps[-1])
        with self.assertRaisesRegex(ValueError, 'No candle at or before'):
            sma_series(bars, 2, stamps[0] - DAY, stamps[-1])


class ViewBehaviour(ProviderScenarioTestCase):
    def setUp(self):
        super().setUp()
        self.stamps = [TODAY - day * DAY for day in range(2, -1, -1)]

    def mocked_yahoo(self, closes):
        frame = daily_frame(self.stamps, closes)
        return mock.patch('market.providers.yahoo.yf.Ticker',
                          return_value=mock.Mock(history=mock.Mock(return_value=frame)))

    def test_lists_sma_values_over_the_window(self):
        self.given_config({'yahoo': {}})
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             self.mocked_yahoo([100.0, 103.0, 106.0]):
            response = self.client.get(
                '/api/sma/',
                {'symbol': 'RBRK', 'interval': '1d', 'period': 2,
                 'start': self.stamps[1], 'end': self.stamps[-1]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['source'], 'close')
        self.assertEqual(data['anchorStart'], self.stamps[1])
        self.assertEqual([v['sma'] for v in data['values']],
                         [101.5, 104.5])
        self.assertEqual(data['latest'], {'time': TODAY, 'sma': 104.5})

    def test_missing_period_rejected(self):
        self.given_config({'yahoo': {}})
        response = self.client.get(
            '/api/sma/', {'symbol': 'RBRK', 'start': TODAY, 'end': TODAY})
        self.assertEqual(response.status_code, 400)

    def test_answers_from_the_chart_cache_without_the_provider(self):
        self.given_config({'yahoo': {}})
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             self.mocked_yahoo([100.0, 103.0, 106.0]):
            warm = self.client.get(
                '/api/history/', {'symbol': 'RBRK', 'interval': '1d', 'range': '1y'})
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker', side_effect=RuntimeError('429')):
            measured = self.client.get(
                '/api/sma/',
                {'symbol': 'RBRK', 'interval': '1d', 'period': 2,
                 'start': self.stamps[1], 'end': self.stamps[-1]})
        self.assertEqual(warm.status_code, 200)
        self.assertEqual(measured.status_code, 200)
        self.assertEqual([v['sma'] for v in measured.json()['values']],
                         [101.5, 104.5])

    def test_warmup_grows_until_period_candles_exist_without_the_provider(self):
        self.given_config({'yahoo': {}})
        stamps = [TODAY - day * DAY for day in range(15, -1, -1)]
        week = [stamp for stamp in stamps
                if datetime.fromtimestamp(stamp, tz=timezone.utc).weekday() < 5]
        closes = [100.0 + i for i in range(len(week))]
        history_store.upsert_bars('yahoo', 'RBRK', '1d', [
            {'time': stamp, 'open': close - 1, 'high': close + 1,
             'low': close - 2, 'close': close, 'volume': 1000.0}
            for stamp, close in zip(week, closes)])
        history_store.record_coverage('yahoo', 'RBRK', '1d', stamps[0], TODAY)
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker', side_effect=RuntimeError('429')):
            response = self.client.get(
                '/api/sma/', {'symbol': 'RBRK', 'interval': '1d', 'period': 5,
                              'start': TODAY - 2 * DAY, 'end': TODAY})
        self.assertEqual(response.status_code, 200)
        values = response.json()['values']
        window = [i for i, stamp in enumerate(week) if stamp >= TODAY - 4 * DAY]
        self.assertTrue(all(v['sma'] is not None for v in values))
        self.assertEqual([v['sma'] for v in values],
                         [sum(closes[i - 4:i + 1]) / 5 for i in window])
