// @vitest-environment jsdom

// Chart mounts a chart engine and drives overlay layers from effect dep
// lists keyed on marker arrays. Those arrays must keep a stable identity
// across renders — a fresh array per render re-arms the hover-target
// effects forever, and each pass calls setState, so the chart never
// settles and burns CPU in a render loop.

import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Chart from '../Chart';

vi.mock('axios', () => ({
    default: {
        get: vi.fn(async () => ({ data: {} })),
        patch: vi.fn(async () => ({ data: {} })),
        defaults: { headers: { common: {} } },
    },
}));

vi.mock('../../engine', () => {
    const makeSeries = () => ({ applyOptions: () => {}, setData: () => {} });
    const engine = {
        size: () => ({ width: 800, height: 400 }),
        timeToX: () => 100,
        priceToY: () => 200,
        xToTime: () => 1735689600,
        yToPrice: () => 100,
        setMagnet: () => {},
        onVisibleRangeChange: () => () => {},
        onCrosshairMove: () => () => {},
        onRedraw: () => () => {},
        onClick: () => () => {},
        dispose: () => {},
        setVisibleRange: () => {},
        getVisibleRange: () => null,
        setCrosshairPosition: () => {},
        clearCrosshair: () => {},
        setCrosshairColor: () => {},
        paneCount: () => 1,
        removeLastPane: () => {},
        addPane: () => {},
        setPaneStretchFactors: () => {},
        applyPriceScaleMargins: () => {},
        setPriceSeries: () => {},
        removeSeries: () => {},
        addHistogramSeries: () => makeSeries(),
        addLineSeries: () => makeSeries(),
        fitContent: () => {},
    };
    return { createChartEngine: async () => engine };
});

const BARS = [
    { time: 1735689600, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    { time: 1735776000, open: 105, high: 115, low: 95, close: 110, volume: 1200 },
    { time: 1735862400, open: 110, high: 120, low: 100, close: 115, volume: 900 },
];

const POSITIONS = [
    { id: 1, symbol: 'AAPL', side: 'buy', shares: 10, price: 105, opened_at: '2025-01-02T15:00:00Z' },
];

const NOTES = [
    { id: 5, symbol: 'AAPL', text: 'earnings', pinned_at: '2025-01-02T14:30:00Z', tags: ['q4'] },
];

const PROPS = {
    chartId: 'chart-1',
    data: BARS,
    chartType: 'candle',
    symbol: 'AAPL',
    provider: null,
    interval: '1d',
    indicators: [],
    drawings: [],
    setDrawings: () => {},
    setActiveTool: () => {},
    onAddAnchorIndicator: () => {},
    onRemoveIndicator: () => {},
    onDatePick: () => {},
    onViewportChange: () => {},
    onNeedHistory: () => {},
    onVisibleLogicalRangeChange: () => {},
    onCrosshairMove: () => {},
    indicatorResults: { resultsById: {}, paneIds: [] },
    positions: POSITIONS,
    notes: NOTES,
};

describe('Chart', () => {
    it('settles after mount instead of re-rendering forever', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        let renders = 0;
        await act(async () => {
            root.render(
                <React.Profiler onRender={() => { renders += 1; }}>
                    <Chart {...PROPS} />
                </React.Profiler>
            );
        });
        // Flush everything the async engine init schedules.
        await act(async () => {});
        const settled = renders;

        // A render loop keeps committing without any input; give it a
        // generous window to spin and assert nothing more happened.
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(renders).toBe(settled);
        expect(settled).toBeGreaterThan(0);

        act(() => { root.unmount(); });
        container.remove();
    }, 10000);
});
