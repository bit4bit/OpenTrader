import React, { useState, useCallback } from 'react';
import Chart from './Chart';
import IndicatorPanel from './IndicatorPanel';
import { useChartData, useAdFullData, useMarketIndexData } from '../hooks/useChartData';
import {
    updateIndicator as updateIndicatorIn,
    removeIndicator as removeIndicatorIn,
    removeIndicatorGroup as removeIndicatorGroupIn,
    toggleIndicator as toggleIndicatorIn,
} from '../Indicators/actions';
import { formatADLValue } from '../Indicators/adl';
import { getActivePaneTypes } from '../Indicators/panes';
import { SCRIPT_TYPES, isScriptPane, INDICATOR_TYPES, indicatorTitle } from '../Indicators/scripts';
import { useIndicatorResults } from '../hooks/useIndicatorResults';

const formatPrice = (price) => (price != null ? price.toFixed(2) : '');
const formatPercent = (val) => (val != null ? (val >= 0 ? '+' : '') + val.toFixed(2) + '%' : '');
const formatLegendValue = (val, type) =>
    type === 'ad' ? formatADLValue(val) : val.toFixed(2);

const OVERLAY_ORDER = ['sma', 'bb', 'supertrend', 'ichimoku', 'volume_profile', 'vp', 'w52', 'vol_sma'];

const PANEL_DEFS = [...INDICATOR_TYPES.map(t => ({ title: indicatorTitle(t), groupType: t })),
    { title: 'Custom Script', groupType: 'custom' }];

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
    const { symbol: chartSymbol, interval, chartType, indicators, drawings, minimizedPanels = [] } = chart;
    const symbol = chartSymbol?.symbol || '';
    const provider = chartSymbol?.provider || null;
    const { data, loading, loadingMore, error, unsupported, handleVisibleLogicalRangeChange } = useChartData(symbol, provider, interval);
    const adFullData = useAdFullData(symbol, provider, interval, indicators);
    const { data: smiData, invalidSymbols: smiInvalidSymbols } = useMarketIndexData(indicators, interval);
    const [hoveredData, setHoveredData] = useState(null);

    const patchIndicators = useCallback((fn) => {
        onUpdate(chart.id, c => ({ indicators: fn(c.indicators) }));
    }, [chart.id, onUpdate]);

    const setDrawings = useCallback((updater) => {
        onUpdate(chart.id, c => ({
            drawings: typeof updater === 'function' ? updater(c.drawings) : updater,
        }));
    }, [chart.id, onUpdate]);

    const updateIndicator = useCallback((id, updates) => patchIndicators(list => updateIndicatorIn(list, id, updates)), [patchIndicators]);
    const removeIndicator = useCallback((id) => patchIndicators(list => removeIndicatorIn(list, id)), [patchIndicators]);
    const removeIndicatorGroup = useCallback((type) => patchIndicators(list => removeIndicatorGroupIn(list, type)), [patchIndicators]);
    const toggleIndicator = useCallback((id) => patchIndicators(list => toggleIndicatorIn(list, id)), [patchIndicators]);

    const setPanelMinimized = useCallback((groupType, minimized) => {
        onUpdate(chart.id, c => ({
            minimizedPanels: minimized
                ? [...new Set([...(c.minimizedPanels || []), groupType])]
                : (c.minimizedPanels || []).filter(t => t !== groupType),
        }));
    }, [chart.id, onUpdate]);

    const priceData = hoveredData?.price;
    const pnl = priceData ? ((priceData.close - priceData.open) / priceData.open * 100) : null;
    const pnlColor = pnl >= 0 ? '#26a69a' : '#ef5350';

    const indicatorResults = useIndicatorResults(data, adFullData, indicators, scriptsById, smiData);
    const customErrors = {};
    Object.entries(indicatorResults.errorsById).forEach(([id, err]) => {
        const ind = indicators.find(i => i.id === id);
        if (ind) customErrors[id] = err;
    });

    const activePaneTypes = [...getActivePaneTypes(indicators), ...indicatorResults.paneIds];
    const isPaneType = (type) => type === 'custom' || isScriptPane(type);
    const scriptLegendIndicators = [...SCRIPT_TYPES, 'custom'];
    const paneLegendTop = (type) => {
        const idx = activePaneTypes.indexOf(type);
        if (idx === -1) return undefined;
        const total = activePaneTypes.length + 3;
        return `calc(${(((3 + idx) * 100) / total).toFixed(3)}% + 6px)`;
    };

    const activeOverlayTypes = OVERLAY_ORDER.filter(t => indicators.some(i => i.type === t && i.visible));
    const minimizedTopFor = (type) => {
        if (activePaneTypes.includes(type)) return paneLegendTop(type);
        const idx = activeOverlayTypes.indexOf(type);
        return `calc(36px + ${Math.max(0, idx) * 34}px)`;
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
                        {indicators.filter(i => i.type === type && i.visible).map(ind =>
                            (hoveredData?.generic?.[ind.id] ?? []).map((p, pi) => (
                                <div key={`${ind.id}-${pi}`} className="legend-item">
                                    <span className="legend-bullet" style={{ backgroundColor: p.color }}></span>
                                    <span className="legend-label">{p.title}</span>
                                    <span className="legend-value" style={{ color: p.color }}>
                                        {p.value != null ? formatLegendValue(p.value, ind.type) : ''}
                                    </span>
                                </div>
                            ))
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

                <div className="indicator-panels-container">
                    {PANEL_DEFS.map(def => (
                        <IndicatorPanel
                            key={def.groupType}
                            title={def.title}
                            groupType={def.groupType}
                            minimizedTop={minimizedTopFor(def.groupType)}
                            isMinimized={minimizedPanels.includes(def.groupType)}
                            onMinimizeChange={(minimized) => setPanelMinimized(def.groupType, minimized)}
                            indicators={indicators.filter(i => i.type === def.groupType)}
                            invalidSymbols={def.groupType === 'smi' ? smiInvalidSymbols : []}
                            scriptsById={scriptsById}
                            scriptErrors={customErrors}
                            updateIndicator={updateIndicator}
                            removeIndicator={removeIndicator}
                            removeIndicatorGroup={removeIndicatorGroup}
                            toggleIndicator={toggleIndicator}
                        />
                    ))}
                </div>

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
