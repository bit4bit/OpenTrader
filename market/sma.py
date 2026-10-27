"""SMA over chart bars.

Source rule mirrors the frontend's Indicators/sma.js (open, high, low,
close, hl2, hlc3, ohlc4, volume), so backend values and UI values agree.
A candle's SMA needs the `period` candles ending at it; sources
computable from missing wicks report None there (mean of None is not a
mean).

Window anchors and the one-slot fetch reach come from the trendline
module: the same anchor rule and the same "bars at/before each bound,
inclusive" semantics.
"""
from .trendline import anchor_index, fetch_pad

SOURCES = ('open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'volume')


def _mean(values):
    usable = [value for value in values if value is not None]
    if any(value is None for value in values) or not usable:
        return None
    return sum(usable) / len(usable)


def source_value(row, source):
    if source in ('hl2', 'hlc3', 'ohlc4'):
        parts = [row['open'], row['high'], row['low'], row['close']]
        picks = {'hl2': parts[1:3], 'hlc3': parts[1:4], 'ohlc4': parts}[source]
        return _mean(picks)
    return row[source]


def sma_series(rows, period, start, end, source='close'):
    """SMA per candle of the anchored window; a value is None until
    `period` candles ending at it exist (warmup candles sit before the
    window): {period, source, anchorStart, anchorEnd, values, latest}."""
    if source not in SOURCES:
        raise ValueError(f'Unknown source {source!r}: choose one of {SOURCES}')
    if period < 1:
        raise ValueError('period is a number of candles')
    if end < start:
        raise ValueError('end is before start')
    if not rows:
        raise ValueError('No candles in range')
    first = anchor_index(rows, start)
    last = anchor_index(rows, end)

    values = []
    for index in range(first, last + 1):
        lookback = rows[max(0, index + 1 - period):index + 1]
        sma = _mean([source_value(row, source) for row in lookback]) \
            if len(lookback) == period else None
        values.append({'time': rows[index]['time'], 'sma': sma})

    latest = values[-1]
    return {
        'period': period,
        'source': source,
        'anchorStart': rows[first]['time'],
        'anchorEnd': rows[last]['time'],
        'values': values,
        'latest': latest,
    }
