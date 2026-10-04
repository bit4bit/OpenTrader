import { useState, useEffect } from 'react';
import axios from 'axios';

// Price decimals per provider from /api/providers/config/, fetched once and
// shared across all charts. Unknown providers / fetch failure -> the caller's
// fallback (DEFAULT_PRICE_DECIMALS).
let cache = null;
let pending = null;

const fetchDecimals = () => {
    if (cache) return Promise.resolve(cache);
    if (!pending) {
        pending = axios.get('/api/providers/config/')
            .then(response => { cache = response.data?.price_decimals || {}; })
            .catch(err => { console.warn('Provider config fetch failed', err); cache = {}; })
            .finally(() => { pending = null; });
    }
    return pending;
};

export function useProviderPriceDecimals() {
    const [decimals, setDecimals] = useState(cache || {});
    useEffect(() => {
        let cancelled = false;
        fetchDecimals().then(() => {
            if (!cancelled && cache) setDecimals(cache);
        });
        return () => { cancelled = true; };
    }, []);
    return decimals;
}
