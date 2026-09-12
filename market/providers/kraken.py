import logging
from datetime import datetime, timezone

import pandas as pd
import requests

from .base import MarketDataProvider, search_in_catalog

logger = logging.getLogger(__name__)

KRAKEN_API = 'https://api.kraken.com/0/public'

INTERVAL_MINUTES = {
    '1m': 1, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '4h': 240, '1d': 1440, '1wk': 10080,
}


class KrakenMarketProvider(MarketDataProvider):
    """Kraken public REST API: crypto pairs only, no key required."""

    def _get(self, path, params=None):
        response = requests.get(f'{KRAKEN_API}{path}', params=params, timeout=15)
        response.raise_for_status()
        payload = response.json()
        if payload.get('error'):
            raise RuntimeError(f'Kraken API error: {payload["error"]}')
        return payload.get('result')

    def symbols(self):
        result = self._get('/AssetPairs')
        catalog = []
        for pair_key, pair in result.items():
            if pair.get('status') != 'online':
                continue
            wsname = pair.get('wsname') or f"{pair.get('base')}/{pair.get('quote')}"
            catalog.append({
                'symbol': wsname,
                'name': pair.get('altname') or wsname,
                'fullname': wsname,
                'type': 'CRYPTOCURRENCY',
                'exchange': 'Kraken',
                'sector': 'Cryptocurrency',
                'pair_key': pair_key,
            })
        return catalog

    def search(self, query):
        return search_in_catalog(self.symbols(), query)[:10]

    def _pair_key(self, symbol):
        for entry in self.symbols():
            if entry['symbol'] == symbol:
                return entry.get('pair_key', symbol)
        return symbol

    def get_history(self, symbol, interval, period=None, start=None, end=None):
        minutes = INTERVAL_MINUTES.get(interval)
        if minutes is None:
            return pd.DataFrame()
        params = {'pair': self._pair_key(symbol), 'interval': minutes}
        if start:
            params['since'] = int(start)
        result = self._get('/OHLC', params)
        if not result:
            return pd.DataFrame()
        # result is {pair_key: [[time, open, high, low, close, vwap, volume, count], ...], last: ...}
        rows = next(v for v in result.values() if isinstance(v, list))
        if end:
            rows = [r for r in rows if r[0] <= int(end)]
        df = pd.DataFrame(rows, columns=['time', 'open', 'high', 'low', 'close', 'vwap', 'volume', 'count'])
        df = df.astype({'open': float, 'high': float, 'low': float, 'close': float, 'volume': float})
        df = df.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'})
        df['Date'] = df['time'].apply(lambda t: datetime.fromtimestamp(t, tz=timezone.utc))
        return df[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']]