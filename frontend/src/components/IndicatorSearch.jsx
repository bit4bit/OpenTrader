import React, { useState, useEffect, useRef } from 'react';
import { INDICATOR_TYPES, indicatorTitle } from '../Indicators/scripts';

const IndicatorSearch = ({ onAddIndicator, onClose }) => {
    const [query, setQuery] = useState('');
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

    return (
        <div className="indicator-search-overlay" ref={containerRef}>
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
                            onClose();
                        }}
                    >
                        {ind.name}
                    </div>
                )) : (
                    <div className="indicator-search-no-results">No indicators found</div>
                )}
            </div>
        </div>
    );
};

export default IndicatorSearch;