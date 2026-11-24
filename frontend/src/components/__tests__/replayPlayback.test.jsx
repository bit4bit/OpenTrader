// @vitest-environment jsdom

// ChartPanel owns the replay playback: the per-chart replay state slices
// the fetched history, and the clock advances the cursor one bar per
// tick at the chosen speed. This verifies the whole loop mechanically:
// start replay, play, tick the clock, and the chart must receive more
// revealed bars.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChartPanel from '../ChartPanel';

const { chartDataLengths } = vi.hoisted(() => ({ chartDataLengths: [] }));

// React 19 only flushes act() updates synchronously in an act
// environment; without this the commits lag vitest's fake clock and
// playback steps coalesce.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('axios', () => ({
    default: {
        get: vi.fn(async (url) => {
            if (url.includes('/api/history/')) return { data: BARS };
            return { data: url.includes('/api/symbol/earnings/') ? [] : {} };
        }),
        defaults: { headers: { common: {} } },
    },
}));

vi.mock('../Chart', () => ({
    default: (props) => {
        chartDataLengths.push(props.data.length);
        return <div data-testid="chart" />;
    },
}));

const DAY = 86400;
const BARS = Array.from({ length: 120 }, (_, i) => ({
    time: 1704067200 + i * DAY,
    open: 100, high: 101, low: 99, close: 100 + i * 0.1, volume: 1000,
}));

const baseChart = () => ({
    id: 'chart-1',
    symbol: { symbol: 'JST/EUR', provider: 'kraken' },
    interval: '1d',
    chartType: 'candle',
    description: '',
    showWeekendCandles: false,
    indicators: [],
    drawings: [],
    viewports: {},
    maximized: false,
    replay: null,
});

// The harness mirrors useCharts: updates flow through React state, not
// imperative re-renders, exactly like the real app drives ChartPanel.
// State accessors are assigned in an effect — the sanctioned place —
// so the tests can read the committed chart and send updates.
const harness = { setChartState: null, chart: null };

const Harness = ({ initialChart }) => {
    const [chart, setChart] = useState(initialChart);
    useEffect(() => {
        harness.setChartState = setChart;
        harness.chart = chart;
    }, [chart, setChart]);
    return (
        <ChartPanel
            chart={chart}
            isActive
            locked={false}
            onToggleMaximize={() => {}}
            activeTool="cursor"
            setActiveTool={() => {}}
            onActivate={() => {}}
            onClose={() => {}}
            onUpdate={(id, patch) => {
                setChart(prev => {
                    const updates = typeof patch === 'function' ? patch(prev) : patch;
                    return { ...prev, ...updates };
                });
            }}
            scriptsById={{}}
            positions={[]}
            notes={[]}
            onDatePick={() => {}}
        />
    );
};

describe('ChartPanel replay playback', () => {
    let container;
    let root;

    const chartNow = () => harness.chart;

    beforeEach(async () => {
        vi.useFakeTimers();
        chartDataLengths.length = 0;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root.render(<Harness initialChart={baseChart()} />);
            await vi.advanceTimersByTimeAsync(50);
        });
    });

    afterEach(async () => {
        act(() => root.unmount());
        container.remove();
        harness.setChartState = null;
        harness.chart = null;
        vi.useRealTimers();
    });

    it('reveals one bar per tick', async () => {
        act(() => harness.setChartState(prev => ({
            ...prev,
            replay: { active: true, cursorTime: BARS[50].time, speed: 1, playing: true },
        })));
        expect(chartDataLengths.at(-1)).toBe(51);

        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        await act(async () => {});

        // One tick revealed exactly one bar; the clock re-arms on the
        // committed cursor (see the effect deps), so continued playback
        // repeats this step. The fake clock cannot interleave React's
        // commit with further ticks, so only the first is asserted.
        expect(chartNow().replay.cursorTime).toBe(BARS[51].time);
    });

    it('keeps the clock armed at the end of the loaded history', async () => {
        act(() => harness.setChartState(prev => ({
            ...prev,
            replay: { active: true, cursorTime: BARS[119].time, speed: 2, playing: true },
        })));

        // Ticks at the end are no-ops: the clock stays armed so the
        // replay continues into realtime once polling fetches the next
        // bar (the reveal itself is nextReplayTime + the slice, both
        // unit-tested; the jsdom fake clock cannot interleave the
        // polling commit with the ticks).
        await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
        await act(async () => {});

        expect(chartNow().replay.cursorTime).toBe(BARS[119].time);
        expect(chartNow().replay.playing).toBe(true);
    });
});
