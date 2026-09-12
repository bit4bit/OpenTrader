# opentrader/

Django project package — settings, root URL routing, and WSGI/ASGI entry points.

## Responsibilities

- **Settings** (`settings.py`) — installed apps, DRF `TokenAuthentication`, database, static files. App state lives in a working directory (default `~/.opentrader`, override with `OPENTRADER_WORKING_DIR`).
- **Root URLs** (`urls.py`) — routes `/api/*` to the `market` app and serves `frontend/dist` as the SPA for everything else.
- **Entry points** — `wsgi.py` / `asgi.py` for deployment.
