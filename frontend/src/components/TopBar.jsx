import React from 'react';
import LayoutPicker from './LayoutPicker';
import SessionMenu from './SessionMenu';

const TopBar = ({
    symbol,
    symbolProvider,
    interval, setInterval,
    chartType, setChartType,
    showWeekendCandles = false, onToggleWeekendCandles,
    hasActiveChart,
    openIndicatorSearch,
    openCustomIndicators,
    openSymbolSearch,
    openSymbolCatalog,
    locked, onToggleLock,
    gridLayout, onSetGridLayout,
    onAddChart,
    onCloseAll,
    onToggleToolbar,
    sessions = [],
    folders = [],
    activeSession,
    activeFolderId,
    onSwitchSession,
    onCreateSession,
    onRenameSession,
    onDeleteSession,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveSession,
    onSetActiveFolder,
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
                <button
                    className="toolbar-btn"
                    onClick={onToggleToolbar}
                    title="Hide toolbar"
                >
                    <span style={{ fontSize: '14px' }}>🞁</span>
                </button>
                <span>Open Trader</span>
            </div>

            <div className="top-bar-divider" />

            <div className="top-bar-section session-section">
                <SessionMenu
                    sessions={sessions}
                    folders={folders}
                    activeSession={activeSession}
                    activeFolderId={activeFolderId}
                    onSwitchSession={onSwitchSession}
                    onCreateSession={onCreateSession}
                    onRenameSession={onRenameSession}
                    onDeleteSession={onDeleteSession}
                    onCreateFolder={onCreateFolder}
                    onRenameFolder={onRenameFolder}
                    onDeleteFolder={onDeleteFolder}
                    onMoveSession={onMoveSession}
                    onSetActiveFolder={onSetActiveFolder}
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
                <button
                    className={`toolbar-btn ${showWeekendCandles ? 'active' : ''}`}
                    onClick={onToggleWeekendCandles}
                    disabled={!hasActiveChart}
                    title="Show placeholder candles for weekends and holidays (daily intervals)"
                >
                    <span style={{ fontSize: '14px', marginRight: '4px' }}>📅</span>
                    Weekends
                </button>
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
                {gridLayout && onSetGridLayout && (
                    <LayoutPicker gridLayout={gridLayout} onSetGridLayout={onSetGridLayout} />
                )}
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
