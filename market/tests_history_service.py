"""Behavior-driven tests for the history composition policy.

Given/When/Then scenarios through the real stack (store, service, and
the /api/history/ view run for real). The only external boundary is the
provider — scripted instead of yfinance, so fetch behavior is exact:
- a first-ever fetch defers to the provider's own semantics and its rows
  are both served and stored, with the immutable part recorded covered;
- within covered range the store answers alone: the provider is asked
  only for the moving tail (plus one slot of stamp-skew guard);
- uncovered immutable segments (older pagination) fetch and store
  precisely that segment; covered immutable windows fetch nothing;
- a mutable bar never comes from storage: the fresh tail refetch
  overwrites the day's still-moving row;
- when the provider fails, stored bars are still served (stale but
  correct up to the last close); with nothing stored the failure raises;
- the interval defines the mutable region: monthly bars floor to the
  calendar month/quarter, unknown intervals trust nothing.
"""
import time
from datetime import datetime, timezone

import pandas as pd
from django.test import TestCase

from market import history_service, history_store
from market.history_service import ProviderFetchFailed, immutable_boundary
from market.tests import ProviderScenarioTestCase, yahoo_quote, yahoo_screen, mock

DAY = 86400
NOW = int(time.time())
TODAY = NOW - NOW % DAY


def daily_frame(stamps, closes):
    return pd.DataFrame({
        'Date': [pd.Timestamp(stamp, unit='s', tz='UTC') for stamp in stamps],
        'Open': [close - 1 for close in closes],
        'High': [close + 1 for close in closes],
        'Low': [close - 2 for close in closes],
        'Close': closes,
        'Volume': [1000.0] * len(closes),
    })


class ScriptProvider:
    """get_history(period | start, end) -> canned frame, or raises from
    the `error_from_call`-th call onwards."""

    def __init__(self, stamps, closes, error=None, error_from_call=1):
        self.calls = []
        self.stamps = stamps
        self.closes = closes
        self.error = error
        self.error_from_call = error_from_call

    def get_history(self, symbol, interval, period=None, start=None, end=None):
        self.calls.append({'interval': interval, 'period': period,
                           'start': start, 'end': end})
        if self.error and len(self.calls) >= self.error_from_call:
            raise self.error
        return daily_frame(self.stamps, self.closes)


def utc_midnight(year, month, day):
    return int(datetime(year, month, day, tzinfo=timezone.utc).timestamp())


def seed_stored_bars(provider_name, symbol, interval, days_back, closes_by_day):
    """Stored daily bars; closes keyed by days-back ((today) = 0), a light
    linear default away from the anchors so unspecified days still exist."""
    stamps = [TODAY - day * DAY for day in range(days_back, -1, -1)]
    closes = [closes_by_day.get(day, 100.0 + (days_back - day))
              for day in range(days_back, -1, -1)]
    history_store.upsert_bars(provider_name, symbol, interval, [
        {'time': stamp, 'open': close - 1, 'high': close + 1, 'low': close - 2,
         'close': close, 'volume': 1000.0}
        for stamp, close in zip(stamps, closes)])
    return stamps, closes


class FirstFetchBehaviour(TestCase):
    def test_provider_rows_are_served_stored_and_covered(self):
        stamps = [TODAY - day * DAY for day in range(10, -1, -1)]
        closes = [90.0, 91.0, 92.0, 93.0, 94.0, 95.0, 96.0, 97.0, 98.0, 99.0, 100.0]
        provider = ScriptProvider(stamps, closes)
        rows = history_service.bars_for(provider, 'yahoo', 'RBRK', '1d', period='1y')
        self.assertEqual([row['time'] for row in rows], stamps)
        self.assertEqual(rows[-1], {'time': TODAY, 'open': 99.0, 'high': 101.0,
                                    'low': 98.0, 'close': 100.0, 'volume': 1000.0})
        self.assertTrue(history_store.has_bars('yahoo', 'RBRK', '1d'))
        self.assertEqual(history_store.uncovered_segments(
            'yahoo', 'RBRK', '1d', TODAY - 10 * DAY, TODAY), [])

    def test_provider_failure_on_first_fetch_raises(self):
        provider = ScriptProvider([], [], error=RuntimeError('Too Many Requests. Rate limited.'))
        with self.assertRaises(ProviderFetchFailed):
            history_service.bars_for(provider, 'yahoo', 'RBRK', '1d', period='1y')
        self.assertFalse(history_store.has_bars('yahoo', 'RBRK', '1d'))


class CoveredWindowBehaviour(TestCase):
    def setUp(self):
        self.provider = ScriptProvider([], [])
        self.provider.error = RuntimeError('provider down')

    def test_covered_immutable_window_is_answered_from_storage(self):
        seed_stored_bars('yahoo', 'RBRK', '1d', 10, {10: 90.0, 6: 96.0, 0: 100.0})
        history_store.record_coverage('yahoo', 'RBRK', '1d', TODAY - 10 * DAY, TODAY)
        rows = history_service.bars_for(
            self.provider, 'yahoo', 'RBRK', '1d',
            start=TODAY - 10 * DAY, end=TODAY - 6 * DAY)
        # [T-10d, T-6d) half-open: 4 immutable bars, storage only, no calls.
        self.assertEqual([row['time'] for row in rows],
                         [TODAY - day * DAY for day in range(10, 6, -1)])
        self.assertEqual(self.provider.calls, [])

    def test_only_the_tail_is_refetched_on_period_requests(self):
        seed_stored_bars('yahoo', 'RBRK', '1d', 10, {10: 90.0, 0: 100.0})
        history_store.record_coverage('yahoo', 'RBRK', '1d', TODAY - 365 * DAY, TODAY)
        rows = history_service.bars_for(self.provider, 'yahoo', 'RBRK', '1d', period='1y')
        self.assertEqual(len(self.provider.calls), 1)
        call = self.provider.calls[0]
        self.assertIsNone(call['period'])
        # The tail reaches one daily slot behind the boundary: today's
        # exchange-stamped bar can open hours off UTC midnight.
        self.assertEqual(call['start'], TODAY - DAY)
        self.assertGreaterEqual(call['end'], NOW - 5)
        # Rows come from storage despite the provider being down.
        self.assertEqual(len(rows), 11)


class UncoveredSegmentBehaviour(TestCase):
    def test_older_pagination_fetches_only_that_segment(self):
        seed_stored_bars('yahoo', 'RBRK', '1d', 10, {10: 90.0, 0: 100.0})
        history_store.record_coverage('yahoo', 'RBRK', '1d', TODAY - 10 * DAY, TODAY)
        older_stamps = [TODAY - day * DAY for day in range(20, 13, -1)]
        provider = ScriptProvider(older_stamps, [95.0, 96.0, 97.0, 98.0, 99.0, 100.0, 101.0])
        window_start, window_end = TODAY - 20 * DAY, TODAY - 13 * DAY
        rows = history_service.bars_for(
            provider, 'yahoo', 'RBRK', '1d', start=window_start, end=window_end)
        self.assertEqual(provider.calls, [{
            'interval': '1d', 'period': None,
            'start': window_start, 'end': window_end,
        }])
        self.assertEqual([row['close'] for row in rows],
                         [95.0, 96.0, 97.0, 98.0, 99.0, 100.0, 101.0])
        self.assertEqual(history_store.uncovered_segments(
            'yahoo', 'RBRK', '1d', window_start, window_end), [])

    def test_fresh_tail_value_overwrites_the_stored_mutable_bar(self):
        seed_stored_bars('yahoo', 'RBRK', '1d', 1, {1: 99.0, 0: 123.45})
        history_store.record_coverage('yahoo', 'RBRK', '1d', TODAY - DAY, TODAY)
        stamps = [TODAY - DAY, TODAY]
        provider = ScriptProvider(stamps, [99.0, 137.5])
        rows = history_service.bars_for(provider, 'yahoo', 'RBRK', '1d', period='1mo')
        self.assertEqual(rows[-1], {'time': TODAY, 'open': 136.5, 'high': 138.5,
                                    'low': 135.5, 'close': 137.5, 'volume': 1000.0})


class ProviderFailureMidwayBehaviour(TestCase):
    def test_stored_bars_are_served_when_the_provider_fails(self):
        seed_stored_bars('yahoo', 'RBRK', '1d', 5, {5: 95.0, 4: 96.0, 3: 97.0,
                                              2: 98.0, 1: 99.0, 0: 100.0})
        history_store.record_coverage('yahoo', 'RBRK', '1d', TODAY - 5 * DAY, TODAY)
        provider = ScriptProvider([], [], error=Exception('Too Many Requests'))
        rows = history_service.bars_for(provider, 'yahoo', 'RBRK', '1d', period='1mo')
        self.assertEqual([row['close'] for row in rows], [95.0, 96.0, 97.0, 98.0, 99.0, 100.0])


class ViewBehaviour(ProviderScenarioTestCase):
    """The view wraps the service: same shapes and status codes as the
    pre-storage endpoint."""

    def test_first_fetch_serves_provider_rows(self):
        self.given_config({'yahoo': {}})
        stamps = [TODAY - day * DAY for day in range(2, -1, -1)]
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker',
                        return_value=mock.Mock(history=mock.Mock(
                            return_value=daily_frame(stamps, [100.0, 101.0, 102.0])))):
            response = self.client.get(
                '/api/history/', {'symbol': 'RBRK', 'interval': '1d', 'range': '1y'})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data[-1]['time'], TODAY)
        self.assertEqual(data[-1]['close'], 102.0)

    def test_provider_failure_without_storage_is_a_500(self):
        self.given_config({'yahoo': {}})
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker', side_effect=RuntimeError(
                 'Too Many Requests. Rate limited. Try after a while.')):
            response = self.client.get(
                '/api/history/', {'symbol': 'RBRK', 'interval': '1d', 'range': '1y'})
        self.assertEqual(response.status_code, 500)
        self.assertIn('Rate limited', response.json()['error'])

    def test_provider_failure_with_storage_serves_stored_bars(self):
        self.given_config({'yahoo': {}})
        stamps = [TODAY - day * DAY for day in range(2, -1, -1)]
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker',
                        return_value=mock.Mock(history=mock.Mock(
                            return_value=daily_frame(stamps, [100.0, 101.0, 102.0])))):
            first = self.client.get(
                '/api/history/', {'symbol': 'RBRK', 'interval': '1d', 'range': '1y'})
        with yahoo_screen([yahoo_quote('RBRK', 'Rubrik')]), \
             mock.patch('market.providers.yahoo.yf.Ticker', side_effect=RuntimeError('429')):
            second = self.client.get(
                '/api/history/', {'symbol': 'RBRK', 'interval': '1d', 'range': '1y'})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json(), first.json())


class IntervalBoundaryBehaviour(TestCase):
    def test_daily_bars_floor_to_utc_midnight(self):
        stamp = int(datetime(2026, 10, 27, 14, 3, tzinfo=timezone.utc).timestamp())
        self.assertEqual(immutable_boundary('1d', stamp), utc_midnight(2026, 10, 27))

    def test_month_bars_floor_to_the_calendar_month(self):
        stamp = int(datetime(2026, 10, 27, 14, 3, tzinfo=timezone.utc).timestamp())
        self.assertEqual(immutable_boundary('1mo', stamp), utc_midnight(2026, 10, 1))

    def test_quarter_bars_floor_to_the_calendar_quarter(self):
        stamp = int(datetime(2026, 10, 27, 14, 3, tzinfo=timezone.utc).timestamp())
        self.assertEqual(immutable_boundary('3mo', stamp), utc_midnight(2026, 10, 1))
        stamp_june = int(datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc).timestamp())
        self.assertEqual(immutable_boundary('3mo', stamp_june), utc_midnight(2026, 4, 1))

    def test_unknown_intervals_trust_nothing(self):
        stamp = int(datetime(2026, 10, 27, 14, 3, tzinfo=timezone.utc).timestamp())
        self.assertEqual(immutable_boundary('bogus', stamp), stamp)
