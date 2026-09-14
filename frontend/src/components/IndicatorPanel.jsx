import React from 'react';
import { SMA_SOURCES } from '../Indicators/sma';
import { discoverInputs } from '../Indicators/dsl/runtime';
import { SCRIPT_TYPES, scriptFields } from '../Indicators/scripts';

/**
 * Schema-driven settings form for script-based indicators. `fields` is the
 * input schema (registry fields for built-ins, discoverInputs for custom
 * scripts); `values` holds the current value per field key.
 */
const ScriptSettings = ({ fields, values = {}, disabled = false, onChange, scriptError }) => (
    <div className="indicator-settings rsi-grid">
        {fields.filter(f => f.type !== 'symbols').map(field => (
            <div key={field.key} className="setting-item">
                <label>{field.label}</label>
                {(field.type === 'int' || field.type === 'float') && (
                    <input
                        type="number"
                        disabled={disabled}
                        min={field.min} max={field.max} step={field.step ?? (field.type === 'int' ? 1 : 0.1)}
                        value={values[field.key] ?? field.default}
                        onChange={(e) => onChange(field.key, field.type === 'int'
                            ? (parseInt(e.target.value) || 0)
                            : (parseFloat(e.target.value) || 0))}
                    />
                )}
                {field.type === 'bool' && (
                    <input
                        type="checkbox"
                        disabled={disabled}
                        checked={values[field.key] ?? field.default}
                        onChange={(e) => onChange(field.key, e.target.checked)}
                    />
                )}
                {field.type === 'string' && !field.options && (
                    <input
                        type="text"
                        disabled={disabled}
                        value={values[field.key] ?? field.default}
                        onChange={(e) => onChange(field.key, e.target.value)}
                    />
                )}
                {field.type === 'string' && field.options && (
                    <select
                        disabled={disabled}
                        value={values[field.key] ?? field.default}
                        onChange={(e) => onChange(field.key, e.target.value)}
                    >
                        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                )}
                {field.type === 'color' && (
                    <input
                        type="color"
                        disabled={disabled}
                        value={values[field.key] ?? field.default}
                        onChange={(e) => onChange(field.key, e.target.value)}
                    />
                )}
                {field.type === 'source' && (
                    <select
                        disabled={disabled}
                        value={values[field.key] ?? field.default}
                        onChange={(e) => onChange(field.key, e.target.value)}
                    >
                        {SMA_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                )}
            </div>
        ))}
        {scriptError && <div className="custom-script-error" style={{ gridColumn: '1 / -1' }}>{scriptError}</div>}
    </div>
);

/**
 * A standalone component for an indicator group (e.g. SMA or RSI)
 */
const IndicatorGroupPanel = ({
    title,
    groupType,
    indicators,
    updateIndicator,
    removeIndicator,
    removeIndicatorGroup,
    toggleIndicator,
    invalidSymbols = [],
    scriptsById = null,
    scriptErrors = null,
    minimizedTop,
    isMinimized,
    onMinimizeChange
}) => {
    if (!indicators || indicators.length === 0) return null;

    if (isMinimized) {
        const icon = groupType === 'sma' ? '📈' :
            groupType === 'rsi' ? '📊' :
                groupType === 'macd' ? '📊' :
                    groupType === 'bb' ? '📊' :
                        groupType === 'stoch' ? '📊' :
                            groupType === 'supertrend' ? '📊' :
                                groupType === 'atr' ? '📊' :
                                    groupType === 'ichimoku' ? '📊' :
                                        groupType === 'tsi' ? '📊' :
                                            groupType === 'ad' ? '📊' :
                                                groupType === 'smi' ? '🧮' :
                                                groupType === 'w52' ? '📈' :
                                                    groupType === 'vol_sma' ? '📊' : '📊';
        return (
            <button
                className="indicator-panel-minimized-btn"
                style={{ position: 'absolute', top: minimizedTop || '36px', right: 0 }}
                onClick={() => onMinimizeChange(false)}
                title={`Expand ${title} settings`}
            >
                {icon}
            </button>
        );
    }

    return (
        <div className={`indicator-panel${groupType === 'smi' ? ' wide' : ''}`}>
            {/* Header for this specific group */}
            <div className="indicator-panel-header">
                <span className="panel-title">{title}</span>
                <div className="panel-controls">
                    <button
                        className="header-action-btn minimize"
                        onClick={(e) => { e.stopPropagation(); onMinimizeChange(true); }}
                        title="Minimize"
                    >
                        −
                    </button>
                    <button
                        className="header-action-btn remove"
                        title={`Remove all ${title}`}
                        onClick={() => removeIndicatorGroup(groupType)}
                    >
                        ✕
                    </button>
                </div>
            </div>

            <div className="indicator-panel-content">
                {indicators.map((ind, idx) => (
                    <div key={ind.id} className={`indicator-row ${!ind.visible ? 'row-hidden' : ''}`}>
                        {/* Main Controls */}
                        <div className="indicator-row-main">
                            <div className="indicator-info">
                                {ind.color && <span className="color-swatch" style={{ backgroundColor: ind.color }} />}
                                <label className="indicator-label">
                                    {groupType === 'custom' ? (ind.name || 'Custom Script') :
                                    groupType === 'sma' ? `SMA ${idx + 1}` :
                                        groupType === 'rsi' ? `RSI (${ind.length})` :
                                            groupType === 'macd' ? 'Normalized MACD' :
                                                groupType === 'volume_profile' ? `Volume Profile (${ind.priceBins})` :
                                                    groupType === 'bb' ? `BB (${ind.length}, ${ind.stdDev})` :
                                                        groupType === 'stoch' ? `Stoch (${ind.length}, ${ind.dLength})` :
                                                            groupType === 'supertrend' ? `Supertrend (${ind.atrLength}, ${ind.factor})` :
                                                                groupType === 'atr' ? `ATR (${ind.length})` :
                                                                    groupType === 'ichimoku' ? `Ichimoku Cloud` :
                                                                        groupType === 'tsi' ? `TSI (${ind.longLength}, ${ind.shortLength}, ${ind.signalLength})` :
                                                                                groupType === 'ad' ? 'Accum/Dist' :
                                                                                    groupType === 'smi' ? `SMI (${(ind.constituents || []).length} symbols)` :
                                                                                groupType === 'w52' ? `52W High/Low (${ind.basis === 'close' ? 'Close' : 'Highs/Lows'})` :
                                                                                    groupType === 'volume' ? 'Volume' :
                                                                                    groupType === 'vol_sma' ? `Vol SMA (${ind.length})` : 'Indicator'}
                                </label>
                            </div>
                            <div className="indicator-actions">
                                <button
                                    className={`action-btn ${!ind.visible ? 'hidden' : ''}`}
                                    onClick={() => toggleIndicator(ind.id)}
                                >
                                    {ind.visible ? '👁' : '👁\u200d🗨'}
                                </button>
                                {(groupType === 'sma' || groupType === 'custom') && (
                                    <button
                                        className="action-btn remove-single"
                                        onClick={() => removeIndicator(ind.id)}
                                        title="Remove this indicator"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Script-based indicator settings: schema-driven from
                            the field registry (built-ins) or input
                            declarations (custom scripts). */}
                        {SCRIPT_TYPES.includes(groupType) && (
                            <ScriptSettings
                                fields={scriptFields(groupType)}
                                values={ind}
                                disabled={!ind.visible}
                                onChange={(key, value) => updateIndicator(ind.id, { [key]: value })}
                            />
                        )}

                        {/* SMI Constituents (base value and color are
                            handled by the generic script settings above) */}
                        {groupType === 'smi' && (
                            <div className="indicator-settings smi-grid">
                                {(ind.constituents || []).map((c, ci) => (
                                    <React.Fragment key={ci}>
                                        <div className="setting-item">
                                            <label>Symbol {ci + 1}</label>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={c.enabled !== false}
                                                    title={c.enabled !== false ? 'Disable symbol' : 'Enable symbol'}
                                                    onChange={(e) => {
                                                        const constituents = ind.constituents.map((x, xi) => xi === ci ? { ...x, enabled: e.target.checked } : x);
                                                        updateIndicator(ind.id, { constituents });
                                                    }}
                                                />
                                                <input
                                                    type="text" value={c.symbol}
                                                    disabled={!ind.visible || c.enabled === false}
                                                    style={{ ...(invalidSymbols.includes(c.symbol) ? { borderColor: '#ef5350', color: '#ef5350' } : {}), ...(c.enabled === false ? { opacity: 0.4 } : {}) }}
                                                    title={invalidSymbols.includes(c.symbol) ? 'Invalid symbol: no data received' : undefined}
                                                    onChange={(e) => {
                                                        const constituents = ind.constituents.map((x, xi) => xi === ci ? { ...x, symbol: e.target.value.toUpperCase() } : x);
                                                        updateIndicator(ind.id, { constituents });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="setting-item">
                                            <label>Weight</label>
                                            <input
                                                type="number" step="0.01" min="0" max="1" value={c.weight}
                                                disabled={!ind.visible}
                                                onChange={(e) => {
                                                    const constituents = ind.constituents.map((x, xi) => xi === ci ? { ...x, weight: Math.max(0, parseFloat(e.target.value) || 0) } : x);
                                                    updateIndicator(ind.id, { constituents });
                                                }}
                                            />
                                        </div>
                                        <div className="setting-item" style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <button
                                                className="action-btn remove-single"
                                                title="Remove symbol"
                                                onClick={() => updateIndicator(ind.id, { constituents: ind.constituents.filter((_, xi) => xi !== ci) })}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </React.Fragment>
                                ))}
                                <div className="setting-item" style={{ gridColumn: 'span 3' }}>
                                    <button
                                        className="action-btn"
                                        title="Add symbol"
                                        style={{ width: '100%' }}
                                        onClick={() => updateIndicator(ind.id, { constituents: [...(ind.constituents || []), { symbol: '', weight: 0, enabled: true }] })}
                                    >
                                        + Add Symbol
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* Custom Script Settings */}
                        {groupType === 'custom' && (() => {
                            const script = scriptsById?.[ind.scriptId];
                            if (!script) return <div className="custom-script-error">Script not found on server</div>;
                            const { schema, error } = discoverInputs(script.code);
                            if (error) return <div className="custom-script-error">{error}</div>;
                            return (
                                <ScriptSettings
                                    fields={schema}
                                    values={ind.inputs}
                                    disabled={!ind.visible}
                                    onChange={(key, value) => updateIndicator(ind.id, { inputs: { ...ind.inputs, [key]: value } })}
                                    scriptError={scriptErrors?.[ind.id]}
                                />
                            );
                        })()}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default IndicatorGroupPanel;
