"""Trend measurement over chart bars: candle count, anchors, slope, angle, volume.

Anchor rule: the anchor candle for a timestamp is the last bar at or before
it (bars carry their open time; daily-and-longer stamps are UTC midnight of
the exchange-local trading date, so any timestamp inside a trading day maps
to that day's bar). Angle convention: one bar on the time axis and one unit
of price are both one axis unit, so angle = atan(price change per bar) —
a documented scale, not a chart-zoom truth.
"""
import bisect
import math

from . import history_service

ANCHOR_RULES = ('close', 'open', 'high', 'low')


def fetch_pad(interval):
    """Reach of the fetch one bar slot behind `start`: bars carry their
    open time, so the candle containing a mid-slot `start` opens before it
    (daily stamps are UTC midnights, hours off exchange opens); monthly
    bars floor to calendar months."""
    if interval in ('1mo', '3mo'):
        return 31 * 86400
    return history_service.SLOT_SECONDS.get(interval, 86400)


def _anchor_index(rows, timestamp):
    times = [row['time'] for row in rows]
    index = bisect.bisect_right(times, timestamp) - 1
    if index < 0:
        raise ValueError(f'No candle at or before {timestamp}')
    return index


def _average_volume(segment):
    volumes = [row['volume'] for row in segment if row['volume'] is not None]
    return sum(volumes) / len(volumes) if volumes else None


def analyze_trendline(rows, start, end, anchor='close'):
    """Measure the stretch of bars from the anchor bar at/before start to
    the one at/before end, inclusive: {candles, anchors, slope per bar,
    change, angle, average volume}."""
    if anchor not in ANCHOR_RULES:
        raise ValueError(f'Unknown anchor {anchor!r}: choose one of {ANCHOR_RULES}')
    if end < start:
        raise ValueError('end is before start')
    if not rows:
        raise ValueError('No candles in range')

    first = _anchor_index(rows, start)
    last = _anchor_index(rows, end)
    segment = rows[first:last + 1]
    candles = len(segment)
    price_start = segment[0][anchor]
    price_end = segment[-1][anchor]
    if price_start is None or price_end is None:
        raise ValueError(f'Anchor {anchor!r} missing on the endpoint candles')

    change = price_end - price_start
    change_percent = change / price_start * 100 if price_start else None
    bars = candles - 1
    slope_per_bar = change / bars if bars else None
    change_percent_per_bar = change_percent / bars if bars and change_percent is not None else None
    angle_degrees = math.degrees(math.atan(slope_per_bar)) if bars else None

    return {
        'candles': candles,
        'anchorStart': {'time': segment[0]['time'], 'price': price_start},
        'anchorEnd': {'time': segment[-1]['time'], 'price': price_end},
        'anchor': anchor,
        'slopePerBar': slope_per_bar,
        'changePercentPerBar': change_percent_per_bar,
        'change': change,
        'changePercent': change_percent,
        'angleDegrees': angle_degrees,
        'avgVolume': _average_volume(segment),
    }
