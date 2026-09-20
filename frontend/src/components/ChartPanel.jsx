import React, { useState, useCallback } from 'react';
import Chart from './Chart';
import { useChartData, useAdFullData, useMarketIndexData } from '../hooks/useChartData';
import { formatADLValue } from '../Indicators/adl';
import { computeActivePaneTypes } from '../chart/paneLayout';
import { SCRIPT_TYPES, isScriptPane, scriptPaneType } from '../Indicators/scripts';
import { useIndicatorResults } from '../hooks/useIndicatorResults';

const formatPrice = (price) => (price != null ? price.toFixed(2) : '');
const formatPercent = (val) => (val != null ? (val >= 0 ? '+' : '') + val.toFixed(2) + '%' : '');
const formatVolumeValue = (val) => {
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
    return val.toFixed(0);
};
const formatLegendValue = (val, type) =>
    type === 'ad' ? formatADLValue(val)
        : (type === 'volume' || type === 'vol_sma') ? formatVolumeValue(val)
            : val.toFixed(2);
const formatVolumeChange = ({ delta, percent }) =>
    `${formatPercent(percent)} ${delta >= 0 ? '+' : '−'}${formatVolumeValue(Math.abs(delta))}`;

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
    const { symbol: chartSymbol, interval, chartType, indicators, drawings } = chart;
    const symbol = chartSymbol?.symbol || '';
    const provider = chartSymbol?.provider || null;
    const { data, loading, loadingMore, error, unsupported, handleVisibleLogicalRangeChange } = useChartData(symbol, provider, interval);
    const adFullData = useAdFullData(symbol, provider, interval, indicators);
    const { data: smiData } = useMarketIndexData(indicators, interval);
    const [hoveredData, setHoveredData] = useState(null);

    const setDrawings = useCallback((updater) => {
        onUpdate(chart.id, c => ({
            drawings: typeof updater === 'function' ? updater(c.drawings) : updater,
        }));
    }, [chart.id, onUpdate]);

    const priceData = hoveredData?.price;
    const pnl = priceData ? ((priceData.close - priceData.open) / priceData.open * 100) : null;
    const pnlColor = pnl >= 0 ? '#26a69a' : '#ef5350';

    const indicatorResults = useIndicatorResults(data, adFullData, indicators, scriptsById, smiData);

    const activePaneTypes = computeActivePaneTypes(indicators, indicatorResults.paneIds);
    const isPaneType = (type) => type === 'custom' || isScriptPane(type);
    const scriptLegendIndicators = [...SCRIPT_TYPES, 'custom'];
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
                <span className="chart-tile-title">{symbol}{provider ? ` · ${provider}` : ''} · {interval}</span>
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
                            <span className="ohlc-item"><span className="ohlc-label">O</span><span style={{ color: pnlColor }}>{formatPrice(priceData.open)}</span></span>
                            <span className="ohlc-item"><span className="ohlc-label">H</span><span style={{ color: pnlColor }}>{formatPrice(priceData.high)}</span></span>
                            <span className="ohlc-item"><span className="ohlc-label">L</span><span style={{ color: pnlColor }}>{formatPrice(priceData.low)}</span></span>
                            <span className="ohlc-item"><span className="ohlc-label">C</span><span style={{ color: pnlColor }}>{formatPrice(priceData.close)}</span></span>
                            <span style={{ color: pnlColor, fontWeight: 'bold' }}>{formatPercent(pnl)}</span>
                        </div>
                    )}
                </div>

                {/* SCRIPT INDICATOR LEGENDS (built-ins + custom): one legend
                    item per plot, bullets/titles/values from the script. */}
                {indicators.filter(i => scriptLegendIndicators.includes(i.type) && i.visible && !isPaneType(i.type)).map(ind => {
                    const plots = hoveredData?.generic?.[ind.id] ?? [];
                    const hasOverlay = indicatorResults.resultsById[ind.id]?.plots.some(p => p.overlay);
                    if (!hasOverlay) return null;
                    return (
                        <div key={ind.id} className="chart-legend-indicators price-indicators">
                            {plots.map((p, pi) => (
                                <div key={pi} className="legend-item">
                                    <span className="legend-bullet" style={{ backgroundColor: p.color }}></span>
                                    <span className="legend-label">{p.title}</span>
                                    <span className="legend-value" style={{ color: p.color }}>
                                        {p.value != null ? formatLegendValue(p.value, ind.type) : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })}
                {activePaneTypes.filter(t => !t.startsWith('custom-')).map(type => (
                    <div key={type} className="chart-legend-indicators" style={{ top: paneLegendTop(type) }}>
                        {indicators.filter(i => scriptPaneType(i.type) === type && i.visible).map(ind =>
                            (hoveredData?.generic?.[ind.id] ?? []).map((p, pi) => {
                                const volumeChange = ind.type === 'volume' && pi === 0 ? hoveredData?.volumeChange : null;
                                return (
                                    <div key={`${ind.id}-${pi}`} className="legend-item">
                                        <span className="legend-bullet" style={{ backgroundColor: p.color }}></span>
                                        <span className="legend-label">{p.title}</span>
                                        <span className="legend-value" style={{ color: p.color }}>
                                            {p.value != null ? formatLegendValue(p.value, ind.type) : ''}
                                        </span>
                                        {volumeChange && p.value != null && (
                                            <span
                                                className="legend-volume-change"
                                                style={{ color: volumeChange.delta >= 0 ? '#26a69a' : '#ef5350' }}
                                            >
                                                {formatVolumeChange(volumeChange)}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
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
                        symbol={symbol}
                        provider={provider}
                        interval={interval}
                        indicators={indicators}
                        drawings={drawings}
                        setDrawings={setDrawings}
                        activeTool={activeTool}
                        setActiveTool={setActiveTool}
                        magnetEnabled={magnetEnabled}
                        onVisibleLogicalRangeChange={handleVisibleLogicalRangeChange}
                        onCrosshairMove={setHoveredData}
                        indicatorResults={indicatorResults}
                    />
                )}
            </div>
        </div>
    );
};

export default ChartPanel;
