import { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * Benchmark index membership for a chart symbol, from /api/index-membership/.
 * Returns { code, name, yahoo } entries — `yahoo` is the symbol the history
 * endpoint understands when fetching the index for the Benchmark pane.
 */
export function useIndexMembership(symbol) {
    const [membership, setMembership] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            axios.get('/api/index-membership/', { params: { symbol } })
                .then(response => {
                    if (cancelled) return;
                    setMembership(response.data?.indexes || []);
                    setError(null);
                })
                .catch(err => {
                    if (cancelled) return;
                    console.warn('Index membership fetch failed for ' + symbol, err);
                    setMembership([]);
                    setError('Membership lookup failed');
                });
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [symbol]);

    // Mask stale state while there is no symbol instead of resetting it in
    // the effect (synchronous setState-in-effect is disallowed).
    return { membership: symbol ? membership : [], error: symbol ? error : null };
}
