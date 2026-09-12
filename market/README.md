# market/

The OpenTrader backend application — a Django app exposing the REST API at `/api/`.

## Overview

The backend is responsible for serving market data (symbol search and price history) through pluggable, runtime-selectable data providers, and for persisting user sessions (chart layouts) behind token authentication.
