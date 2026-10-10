import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Chart from './Chart';
import { useChartData, useAdFullData, useMarketIndexData } from '../hooks/useChartData';
import { useSymbolInfo } from '../hooks/useSymbolInfo';
import { useSymbolEarnings } from '../hooks/useSymbolEarnings';
import { formatADLValue } from '../Indicators/adl';
import { computeActivePaneTypes } from '../chart/paneLayout';
import { formatPriceValue, DEFAULT_PRICE_DECIMALS } from '../chart/priceFormat';
import { useProviderPriceDecimals } from '../hooks/useProviderPriceDecimals';
import { averageVolume } from '../chart/averageVolume';
import { volumeBarTotals } from '../chart/volumeInfo';
import { visiblePriceRange } from '../chart/visiblePriceRange';
import { INTRADAY_INTERVALS } from '../chart/timeFormat';
import { SCRIPT_TYPES, isScriptPane, scriptPaneType } from '../Indicators/scripts';
import { useIndicatorResults } from '../hooks/useIndicatorResults';
import { qoqEpsChangeAt } from '../chart/earningsLegend';

const formatPrice = (price, decimals) => formatPriceValue(price, decimals);
const formatPercent = (val) => (val != null ? (val >= 0 ? '+' : '') + val.toFixed(2) + '%' : '');
const formatVolumeValue = (val) => {
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
    return val.toFixed(0);
};
const formatLegendValue = (val, type, ind = null, pctShares = false) => {
    if (type === 'ad') return formatADLValue(val);
    if (type === 'volume') {
        if (ind?.pctShares) return val != null ? val.toFixed(3) + '%' : '';
        return formatVolumeValue(val);
    }
    if (type === 'vol_sma' || type === 'vol_ema') {
        if (pctShares) return val != null ? val.toFixed(3) + '%' : '';
        return formatVolumeValue(val);
    }
    if (type === 'trading_activity') return formatVolumeValue(val);
    return val.toFixed(2);
};
const formatVolumeChange = ({ delta, percent }) =>
    `${formatPercent(percent)} ${delta >= 0 ? '+' : '−'}${formatVolumeValue(Math.abs(delta))}`;
// % of shares mode re-expresses the count-scaled decorations as turnover
// percentage points so they stay meaningful next to the % bars.
const formatTurnover = (val, so) => {
    if (val == null || so == null) return '';
    return ((val / so) * 100).toFixed(3) + '%';
};
const formatVolumeChangePct = ({ delta, percent }, so) =>
    `${formatPercent(percent)} ${delta >= 0 ? '+' : '−'}${formatTurnover(Math.abs(delta), so)}`;
// Compact timestamp for the visible-range volume totals legend: date for
// daily+ intervals, date + time for intraday.
const formatWindowTime = (time, interval) => {
    const d = new Date(time * 1000);
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
    if (!INTRADAY_INTERVALS.includes(interval)) return date;
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${date} ${hh}:${mm}`;
};

const ChartPanel = ({
    chart,
    isActive,
    locked,
    activeTool,
    setActiveTool,
    magnetEnabled = true,
    onActivate,
    onClose,
    onUpdate,
    scriptsById,
}) => {
    const { symbol: chartSymbol, interval, chartType, indicators, drawings, showWeekendCandles } = chart;
    const symbol = chartSymbol?.symbol || '';
    const provider = chartSymbol?.provider || null;
    const priceDecimals = useProviderPriceDecimals()[provider] ?? DEFAULT_PRICE_DECIMALS;
    const { data, loading, loadingMore, error, unsupported, handleVisibleLogicalRangeChange } = useChartData(symbol, provider, interval);
    const adFullData = useAdFullData(symbol, provider, interval, indicators);
    const { data: smiData } = useMarketIndexData(indicators, interval);
    const symbolInfo = useSymbolInfo(symbol, provider);
    const earnings = useSymbolEarnings(symbol, provider);
    const [hoveredData, setHoveredData] = useState(null);

    // First visible bar's time, debounced until pan/zoom settles: the
    // Benchmark Index overlay rebases against it so comparison lines stay
    // near the candles instead of stretching the price scale. Keyed by
    // the data source so a symbol/interval switch drops the stale anchor.
    const anchorTimerRef = useRef(null);
    const dataKey = `${symbol}-${provider}-${interval}`;
    const [anchor, setAnchor] = useState(null); // { key, time }
    // Visible time window ({ key, fromTime, toTime }), debounced with the
    // anchor: feeds the volume pane's buy/sell bar totals legend.
    const [visibleWindow, setVisibleWindow] = useState(null);
    useEffect(() => () => clearTimeout(anchorTimerRef.current), []);
    const onVisibleRangeChange = useCallback((range) => {
        handleVisibleLogicalRangeChange(range);
        if (!range) return;
        clearTimeout(anchorTimerRef.current);
        anchorTimerRef.current = setTimeout(() => {
            if (data.length === 0) return;
            const firstVisibleIndex = Math.min(Math.max(Math.ceil(range.from), 0), data.length - 1);
            const lastVisibleIndex = Math.min(Math.max(Math.floor(range.to), 0), data.length - 1);
            setAnchor({ key: dataKey, time: data[firstVisibleIndex].time });
            setVisibleWindow({
                key: dataKey,
                fromTime: data[firstVisibleIndex].time,
                toTime: data[Math.max(firstVisibleIndex, lastVisibleIndex)].time,
            });
        }, 150);
    }, [handleVisibleLogicalRangeChange, data, dataKey]);
    const overlayAnchorTime = anchor?.key === dataKey ? anchor.time : null;

    const setDrawings = useCallback((updater) => {
        onUpdate(chart.id, c => ({
            drawings: typeof updater === 'function' ? updater(c.drawings) : updater,
        }));
    }, [chart.id, onUpdate]);

    const avgVolume = useMemo(() => averageVolume(data, interval), [data, interval]);

    const priceData = hoveredData?.price;
    const pnl = priceData ? ((priceData.close - priceData.open) / priceData.open * 100) : null;
    const pnlColor = pnl >= 0 ? '#26a69a' : '#ef5350';

    const indicatorResults = useIndicatorResults(data, adFullData, indicators, scriptsById, smiData, symbolInfo, earnings, overlayAnchorTime);

    const activePaneTypes = computeActivePaneTypes(indicators, indicatorResults.paneIds);
    const isPaneType = (type) => type === 'custom' || isScriptPane(type);
    const scriptLegendIndicators = [...SCRIPT_TYPES, 'custom'];
    const volumeIndicator = indicators.find(i => i.type === 'volume' && i.visible);
    const volumePctShares = volumeIndicator?.pctShares === true;
    // Divisor that re-expresses count-based legend decorations as turnover
    // % while the volume bars are in % of shares mode.
    const turnoverDivisor = volumePctShares ? symbolInfo?.sharesOutstanding : null;
    // Buy vs sell bar totals over the visible time window, matching the
    // volume bars' own up/down coloring.
    const visibleVolumeTotals = useMemo(() => {
        if (visibleWindow?.key !== dataKey) return null;
        return volumeBarTotals(data, visibleWindow.fromTime, visibleWindow.toTime);
    }, [data, visibleWindow, dataKey]);
    // Visible-scale price extremes (lowest low, highest high, spread in
    // percent) for the range legend next to the OHLC readout.
    const rangeStats = useMemo(() => {
        if (visibleWindow?.key !== dataKey) return null;
        return visiblePriceRange(data, visibleWindow.fromTime, visibleWindow.toTime);
    }, [data, visibleWindow, dataKey]);
    const volumeUpColor = volumeIndicator?.upColor ?? '#26a69a';
    const volumeDownColor = volumeIndicator?.downColor ?? '#ef5350';
    const formatWindowVolume = (val) =>
        turnoverDivisor != null ? formatTurnover(val, turnoverDivisor) : formatVolumeValue(val);
    const paneLegendTop = (type) => {
        const idx = activePaneTypes.indexOf(type);
        if (idx === -1) return undefined;
        const total = activePaneTypes.length + 3;
        return `calc(${(((3 + idx) * 100) / total).toFixed(3)}% + 6px)`;
    };

    return (
        <div
            className={`chart-tile${isActive ? ' active' : ''}`}
            onMouseDown={onActivate}
        >
            <div className="chart-tile-header">
                <span className="chart-tile-title">{symbol}{provider ? ` · ${provider}` : ''} · {interval}{avgVolume != null ? ` · Avg Vol ${formatVolumeValue(avgVolume)}` : ''}</span>
                <button
                    className="chart-tile-close"
                    title="Close chart"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={onClose}
                >
                    ✕
                </button>
            </div>
            <div className="chart-tile-body">
                {/* TOP LEGEND (Main OHLC) */}
                <div className="chart-legend-main">
                    {priceData && (
                        <div className="legend-ohlc">
                            <span className="ohlc-item"><span className="ohlc-label">O</span><span style={{ color: pnlColor }}>{formatPrice(priceData.open, priceDecimals)}</span></span>
                            <span className="ohlc-item"><span className="ohlc-label">H</span><span style={{ color: pnlColor }}>{formatPrice(priceData.high, priceDecimals)}</span></span>
                            <span className="ohlc-item"><span className="ohlc-label">L</span><span style={{ color: pnlColor }}>{formatPrice(priceData.low, priceDecimals)}</span></span>
                            <span className="ohlc-item"><span className="ohlc-label">C</span><span style={{ color: pnlColor }}>{formatPrice(priceData.close, priceDecimals)}</span></span>
                            <span style={{ color: pnlColor, fontWeight: 'bold' }}>{formatPercent(pnl)}</span>
                        </div>
                    )}
                    {/* Visible-scale range: lowest/highest price in view and
                        the spread between both in percent. */}
                    {rangeStats && (
                        <div className="legend-ohlc">
                            <span className="ohlc-item"><span className="ohlc-label">L</span><span style={{ color: '#ef5350' }}>{formatPrice(rangeStats.low, priceDecimals)}</span></span>
                            <span className="ohlc-item"><span className="ohlc-label">H</span><span style={{ color: '#26a69a' }}>{formatPrice(rangeStats.high, priceDecimals)}</span></span>
                            <span className="ohlc-item"><span className="ohlc-label">Δ</span><span>{formatPercent(rangeStats.percent)}</span></span>
                        </div>
                    )}
                </div>

                {/* SCRIPT INDICATOR LEGENDS (built-ins + custom): one legend
                    item per plot, bullets/titles/values from the script. */}
                {(() => {
                    const overlayIndicators = indicators.filter(i => scriptLegendIndicators.includes(i.type) && i.visible && !isPaneType(i.type))
                        .filter(ind => indicatorResults.resultsById[ind.id]?.plots.some(p => p.overlay));
                    if (overlayIndicators.length === 0) return null;
                    return (
                        <div className="chart-legend-overlay">
                            {overlayIndicators.map(ind => {
                                const plots = hoveredData?.generic?.[ind.id] ?? [];
                                return (
                                    <div key={ind.id} className="chart-legend-indicators price-indicators">
                                        {plots.map((p, pi) => (
                                            <div key={pi} className="legend-item">
                                                <span className="legend-bullet" style={{ backgroundColor: p.color }}></span>
                                                <span className="legend-label">{p.title}</span>
                                                <span className="legend-value" style={{ color: p.color }}>
                                                    {p.value != null ? formatLegendValue(p.value, ind.type, ind) : ''}
                                                </span>
                                                {p.change != null && p.value != null && (
                                                    <span
                                                        className="legend-volume-change"
                                                        style={{ color: p.change >= 0 ? '#26a69a' : '#ef5350' }}
                                                    >
                                                        {formatPercent(p.change * 100)}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
                {activePaneTypes.filter(t => !t.startsWith('custom-')).map(type => (
                    <div key={type} className="chart-legend-indicators" style={{ top: paneLegendTop(type) }}>
                        {indicators.filter(i => scriptPaneType(i.type) === type && i.visible).map(ind => {
                            const plots = hoveredData?.generic?.[ind.id] ?? [];
                            const buyersValue = ind.type === 'trading_activity' ? plots[1]?.value : null;
                            const qoqChange = ind.type === 'earnings'
                                ? qoqEpsChangeAt(data, earnings, hoveredData?.price?.time ?? null)
                                : null;
                            return (
                                <React.Fragment key={ind.id}>
                                    {plots.map((p, pi) => {
                                const isVolume = (ind.type === 'volume' || ind.type === 'trading_activity') && pi === 0;
                                const volumeChange = isVolume ? hoveredData?.volumeChange : null;
                                const volumeSplit = isVolume ? hoveredData?.volumeSplit : null;
                                const splitTotal = isVolume ? hoveredData?.volumeSplitTotal : null;
                                // Trading Activity's Sell Volume plot is the
                                // full-volume base bar; display the sell volume
                                // (base minus the overlaid buy volume).
                                const value = pi === 0 && buyersValue != null && p.value != null
                                    ? p.value - buyersValue
                                    : p.value;
                                return (
                                    <React.Fragment key={`${ind.id}-${pi}`}>
                                        <div className="legend-item">
                                            <span className="legend-bullet" style={{ backgroundColor: p.color }}></span>
                                            <span className="legend-label">{p.title}</span>
                                            <span className="legend-value" style={{ color: p.color }}>
                                                {value != null ? formatLegendValue(value, ind.type, ind, volumePctShares) : ''}
                                            </span>
                                            {volumeChange && value != null && (
                                                <span
                                                    className="legend-volume-change"
                                                    style={{ color: volumeChange.delta >= 0 ? '#26a69a' : '#ef5350' }}
                                                >
                                                    {turnoverDivisor != null
                                                        ? formatVolumeChangePct(volumeChange, turnoverDivisor)
                                                        : formatVolumeChange(volumeChange)}
                                                </span>
                                            )}
                                        </div>
                                        {volumeSplit && value != null && (
                                            <div className="legend-item">
                                                <span className="legend-label">
                                                    {turnoverDivisor != null
                                                        ? `Buy ${formatTurnover(volumeSplit.bought, turnoverDivisor)} · Sell ${formatTurnover(volumeSplit.sold, turnoverDivisor)}`
                                                        : `Buy ${formatVolumeValue(volumeSplit.bought)} · Sell ${formatVolumeValue(volumeSplit.sold)}`}
                                                </span>
                                                <span
                                                    className="legend-volume-change"
                                                    style={{ color: volumeSplit.percent >= 0 ? '#26a69a' : '#ef5350' }}
                                                >
                                                    Δ {formatPercent(volumeSplit.percent)}
                                                </span>
                                            </div>
                                        )}
                                        {splitTotal && value != null && (
                                            <div className="legend-item">
                                                <span className="legend-label">
                                                    {turnoverDivisor != null
                                                        ? `Total Buy ${formatTurnover(splitTotal.bought, turnoverDivisor)} · Sell ${formatTurnover(splitTotal.sold, turnoverDivisor)}`
                                                        : `Total Buy ${formatVolumeValue(splitTotal.bought)} · Sell ${formatVolumeValue(splitTotal.sold)}`}
                                                </span>
                                                <span
                                                    className="legend-volume-change"
                                                    style={{ color: splitTotal.percent >= 0 ? '#26a69a' : '#ef5350' }}
                                                >
                                                    Δ {formatPercent(splitTotal.percent)}
                                                </span>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                                })}
                                {qoqChange && plots.length > 0 && (
                                    <div className="legend-item">
                                        <span
                                            className="legend-bullet"
                                            style={{ backgroundColor: qoqChange.change >= 0 ? ind.beatColor : ind.missColor }}
                                        ></span>
                                        <span className="legend-label">QoQ {qoqChange.date}</span>
                                        <span
                                            className="legend-value"
                                            style={{ color: qoqChange.change >= 0 ? ind.beatColor : ind.missColor }}
                                        >
                                            {formatPercent(qoqChange.change)}
                                        </span>
                                    </div>
                                )}
                                </React.Fragment>
                            );
                        })}
                        {type === 'volume' && volumeIndicator && visibleVolumeTotals && (
                            <div className="legend-item">
                                <span className="legend-label">
                                    {formatWindowTime(visibleWindow.fromTime, interval)} → {formatWindowTime(visibleWindow.toTime, interval)}
                                </span>
                                <span className="legend-bullet" style={{ backgroundColor: volumeUpColor }}></span>
                                <span className="legend-label">
                                    Buy {visibleVolumeTotals.buyBars} bars · {formatWindowVolume(visibleVolumeTotals.buyVolume)}
                                </span>
                                <span className="legend-bullet" style={{ backgroundColor: volumeDownColor }}></span>
                                <span className="legend-label">
                                    Sell {visibleVolumeTotals.sellBars} bars · {formatWindowVolume(visibleVolumeTotals.sellVolume)}
                                </span>
                                <span
                                    className="legend-volume-change"
                                    style={{ color: visibleVolumeTotals.percent >= 0 ? volumeUpColor : volumeDownColor }}
                                >
                                    Δ {formatPercent(visibleVolumeTotals.percent)}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
                {indicators.filter(i => i.type === 'custom' && i.visible).map(ind => {
                    const paneType = `custom-${ind.id}`;
                    if (!activePaneTypes.includes(paneType)) return null;
                    return (
                        <div key={paneType} className="chart-legend-indicators" style={{ top: paneLegendTop(paneType) }}>
                            {(hoveredData?.generic?.[ind.id] ?? []).map((p, pi) => (
                                <div key={pi} className="legend-item">
                                    <span className="legend-bullet" style={{ backgroundColor: p.color }}></span>
                                    <span className="legend-label">{p.title}</span>
                                    <span className="legend-value" style={{ color: p.color }}>
                                        {p.value != null ? p.value.toFixed(2) : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })}

                {loading && (
                    <div className="chart-loader initial-loader">
                        Loading {symbol}...
                    </div>
                )}
                {loadingMore && (
                    <div className="chart-loader more-loader">
                        Fetching historical data...
                    </div>
                )}
                {error && !loading && (
                    <div className="chart-error-overlay">
                        {error}
                        {unsupported && (
                            <button
                                className="toolbar-btn"
                                style={{ marginTop: '10px' }}
                                onClick={() => onUpdate(chart.id, { symbol: { symbol: '', provider: null } })}
                            >
                                Change symbol
                            </button>
                        )}
                    </div>
                )}
                {data.length > 0 && (
                    <Chart
                        chartId={chart.id}
                        isActive={isActive}
                        syncEnabled={locked}
                        data={data}
                        chartType={chartType}
                        showWeekendCandles={showWeekendCandles}
                        symbol={symbol}
                        provider={provider}
                        interval={interval}
                        indicators={indicators}
                        drawings={drawings}
                        setDrawings={setDrawings}
                        activeTool={activeTool}
                        setActiveTool={setActiveTool}
                        magnetEnabled={magnetEnabled}
                        onVisibleLogicalRangeChange={onVisibleRangeChange}
                        onCrosshairMove={setHoveredData}
                        indicatorResults={indicatorResults}
                    />
                )}
            </div>
        </div>
    );
};

export default ChartPanel;
