// Pure note-list presentation logic (views, search, sorting, counts)
// behind NotesModal — the counterpart of positions/positionList.js.

const TAG_VIEW_PREFIX = 'tag:';
const SYMBOL_VIEW_PREFIX = 'symbol:';

const SMART_VIEW_FILTERS = {
    all: () => true,
    favorites: n => !!n.favorite,
    dated: n => n.pinned_at != null,
    undated: n => n.pinned_at == null,
    journal: n => !n.symbol,
};

export const tagViewId = (tag) => `${TAG_VIEW_PREFIX}${tag}`;

export const tagFromView = (viewId) =>
    viewId.startsWith(TAG_VIEW_PREFIX) ? viewId.slice(TAG_VIEW_PREFIX.length) : null;

export const symbolViewId = (symbol) => `${SYMBOL_VIEW_PREFIX}${symbol}`;

export const symbolFromView = (viewId) =>
    viewId.startsWith(SYMBOL_VIEW_PREFIX) ? viewId.slice(SYMBOL_VIEW_PREFIX.length) : null;

export const notesInView = (notes, viewId) => {
    const symbol = symbolFromView(viewId);
    if (symbol != null) {
        const wanted = symbol.toLowerCase();
        return notes.filter(n => (n.symbol || '').toLowerCase() === wanted);
    }
    const tag = tagFromView(viewId);
    if (tag != null) {
        const wanted = tag.toLowerCase();
        return notes.filter(n => (n.tags || []).some(t => t.toLowerCase() === wanted));
    }
    const filter = SMART_VIEW_FILTERS[viewId] || SMART_VIEW_FILTERS.all;
    return notes.filter(filter);
};

export const filterByQuery = (notes, query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(n =>
        (n.symbol || '').toLowerCase().includes(q) ||
        (n.text || '').toLowerCase().includes(q) ||
        (n.tags || []).some(t => t.toLowerCase().includes(q))
    );
};

export const sortNotes = (notes, sort) => {
    const sorted = [...notes];
    if (sort === 'symbol') {
        sorted.sort((a, b) =>
            (a.symbol || '\uffff').localeCompare(b.symbol || '\uffff') ||
            (a.pinned_at || '').localeCompare(b.pinned_at || ''));
    } else {
        sorted.sort((a, b) =>
            new Date(b.pinned_at || b.updated_at || b.created_at || 0)
            - new Date(a.pinned_at || a.updated_at || a.created_at || 0));
    }
    return sorted;
};

// Distinct tags in tag order with counts, for the sidebar's tag section;
// casing from each tag's first appearance wins.
export const tagsWithCounts = (notes) => {
    const byTag = new Map();
    for (const n of notes) {
        for (const tag of n.tags || []) {
            const key = tag.toLowerCase();
            if (!byTag.has(key)) byTag.set(key, { tag, count: 0 });
            byTag.get(key).count += 1;
        }
    }
    return [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
};

// Distinct symbols in symbol order with per-symbol counts; symbol-less
// journal notes are their own smart view, not a symbol group.
export const symbolsWithCounts = (notes) => {
    const bySymbol = new Map();
    for (const n of notes) {
        if (!n.symbol) continue;
        bySymbol.set(n.symbol, (bySymbol.get(n.symbol) || 0) + 1);
    }
    return [...bySymbol.entries()]
        .map(([symbol, count]) => ({ symbol, count }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
};

export const countNotes = (notes) => {
    let favorites = 0;
    let dated = 0;
    let undated = 0;
    let journal = 0;
    for (const n of notes) {
        if (n.favorite) favorites += 1;
        if (n.pinned_at == null) undated += 1;
        else dated += 1;
        if (!n.symbol) journal += 1;
    }
    return { favorites, dated, undated, journal, total: notes.length };
};
