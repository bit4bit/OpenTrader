# frontend/

React 19 + Vite single-page app — the charting UI of OpenTrader, built on TradingView's Lightweight Charts.

## Responsibilities

- Render one `lightweight-charts` instance per chart (series, indicators, drawing tools via SVG overlay).
- Multi-chart flow layout with per-chart tiles (headers, legends, indicator panes).
- Client state: auth token, sessions, charts collection, per-chart market data (fetch, refresh polling, pagination).
- Chart synchronization: broadcast visible range and crosshair between locked charts.
- Indicator math and the embedded JavaScript runtime for custom script indicators.

## Structure

- `src/App.jsx` — root: auth gate, session wiring, layout state, global toolbars. Kept thin; logic lives in hooks/modules.
- `src/components/` — `Chart.jsx` (one chart), `ChartGrid.jsx` / `ChartPanel.jsx` (layout), toolbars, search modals, login screen.
- `src/hooks/` — side-effectful state: `useAuth`, `useSessions`, `useCharts`, `useChartData`, etc.
- `src/chart/` — pure, unit-tested presentation logic extracted from `Chart.jsx` (time formatting, Heikin Ashi, bar search, drawing interaction, pane layout, regression, note geometry).
- `src/Indicators/` — pure indicator math, config factories (`actions.js`), pane ordering, and `dsl/` (the custom-indicator JS runtime).
- `src/sync/` — chart registry broadcasting range/crosshair to peers when locked.

## Commands

```bash
npm run dev      # dev server
npm test         # vitest unit tests
npm run build    # production build into dist/
```

Note: `docker compose up` serves a build-time image — after any change here, run `docker compose build frontend && docker compose up -d frontend` and hard-refresh.
