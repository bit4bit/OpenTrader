import { useState, useEffect } from 'react';
import axios from 'axios';

// Quarterly earnings history (report date, EPS estimate/actual, surprise)
// for the earnings indicator. Mirrors useSymbolInfo: a single fetch per
// (symbol, provider), memoized; [] when unreachable so scripts degrade
// gracefully.
//
// The backend returns snake_case; scripts read camelCase, so the response
// is normalized once at the cache boundary.
const cache = new Map();

const key = (symbol, provider) => `${(symbol || '').toUpperCase()}|${provider || ''}`;

const normalize = (quarters) => (quarters || []).map(q => ({
    date: q.date,
    epsEstimate: q.eps_estimate ?? null,
    epsActual: q.eps_actual ?? null,
    surprisePct: q.surprise_pct ?? null,
}));

const fetchEarnings = async (symbol, provider) => {
    const cacheKey = key(symbol, provider);
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    try {
        const response = await axios.get('/api/symbol/earnings/', {
            params: { symbol, provider },
        });
        const quarters = normalize(response.data?.quarters);
        cache.set(cacheKey, quarters);
        return quarters;
    } catch (err) {
        console.warn('Symbol earnings fetch failed', err);
        // Don't cache failures: the endpoint may come up later (backend
        // rebuild), so the next mount/effect must retry the fetch.
        return [];
    }
};

export function useSymbolEarnings(symbol, provider) {
    const [quarters, setQuarters] = useState(() => cache.get(key(symbol, provider)) || null);
    useEffect(() => {
        if (!symbol) {
            Promise.resolve().then(() => setQuarters(null));
            return undefined;
        }
        let cancelled = false;
        fetchEarnings(symbol, provider).then(data => {
            if (!cancelled) setQuarters(data);
        });
        return () => { cancelled = true; };
    }, [symbol, provider]);
    return quarters;
}
