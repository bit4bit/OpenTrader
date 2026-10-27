"""Behavior-driven tests for candle crossings of a horizontal price line.

Pure scenarios for the span rule (touch included, missing wicks degrade
to the close) and the /api/line-crosses/ view over the real stack, so the
endpoint is proven to answer over the same cached history /api/history/
serves.
"""
import time

from django.test import TestCase
import pandas as pd

from market import candle_crossings
from market.candle_crossings import crossing_candles
from market.tests import ProviderScenarioTestCase, yahoo_quote, yahoo_screen, mock

DAY = 86400
NOW = int(time.time())
TODAY = NOW - NOW % DAY


def rows(stamps, lows, highs, closes, volumes):
    return [
        {'time': stamp, 'open': low, 'high': high, 'low': low,
         'close': close, 'volume': volume}
        for stamp, low, high, close, volume in zip(stamps, lows, highs, closes, volumes)
    ]


def daily_frame(stamps, lows, highs, closes):
    return pd.DataFrame({
        'Date': [pd.Timestamp(stamp, unit='s', tz='UTC') for stamp in stamps],
        'Open': lows,
        'High': highs,
        'Low': lows,
        'Close': closes,
        'Volume': [1000.0] * len(closes),
    })


class CrossingBehavior(TestCase):
    def setUp(self):
        self.stamps = [TODAY - day * DAY for day in range(2, -1, -1)]
        self.bars = rows(self.stamps, [99.0, 100.0, 110.0], [101.0, 104.0, 111.0],
                         [100.0, 103.0, 110.5], [10, 20, 30])

    def test_returns_only_candles_whose_span_contains_the_price(self):
        result = crossing_candles(
            self.bars, 101.0, self.stamps[0], self.stamps[-1])
        self.assertEqual(result['candleCount'], 2)
        self.assertEqual([c['time'] for c in result['candles']],
                         self.stamps[:2])
        self.assertFalse(self.stamps[-1] in [c['time'] for c in result['candles']])
        self.assertAlmostEqual(result['avgVolume'], 15.0)

    def test_a_touch_exactly_on_a_wick_crosses(self):
        result = crossing_candles(
            self.bars, 104.0, self.stamps[0], self.stamps[-1])
        self.assertEqual(result['candleCount'], 1)
        self.assertEqual(result['candles'][0]['time'], self.stamps[1])

    def test_window_bounds_and_anchors(self):
        result = crossing_candles(
            self.bars, 103.0, self.stamps[0] + 12 * 3600, self.stamps[-1])
        self.assertEqual(result['anchorStart'], self.stamps[0])
        self.assertEqual(result['anchorEnd'], self.stamps[-1])
        self.assertEqual(result['candles'][0]['time'], self.stamps[1])

    def test_candles_without_wicks_cross_only_on_their_close(self):
        point_on_line = {'time': TODAY, 'open': None, 'high': None,
                         'low': None, 'close': 108.0, 'volume': 5}
        across = crossing_candles([point_on_line], 108.0, TODAY, TODAY)
        besides = crossing_candles([point_on_line], 108.01, TODAY, TODAY)
        self.assertEqual(across['candleCount'], 1)
        self.assertEqual(besides['candleCount'], 0)
        self.assertIsNone(besides['avgVolume'])

    def test_error_scenarios(self):
        with self.assertRaisesRegex(ValueError, 'No candles in range'):
            crossing_candles([], 100.0, self.stamps[0], self.stamps[-1])
        with self.assertRaisesRegex(ValueError, 'No candle at or before'):
            crossing_candles(self.bars, 100.0, self.stamps[0] - DAY, self.stamps[-1])


class ViewBehaviour(ProviderScenarioTestCase):
    """/api/line-crosses/ composes chart history: with the provider down
    and the cache warm, the store answers alone."""

    def setUp(self):
        super().setUp()
        self.stamps = [TODAY - day * DAY for day in range(2, -1, -1)]

    def mocked_yahoo(self, lows, highs, closes):
        frame = daily_frame(self.stamps, lows, highs, closes)
        return mock.patch('market.providers.yahoo.yf.Ticker',
                          return_value=mock.Mock(history=mock.Mock(return_value=frame)))

    def test_lists_crossings_over_the_chart_history(self):
        self.given_config({'yahoo': {}})
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             self.mocked_yahoo([98.0, 99.5, 109.0], [102.0, 105.5, 112.0],
                               [100.0, 101.0, 110.0]):
            response = self.client.get(
                '/api/line-crosses/',
                {'symbol': 'RBRK', 'interval': '1d', 'price': 100.0,
                 'start': self.stamps[0], 'end': self.stamps[-1]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['candleCount'], 2)
        self.assertEqual([c['close'] for c in data['candles']], [100.0, 101.0])
        self.assertEqual(data['avgVolume'], 1000.0)

    def test_missing_price_rejected(self):
        self.given_config({'yahoo': {}})
        response = self.client.get(
            '/api/line-crosses/', {'symbol': 'RBRK', 'start': TODAY, 'end': TODAY})
        self.assertEqual(response.status_code, 400)

    def test_answers_from_the_chart_cache_without_the_provider(self):
        self.given_config({'yahoo': {}})
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             self.mocked_yahoo([98.0, 99.5, 109.0], [102.0, 105.5, 112.0],
                               [100.0, 101.0, 110.0]):
            warm = self.client.get(
                '/api/history/', {'symbol': 'RBRK', 'interval': '1d', 'range': '1y'})
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker', side_effect=RuntimeError('429')):
            crossings = self.client.get(
                '/api/line-crosses/',
                {'symbol': 'RBRK', 'interval': '1d', 'price': 100.0,
                 'start': self.stamps[0], 'end': self.stamps[-1]})
        self.assertEqual(warm.status_code, 200)
        self.assertEqual(crossings.status_code, 200)
        self.assertEqual(crossings.json()['candleCount'], 2)
