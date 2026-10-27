"""Behavior-driven tests for the permanent bar store.

Given/When/Then scenarios exercised against the real stack (models and
their migrations run for real; nothing external is touched):
- upserted bars are stored, deduplicated by time (newest fetch wins),
  and read back in API row shape, ascending;
- range queries are half-open: [start, end);
- a fetch window is recorded as coverage; later requests for the same,
  overlapping or an adjoining immutable range return no uncovered
  segments — the provider is asked again only for ranges truly never
  fetched;
- coverage windows union-merge, including touching ones, and recording
  the same window twice is idempotent;
- bars and coverage are keyed by (provider, symbol, interval): the same
  symbol under another provider stays a separate history.
"""
from django.test import TestCase

from market import history_store


def bar(time, close, **overrides):
    return {
        'time': time, 'open': close - 1, 'high': close + 1, 'low': close - 2,
        'close': close, 'volume': 1000.0, **overrides,
    }


class UpsertBarTests(TestCase):
    def test_stores_and_reads_back_in_api_row_shape(self):
        history_store.upsert_bars('yahoo', 'RBRK', '1d', [bar(t, 10.0 + t) for t in (100, 101, 102)])
        bars = history_store.stored_bars('yahoo', 'RBRK', '1d')
        self.assertEqual([b['time'] for b in bars], [100, 101, 102])
        self.assertEqual(
            bars[1],
            {'time': 101, 'open': 110.0, 'high': 112.0, 'low': 109.0,
             'close': 111.0, 'volume': 1000.0},
        )

    def test_reupsert_wins_with_newest_values(self):
        # The mutable tail is refetched on every request: the second fetch
        # of the same timestamp (e.g. today's still-moving daily bar) must
        # replace the first, not duplicate it.
        history_store.upsert_bars('yahoo', 'RBRK', '1d', [bar(100, 50.0)])
        history_store.upsert_bars('yahoo', 'RBRK', '1d', [bar(100, 55.0)])
        bars = history_store.stored_bars('yahoo', 'RBRK', '1d')
        self.assertEqual(len(bars), 1)
        self.assertEqual(bars[0]['close'], 55.0)

    def test_range_query_is_half_open(self):
        history_store.upsert_bars('yahoo', 'RBRK', '1d', [bar(t, 10.0) for t in (100, 101, 102)])
        bars = history_store.stored_bars('yahoo', 'RBRK', '1d', start=101)
        self.assertEqual([b['time'] for b in bars], [101, 102])
        bars = history_store.stored_bars('yahoo', 'RBRK', '1d', end=102)
        self.assertEqual([b['time'] for b in bars], [100, 101])
        bars = history_store.stored_bars('yahoo', 'RBRK', '1d', start=101, end=102)
        self.assertEqual([b['time'] for b in bars], [101])

    def test_empty_fetch_persists_nothing(self):
        history_store.upsert_bars('yahoo', 'RBRK', '1d', [])
        self.assertEqual(history_store.stored_bars('yahoo', 'RBRK', '1d'), [])

    def test_other_provider_or_interval_is_a_separate_history(self):
        history_store.upsert_bars('yahoo', 'RBRK', '1d', [bar(100, 10.0)])
        history_store.upsert_bars('kraken', 'RBRK', '1d', [bar(100, 20.0)])
        history_store.upsert_bars('yahoo', 'RBRK', '1wk', [bar(100, 30.0)])
        self.assertEqual(history_store.stored_bars('yahoo', 'RBRK', '1d')[0]['close'], 10.0)
        self.assertEqual(history_store.stored_bars('kraken', 'RBRK', '1d')[0]['close'], 20.0)
        self.assertEqual(history_store.stored_bars('yahoo', 'RBRK', '1wk')[0]['close'], 30.0)


class CoverageTests(TestCase):
    def query(self, start, end, **kwargs):
        return history_store.uncovered_segments('yahoo', 'RBRK', '1d', start, end, **kwargs)

    def test_before_any_fetch_nothing_is_covered(self):
        self.assertEqual(self.query(1000, 2000), [(1000, 2000)])

    def test_covered_range_needs_no_refetch(self):
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1000, 2000)
        self.assertEqual(self.query(1100, 1900), [])
        self.assertEqual(self.query(1000, 2000), [])

    def test_only_uncovered_parts_are_refetched(self):
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1000, 1500)
        self.assertEqual(self.query(1000, 2000), [(1500, 2000)])
        self.assertEqual(self.query(500, 1200), [(500, 1000)])

    def test_exact_bounds_are_shared_with_needy_requests(self):
        # A request partially overlapping coverage on both sides yields the
        # two outside segments only.
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1500, 1800)
        self.assertEqual(self.query(1000, 2000), [(1000, 1500), (1800, 2000)])

    def test_multiple_windows_stay_separate(self):
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1000, 1500)
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1700, 2000)
        self.assertEqual(self.query(1000, 2000), [(1500, 1700)])

    def test_overlapping_fetches_union_cover_the_span(self):
        # Two sequential paginations that overlap: the union covers the
        # contiguous span.
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1000, 1600)
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1500, 2100)
        self.assertEqual(self.query(1000, 2100), [])

    def test_touching_windows_merge_into_one_span(self):
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1000, 1500)
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1500, 2000)
        self.assertEqual(self.query(1000, 2000), [])

    def test_recording_same_window_twice_is_idempotent(self):
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1000, 1500)
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1000, 1500)
        records = history_store.BarCoverage.objects.filter(symbol='RBRK')
        self.assertEqual(records.count(), 1)
        self.assertEqual(records[0].start, 1000)
        self.assertEqual(records[0].end, 1500)
        self.assertEqual(self.query(1000, 1500), [])

    def test_empty_window_records_nothing(self):
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1500, 1500)
        self.assertFalse(history_store.BarCoverage.objects.exists())

    def test_coverage_is_keyed_by_provider_and_interval(self):
        history_store.record_coverage('yahoo', 'RBRK', '1d', 1000, 2000)
        self.assertEqual(self.query(1000, 2000), [])
        self.assertEqual(
            history_store.uncovered_segments('kraken', 'RBRK', '1d', 1000, 2000),
            [(1000, 2000)])
        self.assertEqual(
            history_store.uncovered_segments('yahoo', 'RBRK', '1wk', 1000, 2000),
            [(1000, 2000)])
