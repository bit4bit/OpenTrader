import React, { useState, useEffect, useRef } from 'react';
import { INDICATOR_TYPES, indicatorTitle } from '../Indicators/scripts';
import { indicatorLabel } from '../Indicators/labels';
import IndicatorSettings from './IndicatorSettings';

const IndicatorSearch = ({
    indicators = [],
    onAddIndicator,
    onUpdateIndicator,
    onRemoveIndicator,
    onToggleIndicator,
    scriptsById,
    onClose,
}) => {
    const [tab, setTab] = useState('add');
    const [query, setQuery] = useState('');
    const [openSettingsId, setOpenSettingsId] = useState(null);
    const containerRef = useRef();

    const filtered = INDICATOR_TYPES
        .map(id => ({ id, name: indicatorTitle(id) }))
        .filter(ind => ind.name.toLowerCase().includes(query.toLowerCase()));

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const typeCounts = {};
    const indexInType = (ind) => {
        const idx = typeCounts[ind.type] || 0;
        typeCounts[ind.type] = idx + 1;
        return idx;
    };

    return (
        <div className="indicator-search-overlay" ref={containerRef}>
            <div className="indicator-panel-tabs">
                <button
                    className={`indicator-panel-tab${tab === 'add' ? ' active' : ''}`}
                    onClick={() => setTab('add')}
                >
                    Add
                </button>
                <button
                    className={`indicator-panel-tab${tab === 'active' ? ' active' : ''}`}
                    onClick={() => setTab('active')}
                >
                    Active ({indicators.length})
                </button>
            </div>
            {tab === 'add' && (
                <>
                    <div className="indicator-search-header">
                        <input
                            type="text"
                            placeholder="Search indicators..."
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                    <div className="indicator-search-list">
                        {filtered.length > 0 ? filtered.map(ind => (
                            <div
                                key={ind.id}
                                className="indicator-search-item"
                                onClick={() => {
                                    onAddIndicator(ind.id);
                                }}
                            >
                                {ind.name}
                            </div>
                        )) : (
                            <div className="indicator-search-no-results">No indicators found</div>
                        )}
                    </div>
                </>
            )}
            {tab === 'active' && (
                <div className="indicator-active-list">
                    {indicators.length === 0 && (
                        <div className="indicator-search-no-results">No indicators on this chart</div>
                    )}
                    {indicators.map(ind => {
                        const label = indicatorLabel(ind.type, ind, indexInType(ind));
                        const settingsOpen = openSettingsId === ind.id;
                        return (
                            <div key={ind.id} className={`indicator-active-item${!ind.visible ? ' row-hidden' : ''}`}>
                                <div className="indicator-active-row">
                                    {ind.color && <span className="color-swatch" style={{ backgroundColor: ind.color }} />}
                                    <span className="indicator-name">{label}</span>
                                    <div className="indicator-actions">
                                        <button
                                            className={`action-btn ${!ind.visible ? 'hidden' : ''}`}
                                            title={ind.visible ? 'Hide' : 'Show'}
                                            onClick={() => onToggleIndicator(ind.id)}
                                        >
                                            {ind.visible ? '👁' : '👁\u200d🗨'}
                                        </button>
                                        <button
                                            className={`action-btn${settingsOpen ? ' settings-open' : ''}`}
                                            title={`${settingsOpen ? 'Close' : 'Open'} ${label} settings`}
                                            onClick={() => setOpenSettingsId(settingsOpen ? null : ind.id)}
                                        >
                                            ⚙
                                        </button>
                                        <button
                                            className="action-btn remove-single"
                                            title={`Remove ${label}`}
                                            onClick={() => onRemoveIndicator(ind.id)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                                {settingsOpen && (
                                    <IndicatorSettings
                                        ind={ind}
                                        groupType={ind.type}
                                        scriptsById={scriptsById}
                                        updateIndicator={onUpdateIndicator}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default IndicatorSearch;
