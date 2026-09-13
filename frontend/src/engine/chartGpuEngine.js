// ChartGPU (WebGPU) implementation of the ChartEngine contract — public
// API only (chartgpu.io/docs). How the contract maps:
//
// - One ChartGPU instance per engine. Indicator "panes" become independent
//   multi-Y axes (`axes.y[]` with explicit min/max) on the same plot —
//   ChartGPU has no pane/subplot API, but per-series scales are documented.
// - Overlay plots (paneIndex 0) share the price axis; pane plots get their
//   own axis whose explicit bounds the engine recomputes from the visible
//   window (AxisConfig.min/max override auto-bounds, documented).
// - Zoom/pan: percent-space window via getZoomRange/setZoomRange, mapped
//   to/from the contract's logical {from,to} bar range.
// - The drawing overlay (render/) requires exact time/price-to-pixel
//   transforms; those are exact here BY CONSTRUCTION: the engine sets the
//   x domain (first bar .. last bar + logical headroom), explicit axis
//   bounds, and explicit grid gutters — everything it reads back is its
//   own state.
// - Crosshair events carry the interaction x (domain units); the price
//   comes from the tracked pointer position through the y transform.
//   Drawing clicks/preview snap to the nearest bar time (magnet-like).
//
// Known adapter gaps (documented library limits): per-candle volume
// coloring, crosshair color tuning and magnet/non-magnet crosshair are
// theme/pointer-driven (setMagnet/setCrosshairColor are intentional
// no-ops with the closest default).

import {
    ChartGPU,
    createPipelineCache,
} from 'chartgpu';
import { findNearestBar } from '../chart/barSearch';

export const WEBGPU_UNSUPPORTED = 'WEBGPU_UNSUPPORTED';

// Explicit plot gutters (CSS px) — set on every rebuild so the overlay
// transform is deterministic (theme defaults would vary).
const GRID = { left: 60, right: 88, top: 8, bottom: 36 };
// Visual padding fraction added around visible extremes for axis bounds.
const Y_PAD = 0.05;
// Volume bars render along their own axis scaled so the largest bar fills
// the bottom VOLUME_BAND of the plot (bottom-anchored look).
const VOLUME_BAND = 0.2;
// Logical headroom past the last bar, matching the lwc rightOffset look.
const RIGHT_BARS = 20;

const UP_COLOR = '#26a69a';
const DOWN_COLOR = '#ef5350';
const LINE_COLOR = '#2962ff';
const VOLUME_COLOR = 'rgba(38,166,154,0.5)';

const valueAt = (points, x) => {
    let best = null, bestDist = Infinity;
    for (const [px, py] of points) {
        const d = Math.abs(px - x);
        if (d < bestDist) { bestDist = d; best = py; }
        else if (px > x) break;
    }
    return best;
};

const extentOf = (values) => {
    let lo = Infinity, hi = -Infinity;
    let any = false;
    values.forEach(v => {
        if (v === null || !Number.isFinite(v)) return;
        any = true;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    });
    return any ? { min: lo, max: hi } : null;
};

const paddedBounds = ({ min, max }) => {
    const pad = (max - min) * Y_PAD || Math.abs(max) || 1;
    return { min: min - pad, max: max + pad };
};

export const WEBGPU_NO_ADAPTER = 'WEBGPU_NO_ADAPTER';

export function createChartGpuEngine(container, { timeFormatter } = {}) {
    return (async () => {
        if (!navigator.gpu) throw new Error(WEBGPU_UNSUPPORTED);
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new Error(WEBGPU_NO_ADAPTER);
        const device = await adapter.requestDevice();
        const shared = { adapter, device, pipelineCache: createPipelineCache(device) };

        let disposed = false;
        let chart = null;
        let priceChartType = null;
        let priceBars = []; // contract rows (time in seconds)
        let volumeBars = null;
        let handleSeq = 0;
        const handles = []; // { yAxis, data: [[ms, value]...], line, style }
        let zoom = { start: 0, end: 100 };
        let yBounds = null; // explicit price-axis bounds (current)
        let lastPointer = null; // { x, y } CSS px inside the container

        const rangeCbs = [];
        const crosshairCbs = [];
        const clickCbs = [];
        const redrawCbs = [];

        // ---- coordinate model (single source of truth for the overlay)

        const xDomain = () => {
            if (priceBars.length === 0) return null;
            const t0 = priceBars[0].time * 1000;
            const tN = priceBars[priceBars.length - 1].time * 1000;
            const avg = priceBars.length > 1 ? (tN - t0) / (priceBars.length - 1) : 60000;
            return { min: t0, max: tN + avg * RIGHT_BARS, bars: priceBars.length - 1 + RIGHT_BARS };
        };

        const viewWindow = () => {
            const dom = xDomain();
            if (!dom) return null;
            return {
                min: dom.min + (zoom.start / 100) * (dom.max - dom.min),
                max: dom.min + (zoom.end / 100) * (dom.max - dom.min),
            };
        };

        const plotBox = () => ({
            left: GRID.left,
            right: container.clientWidth - GRID.right,
            top: GRID.top,
            bottom: container.clientHeight - GRID.bottom,
        });

        const size = () => ({ width: container.clientWidth, height: container.clientHeight });

        const timeToX = (time) => {
            const dom = xDomain();
            const view = viewWindow();
            if (!dom || !view) return null;
            const box = plotBox();
            const tMs = time * 1000;
            return box.left + ((tMs - view.min) / (view.max - view.min)) * (box.right - box.left);
        };

        const priceToY = (price) => {
            if (!yBounds) return null;
            const box = plotBox();
            return box.top + ((yBounds.max - price) / (yBounds.max - yBounds.min)) * (box.bottom - box.top);
        };

        const xToTime = (px) => {
            const dom = xDomain();
            const view = viewWindow();
            if (!dom || !view) return null;
            const box = plotBox();
            const tMs = view.min + ((px - box.left) / (box.right - box.left)) * (view.max - view.min);
            return tMs / 1000;
        };

        const yToPrice = (py) => {
            if (!yBounds) return null;
            const box = plotBox();
            return yBounds.max - ((py - box.top) / (box.bottom - box.top)) * (yBounds.max - yBounds.min);
        };

        // Contract logical range {from,to} in bars <-> percent zoom window.
        const percentOfBar = (b) => {
            const dom = xDomain();
            if (!dom || dom.bars <= 0) return 0;
            return Math.min(100, Math.max(0, (b / dom.bars) * 100));
        };
        const barOfPercent = (p) => {
            const dom = xDomain();
            if (!dom) return 0;
            return (p / 100) * dom.bars;
        };

        // ---- rendering

        const visibleSlice = (bars) => {
            const view = viewWindow();
            if (!view) return bars;
            return bars.filter(t => t.time * 1000 >= view.min && t.time * 1000 <= view.max);
        };

        const rebuild = () => {
            if (disposed || !chart) return;

            const dom = xDomain();
            if (!dom) return;

            const visible = visibleSlice(priceBars);

            // Price axis bounds: visible bars plus overlay (paneIndex 0) handle data.
            const priceValues = visible.flatMap(b => [b.close, b.low, b.high].filter(Number.isFinite));
            handles.filter(h => h.yAxis === 'price').forEach(h => {
                const view = viewWindow();
                (h.data || []).forEach(([ms, v]) => {
                    if (ms >= view.min && ms <= view.max && Number.isFinite(v)) priceValues.push(v);
                });
            });
            const priceExtent = extentOf(priceValues);
            yBounds = priceExtent ? paddedBounds(priceExtent) : null;

            // Volume axis: 0 .. scaled so the largest visible bar reaches VOLUME_BAND.
            const vExt = extentOf(visible.map(b => b.volume || 0));
            const volAxisMax = vExt && vExt.max > 0 ? vExt.max / VOLUME_BAND : 1;

            const series = [];
            if (priceChartType === 'candles' && visible.length > 0) {
                series.push({
                    type: 'candlestick',
                    yAxis: 'price',
                    itemStyle: { upColor: UP_COLOR, downColor: DOWN_COLOR },
                    data: visible.map(b => [b.time * 1000, b.open, b.close, b.low, b.high]),
                });
            } else if (visible.length > 0) {
                series.push({
                    type: 'line',
                    yAxis: 'price',
                    lineStyle: { color: LINE_COLOR, width: 2 },
                    data: visible.map(b => [b.time * 1000, b.close]),
                });
            }

            if (volumeBars && volumeBars.length > 0) {
                series.push({
                    type: 'bar',
                    yAxis: 'vol',
                    itemStyle: { color: VOLUME_COLOR },
                    data: visibleSlice(volumeBars).map(b => [b.time * 1000, b.volume || 0]),
                });
            }

            const axesY = [
                { id: 'price', position: 'right', type: 'value', min: yBounds?.min, max: yBounds?.max },
                { id: 'vol', position: 'left', type: 'value', min: 0, max: volAxisMax },
            ];
            handles.forEach(h => {
                const view = viewWindow();
                const ext = extentOf((h.data || [])
                    .filter(([ms]) => ms >= view.min && ms <= view.max)
                    .map(([, v]) => v));
                const b = ext ? paddedBounds(ext) : null;
                axesY.push({ id: h.yAxis, position: 'right', type: 'value', min: b?.min, max: b?.max });
                if (h.data && h.data.length > 0) {
                    series.push(h.line
                        ? {
                            type: 'line', yAxis: h.yAxis, name: h.style.title,
                            lineStyle: { color: h.style.color, width: h.style.lineWidth ?? 1.5 },
                            data: h.data,
                        }
                        : {
                            type: 'bar', yAxis: h.yAxis, name: h.style.title,
                            itemStyle: { color: h.style.color },
                            data: h.data,
                        });
                }
            });

            chart.setOption({
                theme: 'dark',
                grid: GRID,
                tooltip: { show: false },
                dataZoom: [{ type: 'inside' }],
                annotations: [],
                xAxis: {
                    type: 'time',
                    min: dom.min,
                    max: dom.max,
                    tickFormatter: (ms) => (timeFormatter ? timeFormatter(Math.round(ms / 1000)) : ''),
                },
                axes: { y: axesY },
                series,
            });
            redrawCbs.forEach(cb => cb());
        };

        // Data growth shifts the percent window; preserve the visible times.
        const updateDataDomain = (newBars) => {
            const oldWindow = viewWindow();
            priceBars = newBars;
            if (oldWindow) {
                const dom = xDomain();
                if (dom && dom.max > dom.min) {
                    const s = ((oldWindow.min - dom.min) / (dom.max - dom.min)) * 100;
                    const e = ((oldWindow.max - dom.min) / (dom.max - dom.min)) * 100;
                    if (s >= 0 && e <= 100 && e - s > 0.01) zoom = { start: s, end: e };
                }
            }
        };

        container.style.position = 'relative';
        const resizeObserver = new ResizeObserver(rebuild);
        resizeObserver.observe(container);

        // ---- engine factory

        const baseOptions = () => ({
            theme: 'dark',
            tooltip: { show: false },
            dataZoom: [{ type: 'inside' }],
        });

        try {
            chart = await ChartGPU.create(container, baseOptions(), shared);
        } catch (err) {
            // Not a WebGPU-availability problem — surface the real cause.
            console.error('ChartGPU.create failed:', err);
            throw err;
        }

        chart.on('zoomRangeChange', (payload) => {
            if (payload.source !== undefined && payload.source !== null) return; // remote sync
            zoom = { start: payload.start, end: payload.end };
            rebuild();
            const range = { from: barOfPercent(payload.start), to: barOfPercent(payload.end) };
            rangeCbs.forEach(cb => cb(range));
        });

        chart.on('click', (payload) => {
            if (clickCbs.length === 0) return;
            const hit = chart.hitTest(payload.event);
            if (!hit.isInGrid) {
                clickCbs.forEach(cb => cb(null));
                return;
            }
            const tMs = xToTime(hit.canvasX) * 1000;
            const bar = findNearestBar(priceBars, tMs / 1000);
            clickCbs.forEach(cb => cb({
                time: bar ? bar.time : tMs / 1000,
                price: yToPrice(hit.canvasY),
            }));
        });

        const trackPointer = (e) => {
            const rect = container.getBoundingClientRect();
            lastPointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };
        const untrackPointer = () => { lastPointer = null; };
        container.addEventListener('pointermove', trackPointer);
        container.addEventListener('pointerleave', untrackPointer);

        chart.onInteractionXChange((x, source) => {
            if (source !== undefined && source !== null) return; // forwarded from sync peers
            if (x === null) {
                crosshairCbs.forEach(cb => cb(null));
                return;
            }
            const tSec = x / 1000;
            const bar = findNearestBar(priceBars, tSec);
            const seriesValues = new Map();
            handles.forEach(h => seriesValues.set(h, valueAt(h.data || [], x)));
            crosshairCbs.forEach(cb => cb({
                time: bar ? bar.time : tSec,
                price: lastPointer ? yToPrice(lastPointer.y) : (bar ? bar.price : null),
                point: lastPointer,
                priceBar: bar,
                seriesValues,
            }));
        });

        const engine = {
            dispose() {
                disposed = true;
                resizeObserver.disconnect();
                container.removeEventListener('pointermove', trackPointer);
                container.removeEventListener('pointerleave', untrackPointer);
                try { chart.dispose(); } catch { /* chart may already be gone */ }
                // The device was created by this engine, so it owns cleanup.
                device.destroy();
                chart = null;
            },

            size,
            timeToX,
            priceToY,
            xToTime,
            yToPrice,

            getVisibleRange() {
                return { from: barOfPercent(zoom.start), to: barOfPercent(zoom.end) };
            },
            setVisibleRange(range) {
                chart.setZoomRange(percentOfBar(range.from), percentOfBar(range.to));
            },
            fitContent() {
                chart.setZoomRange(0, 100);
            },

            setPriceSeries(type, rowsData) {
                priceChartType = type;
                updateDataDomain(rowsData);
                rebuild();
            },

            setVolumeData(bars) {
                volumeBars = bars;
                rebuild();
            },

            // Price-scale slack is baked into the explicit axis bounds above.
            applyPriceScaleMargins() {},

            // ChartGPU renders one plot; indicator "panes" map to per-series
            // y-axes, so pane management is a no-op in this adapter.
            paneCount() { return 1; },
            addPane() {},
            removeLastPane() {},
            setPaneStretchFactors() {},

            addLineSeries(options, paneIndex) {
                const handle = {
                    yAxis: paneIndex > 0 ? `ind-${handleSeq++}` : 'price',
                    data: [],
                    line: true,
                    style: { color: options.color, lineWidth: options.lineWidth, title: options.title },
                };
                handles.push(handle);
                return {
                    setData: (rowsData) => {
                        handle.data = rowsData.map(r => [r.time * 1000, r.value]);
                        rebuild();
                    },
                    applyOptions: (opts) => {
                        handle.style = { ...handle.style, ...opts };
                        rebuild();
                    },
                };
            },

            addHistogramSeries(options, paneIndex) {
                const handle = {
                    yAxis: paneIndex > 0 ? `ind-${handleSeq++}` : 'price',
                    data: [],
                    line: false,
                    style: { color: options.color, lineWidth: options.lineWidth, title: options.title },
                };
                handles.push(handle);
                return {
                    setData: (rowsData) => {
                        handle.data = rowsData.map(r => [r.time * 1000, r.value]);
                        rebuild();
                    },
                    applyOptions: (opts) => {
                        handle.style = { ...handle.style, ...opts };
                        rebuild();
                    },
                };
            },

            removeSeries(handle) {
                const idx = handles.indexOf(handle);
                if (idx !== -1) {
                    handles.splice(idx, 1);
                    rebuild();
                }
            },

            // Documented limits: see the header note.
            setMagnet() {},
            setCrosshairColor() {},

            setCrosshairPosition(price, time) {
                chart.setInteractionX(time * 1000);
            },
            clearCrosshair() {
                chart.setInteractionX(null);
            },

            onVisibleRangeChange(cb) {
                rangeCbs.push(cb);
                return () => { const i = rangeCbs.indexOf(cb); if (i !== -1) rangeCbs.splice(i, 1); };
            },

            onCrosshairMove(cb) {
                crosshairCbs.push(cb);
                return () => { const i = crosshairCbs.indexOf(cb); if (i !== -1) crosshairCbs.splice(i, 1); };
            },

            onClick(cb) {
                clickCbs.push(cb);
                return () => { const i = clickCbs.indexOf(cb); if (i !== -1) clickCbs.splice(i, 1); };
            },

            onRedraw(cb) {
                redrawCbs.push(cb);
                return () => { const i = redrawCbs.indexOf(cb); if (i !== -1) redrawCbs.splice(i, 1); };
            },
        };
        return engine;
    })();
}
