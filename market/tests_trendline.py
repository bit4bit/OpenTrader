"""Behavior-driven tests for trendline measurement over chart bars.

Pure scenarios for the math (anchor rule, snapping, slope/angle under the
one-bar-one-price-unit convention) and the /api/trendline/ view over the
real stack (real registry, real disk cache, scripted provider), so the
endpoint is proven to answer over the same cached history /api/history/
serves.
"""
import math
import time

from django.test import TestCase
import pandas as pd

from market import trendline
from market.providers import registry as views_registry
from market.tests import ProviderScenarioTestCase, yahoo_quote, yahoo_screen, mock
from market.trendline import analyze_trendline

DAY = 86400
NOW = int(time.time())
TODAY = NOW - NOW % DAY


def rows(stamps, closes, volumes):
    return [
        {'time': stamp, 'open': close - 1, 'high': close + 1, 'low': close - 2,
         'close': close, 'volume': volume}
        for stamp, close, volume in zip(stamps, closes, volumes)
    ]


def daily_frame(stamps, closes):
    return pd.DataFrame({
        'Date': [pd.Timestamp(stamp, unit='s', tz='UTC') for stamp in stamps],
        'Open': [close - 1 for close in closes],
        'High': [close + 1 for close in closes],
        'Low': [close - 2 for close in closes],
        'Close': closes,
        'Volume': [1000.0] * len(closes),
    })


class FakeProvider:
    """get_history(start, end) -> one canned frame, recording every call."""

    def __init__(self, frame):
        self.frame = frame
        self.calls = []

    def get_history(self, symbol, interval, period=None, start=None, end=None):
        self.calls.append({'start': start, 'end': end})
        return self.frame


class MeasurementBehavior(TestCase):
    def test_counts_candles_inclusively_and_measures_the_span(self):
        stamps = [TODAY - day * DAY for day in range(4, -1, -1)]
        result = analyze_trendline(
            rows(stamps, [100.0, 101.0, 102.0, 104.0, 108.0], [10, 20, 30, 40, 50]),
            stamps[0], stamps[-1])
        self.assertEqual(result['candles'], 5)
        self.assertEqual(result['anchorStart'], {'time': stamps[0], 'price': 100.0})
        self.assertEqual(result['anchorEnd'], {'time': stamps[-1], 'price': 108.0})
        self.assertAlmostEqual(result['change'], 8.0)
        self.assertAlmostEqual(result['changePercent'], 8.0)
        self.assertAlmostEqual(result['slopePerBar'], 2.0)
        self.assertAlmostEqual(result['angleDegrees'], math.degrees(math.atan(2.0)))
        self.assertAlmostEqual(result['avgVolume'], 30.0)

    def test_snaps_inside_a_day_to_that_days_bar(self):
        stamps = [TODAY - day * DAY for day in range(2, -1, -1)]
        result = analyze_trendline(
            rows(stamps, [100.0, 101.0, 102.0], [10, 20, 30]),
            TODAY - DAY + 12 * 3600, TODAY + 12 * 3600)
        self.assertEqual(result['candles'], 2)
        self.assertEqual(result['anchorStart']['time'], TODAY - DAY)
        self.assertEqual(result['anchorEnd']['time'], TODAY)

    def test_anchor_rule_picks_the_endpoint_price(self):
        stamps = [TODAY - DAY, TODAY]
        result = analyze_trendline(
            rows(stamps, [100.0, 102.0], [10, 20]), stamps[0], stamps[-1],
            anchor='high')
        self.assertEqual(result['anchorStart']['price'], 101.0)
        self.assertEqual(result['anchorEnd']['price'], 103.0)

    def test_a_single_candle_has_no_slope_or_angle(self):
        result = analyze_trendline(
            rows([TODAY], [100.0], [10]), TODAY, TODAY + 12 * 3600)
        self.assertEqual(result['candles'], 1)
        self.assertIsNone(result['slopePerBar'])
        self.assertIsNone(result['changePercentPerBar'])
        self.assertIsNone(result['angleDegrees'])
        self.assertEqual(result['change'], 0.0)
        self.assertEqual(result['changePercent'], 0.0)

    def test_missing_volumes_are_excluded_from_the_average(self):
        stamps = [TODAY - day * DAY for day in range(2, -1, -1)]
        result = analyze_trendline(
            rows(stamps, [100.0, 101.0, 102.0], [10, None, 40]),
            stamps[0], stamps[-1])
        self.assertEqual(result['avgVolume'], 25.0)

    def test_error_scenarios(self):
        stamps = [TODAY - DAY, TODAY]
        bars = rows(stamps, [100.0, 102.0], [10, 20])
        with self.assertRaisesRegex(ValueError, 'Unknown anchor'):
            analyze_trendline(bars, stamps[0], stamps[-1], anchor='wick')
        with self.assertRaisesRegex(ValueError, 'end is before start'):
            analyze_trendline(bars, stamps[1], stamps[0])
        with self.assertRaisesRegex(ValueError, 'No candles in range'):
            analyze_trendline([], stamps[0], stamps[-1])
        with self.assertRaisesRegex(ValueError, 'No candle at or before'):
            analyze_trendline(bars, stamps[0] - DAY, stamps[-1])


    def test_fetch_reaches_one_slot_before_a_mid_day_start(self):
        stamps = [TODAY - day * DAY for day in range(2, -1, -1)]
        provider = FakeProvider(daily_frame(stamps, [100.0, 102.0, 105.0]))
        start = stamps[0] + 12 * 3600
        with mock.patch.object(views_registry, 'resolve_provider',
                               return_value=(provider, {'provider': 'script'})):
            response = self.client.get(
                '/api/trendline/', {'symbol': 'RBRK', 'interval': '1d',
                                    'start': start, 'end': stamps[2]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(provider.calls, [{
            'start': start - DAY, 'end': stamps[2] + 1}])
        self.assertEqual(response.json()['anchorStart']['time'], stamps[0])


class ViewBehaviour(ProviderScenarioTestCase):
    """/api/trendline/ composes chart history: one status contract with
    /api/history/ and answers from its cache without the provider."""

    def test_measures_the_stretch_between_two_timestamps(self):
        self.given_config({'yahoo': {}})
        stamps = [TODAY - day * DAY for day in range(2, -1, -1)]
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker',
                        return_value=mock.Mock(history=mock.Mock(
                            return_value=daily_frame(stamps, [100.0, 102.0, 105.0])))):
            response = self.client.get(
                '/api/trendline/',
                {'symbol': 'RBRK', 'interval': '1d', 'start': stamps[0], 'end': stamps[-1]})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['candles'], 3)
        self.assertEqual(data['anchorEnd'], {'time': TODAY, 'price': 105.0})
        self.assertAlmostEqual(data['avgVolume'], 1000.0)

    def test_missing_params_rejected(self):
        self.given_config({'yahoo': {}})
        response = self.client.get('/api/trendline/', {'symbol': 'RBRK'})
        self.assertEqual(response.status_code, 400)

    def test_answers_from_the_chart_cache_without_the_provider(self):
        self.given_config({'yahoo': {}})
        stamps = [TODAY - day * DAY for day in range(2, -1, -1)]
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker',
                        return_value=mock.Mock(history=mock.Mock(
                            return_value=daily_frame(stamps, [100.0, 102.0, 105.0])))):
            warm = self.client.get(
                '/api/history/', {'symbol': 'RBRK', 'interval': '1d', 'range': '1y'})
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker', side_effect=RuntimeError('429')):
            measured = self.client.get(
                '/api/trendline/',
                {'symbol': 'RBRK', 'interval': '1d', 'start': stamps[0], 'end': stamps[-1]})
        self.assertEqual(warm.status_code, 200)
        self.assertEqual(measured.status_code, 200)
        self.assertEqual(measured.json()['candles'], 3)
