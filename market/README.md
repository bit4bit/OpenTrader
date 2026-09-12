# market/

Django app exposing OpenTrader's REST API, mounted at `/api/`.

## Responsibilities

- **Market data endpoints** — `TickerSearch` (symbol lookup) and `TickerHistory` (OHLCV candles), public.
- **Session endpoints** — `SessionListCreate` / `SessionDetail` (token-authenticated): per-user persisted chart layouts.
- **Auth** — `LoginView`: username-only login issuing a DRF token.
- **Data providers** — pluggable market data backends, selectable at runtime.

## Structure

- `views.py` — DRF views for the endpoints above.
- `models.py` — `Session` model (per-user layout state).
- `urls.py` — routes mounted at `/api/`.
- `providers/` — provider registry and implementations: `base.py` (interface), `yahoo.py`, `kraken.py`, `registry.py` (runtime selection).
- `tests.py`, `tests_indicators.py` — Django test suites.
