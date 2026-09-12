import { useState, useEffect, useCallback, useRef } from 'react';

const createChartConfig = (symbol, interval = '1d') => ({
    id: `chart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    interval,
    chartType: 'candle',
    indicators: [],
    drawings: [],
    minimizedPanels: [],
});

const defaultLayout = () => {
    const chart = createChartConfig('AAPL');
    return { charts: [chart], activeChartId: chart.id, locked: false };
};

export function useCharts(initialLayout, onLayoutChange) {
    const [layout] = useState(() => (
        Array.isArray(initialLayout?.charts) ? initialLayout : defaultLayout()
    ));
    const [charts, setCharts] = useState(layout.charts);
    const [activeChartId, setActiveChartId] = useState(layout.activeChartId);
    const [locked, setLocked] = useState(layout.locked ?? false);

    const mounted = useRef(false);

    useEffect(() => {
        if (!mounted.current) {
            mounted.current = true;
            return;
        }
        onLayoutChange?.({ charts, activeChartId, locked });
    }, [charts, activeChartId, locked, onLayoutChange]);

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
