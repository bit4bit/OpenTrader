// lightweight-charts implementation of the ChartEngine contract
// (see engine.js). All chart-library specifics live here.

import {
    createChart,
    ColorType,
    CrosshairMode,
    CandlestickSeries,
    LineSeries,
    HistogramSeries,
} from 'lightweight-charts';

// Repaint signal for overlays: the library calls updateAllViews() on every
// internal redraw (pan, zoom, resize, scale change).
class RedrawPrimitive {
    constructor(callback) {
        this._callback = callback;
    }
    updateAllViews() {
        this._callback();
    }
    paneViews() { return []; }
    priceAxisViews() { return []; }
    timeAxisViews() { return []; }
}

const wrapSeries = (series) => ({
    native: series,
    setData: (rows) => series.setData(rows),
    applyOptions: (options) => series.applyOptions(options),
});

export function createLwcEngine(container, { timeFormatter } = {}) {
    const chart = createChart(container, {
        layout: {
            background: { type: ColorType.Solid, color: '#131722' },
            textColor: '#d1d4dc',
        },
        grid: {
            vertLines: { color: '#2a2e39' },
            horzLines: { color: '#2a2e39' },
        },
        width: container.clientWidth,
        height: container.clientHeight,
        timeScale: {
            borderColor: '#2a2e39',
            timeVisible: true,
            secondsVisible: false,
            shiftVisibleRangeOnNewBar: false,
            fixRightEdge: false,
            rightOffset: 20,
        },
        rightPriceScale: {
            borderColor: '#2a2e39',
            autoScale: true,
            alignLabels: true,
        },
        crosshair: {
            mode: CrosshairMode.Magnet,
            vertLine: {
                color: '#758696',
            },
        },
        localization: {
            timeFormatter: (time) => (timeFormatter ? timeFormatter(time) : String(time)),
        },
    });

    let priceSeries = null;
    let priceChartType = null;
    let redrawCallback = null;
    const handles = []; // engine series handles, for crosshair value lookups

    // Reference bar times at each edge of the data. The library's
    // coordinateToTime/timeToCoordinate return null outside the data range;
    // these refs let us extrapolate into the whitespace beyond the
    // first/last bar so drawings can extend into the future.
    const EDGE_REF_COUNT = 6;
    let edgeTimes = { first: [], last: [] };

    // Regular bar step from a sorted reference list: the smallest gap
    // between consecutive bars (weekend/holiday gaps are wider).
    const barStep = (refs) => {
        let step = Infinity;
        for (let i = 1; i < refs.length; i++) step = Math.min(step, refs[i] - refs[i - 1]);
        return Number.isFinite(step) ? step : null;
    };

    const extrapolateTime = (x) => {
        const direct = chart.timeScale().coordinateToTime(x);
        if (direct != null) return direct;
        const { first, last } = edgeTimes;
        const tLast = last[last.length - 1];
        const xLast = tLast !== undefined ? chart.timeScale().timeToCoordinate(tLast) : null;
        if (xLast !== null && x >= xLast && last.length >= 2) {
            const step = barStep(last);
            const xPrev = chart.timeScale().timeToCoordinate(last[last.length - 2]);
            if (step !== null && xPrev !== null && xPrev !== xLast) {
                const bars = Math.round((x - xLast) / (xLast - xPrev));
                if (bars > 0) return tLast + bars * step;
            }
        }
        const tFirst = first[0];
        const xFirst = tFirst !== undefined ? chart.timeScale().timeToCoordinate(tFirst) : null;
        if (xFirst !== null && x <= xFirst && first.length >= 2) {
            const step = barStep(first);
            const xNext = chart.timeScale().timeToCoordinate(first[1]);
            if (step !== null && xNext !== null && xNext !== xFirst) {
                const bars = Math.round((xFirst - x) / (xNext - xFirst));
                if (bars > 0) return tFirst - bars * step;
            }
        }
        return null;
    };

    const extrapolateCoordinate = (time) => {
        const direct = chart.timeScale().timeToCoordinate(time);
        if (direct != null) return direct;
        const { first, last } = edgeTimes;
        const tLast = last[last.length - 1];
        const xLast = tLast !== undefined ? chart.timeScale().timeToCoordinate(tLast) : null;
        if (xLast !== null && time > tLast && last.length >= 2) {
            const step = barStep(last);
            const xPrev = chart.timeScale().timeToCoordinate(last[last.length - 2]);
            if (step !== null && xPrev !== null && xPrev !== xLast) {
                return xLast + ((time - tLast) / step) * (xLast - xPrev);
            }
        }
        const tFirst = first[0];
        const xFirst = tFirst !== undefined ? chart.timeScale().timeToCoordinate(tFirst) : null;
        if (xFirst !== null && time < tFirst && first.length >= 2) {
            const step = barStep(first);
            const xNext = chart.timeScale().timeToCoordinate(first[1]);
            if (step !== null && xNext !== null && xNext !== xFirst) {
                return xFirst - ((tFirst - time) / step) * (xNext - xFirst);
            }
        }
        return null;
    };

    const attachRedraw = () => {
        if (priceSeries && redrawCallback) {
            priceSeries.attachPrimitive(new RedrawPrimitive(redrawCallback));
        }
    };

    const resizeObserver = new ResizeObserver(() => {
        chart.applyOptions({
            width: container.clientWidth,
            height: container.clientHeight,
        });
    });
    resizeObserver.observe(container);

    return {
        dispose() {
            resizeObserver.disconnect();
            chart.remove();
            priceSeries = null;
        },

        size: () => ({ width: container.clientWidth, height: container.clientHeight }),
        timeToX: (time) => extrapolateCoordinate(time),
        priceToY: (price) => (priceSeries ? priceSeries.priceToCoordinate(price) : null),
        xToTime: (px) => extrapolateTime(px),
        yToPrice: (py) => (priceSeries ? priceSeries.coordinateToPrice(py) : null),

        getVisibleRange: () => chart.timeScale().getVisibleLogicalRange(),
        setVisibleRange: (range) => chart.timeScale().setVisibleLogicalRange(range),
        fitContent: () => chart.timeScale().fitContent(),

        setPriceSeries(chartType, rows) {
            if (priceSeries && priceChartType !== chartType) {
                chart.removeSeries(priceSeries);
                priceSeries = null;
            }
            if (!priceSeries) {
                priceSeries = chartType === 'line'
                    ? chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 2 })
                    : chart.addSeries(CandlestickSeries, {
                        upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
                    });
                priceChartType = chartType;
                attachRedraw();
            }
            priceSeries.setData(rows);
            edgeTimes = {
                first: rows.slice(0, EDGE_REF_COUNT).map(r => r.time),
                last: rows.slice(-EDGE_REF_COUNT).map(r => r.time),
            };
        },

        applyPriceScaleMargins: (margins) =>
            chart.priceScale('right').applyOptions({ scaleMargins: margins }),

        paneCount: () => chart.panes().length,
        addPane: () => chart.addPane(),
        removeLastPane: () => chart.removePane(chart.panes().length - 1),
        setPaneStretchFactors: (factors) =>
            chart.panes().forEach((p, i) => p.setStretchFactor(factors[i])),

        addLineSeries: (options, paneIndex) => {
            const handle = wrapSeries(chart.addSeries(LineSeries, options, paneIndex));
            handles.push(handle);
            return handle;
        },
        addHistogramSeries: (options, paneIndex) => {
            const handle = wrapSeries(chart.addSeries(HistogramSeries, options, paneIndex));
            handles.push(handle);
            return handle;
        },
        removeSeries(handle) {
            const idx = handles.indexOf(handle);
            if (idx !== -1) handles.splice(idx, 1);
            try { chart.removeSeries(handle.native ?? handle); } catch { /* series already gone */ }
        },

        setMagnet: (enabled) => chart.applyOptions({
            crosshair: { mode: enabled ? CrosshairMode.Magnet : CrosshairMode.Normal },
        }),
        setCrosshairColor: (color) => chart.applyOptions({ crosshair: { vertLine: { color } } }),
        setCrosshairPosition: (price, time) =>
            priceSeries && chart.setCrosshairPosition(price, time, priceSeries),
        clearCrosshair: () => chart.clearCrosshairPosition?.(),

        onVisibleRangeChange(cb) {
            chart.timeScale().subscribeVisibleLogicalRangeChange(cb);
            return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(cb);
        },

        onCrosshairMove(cb) {
            const handler = (param) => {
                if (!param.point || !priceSeries) {
                    cb(null);
                    return;
                }
                // Beyond the last bar param.time is null: extrapolate so the
                // crosshair (and drawing previews) work in the right whitespace.
                const time = param.time ?? extrapolateTime(param.point.x);
                if (time == null) {
                    cb(null);
                    return;
                }
                // Values keyed by engine handle so call sites stay engine-neutral.
                const seriesValues = new Map();
                handles.forEach(h => {
                    const value = param.seriesData.get(h.native);
                    if (value !== undefined) seriesValues.set(h, value);
                });
                cb({
                    time,
                    point: param.point,
                    price: priceSeries.coordinateToPrice(param.point.y),
                    priceBar: param.seriesData.get(priceSeries),
                    seriesValues,
                });
            };
            chart.subscribeCrosshairMove(handler);
            return () => chart.unsubscribeCrosshairMove(handler);
        },

        onClick(cb) {
            const handler = (param) => {
                if (!param.point || !priceSeries) {
                    cb(null);
                    return;
                }
                const time = param.time ?? extrapolateTime(param.point.x);
                if (time == null) {
                    cb(null);
                    return;
                }
                cb({ time, price: priceSeries.coordinateToPrice(param.point.y) });
            };
            chart.subscribeClick(handler);
            return () => chart.unsubscribeClick(handler);
        },

        onRedraw(cb) {
            redrawCallback = cb;
            attachRedraw();
            return () => { if (redrawCallback === cb) redrawCallback = null; };
        },
    };
}
