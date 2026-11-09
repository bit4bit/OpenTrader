import { useState, useEffect, useCallback, useRef } from 'react';
import { createIndicator } from '../Indicators/scripts';
import { normalizeGridLayoutId } from '../chart/gridLayout';

const normalizeSymbol = (symbol) =>
    typeof symbol === 'string'
        ? { symbol, provider: null }
        : { symbol: symbol.symbol, provider: symbol.provider ?? null };

const createChartConfig = (symbol, interval = '1d', description = '') => ({
    id: `chart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    symbol: normalizeSymbol(symbol),
    interval,
    description: description || '',
    chartType: 'candle',
    showWeekendCandles: false,
    indicators: [createIndicator('volume')],
    drawings: [],
    minimizedPanels: [],
    maximized: false,
    viewports: {},
});

const defaultLayout = () => {
    const chart = createChartConfig('AAPL');
    return { charts: [chart], activeChartId: chart.id, locked: false, gridLayout: 'auto' };
};

const normalizeLayout = (layout) => {
    const charts = layout.charts || [];
    // At most one maximized chart: the first one flagged wins.
    const maximizedIndex = charts.findIndex(c => c.maximized === true);
    return {
        ...layout,
        gridLayout: normalizeGridLayoutId(layout.gridLayout),
        charts: charts.map((c, i) => ({
            ...c,
            symbol: normalizeSymbol(c.symbol),
            description: c.description || '',
            maximized: i === maximizedIndex,
        })),
    };
};

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

    const addChart = useCallback((symbol, description = '') => {
        const chart = createChartConfig(symbol, '1d', description);
        // A maximized tile would hide the new chart: un-maximize.
        setCharts(prev => [...prev.map(c => (c.maximized ? { ...c, maximized: false } : c)), chart]);
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
        setCharts(prev => {
            let changed = false;
            const next = prev.map(c => {
                if (c.id !== id) return c;
                const updates = typeof patch === 'function' ? patch(c) : patch;
                if (updates === c) {
                    return c;
                }
                changed = true;
                return { ...c, ...updates };
            });
            return changed ? next : prev;
        });
    }, []);

    const toggleLock = useCallback(() => setLocked(prev => !prev), []);

    // Only one chart may be maximized: un-maximizes the others and makes
    // the target chart active.
    const toggleMaximize = useCallback((id) => {
        setCharts(prev => {
            let changed = false;
            const next = prev.map(c => {
                if (c.id !== id && !c.maximized) return c;
                changed = true;
                return c.id === id ? { ...c, maximized: !c.maximized } : { ...c, maximized: false };
            });
            return changed ? next : prev;
        });
        setActiveChartId(id);
    }, []);

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
        toggleMaximize,
    };
}
