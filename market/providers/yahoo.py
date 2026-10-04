import logging

import pandas as pd
import yfinance as yf

from .base import MarketDataProvider

logger = logging.getLogger(__name__)

CRYPTO_SEEDS = [
    'BTC-USD', 'ETH-USD', 'USDT-USD', 'BNB-USD', 'SOL-USD', 'XRP-USD',
    'USDC-USD', 'ADA-USD', 'DOGE-USD', 'AVAX-USD', 'TRX-USD', 'LINK-USD',
    'DOT-USD', 'MATIC-USD', 'LTC-USD', 'BCH-USD', 'SHIB-USD', 'UNI-USD',
    'ATOM-USD', 'XLM-USD', 'XBT-USD', 'ETC-USD', 'FIL-USD', 'NEAR-USD',
]

INDEX_SEEDS = ['^GSPC', '^IXIC', '^DJI', '^FTSE', '^GDAXI', '^FCHI', '^N225', '^HSI', '^STOXX50E']


class YahooMarketProvider(MarketDataProvider):
    """Yahoo Finance via yfinance: equities, indices, forex, crypto."""

    def symbols(self):
        # Yahoo has no 'list all symbols' endpoint; publish the top US-listed
        # equities via the screener plus seeded crypto/indices. Symbols surfaced
        # by search() are merged back into the registry-cached catalog, so the
        # catalog grows to cover everything the user actually picks.
        catalog = {}
        try:
            for quote in self._screener():
                catalog[quote.get('symbol')] = self._entry(quote)
        except Exception as e:
            logger.warning('Yahoo screener fetch failed: %s', e)
        for symbol in CRYPTO_SEEDS + INDEX_SEEDS:
            if symbol not in catalog:
                catalog[symbol] = {
                    'symbol': symbol,
                    'name': symbol,
                    'fullname': symbol,
                    'type': 'CRYPTOCURRENCY' if symbol.endswith('-USD') and not symbol.startswith('^') else 'INDEX',
                    'exchange': 'Yahoo',
                    'sector': 'Cryptocurrency' if symbol.endswith('-USD') and not symbol.startswith('^') else None,
                }
        return list(catalog.values())

    def _screener(self):
        # Yahoo screener is paged (250 max); the global marketcap sort buries
        # US mega-caps behind obscure foreign listings, so query per exchange.
        quotes = []
        seen = set()
        for exchange in ('NMS', 'NYQ'):
            response = yf.screen(
                yf.EquityQuery('eq', ['exchange', exchange]),
                size=250, sortField='intradaymarketcap', sortAsc=False,
            )
            for quote in response.get('quotes', []):
                symbol = quote.get('symbol')
                if symbol and symbol not in seen:
                    seen.add(symbol)
                    quotes.append(quote)
        return quotes

    def _entry(self, quote):
        entry_type = quote.get('quoteType')
        return {
            'symbol': quote.get('symbol'),
            'name': quote.get('shortName') or quote.get('longName') or quote.get('symbol'),
            'fullname': quote.get('longName') or quote.get('shortName') or quote.get('symbol'),
            'type': entry_type,
            'exchange': quote.get('fullExchangeName') or quote.get('exchange'),
            'sector': quote.get('sector') or ('Cryptocurrency' if entry_type == 'CRYPTOCURRENCY' else None),
        }

    def search(self, query):
        results = []
        for quote in yf.Search(query, max_results=10).quotes:
            results.append(self._entry(quote))
        return results

    def get_history(self, symbol, interval, period=None, start=None, end=None):
        ticker = yf.Ticker(symbol)
        if start and end:
            df = ticker.history(start=start, end=end, interval=interval, auto_adjust=False)
        else:
            df = ticker.history(period=period or '1mo', interval=interval, auto_adjust=False)
        if df is None or df.empty:
            return pd.DataFrame()
        return df

    def get_info(self, symbol):
        # fast_info is the lightweight subset of .info cached by yfinance:
        # enough for turnover-style indicators (sharesOutstanding, marketCap)
        # without the per-call overhead of the full fundamentals payload.
        try:
            fast = yf.Ticker(symbol).fast_info
        except Exception as e:
            logger.warning('Yahoo fast_info fetch failed for %s: %s', symbol, e)
            return {'shares_outstanding': None, 'market_cap': None}

        def _as_int(value):
            if value is None:
                return None
            try:
                if hasattr(value, 'item'):
                    value = value.item()
                return int(value) if value == value and value not in (float('inf'), float('-inf')) else None
            except (TypeError, ValueError):
                return None

        return {
            'shares_outstanding': _as_int(getattr(fast, 'shares', None)),
            'market_cap': _as_int(getattr(fast, 'market_cap', None)),
        }