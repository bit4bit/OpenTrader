import pandas as pd


class MarketDataProvider:
    """Contract every data provider follows.

    Catalog entries are uniform dicts:
        {symbol, name, fullname, type, exchange, sector}
    The registry stamps the extra 'provider' key.
    """

    def __init__(self, **config):
        self.config = config

    def symbols(self):
        """Return the full catalog as a list of metadata dicts."""
        raise NotImplementedError

    def search(self, query):
        """Return catalog-style dicts matching the query."""
        raise NotImplementedError

    def get_history(self, symbol, interval, period=None, start=None, end=None):
        """Return OHLCV history as a DataFrame with Open/High/Low/Close/Volume columns."""
        raise NotImplementedError


def search_in_catalog(catalog, query):
    q = query.strip().lower()
    if not q:
        return []
    matches = []
    for entry in catalog:
        if (q in entry['symbol'].lower() or q in (entry['name'] or '').lower()
                or q in (entry['fullname'] or '').lower()):
            matches.append(entry)
    return matches