# frontend/

The OpenTrader web application — a React single-page app for interactive charting, built on TradingView's Lightweight Charts.

## Overview

The frontend is responsible for everything the user sees and interacts with: multi-chart layouts, market data visualization, indicators (including user-written script indicators), drawing tools, and real-time chart synchronization. It talks to the backend REST API for market data and session persistence.

## Commands

```bash
npm run dev      # dev server
npm test         # unit tests
npm run build    # production build
```

Note: `docker compose up` serves a build-time image — after any change here, run `docker compose build frontend && docker compose up -d frontend` and hard-refresh.
