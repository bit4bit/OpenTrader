import { useState, useEffect } from 'react';
import axios from 'axios';

// Per-symbol fundamentals (sharesOutstanding, marketCap) for turnover-style
// indicators. Mirrors useAdFullData: a single fetch per (symbol, provider),
// memoized. Resolves {} when the endpoint is unreachable so scripts that
// defensively read symbolInfo.sharesOutstanding degrade gracefully.
//
// The backend returns snake_case; scripts read camelCase, so the response is
// normalized once at the cache boundary.
const cache = new Map();

const key = (symbol, provider) => `${(symbol || '').toUpperCase()}|${provider || ''}`;

const normalize = (data) => {
    if (!data) return {};
    const out = { ...data };
    if ('shares_outstanding' in out) {
        out.sharesOutstanding = out.shares_outstanding;
        delete out.shares_outstanding;
    }
    if ('market_cap' in out) {
        out.marketCap = out.market_cap;
        delete out.market_cap;
    }
    if ('trailing_eps' in out) {
        out.trailingEps = out.trailing_eps;
        delete out.trailing_eps;
    }
    return out;
};

const fetchInfo = async (symbol, provider) => {
    const cacheKey = key(symbol, provider);
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    try {
        const response = await axios.get('/api/symbol/info/', {
            params: { symbol, provider },
        });
        const data = normalize(response.data || {});
        cache.set(cacheKey, data);
        return data;
    } catch (err) {
        console.warn('Symbol info fetch failed', err);
        // Don't cache failures: the endpoint may come up later (backend
        // rebuild), so the next mount/effect must retry the fetch.
        return { symbol, provider, sharesOutstanding: null, marketCap: null, trailingEps: null };
    }
};

export function useSymbolInfo(symbol, provider) {
    const [info, setInfo] = useState(() => cache.get(key(symbol, provider)) || null);
    useEffect(() => {
        if (!symbol) {
            Promise.resolve().then(() => setInfo(null));
            return undefined;
        }
        let cancelled = false;
        fetchInfo(symbol, provider).then(data => {
            if (!cancelled) setInfo(data);
        });
        return () => { cancelled = true; };
    }, [symbol, provider]);
    return info;
}

