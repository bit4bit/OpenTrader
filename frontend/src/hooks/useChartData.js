import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const isValidNum = (v) => typeof v === 'number' && isFinite(v);

const normalizeBar = (d) => {
    let t = Number(d.time);
    if (t > 1e11) t = Math.floor(t / 1000);
    else t = Math.floor(t);
    return {
        ...d,
        time: t,
        open: isValidNum(d.open) ? d.open : d.close,
        high: isValidNum(d.high) ? d.high : d.close,
        low: isValidNum(d.low) ? d.low : d.close,
        close: isValidNum(d.close) ? d.close : d.open,
    };
};

const mergeBars = (bars) =>
    Array.from(new Map(bars
        .filter(d => d.time != null)
        .map(normalizeBar)
        .filter(d => isValidNum(d.close))
        .map(d => [d.time, d])).values())
        .sort((a, b) => a.time - b.time);

const initialRangeFor = (interval) => {
    if (['1m', '5m', '15m'].includes(interval)) return '5d';
    if (['1h', '4h'].includes(interval)) return '1mo';
    return '1y';
};

const refreshRangeFor = (interval) =>
    ['1wk', '1mo'].includes(interval) ? '1mo' : '1d';

const historyOffsetFor = (interval) => {
    if (interval === '1m') return 2 * 24 * 60 * 60;
    if (['5m', '15m'].includes(interval)) return 7 * 24 * 60 * 60;
    if (['1h', '4h'].includes(interval)) return 30 * 24 * 60 * 60;
    return 365 * 24 * 60 * 60;
};

const refreshMsFor = (interval) => {
    if (['1m', '5m', '15m'].includes(interval)) return 10000;
    if (['1h', '4h'].includes(interval)) return 30000;
    return 60000;
};

export function useChartData(symbol, interval) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const loadingMoreRef = useRef(false);
    const dataRef = useRef([]);
    useEffect(() => { dataRef.current = data; }, [data]);

    useEffect(() => {
        const controller = new AbortController();
        const start = () => {
            if (controller.signal.aborted) return;
            setLoading(true);
            setError(null);
        };
        const timer = setTimeout(start, 0);
        axios.get('/api/history/', {
            params: { symbol, interval, range: initialRangeFor(interval) },
            signal: controller.signal,
        })
            .then(response => setData(mergeBars(response.data || [])))
            .catch(err => {
                if (axios.isCancel(err)) return;
                console.error('Fetch error:', err);
                setError('Failed to load data for ' + symbol);
                setData([]);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [symbol, interval]);

    useEffect(() => {
        const intervalId = setInterval(async () => {
            if (loadingMoreRef.current || dataRef.current.length === 0) return;
            try {
                const response = await axios.get('/api/history/', {
                    params: { symbol, interval, range: refreshRangeFor(interval) },
                });
                if (response.data?.length > 0) {
                    setData(prev => mergeBars([...prev, ...response.data]));
                }
            } catch (err) {
                console.warn('Real-time refresh failed:', err);
            }
        }, refreshMsFor(interval));
        return () => clearInterval(intervalId);
    }, [symbol, interval]);

    const fetchMoreData = useCallback(async () => {
        const current = dataRef.current;
        if (loadingMoreRef.current || current.length === 0) return;
        const firstTime = current[0].time;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        try {
            const response = await axios.get('/api/history/', {
                params: { symbol, interval, start: firstTime - historyOffsetFor(interval), end: firstTime },
            });
            if (response.data?.length > 0) {
                setData(prev => mergeBars([...response.data, ...prev]));
            }
        } catch (err) {
            console.error('Fetch more error:', err);
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [symbol, interval]);

    const handleVisibleLogicalRangeChange = useCallback((range) => {
        if (range && range.from < 50) fetchMoreData();
    }, [fetchMoreData]);

    return { data, loading, loadingMore, error, handleVisibleLogicalRangeChange };
}

export function useAdFullData(symbol, interval, indicators) {
    const [adFullData, setAdFullData] = useState(null);
    const adFullKey = useRef('');

    useEffect(() => {
        const adActive = indicators.some(i => i.type === 'ad' && i.visible);
        if (!adActive) return;
        const key = `${symbol}-${interval}`;
        if (adFullKey.current === key) return;
        let cancelled = false;
        axios.get('/api/history/', {
            params: { symbol, interval, range: 'max' },
        })
            .then(response => {
                if (cancelled) return;
                adFullKey.current = key;
                setAdFullData(mergeBars(response.data || []));
            })
            .catch(err => {
                if (!cancelled) console.warn('A/D full history fetch failed:', err);
            });
        return () => { cancelled = true; };
    }, [symbol, interval, indicators]);

    return adFullData;
}
