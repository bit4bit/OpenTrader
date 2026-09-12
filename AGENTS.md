# AGENTS.md

Guidance for coding agents working on OpenTrader.

## Project Overview

OpenTrader is an open-source TradingView alternative: Django + DRF backend serving Yahoo Finance (yfinance) data, React 19 + Vite frontend using TradingView's `lightweight-charts` library.

## Structure

- `market/` — Django app: `views.py` (`TickerSearch`, `TickerHistory` public REST endpoints; `LoginView`, `SessionListCreate`, `SessionDetail` token-authenticated session endpoints), `models.py` (`Session` model), `urls.py` mounted at `/api/`.
- `opentrader/` — Django project settings. Serves `frontend/dist` as the SPA; `/api/*` is proxied to the app. Auth is DRF `TokenAuthentication` (username-only login, no password).
- `frontend/src/`
  - `App.jsx` — root: auth gate (login screen), session wiring, layout state, global toolbars (TopBar, DrawingToolbar, search modals). Keep it thin; logic belongs in hooks/modules.
  - `components/Chart.jsx` — one `lightweight-charts` instance: series, indicator rendering, drawing engine (SVG overlay), sync registration.
  - `components/ChartGrid.jsx` / `ChartPanel.jsx` — multi-chart flow layout and per-chart tile (header, legends, indicator panels, loaders).
  - `hooks/useAuth.js` — token+username in `localStorage` (`opentrader_auth`), axios `Authorization: Token ...` header, `login`/`logout`.
  - `hooks/useSessions.js` — sessions list, active session, CRUD against `/api/sessions/`, debounced (~1s) layout auto-save (PATCH).
  - `hooks/useCharts.js` — charts collection state: CRUD, active chart, lock flag. No persistence of its own; reports changes via `onLayoutChange`.
  - `hooks/useChartData.js` — per-chart market data: initial fetch, refresh polling, left-scroll pagination, `useAdFullData`.
  - `sync/chartSync.js` — registry of live chart APIs; broadcasts visible range and crosshair to peers when locked, with a re-entrancy guard.
  - `Indicators/` — pure indicator math (`sma.js`, `rsi.js`, ...) plus `actions.js` (pure indicator config factories/operations) and `panes.js` (pane ordering).

## Coding Guidelines

- **Functional software design.** Prefer pure functions and custom hooks over classes or shared mutable state. Side effects live at the edges (hooks, event handlers).
- **Clear and concise vocabulary.** Names say what things are: `addChart`, `broadcastRange`, `findNearestBar`. No abbreviations or clever names.
- **The source code is the source of truth.** Avoid comments that restate the code. Comment only non-obvious intent (e.g. why A/D needs full history).
- **Clean code / Kent Beck's rules of simple design:** passes tests, reveals intent, no duplication, fewest elements. Make the minimal change that achieves the goal; don't add speculative features.
- **SOLID.** Single responsibility especially: fetching in hooks, indicator math in `Indicators/`, sync in `sync/`, rendering in components. Extend behavior by adding modules/props, not by growing `App.jsx` or `Chart.jsx`.
- **No workarounds.** Always look for the most appropriate and best solution. If a bug is caused by bad data or state (e.g. a corrupted session layout), fix the data/state instead of patching the code to tolerate it.

## Commands

- Frontend dev: `cd frontend && npm run dev`
- Frontend check: `cd frontend && npm run build` and `npx eslint <changed files>`
  - Note: `Chart.jsx` has pre-existing lint errors (duplicate keys, unused vars) — don't add new ones.
- Backend: `python3 -m venv venv && venv/bin/pip install -r requirements.txt`, then `venv/bin/python manage.py migrate && venv/bin/python manage.py runserver`

## Docker Workflow (important)

`docker compose up` serves the frontend from a **build-time image**, not from disk. After any frontend change, rebuild or nothing changes in the browser:

```bash
docker compose build frontend && docker compose up -d frontend
```

The `frontend` container copies `dist/` into the shared `dist` volume served by the nginx router, then exits — `Exited (0)` is normal. Hard-refresh (`Ctrl+Shift+R`) after rebuilding.

## Conventions

- Chart state is per-chart: `{ id, symbol, interval, chartType, indicators, drawings }`. Global toolbar actions target the **active** chart (`activeChartId`).
- Layout (`{charts, activeChartId, locked}`) persists to the active `Session` on the backend via debounced PATCH; the old `opentrader_layout` localStorage key is gone. Sessions require a token from `POST /api/auth/login/`; a new user gets a "My Session" seeded at first login.
- Sync (lock) works by logical range for zoom/pan and nearest-bar snapping for the crosshair, so charts with different symbols/sessions stay aligned.
- Commit style: short imperative subject, lowercase (e.g. `add Volume SMA indicator`), optional body explaining why.
