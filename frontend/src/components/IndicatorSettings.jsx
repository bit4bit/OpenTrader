import React from 'react';
import { SMA_SOURCES } from '../Indicators/sma';
import { discoverInputs } from '../Indicators/dsl/runtime';
import { SCRIPT_TYPES, scriptFields } from '../Indicators/scripts';
import { useIndexMembership } from '../hooks/useIndexMembership';

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
 * Benchmark Index settings (base value handled by the generic script
 * settings above): one row per index, plus a membership picker listing the
 * benchmark indexes the chart symbol belongs to.
 */
const BenchmarkSettings = ({ ind, chartSymbol, updateIndicator }) => {
    const { membership, error } = useIndexMembership(chartSymbol);
    const indexes = ind.indexes || [];
    const added = new Set(indexes.map(ix => ix.symbol));
    const available = membership.filter(m => !added.has(m.yahoo));

    const addIndex = (entry) => updateIndicator(ind.id, {
        indexes: [...indexes, { symbol: entry.yahoo, name: entry.name, enabled: true }],
    });

    return (
        <div className="indicator-settings smi-grid">
            {indexes.map((ix, i) => (
                <React.Fragment key={i}>
                    <div className="setting-item">
                        <label>Index {i + 1}</label>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input
                                type="checkbox"
                                checked={ix.enabled !== false}
                                title={ix.enabled !== false ? 'Disable index' : 'Enable index'}
                                onChange={(e) => updateIndicator(ind.id, {
                                    indexes: indexes.map((x, xi) => xi === i ? { ...x, enabled: e.target.checked } : x),
                                })}
                            />
                            <span style={{ ...(ix.enabled === false ? { opacity: 0.4 } : {}) }}>
                                {ix.name ? `${ix.name} (${ix.symbol})` : ix.symbol}
                            </span>
                        </div>
                    </div>
                    <div className="setting-item" style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                            className="action-btn remove-single"
                            title="Remove index"
                            onClick={() => updateIndicator(ind.id, { indexes: indexes.filter((_, xi) => xi !== i) })}
                        >
                            ✕
                        </button>
                    </div>
                </React.Fragment>
            ))}
            {membership.length > 0 && (
                <div className="setting-item" style={{ gridColumn: 'span 2' }}>
                    <label>{chartSymbol} belongs to</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <select
                            style={{ flex: 1 }}
                            value=""
                            onChange={(e) => {
                                const entry = available.find(m => m.yahoo === e.target.value);
                                if (entry) addIndex(entry);
                            }}
                        >
                            <option value="" disabled>Add index...</option>
                            {available.map(m => <option key={m.yahoo} value={m.yahoo}>{m.name}</option>)}
                        </select>
                        {available.length > 1 && (
                            <button className="action-btn" title="Add all membership indexes" onClick={() => available.forEach(addIndex)}>
                                All
                            </button>
                        )}
                    </div>
                </div>
            )}
            {error && <div className="custom-script-error" style={{ gridColumn: '1 / -1' }}>{error}</div>}
        </div>
    );
};

/**
 * Settings controls for a single indicator instance: schema-driven script
 * fields, the SMI constituents grid, or custom-script inputs.
 */
const IndicatorSettings = ({ ind, groupType, chartSymbol, invalidSymbols = [], scriptsById, scriptErrors, updateIndicator }) => (
    <>
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
                        onClick={() => updateIndicator(ind.id, { constituents: [...(ind.constituents || []), { symbol: '', weight: 0.1, enabled: true }] })}
                    >
                        + Add Symbol
                    </button>
                </div>
            </div>
        )}
        {/* Benchmark Index: membership-driven index rows */}
        {groupType === 'benchmark' && (
            <BenchmarkSettings ind={ind} chartSymbol={chartSymbol} updateIndicator={updateIndicator} />
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
    </>
);

export default IndicatorSettings;
