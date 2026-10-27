"""Candle crossings of a horizontal price line.

A candle crosses the line when the line lies inside its span
(low <= price <= high) — wick touches included, pass-through distinction
not made. A bar without wicks degrades to its close point (crosses only
if it closes on the line), and a bar with neither does not cross.

Window anchors and the one-slot fetch reach come from the trendline
module: the same anchor rule and the same "bars at/before each bound,
inclusive" semantics.
"""
from .trendline import anchor_index, average_volume, fetch_pad


def _crosses(row, price):
    low = row['low'] if row['low'] is not None else row['close']
    high = row['high'] if row['high'] is not None else row['close']
    if low is None or high is None:
        return False
    return low <= price <= high


def crossing_candles(rows, price, start, end):
    """Candles between the anchor bars at/before start and end, inclusive,
    whose span contains the price: {anchorStart, anchorEnd, candleCount,
    candles, avgVolume}."""
    if not rows:
        raise ValueError('No candles in range')
    first = anchor_index(rows, start)
    last = anchor_index(rows, end)
    anchor_start, anchor_end = rows[first], rows[last]
    candles = [row for row in rows[first:last + 1] if _crosses(row, price)]
    return {
        'price': price,
        'anchorStart': anchor_start['time'],
        'anchorEnd': anchor_end['time'],
        'candleCount': len(candles),
        'candles': candles,
        'avgVolume': average_volume(candles),
    }
