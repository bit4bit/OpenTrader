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
    let volumeSeries = null;
    let redrawCallback = null;
    const handles = []; // engine series handles, for crosshair value lookups

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
            volumeSeries = null;
        },

        size: () => ({ width: container.clientWidth, height: container.clientHeight }),
        timeToX: (time) => chart.timeScale().timeToCoordinate(time),
        priceToY: (price) => (priceSeries ? priceSeries.priceToCoordinate(price) : null),
        xToTime: (px) => chart.timeScale().coordinateToTime(px),
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
        },

        setVolumeData(bars) {
            if (!volumeSeries) {
                volumeSeries = chart.addSeries(HistogramSeries, {
                    color: '#26a69a',
                    priceFormat: { type: 'volume' },
                    priceScaleId: 'volume',
                });
            }
            volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });
            volumeSeries.setData(bars.map(d => ({
                time: d.time,
                value: d.volume || 0,
                color: d.close >= d.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
            })));
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
                if (!param.time || !priceSeries || param.point === undefined) {
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
                    time: param.time,
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
                if (!param.point || !priceSeries || param.time === undefined || param.time === null) {
                    cb(null);
                    return;
                }
                cb({ time: param.time, price: priceSeries.coordinateToPrice(param.point.y) });
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
