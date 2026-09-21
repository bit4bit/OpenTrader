# AGENTS.md

Guidance for coding agents working on OpenTrader.

## Project Overview

OpenTrader is an open-source TradingView alternative: Django + DRF backend serving Yahoo Finance (yfinance) data, React 19 + Vite frontend using TradingView's `lightweight-charts` library.

## Structure

- `market/` — Django app: `views.py` (`TickerSearch`, `TickerHistory`, `IndexMembership` public REST endpoints; `LoginView`, `SessionListCreate`, `SessionDetail`, `FolderListCreate`, `FolderDetail`, `PreferenceView` token-authenticated endpoints), `models.py` (`Session` with optional `folder` FK, `Folder`, `UserPreference` models), `urls.py` mounted at `/api/`.
- `market/providers/` — market data providers (`yahoo.py`, `kraken.py`) routed by `registry.py`, plus `index_membership.py`: the benchmark-membership abstraction (`IndexMembershipProvider` base + `GitHubIndexConstituentsProvider` for the yfiua/index-constituents dataset). It inverts index→constituents into stock→indexes behind `memberships_for()`, disk-cached 24 h; swap sources by adding a provider class and setting `index_membership_provider` in `config.json`.
- `opentrader/` — Django project settings. Serves `frontend/dist` as the SPA; `/api/*` is proxied to the app. Auth is DRF `TokenAuthentication` (username-only login, no password).
- `frontend/src/`
  - `App.jsx` — root: auth gate (login screen), session wiring, layout state, global toolbars (TopBar, DrawingToolbar, search modals). Keep it thin; logic belongs in hooks/modules.
  - `components/Chart.jsx` — orchestration only: interaction state, layout, and wiring between the chart engine, overlay renderers, and hooks. No chart-library imports.
  - `components/ChartGrid.jsx` / `ChartPanel.jsx` — multi-chart flow layout and per-chart tile (header, legends, indicator panels, loaders).
  - `hooks/useAuth.js` — token+username in `localStorage` (`opentrader_auth`), axios `Authorization: Token ...` header, `login`/`logout`.
  - `hooks/useSessions.js` — sessions list, folders list, active session/folder, CRUD against `/api/sessions/`, `/api/folders/`, `/api/preferences/`, debounced (~1s) layout auto-save (PATCH).
  - `components/SessionMenu.jsx` — session dropdown in the TopBar: folders with expand/collapse (localStorage), drag & drop sessions between folders, inline rename, per-item delete.
  - `hooks/useCharts.js` — charts collection state: CRUD, active chart, lock flag. No persistence of its own; reports changes via `onLayoutChange`.
  - `hooks/useChartData.js` — per-chart market data: initial fetch, refresh polling, left-scroll pagination, `useAdFullData`; `useMarketIndexData` fetches full history for the extra symbols pane indicators need (SMI constituents, Benchmark Index indexes).
  - `hooks/useIndexMembership.js` — fetches `/api/index-membership/` (which benchmark indexes a stock belongs to) for the Benchmark Index settings UI.
  - `engine/` — pluggable **ChartEngine** (chart stack: series, panes, axes, zoom, crosshair, coordinate conversion). `engine.js` documents the contract; `lwcEngine.js` is the lightweight-charts implementation and the default; `chartGpuEngine.js` is an **unstable** WebGPU adapter; `index.js` selects at build time via `VITE_CHART_ENGINE` (default `lwc`).
  - `render/` — pluggable **DrawingRenderer** overlay stack. `layers.js` declares the named layers and stacking order (`fills` → `volumeProfile` → `weekends` → `drawings` → `notes` DOM); `svgRenderer.js` creates per-layer renderer entities (`createSvgRenderer(surface)` → `{ clear, drawShapes, drawScene }` — every draw clears its layer first) drawing engine-neutral `Shape[]` (line/polyline/polygon/rect/circle/ellipse/path/text in px), grouping committed drawings under `<g data-drawing-id>` for eraser hit-testing.
  - `sync/chartSync.js` — registry of engine-agnostic sync entries (`{ setVisibleRange, showCrosshair }`); broadcasts visible range and crosshair to peers when locked, with a re-entrancy guard.
  - `chart/` — pure, unit-tested presentation logic (Humble Object pattern): `timeFormat.js` (crosshair labels, weekend color), `heikinAshi.js`, `gapFill.js` (weekend/holiday placeholder rows for daily+ intervals), `weekendShapes.js` (gray overlay shapes for those placeholders — the chart library can't color candlesticks per bar), `barSearch.js` (nearest-bar binary search), `drawingTools.js` + `drawingInteraction.js` (tool point requirements, click state machine, Home/End ranges), `drawingGeometry.js` (drawings/fills/volume-profile → engine-neutral `Shape[]`; ctx = `{ timeToX, priceToY, width, height, data }`), `crosshairLegend.js`, `paneLayout.js` (pane ordering/stretch, renderable ids, full-data slicing), `regression.js` (OLS, std error, time windows), `noteGeometry.js` (text-note coordinates and array transforms). Tests live in `chart/__tests__/` (vitest, `npm test`).
  - `Indicators/` — pure indicator math (`sma.js`, `rsi.js`, `marketIndex.js`, `benchmarkIndex.js`, ...) plus `actions.js` (pure indicator config factories/operations) and `panes.js` (pane ordering).

## Coding Guidelines

- **Functional software design.** Prefer pure functions and custom hooks over classes or shared mutable state. Side effects live at the edges (hooks, event handlers).
- **Clear and concise vocabulary.** Names say what things are: `addChart`, `broadcastRange`, `findNearestBar`. No abbreviations or clever names.
- **The source code is the source of truth.** Avoid comments that restate the code. Comment only non-obvious intent (e.g. why A/D needs full history).
- **Clean code / Kent Beck's rules of simple design:** passes tests, reveals intent, no duplication, fewest elements. Make the minimal change that achieves the goal; don't add speculative features.
- **SOLID.** Single responsibility especially: fetching in hooks, indicator math in `Indicators/`, sync in `sync/`, rendering in components. Extend behavior by adding modules/props, not by growing `App.jsx` or `Chart.jsx`.
- **No workarounds.** Always look for the most appropriate and best solution. If a bug is caused by bad data or state (e.g. a corrupted session layout), fix the data/state instead of patching the code to tolerate it.

## Commands

- Frontend dev: `cd frontend && npm run dev`
- Frontend check: `cd frontend && npm test && npm run build` and `npx eslint <changed files>`
  - Note: `Chart.jsx` has pre-existing exhaustive-deps lint warnings — don't add new ones.
- Backend: `python3 -m venv venv && venv/bin/pip install -r requirements.txt`, then `venv/bin/python manage.py migrate && venv/bin/python manage.py runserver`

## Docker Workflow (important)

`docker compose up` serves the frontend from a **build-time image**, not from disk. After any frontend change, rebuild or nothing changes in the browser:

```bash
docker compose build frontend && docker compose up -d frontend
```

The `frontend` container copies `dist/` into the shared `dist` volume served by the nginx router, then exits — `Exited (0)` is normal. Hard-refresh (`Ctrl+Shift+R`) after rebuilding.

## Conventions

- Chart state is per-chart: `{ id, symbol, interval, chartType, showWeekendCandles, indicators, drawings }`. Global toolbar actions target the **active** chart (`activeChartId`). `showWeekendCandles` (the 📅 Weekends toggle in the TopBar) makes `Chart.jsx` run price rows through `chart/gapFill.js` so daily-and-above charts render placeholder doji bars across weekends/holidays.
- Layout (`{charts, activeChartId, locked, gridLayout}`) persists to the active `Session` on the backend via debounced PATCH; the old `opentrader_layout` localStorage key is gone. `gridLayout` is a preset id from `chart/gridLayout.js` (`auto`, `1x1`, `2x1`, `1x2`, `2x2`, `3x2`) chosen via `components/LayoutPicker.jsx` in the TopBar. Sessions require a token from `POST /api/auth/login/`; a new user gets a "My Session" seeded at first login.
- Sync (lock) works by logical range for zoom/pan and nearest-bar snapping for the crosshair, so charts with different symbols/sessions stay aligned.
- Commit style: short imperative subject, lowercase (e.g. `add Volume SMA indicator`), optional body explaining why. Every commit message should include `Co-Authored-By: LLM Assisted`.
