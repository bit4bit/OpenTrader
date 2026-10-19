import logging
from datetime import datetime, timezone

import pandas as pd
import requests

from .base import MarketDataProvider, search_in_catalog

logger = logging.getLogger(__name__)

KRAKEN_FUTURES_API = 'https://futures.kraken.com'

# App interval -> charts API resolution.
INTERVALS = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '4h': '4h', '1d': '1d', '1wk': '1w',
}

# PF_ linear (stablecoin-margined) and PI_ inverse perpetuals; FF_/FI_ are
# dated futures, which we don't chart.
PERPETUAL_PREFIXES = ('PF_', 'PI_')


class KrakenFuturesMarketProvider(MarketDataProvider):
    """Kraken Futures public API: crypto perpetuals, no key required."""

    # Majors quote in whole dollars; alt perps go deeper than spot.
    price_decimals = 5

    def _get(self, path, params=None):
        response = requests.get(f'{KRAKEN_FUTURES_API}{path}', params=params, timeout=15)
        response.raise_for_status()
        payload = response.json()
        if payload.get('result') == 'error':
            raise RuntimeError(f'Kraken Futures API error: {payload.get("error")}')
        return payload

    def symbols(self):
        instruments = self._get('/derivatives/api/v3/instruments').get('instruments', [])
        catalog = []
        for instrument in instruments:
            symbol = instrument.get('symbol') or ''
            if not symbol.startswith(PERPETUAL_PREFIXES):
                continue
            if not instrument.get('tradeable') or instrument.get('suspended') or instrument.get('isExpired'):
                continue
            pair = instrument.get('pair') or ''
            name = f'{pair.replace(":", "/")} Perp' if pair else symbol
            catalog.append({
                'symbol': symbol,
                'name': name,
                'fullname': name,
                'type': 'CRYPTOCURRENCY',
                'exchange': 'Kraken Futures',
                'sector': 'Cryptocurrency',
            })
        return catalog

    def search(self, query):
        return search_in_catalog(self.symbols(), query)[:10]

    def get_history(self, symbol, interval, period=None, start=None, end=None):
        resolution = INTERVALS.get(interval)
        if resolution is None:
            return pd.DataFrame()
        params = {'from': int(start)} if start else None
        payload = self._get(f'/api/charts/v1/trade/{symbol}/{resolution}', params)
        candles = payload.get('candles', [])
        if not candles:
            return pd.DataFrame()
        df = pd.DataFrame(candles)
        df = df.astype({'open': float, 'high': float, 'low': float, 'close': float, 'volume': float})
        df = df.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'})
        # Candle time is epoch milliseconds.
        df['Date'] = df['time'].apply(lambda ms: datetime.fromtimestamp(ms / 1000, tz=timezone.utc))
        if end:
            df = df[df['time'] / 1000 <= int(end)]
        return df[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']]

    def get_info(self, symbol):
        # Crypto has no shares outstanding / market cap. Quote-volume turnover
        # is computed per bar (volume * close) by the vol_quote indicator.
        return {}
