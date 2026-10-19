// Pure position-list presentation logic (views, search, sorting, counts)
// behind PositionsModal — the counterpart of sessions/sessionList.js.

const SYMBOL_VIEW_PREFIX = 'symbol:';

const SMART_VIEW_FILTERS = {
    all: () => true,
    buys: p => p.side !== 'sell',
    sells: p => p.side === 'sell',
    undated: p => p.opened_at == null,
};

export const symbolViewId = (symbol) => `${SYMBOL_VIEW_PREFIX}${symbol}`;

export const symbolFromView = (viewId) =>
    viewId.startsWith(SYMBOL_VIEW_PREFIX) ? viewId.slice(SYMBOL_VIEW_PREFIX.length) : null;

export const filterBySymbol = (positions, symbol) => {
    const wanted = String(symbol || '').toLowerCase();
    return positions.filter(p => (p.symbol || '').toLowerCase() === wanted);
};

export const positionsInView = (positions, viewId) => {
    const symbol = symbolFromView(viewId);
    if (symbol != null) return filterBySymbol(positions, symbol);
    const filter = SMART_VIEW_FILTERS[viewId] || SMART_VIEW_FILTERS.all;
    return positions.filter(filter);
};

export const filterByQuery = (positions, query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return positions;
    return positions.filter(p =>
        (p.symbol || '').toLowerCase().includes(q) ||
        (p.note || '').toLowerCase().includes(q)
    );
};

export const sortPositions = (positions, sort) => {
    const sorted = [...positions];
    if (sort === 'symbol') {
        sorted.sort((a, b) =>
            String(a.symbol || '').localeCompare(String(b.symbol || '')) ||
            (a.opened_at || '').localeCompare(b.opened_at || ''));
    } else {
        sorted.sort((a, b) =>
            new Date(b.opened_at || b.created_at || 0) - new Date(a.opened_at || a.created_at || 0));
    }
    return sorted;
};

// Distinct symbols in symbol order with per-symbol counts, for the
// sidebar's symbol section.
export const symbolsWithCounts = (positions) => {
    const bySymbol = new Map();
    for (const p of positions) {
        const symbol = p.symbol || '';
        bySymbol.set(symbol, (bySymbol.get(symbol) || 0) + 1);
    }
    return [...bySymbol.entries()]
        .map(([symbol, count]) => ({ symbol, count }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
};

export const countPositions = (positions) => {
    let buys = 0;
    let sells = 0;
    let undated = 0;
    for (const p of positions) {
        if (p.side === 'sell') sells += 1;
        else buys += 1;
        if (p.opened_at == null) undated += 1;
    }
    return { buys, sells, undated, total: positions.length };
};
