# OpenTrader

OpenTrader is an open-source alternative to TradingView: a Django + DRF backend serving market data (Yahoo Finance by default, plus configurable providers such as Kraken) and a React 19 + Vite frontend built on TradingView's Lightweight Charts.

> **Note:** OpenTrader is in an early stage — suggestions and issue reports are welcome!

> **Acknowledgements:** This repository is a fork of the great [OpenTrader](https://github.com/nodminger/OpenTrader) by [@nodminger](https://github.com/nodminger) — many thanks for creating and open-sourcing such an awesome project! 🙏

## 📸 Screenshots

![open trader trading view opensource alternative](https://raw.githubusercontent.com/bit4bit/OpenTrader/refs/heads/master/Screenshots/screenshot1.png)
![open trader trading view opensource alternative](https://raw.githubusercontent.com/bit4bit/OpenTrader/refs/heads/master/Screenshots/screenshot2.png)
![open trader trading view opensource alternative](https://raw.githubusercontent.com/bit4bit/OpenTrader/refs/heads/master/Screenshots/screenshot3.png)
![open trader trading view opensource alternative](https://raw.githubusercontent.com/bit4bit/OpenTrader/refs/heads/master/Screenshots/screenshot4.png)
![open trader trading view opensource alternative](https://raw.githubusercontent.com/bit4bit/OpenTrader/refs/heads/master/Screenshots/screenshot5.png)

## ✨ Features

- **Multi-chart layouts** — flow layout with per-chart tiles; layouts persist to backend sessions.
- **Chart types** — candles, lines, and more, with configurable intervals.
- **Indicators** — SMA, RSI, MACD, Bollinger Bands, Stochastic, Super Trend, ATR, Ichimoku, TSI, A/D, 52-Week High/Low, Volume SMA, Volume Profile.
- **Drawing tools** — trend lines, channels, shapes, patterns, Fibonacci/Gann tools, long/short positions, and risk/reward.
- **Chart sync** — lock charts together to share zoom/pan and crosshair across symbols.
- **Ticker search** — symbol lookup with auto-refreshing market data.
- **Token auth + sessions** — username login with per-user session seeding.
- **Configurable data providers** — runtime-selectable market data backends.

## 🚀 Quick Start (Docker Compose)

```bash
docker compose up --build -d
```

Then open [http://localhost](http://localhost) in your browser.

Application state (SQLite database) persists in the `opentrader_data` volume. After changing frontend code, rebuild the frontend image — the container copies `dist/` into the shared volume and then exits (`Exited (0)` is normal):

```bash
docker compose build frontend && docker compose up -d frontend
```

## 🛠️ Manual Setup

**Backend** (Python 3.10+):

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/python manage.py migrate && venv/bin/python manage.py runserver
```

State is stored in a working directory (default `~/.opentrader`); override with `OPENTRADER_WORKING_DIR`.

**Frontend** (Node.js 18+):

```bash
cd frontend && npm install && npm run dev
```

## 🤝 Contributing

Open an issue to report bugs or suggest enhancements, or submit a Pull Request with your improvements.

## ⚖️ License

Distributed under the GNU General Public License v3.0 (GPL-3.0). See `LICENSE` for more information.

---

This project has been edited by an LLM assistant.