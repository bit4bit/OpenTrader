import React, { useState, useEffect, useRef } from 'react';

const SessionMenu = ({ sessions, activeSession, onSwitchSession, onCreateSession, onRenameSession, onDeleteSession }) => {
    const [open, setOpen] = useState(false);
    const [menuPos, setMenuPos] = useState(null);
    const menuRef = useRef(null);
    const buttonRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const close = (e) => {
            if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const toggle = () => {
        if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPos({ top: rect.bottom + 4, left: rect.left });
        }
        setOpen(o => !o);
    };

    const itemStyle = {
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        background: 'none',
        border: 'none',
        color: '#ddd',
        fontSize: '13px',
        cursor: 'pointer',
    };

    return (
        <div style={{ position: 'relative' }}>
            <button ref={buttonRef} className="toolbar-btn" onClick={toggle} title="Sessions">
                <span style={{ fontSize: '13px', marginRight: '4px' }}>📁</span>
                {activeSession?.name || 'No session'}
                <span style={{ fontSize: '10px', marginLeft: '4px' }}>▾</span>
            </button>
            {open && menuPos && (
                <div ref={menuRef} style={{
                    position: 'fixed',
                    top: menuPos.top,
                    left: menuPos.left,
                    minWidth: '180px',
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                    zIndex: 3000,
                }}>
                    {sessions.map(s => (
                        <button
                            key={s.id}
                            style={{ ...itemStyle, fontWeight: s.id === activeSession?.id ? 'bold' : 'normal', color: s.id === activeSession?.id ? '#4fc3f7' : '#ddd' }}
                            onClick={() => { setOpen(false); onSwitchSession(s.id); }}
                        >
                            {s.name}
                        </button>
                    ))}
                    <div style={{ borderTop: '1px solid #333' }} />
                    <button style={itemStyle} onClick={() => { setOpen(false); onCreateSession(); }}>➕ New session</button>
                    <button style={itemStyle} disabled={!activeSession} onClick={() => { setOpen(false); onRenameSession(); }}>✏️ Rename</button>
                    <button style={{ ...itemStyle, color: '#ff6b6b' }} disabled={!activeSession} onClick={() => { setOpen(false); onDeleteSession(); }}>🗑 Delete</button>
                </div>
            )}
        </div>
    );
};

const TopBar = ({
    symbol,
    symbolProvider,
    interval, setInterval,
    chartType, setChartType,
    hasActiveChart,
    openIndicatorSearch,
    openCustomIndicators,
    openSymbolSearch,
    openSymbolCatalog,
    locked, onToggleLock,
    onAddChart,
    onCloseAll,
    sessions = [],
    activeSession,
    onSwitchSession,
    onCreateSession,
    onRenameSession,
    onDeleteSession,
    username,
    onLogout,
}) => {
    const intervals = [
        { label: '1m', value: '1m' },
        { label: '5m', value: '5m' },
        { label: '15m', value: '15m' },
        { label: '1h', value: '1h' },
        { label: '4h', value: '4h' },
        { label: '1D', value: '1d' },
        { label: '1W', value: '1wk' },
        { label: '1M', value: '1mo' },
    ];

    const chartTypes = [
        { label: 'Candles', value: 'candle' },
        { label: 'Line', value: 'line' },
        { label: 'Heikin Ashi', value: 'heikin' },
    ];

    return (
        <div className="top-bar">
            <div className="top-bar-brand">
                Open Trader
            </div>

            <div className="top-bar-divider" />

            <div className="top-bar-section session-section">
                <SessionMenu
                    sessions={sessions}
                    activeSession={activeSession}
                    onSwitchSession={onSwitchSession}
                    onCreateSession={onCreateSession}
                    onRenameSession={onRenameSession}
                    onDeleteSession={onDeleteSession}
                />
            </div>

            <div className="top-bar-divider" />

            <div className="top-bar-section search-section">
                <button
                    className="symbol-search-btn"
                    onClick={openSymbolSearch}
                    disabled={!hasActiveChart}
                >
                    <span className="search-icon">🔍</span>
                    <span className="current-symbol">{symbol || '—'}</span>
                    {symbolProvider && <span className="current-symbol-provider" style={{ fontSize: '11px', opacity: 0.6, marginLeft: '6px' }}>{symbolProvider}</span>}
                </button>
                <button
                    className="toolbar-btn"
                    onClick={openSymbolCatalog}
                    title="Browse all supported symbols"
                >
                    <span style={{ fontSize: '13px' }}>☰</span> Catalog
                </button>
            </div>

            <div className="top-bar-divider" />

            <div className="top-bar-section interval-section">
                <div className="button-group">
                    {intervals.map(int => (
                        <button
                            key={int.value}
                            className={`toolbar-btn ${interval === int.value ? 'active' : ''}`}
                            onClick={() => setInterval(int.value)}
                            disabled={!hasActiveChart}
                        >
                            {int.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="top-bar-divider" />

            <div className="top-bar-section type-section">
                <div className="button-group">
                    {chartTypes.map(type => (
                        <button
                            key={type.value}
                            className={`toolbar-btn ${chartType === type.value ? 'active' : ''}`}
                            onClick={() => setChartType(type.value)}
                            disabled={!hasActiveChart}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="top-bar-divider" />

            <div className="top-bar-section indicators-section">
                <button
                    className="toolbar-btn primary"
                    onClick={openIndicatorSearch}
                    disabled={!hasActiveChart}
                >
                    <span style={{ fontSize: '16px', marginRight: '4px' }}>📊</span>
                    Indicators
                </button>
                <button
                    className="toolbar-btn"
                    onClick={openCustomIndicators}
                    title="Custom script indicators"
                >
                    <span style={{ fontSize: '16px', marginRight: '4px' }}>ƒ</span>
                    Scripts
                </button>
            </div>

            <div className="top-bar-divider" />

            <div className="top-bar-section layout-section">
                <button
                    className={`toolbar-btn ${locked ? 'lock-active' : ''}`}
                    onClick={onToggleLock}
                    title={locked ? 'Unlock charts (independent zoom/move)' : 'Lock charts (sync zoom/move/crosshair)'}
                >
                    <span style={{ fontSize: '14px' }}>{locked ? '🔒' : '🔓'}</span>
                </button>
                <button
                    className="toolbar-btn"
                    onClick={onAddChart}
                    title="Add chart"
                >
                    <span style={{ fontSize: '14px', marginRight: '4px' }}>➕</span>
                    Chart
                </button>
                <button
                    className="toolbar-btn"
                    onClick={onCloseAll}
                    disabled={!hasActiveChart}
                    title="Close all charts"
                >
                    <span style={{ fontSize: '14px' }}>🗑</span>
                </button>
            </div>

            <div style={{ flex: 1 }} />

            <div className="top-bar-section user-section">
                <span style={{ fontSize: '13px', color: '#aaa', marginRight: '8px' }}>👤 {username}</span>
                <button className="toolbar-btn" onClick={onLogout} title="Log out">
                    Log out
                </button>
            </div>
        </div>
    );
};

export default TopBar;
