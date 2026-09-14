import { useState, useEffect, useCallback, useRef } from 'react';
import { createIndicator } from '../Indicators/scripts';
import { normalizeGridLayoutId } from '../chart/gridLayout';

const normalizeSymbol = (symbol) =>
    typeof symbol === 'string' ? { symbol, provider: null } : symbol;

const createChartConfig = (symbol, interval = '1d') => ({
    id: `chart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    symbol: normalizeSymbol(symbol),
    interval,
    chartType: 'candle',
    indicators: [createIndicator('volume')],
    drawings: [],
    minimizedPanels: [],
});

const defaultLayout = () => {
    const chart = createChartConfig('AAPL');
    return { charts: [chart], activeChartId: chart.id, locked: false, gridLayout: 'auto' };
};

const normalizeLayout = (layout) => ({
    ...layout,
    gridLayout: normalizeGridLayoutId(layout.gridLayout),
    charts: (layout.charts || []).map(c => ({ ...c, symbol: normalizeSymbol(c.symbol) })),
});

export function useCharts(initialLayout, onLayoutChange) {
    const [layout] = useState(() => {
        const base = Array.isArray(initialLayout?.charts) ? initialLayout : defaultLayout();
        return normalizeLayout(base);
    });
    const [charts, setCharts] = useState(layout.charts);
    const [activeChartId, setActiveChartId] = useState(layout.activeChartId);
    const [locked, setLocked] = useState(layout.locked ?? false);
    const [gridLayout, setGridLayout] = useState(layout.gridLayout);

    const mounted = useRef(false);

    useEffect(() => {
        if (!mounted.current) {
            mounted.current = true;
            return;
        }
        onLayoutChange?.({ charts, activeChartId, locked, gridLayout });
    }, [charts, activeChartId, locked, gridLayout, onLayoutChange]);

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
        gridLayout,
        setGridLayout,
        setActiveChartId,
        addChart,
        closeChart,
        closeAllCharts,
        updateChart,
        toggleLock,
    };
}
