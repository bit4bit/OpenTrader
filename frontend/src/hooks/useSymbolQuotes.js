import { useEffect, useState } from 'react';
import axios from 'axios';

export const QUOTE_REFRESH_MS = 5 * 60 * 1000;

const symbolsParam = (symbols) => symbols.map(({ symbol }) => symbol).join(',');

export function useSymbolQuotes(symbols) {
    // Keyed by signature (the symbol list), not by the array identity:
    // a re-render must not refetch, only a change of viewed symbols must.
    const signature = symbols.length ? symbolsParam(symbols) : '';
    const [quotes, setQuotes] = useState(() => new Map());

    useEffect(() => {
        if (!signature) return undefined;
        let cancelled = false;
        const fetchQuotes = async () => {
            try {
                const response = await axios.get('/api/symbol/quote/', {
                    params: { symbols: signature },
                });
                if (cancelled) return;
                setQuotes(new Map((response.data || []).map(entry => [entry.symbol, entry])));
            } catch (err) {
                console.warn('Symbol quote fetch failed', err);
            }
        };
        fetchQuotes();
        const timer = setInterval(fetchQuotes, QUOTE_REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [signature]);

    return quotes;
}
