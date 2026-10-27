"""Permanent storage for provider-fetched bars.

Past bars never change (raw OHLCV is not re-stated by later dividends or
splits), so stored bars are served without re-requesting the provider —
only the still-moving latest region is ever fetched again.

Bars and coverage are both keyed by (provider, symbol, interval): the same
symbol under two providers (e.g. a Kraken spot pair and a Yahoo listing)
and one interval per key — an intraday bar set is never (re)aggregated
from a daily one.
"""
from django.db import transaction

from .models import Bar, BarCoverage


def stored_bars(provider, symbol, interval, start=None, end=None):
    """Bars in [start, end), ascending by time, in the API row shape.

    None bounds are open: [start, infinity) or (;; end). Mutability of the
    newest bar is the caller's concern — this returns all stored bars.
    """
    queryset = Bar.objects.filter(provider=provider, symbol=symbol, interval=interval)
    if start is not None:
        queryset = queryset.filter(time__gte=start)
    if end is not None:
        queryset = queryset.filter(time__lt=end)
    return [
        {
            'time': bar.time, 'open': bar.open, 'high': bar.high,
            'low': bar.low, 'close': bar.close, 'volume': bar.volume,
        }
        for bar in queryset.order_by('time')
    ]


def upsert_bars(provider, symbol, interval, bars):
    """Persist bars; the newest fetch wins on duplicate timestamps.

    Rows must already be provider-cleaned (no NaN placeholders, valid
    day/timestamp convention) — this stores what it is given.
    """
    rows = [
        Bar(
            provider=provider, symbol=symbol, interval=interval,
            time=int(bar['time']), open=bar.get('open'), high=bar.get('high'),
            low=bar.get('low'), close=bar.get('close'), volume=bar.get('volume'),
        )
        for bar in bars if bar
    ]
    if not rows:
        return
    Bar.objects.bulk_create(
        rows, update_conflicts=True,
        unique_fields=['provider', 'symbol', 'interval', 'time'],
        update_fields=['open', 'high', 'low', 'close', 'volume'],
    )


def uncovered_segments(provider, symbol, interval, start, end):
    """Sub-ranges of [start, end) never fetched from the provider yet."""
    segments = []
    cursor = start
    for record in BarCoverage.objects.filter(
            provider=provider, symbol=symbol, interval=interval,
            end__gt=start, start__lt=end).order_by('start'):
        if record.start > cursor:
            segments.append((cursor, record.start))
        cursor = max(cursor, record.end)
        if cursor >= end:
            return segments
    if cursor < end:
        segments.append((cursor, end))
    return segments


def record_coverage(provider, symbol, interval, start, end):
    """Union-merge a fetched window into the interval set.

    Overlapping and touching windows merge into one record, so a later
    request is answered from storage as long as its immutable region is
    inside any recorded fetch. Idempotent: recording the same window
    twice leaves a single record.
    """
    if start >= end:
        return
    with transaction.atomic():
        neighbors = list(BarCoverage.objects.filter(
            provider=provider, symbol=symbol, interval=interval,
            end__gte=start, start__lte=end))
        start = min([start] + [neighbor.start for neighbor in neighbors])
        end = max([end] + [neighbor.end for neighbor in neighbors])
        BarCoverage.objects.filter(
            id__in=[neighbor.id for neighbor in neighbors]).delete()
        BarCoverage.objects.create(
            provider=provider, symbol=symbol, interval=interval,
            start=start, end=end)
