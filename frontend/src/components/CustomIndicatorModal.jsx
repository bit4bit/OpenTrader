import React, { useState, useEffect, useRef } from 'react';
import { discoverInputs } from '../Indicators/dsl/runtime';

const EXAMPLE_CODE = `// Custom indicator: plot(ta.sma(close, 20), { title: 'SMA 20' })
// Inputs: input.int/float/bool/string/color/source(label, default, opts?)
// Panes: plot(series, { overlay: false }) renders in its own pane
// Globals: open, high, low, close, volume, time, ta, input, plot

const len = input.int('Length', 20, { min: 1, max: 500 })
const src = input.source('Source', 'close')
plot(ta.sma(src, len), { title: 'SMA', color: '#2962ff' })
`;

const CustomIndicatorModal = ({ scripts, createScript, updateScript, deleteScript, onAddToChart, onClose }) => {
    const containerRef = useRef();
    const [selectedId, setSelectedId] = useState(scripts[0]?.id ?? null);
    const [name, setName] = useState('');
    const [code, setCode] = useState(EXAMPLE_CODE);
    const [error, setError] = useState(null);

    const selected = scripts.find(s => s.id === selectedId) || null;

    // Reset editor fields when the selection changes (derived state, no effect)
    const [lastSelectedId, setLastSelectedId] = useState(selectedId);
    if (selectedId !== lastSelectedId) {
        setLastSelectedId(selectedId);
        setName(selected?.name ?? '');
        setCode(selected?.code ?? EXAMPLE_CODE);
        setError(null);
    }

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const validate = () => {
        const { error } = discoverInputs(code);
        setError(error);
        return !error;
    };

    const save = async () => {
        if (!name.trim() || !validate()) return;
        try {
            const saved = selected
                ? await updateScript(selected.id, { name: name.trim(), code })
                : await createScript(name.trim(), code);
            setSelectedId(saved.id);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        }
    };

    const remove = async () => {
        if (!selected || !window.confirm(`Delete script "${selected.name}"?`)) return;
        await deleteScript(selected.id);
        setSelectedId(null);
    };

    return (
        <div className="custom-indicator-overlay" ref={containerRef}>
            <div className="custom-indicator-header">
                <span>Custom Indicators</span>
                <button className="header-action-btn remove" onClick={onClose}>✕</button>
            </div>
            <div className="custom-indicator-body">
                <div className="custom-indicator-list">
                    <button className="custom-indicator-new" onClick={() => setSelectedId(null)}>
                        + New script
                    </button>
                    {scripts.map(s => (
                        <div
                            key={s.id}
                            className={`custom-indicator-item${s.id === selectedId ? ' active' : ''}`}
                            onClick={() => setSelectedId(s.id)}
                        >
                            {s.name}
                        </div>
                    ))}
                </div>
                <div className="custom-indicator-editor">
                    <input
                        type="text"
                        placeholder="Script name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <textarea
                        spellCheck={false}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onBlur={validate}
                    />
                    {error && <div className="custom-indicator-error">{error}</div>}
                    <div className="custom-indicator-actions">
                        <button className="toolbar-btn primary" onClick={save} disabled={!name.trim()}>
                            {selected ? 'Save' : 'Create'}
                        </button>
                        {selected && onAddToChart && (
                            <button className="toolbar-btn" onClick={() => { onAddToChart(selected); onClose(); }}>
                                Add to chart
                            </button>
                        )}
                        {selected && (
                            <button className="toolbar-btn" onClick={remove}>Delete</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomIndicatorModal;
