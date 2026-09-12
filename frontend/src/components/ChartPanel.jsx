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
import { useCustomIndicatorResults } from '../hooks/useCustomIndicatorResults';

const formatPrice = (price) => (price != null ? price.toFixed(2) : '');
const formatPercent = (val) => (val != null ? (val >= 0 ? '+' : '') + val.toFixed(2) + '%' : '');

const OVERLAY_ORDER = ['sma', 'bb', 'supertrend', 'ichimoku', 'volume_profile', 'vp', 'w52', 'vol_sma'];

const PANEL_DEFS = [
    { title: 'Moving Averages', groupType: 'sma' },
    { title: 'Relative Strength Index', groupType: 'rsi' },
    { title: 'Normalized MACD', groupType: 'macd' },
    { title: 'Volume Profile / HD', groupType: 'volume_profile' },
    { title: 'Bollinger Bands', groupType: 'bb' },
    { title: 'Stochastic Oscillator', groupType: 'stoch' },
    { title: 'SuperTrend', groupType: 'supertrend' },
    { title: 'Average True Range', groupType: 'atr' },
    { title: 'Ichimoku Cloud', groupType: 'ichimoku' },
    { title: 'TSI', groupType: 'tsi' },
    { title: 'Accumulation/Distribution', groupType: 'ad' },
    { title: '52 Week High/Low', groupType: 'w52' },
    { title: 'Volume SMA', groupType: 'vol_sma' },
    { title: 'Simple Market Index', groupType: 'smi' },
    { title: 'Custom Script', groupType: 'custom' },
];

const ChartPanel = ({
    chart,
    isActive,
    locked,
    activeTool,
    setActiveTool,
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
    const activeRsi = indicators.find(i => i.type === 'rsi' && i.visible);

    const { resultsById: customResults, paneIds: customPaneIds, errorsById: customErrors } =
        useCustomIndicatorResults(data, indicators, scriptsById);

    const activePaneTypes = [...getActivePaneTypes(indicators), ...customPaneIds];
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

                {/* SMA LEGENDS */}
                <div className="chart-legend-indicators price-indicators">
                    {indicators.filter(i => i.type === 'sma' && i.visible).map(ind => {
                        const val = hoveredData?.smas?.[ind.id];
                        return (
                            <div key={ind.id} className="legend-item">
                                <span className="legend-bullet" style={{ backgroundColor: ind.color }}></span>
                                <span className="legend-label">SMA {ind.length}{ind.source !== 'close' && <span className="legend-source">({ind.source})</span>}</span>
                                <span className="legend-value" style={{ color: ind.color }}>{val != null ? val.toFixed(2) : ''}</span>
                            </div>
                        );
                    })}
                </div>

                {/* 52 WEEK HIGH/LOW LEGEND */}
                <div className="chart-legend-indicators price-indicators">
                    {indicators.filter(i => i.type === 'w52' && i.visible).map(ind => (
                        <div key={ind.id} className="legend-item">
                            <span className="legend-bullet" style={{ backgroundColor: ind.color }}></span>
                            <span className="legend-label">52W{ind.basis === 'close' ? ' (Close)' : ''}</span>
                            <span className="legend-value" style={{ color: ind.color }}>
                                {hoveredData?.w52s?.[ind.id]?.high?.toFixed(2) || ''}
                                <span style={{ margin: '0 4px', opacity: 0.5 }}>/</span>
                                {hoveredData?.w52s?.[ind.id]?.low?.toFixed(2) || ''}
                            </span>
                        </div>
                    ))}
                </div>

                {/* VOLUME SMA LEGEND */}
                <div className="chart-legend-indicators price-indicators">
                    {indicators.filter(i => i.type === 'vol_sma' && i.visible).map(ind => (
                        <div key={ind.id} className="legend-item">
                            <span className="legend-bullet" style={{ backgroundColor: ind.color }}></span>
                            <span className="legend-label">Vol SMA ({ind.length})</span>
                            <span className="legend-value" style={{ color: ind.color }}>
                                {hoveredData?.volSmas?.[ind.id]?.value != null ? formatADLValue(hoveredData.volSmas[ind.id].value) : ''}
                            </span>
                        </div>
                    ))}
                </div>

                {/* SUPERTREND LEGEND */}
                <div className="chart-legend-indicators price-indicators">
                    {indicators.filter(i => i.type === 'supertrend' && i.visible).map(ind => {
                        const stData = hoveredData?.supertrend?.[ind.id];
                        const color = stData?.trend === 1 ? ind.upColor : ind.downColor;
                        return (
                            <div key={ind.id} className="legend-item">
                                <span className="legend-bullet" style={{ backgroundColor: color }}></span>
                                <span className="legend-label">SuperTrend ({ind.atrLength}, {ind.factor})</span>
                                <span className="legend-value" style={{ color: color }}>
                                    {stData?.value?.toFixed(2) || ''}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* ICHIMOKU LEGEND */}
                <div className="chart-legend-indicators price-indicators">
                    {indicators.filter(i => i.type === 'ichimoku' && i.visible).map(ind => {
                        const icData = hoveredData?.ichimoku?.[ind.id];
                        return (
                            <div key={ind.id} className="legend-item" style={{ fontSize: '11px' }}>
                                <span className="legend-label">Ichimoku</span>
                                <span style={{ color: ind.tenkanColor, marginLeft: '4px' }}>T: {icData?.tenkan?.toFixed(2) || ''}</span>
                                <span style={{ color: ind.kijunColor, marginLeft: '4px' }}>K: {icData?.kijun?.toFixed(2) || ''}</span>
                                <span style={{ color: '#26a69a', marginLeft: '4px' }}>SA: {icData?.spanA?.toFixed(2) || ''}</span>
                                <span style={{ color: '#ef5350', marginLeft: '4px' }}>SB: {icData?.spanB?.toFixed(2) || ''}</span>
                                <span style={{ color: ind.chikouColor, marginLeft: '4px' }}>C: {icData?.chikou?.toFixed(2) || ''}</span>
                            </div>
                        );
                    })}
                </div>

                {/* BOLLINGER BANDS LEGEND */}
                <div className="chart-legend-indicators price-indicators">
                    {indicators.filter(i => i.type === 'bb' && i.visible).map(ind => (
                        <div key={ind.id} className="legend-item">
                            <span className="legend-bullet" style={{ backgroundColor: ind.basisColor }}></span>
                            <span className="legend-label">BB{ind.showInputInStatus ? ` (${ind.length}, ${ind.stdDev})` : ''}</span>
                            {ind.showStatusValues && (
                                <span className="legend-value">
                                    <span style={{ color: ind.basisColor }}>{hoveredData?.bbs?.[ind.id]?.basis?.toFixed(ind.precision) || ''}</span>
                                    <span style={{ margin: '0 4px', opacity: 0.5 }}>/</span>
                                    <span style={{ color: ind.upperColor }}>{hoveredData?.bbs?.[ind.id]?.upper?.toFixed(ind.precision) || ''}</span>
                                    <span style={{ margin: '0 4px', opacity: 0.5 }}>/</span>
                                    <span style={{ color: ind.lowerColor }}>{hoveredData?.bbs?.[ind.id]?.lower?.toFixed(ind.precision) || ''}</span>
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                {/* RSI LEGEND */}
                {activeRsi && (
                    <div className="chart-legend-indicators" style={{ top: paneLegendTop('rsi') }}>
                        <div className="legend-item">
                            <span className="legend-bullet" style={{ backgroundColor: activeRsi.color }}></span>
                            <span className="legend-label">RSI ({activeRsi.length}, {activeRsi.source})</span>
                            <span className="legend-value" style={{ color: activeRsi.color }}>
                                {hoveredData?.rsis?.[activeRsi.id]?.rsi?.toFixed(2) || ''}
                            </span>
                        </div>
                        {activeRsi.smoothingType === 'SMA' && (
                            <div className="legend-item">
                                <span className="legend-bullet" style={{ backgroundColor: activeRsi.smoothColor }}></span>
                                <span className="legend-label">Smooth ({activeRsi.smoothingLength})</span>
                                <span className="legend-value" style={{ color: activeRsi.smoothColor }}>
                                    {hoveredData?.rsis?.[activeRsi.id]?.smoothed?.toFixed(2) || ''}
                                </span>
                            </div>
                        )}
                        {activeRsi.showBB && (
                            <div className="legend-item">
                                <span className="legend-label" style={{ opacity: 0.5 }}>BB (2)</span>
                                <span className="legend-value" style={{ color: activeRsi.bbColor }}>
                                    {hoveredData?.rsis?.[activeRsi.id]?.bbUpper?.toFixed(2) || ''} / {hoveredData?.rsis?.[activeRsi.id]?.bbLower?.toFixed(2) || ''}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* TSI LEGEND */}
                {indicators.find(i => i.type === 'tsi' && i.visible) && (
                    <div className="chart-legend-indicators" style={{ top: paneLegendTop('tsi') }}>
                        {indicators.filter(i => i.type === 'tsi' && i.visible).map(ind => (
                            <React.Fragment key={ind.id}>
                                <div className="legend-item">
                                    <span className="legend-bullet" style={{ backgroundColor: ind.color }}></span>
                                    <span className="legend-label">TSI ({ind.longLength}, {ind.shortLength})</span>
                                    <span className="legend-value" style={{ color: ind.color }}>
                                        {hoveredData?.tsi?.[ind.id]?.tsi?.toFixed(2) || ''}
                                    </span>
                                </div>
                                <div className="legend-item">
                                    <span className="legend-bullet" style={{ backgroundColor: ind.signalColor }}></span>
                                    <span className="legend-label">Signal ({ind.signalLength})</span>
                                    <span className="legend-value" style={{ color: ind.signalColor }}>
                                        {hoveredData?.tsi?.[ind.id]?.signal?.toFixed(2) || ''}
                                    </span>
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {/* MACD LEGEND */}
                {indicators.find(i => i.type === 'macd' && i.visible) && (
                    <div className="chart-legend-indicators" style={{ top: paneLegendTop('macd') }}>
                        <div className="legend-item">
                            <span className="legend-bullet" style={{ backgroundColor: '#2962ff' }}></span>
                            <span className="legend-label">MACD</span>
                            <span className="legend-value" style={{ color: '#2962ff' }}>
                                {hoveredData?.macds?.['macd-main']?.macd?.toFixed(3) || ''}
                            </span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-bullet" style={{ backgroundColor: '#ff9800' }}></span>
                            <span className="legend-label">Signal</span>
                            <span className="legend-value" style={{ color: '#ff9800' }}>
                                {hoveredData?.macds?.['macd-main']?.signal?.toFixed(3) || ''}
                            </span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-label">Hist</span>
                            <span className="legend-value">
                                {hoveredData?.macds?.['macd-main']?.histogram?.toFixed(3) || ''}
                            </span>
                        </div>
                    </div>
                )}

                {/* STOCHASTIC LEGEND */}
                {indicators.find(i => i.type === 'stoch' && i.visible) && (
                    <div className="chart-legend-indicators" style={{ top: paneLegendTop('stoch') }}>
                        <div className="legend-item">
                            <span className="legend-bullet" style={{ backgroundColor: '#2962ff' }}></span>
                            <span className="legend-label">Stoch %K</span>
                            <span className="legend-value" style={{ color: '#2962ff' }}>
                                {hoveredData?.stochs?.['stoch-main']?.k?.toFixed(2) || ''}
                            </span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-bullet" style={{ backgroundColor: '#ff9800' }}></span>
                            <span className="legend-label">%D</span>
                            <span className="legend-value" style={{ color: '#ff9800' }}>
                                {hoveredData?.stochs?.['stoch-main']?.d?.toFixed(2) || ''}
                            </span>
                        </div>
                    </div>
                )}

                {/* ATR LEGEND */}
                {indicators.find(i => i.type === 'atr' && i.visible) && (
                    <div className="chart-legend-indicators" style={{ top: paneLegendTop('atr') }}>
                        {indicators.filter(i => i.type === 'atr' && i.visible).map(ind => (
                            <div key={ind.id} className="legend-item">
                                <span className="legend-bullet" style={{ backgroundColor: ind.color }}></span>
                                <span className="legend-label">ATR ({ind.length})</span>
                                <span className="legend-value" style={{ color: ind.color }}>
                                    {hoveredData?.atrs?.[ind.id]?.value?.toFixed(2) || ''}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* ACCUMULATION/DISTRIBUTION LEGEND */}
                {indicators.find(i => i.type === 'ad' && i.visible) && (
                    <div className="chart-legend-indicators" style={{ top: paneLegendTop('ad') }}>
                        {indicators.filter(i => i.type === 'ad' && i.visible).map(ind => (
                            <div key={ind.id} className="legend-item">
                                <span className="legend-bullet" style={{ backgroundColor: ind.color }}></span>
                                <span className="legend-label">Accum/Dist</span>
                                <span className="legend-value" style={{ color: ind.color }}>
                                    {hoveredData?.ads?.[ind.id]?.value != null ? formatADLValue(hoveredData.ads[ind.id].value) : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* SIMPLE MARKET INDEX LEGEND */}
                {indicators.find(i => i.type === 'smi' && i.visible) && (
                    <div className="chart-legend-indicators" style={{ top: paneLegendTop('smi') }}>
                        {indicators.filter(i => i.type === 'smi' && i.visible).map(ind => (
                            <div key={ind.id} className="legend-item">
                                <span className="legend-bullet" style={{ backgroundColor: ind.color }}></span>
                                <span className="legend-label">
                                    SMI ({(ind.constituents || []).filter(c => c.enabled !== false).map(c => c.symbol).join(', ')})
                                </span>
                                {smiInvalidSymbols.length > 0 && (
                                    <span className="legend-value" style={{ color: '#ef5350' }} title={`No data for: ${smiInvalidSymbols.join(', ')}`}>
                                        ⚠
                                    </span>
                                )}
                                <span className="legend-value" style={{ color: ind.color }}>
                                    {hoveredData?.smis?.[ind.id]?.value != null ? hoveredData.smis[ind.id].value.toFixed(2) : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

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
                            scriptsById={def.groupType === 'custom' ? scriptsById : null}
                            scriptErrors={def.groupType === 'custom' ? customErrors : null}
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
                        adFullData={adFullData}
                        smiData={smiData}
                        chartType={chartType}
                        symbol={symbol}
                        provider={provider}
                        interval={interval}
                        indicators={indicators}
                        drawings={drawings}
                        setDrawings={setDrawings}
                        activeTool={activeTool}
                        setActiveTool={setActiveTool}
                        onVisibleLogicalRangeChange={handleVisibleLogicalRangeChange}
                        onCrosshairMove={setHoveredData}
                        customResults={customResults}
                        customPaneIds={customPaneIds}
                    />
                )}
            </div>
        </div>
    );
};

export default ChartPanel;
