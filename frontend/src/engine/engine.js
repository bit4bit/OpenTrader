// ChartEngine contract — the pluggable chart stack.
//
// An engine owns: the chart canvas, price/volume series, indicator series,
// panes, axes, zoom/pan, crosshair, and coordinate conversion between
// {time, price} and pixels. Renderers (render/) draw user tools on top via
// the converters; interaction state machines (chart/drawingInteraction.js)
// consume the events.
//
// Implementations: lwcEngine.js (lightweight-charts). A future WebGPU
// engine implements the same surface. Selection: engine/index.js (build
// time, VITE_CHART_ENGINE).
//
// Interface (createXEngine(container, { timeFormatter }) -> engine):
//
//   Lifecycle
//     dispose()
//
//   Size / coordinate conversion (null when unconvertible). Converters
//   extrapolate past the data edges so drawings can extend into the
//   whitespace beyond the first/last bar.
//     size() -> { width, height }
//     timeToX(time) -> px | null
//     priceToY(price) -> px | null
//     xToTime(px) -> time | null
//     yToPrice(py) -> price | null
//
//   Visible range (logical { from, to })
//     getVisibleRange() -> { from, to } | null
//     setVisibleRange(range)
//     fitContent()
//
//   Price
//     setPriceSeries(chartType, rows)   // 'candles' | 'line'; rows already
//                                       // presentation-mapped (heikin-ashi)
//     applyPriceScaleMargins({ top, bottom })
//
//   Panes (indicator subplots below the price pane)
//     paneCount()
//     addPane()
//     removeLastPane()
//     setPaneStretchFactors(factors)
//
//   Indicator series. Handles are opaque objects:
//   { setData(rows), applyOptions(options) }.
//     addLineSeries(options, paneIndex) -> handle
//     addHistogramSeries(options, paneIndex) -> handle
//     removeSeries(handle)
//
//   Crosshair
//     setMagnet(enabled)
//     setCrosshairColor(color)
//     setCrosshairPosition(price, time)
//     clearCrosshair()
//
//   Events — each returns an unsubscribe function.
//     onVisibleRangeChange(cb(range))
//     onCrosshairMove(cb(evt | null))
//       evt: { time, point: {x,y}, price, priceBar,
//              seriesValues: Map(handle -> value) }
//     onClick(cb(evt | null))   evt: { time, price }
//     onRedraw(cb())            // fires on every internal repaint
//                               // (pan/zoom/resize) — drives overlay redraws
