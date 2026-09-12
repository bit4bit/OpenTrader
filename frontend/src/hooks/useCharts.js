import { useState, useEffect, useCallback } from 'react';

const LAYOUT_KEY = 'opentrader_layout';
const LEGACY_KEY = 'opentrader_settings';

const createChartConfig = (symbol, interval = '1d') => ({
    id: `chart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    interval,
    chartType: 'candle',
    indicators: [],
    drawings: [],
});

function loadInitialLayout() {
    try {
        const saved = localStorage.getItem(LAYOUT_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed.charts)) return parsed;
        }
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
            const old = JSON.parse(legacy);
            const chart = {
                ...createChartConfig(old.symbol || 'AAPL', old.interval || '1d'),
                chartType: old.chartType || 'candle',
                indicators: old.indicators || [],
                drawings: old.drawings || [],
            };
            localStorage.removeItem(LEGACY_KEY);
            return { charts: [chart], activeChartId: chart.id, locked: false };
        }
    } catch (e) {
        console.warn('Failed to load layout:', e);
    }
    const chart = createChartConfig('AAPL');
    return { charts: [chart], activeChartId: chart.id, locked: false };
}

export function useCharts() {
    const [layout] = useState(loadInitialLayout);
    const [charts, setCharts] = useState(layout.charts);
    const [activeChartId, setActiveChartId] = useState(layout.activeChartId);
    const [locked, setLocked] = useState(layout.locked ?? false);

    useEffect(() => {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({ charts, activeChartId, locked }));
    }, [charts, activeChartId, locked]);

    const addChart = useCallback((symbol) => {
        const chart = createChartConfig(symbol);
        setCharts(prev => [...prev, chart]);
        setActiveChartId(chart.id);
    }, []);

    const closeChart = useCallback((id) => {
        setCharts(prev => {
            const next = prev.filter(c => c.id !== id);
            setActiveChartId(current => {
                if (current !== id) return next.some(c => c.id === current) ? current : (next[next.length - 1]?.id ?? null);
                return next[next.length - 1]?.id ?? null;
            });
            return next;
        });
    }, []);

    const closeAllCharts = useCallback(() => {
        setCharts([]);
        setActiveChartId(null);
    }, []);

    const updateChart = useCallback((id, patch) => {
        setCharts(prev => prev.map(c => {
            if (c.id !== id) return c;
            const updates = typeof patch === 'function' ? patch(c) : patch;
            return { ...c, ...updates };
        }));
    }, []);

    const toggleLock = useCallback(() => setLocked(prev => !prev), []);

    return {
        charts,
        activeChartId,
        locked,
        setActiveChartId,
        addChart,
        closeChart,
        closeAllCharts,
        updateChart,
        toggleLock,
    };
}
