import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const SymbolSearch = ({ onSelectSymbol, onOpenInNewChart, onClose }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef();
    const inputRef = useRef();

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    useEffect(() => {
        const fetchResults = async () => {
            if (query.trim().length === 0) {
                setResults([]);
                return;
            }
            setLoading(true);
            try {
                const response = await axios.get(`/api/search/`, { params: { q: query } });
                setResults(response.data);
            } catch (error) {
                console.error('Search error:', error);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(fetchResults, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const select = (res) => {
        onSelectSymbol({ symbol: res.symbol, provider: res.provider || null });
        onClose();
    };

    const openInNewChart = (e, res) => {
        e.stopPropagation();
        onOpenInNewChart({ symbol: res.symbol, provider: res.provider || null });
        onClose();
    };

    return (
        <div className="indicator-search-overlay symbol-search-overlay" ref={containerRef}>
            <div className="indicator-search-header">
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search stocks, crypto..."
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>
            <div className="indicator-search-list">
                {loading ? (
                    <div className="indicator-search-no-results">Searching...</div>
                ) : results.length > 0 ? (
                    results.map((res) => (
                        <div
                            key={`${res.provider}-${res.symbol}`}
                            className="indicator-search-item symbol-item"
                            onClick={() => select(res)}
                        >
                            <div className="symbol-item-main">
                                <div>
                                    <span className="symbol-name">{res.symbol}</span>
                                    <span className="symbol-type" style={{ fontSize: '10px', opacity: 0.6, marginLeft: '8px' }}>{res.type}</span>
                                    {res.provider && (
                                        <span className="symbol-provider" style={{ fontSize: '10px', opacity: 0.75, marginLeft: '8px', border: '1px solid #4fc3f7', borderRadius: '4px', padding: '1px 5px', color: '#4fc3f7' }}>
                                            {res.provider}
                                        </span>
                                    )}
                                </div>
                                {onOpenInNewChart && (
                                    <button
                                        className="symbol-new-chart-btn"
                                        title="Open in new chart"
                                        onClick={(e) => openInNewChart(e, res)}
                                    >
                                        ⊕ New chart
                                    </button>
                                )}
                            </div>
                            <div className="symbol-item-desc" style={{ fontSize: '12px', opacity: 0.7 }}>
                                {[res.fullname || res.name, res.exchange, res.sector].filter(Boolean).join(' • ')}
                            </div>
                        </div>
                    ))
                ) : query.trim() !== '' ? (
                    <div className="indicator-search-no-results">No results found</div>
                ) : (
                    <div className="indicator-search-no-results">Type symbol or name...</div>
                )}
            </div>
        </div>
    );
};

export default SymbolSearch;