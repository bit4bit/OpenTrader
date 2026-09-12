import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';

const SymbolCatalogModal = ({ onSelectSymbol, onOpenInNewChart, onClose }) => {
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [providerFilter, setProviderFilter] = useState('');
    const [sectorFilter, setSectorFilter] = useState('');
    const containerRef = useRef();

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
        axios.get('/api/symbols/')
            .then(response => setCatalog(response.data || []))
            .catch(error => console.error('Catalog fetch error:', error))
            .finally(() => setLoading(false));
    }, []);

    const providers = useMemo(() => [...new Set(catalog.map(e => e.provider).filter(Boolean))].sort(), [catalog]);
    const sectors = useMemo(
        () => [...new Set(catalog.map(e => e.sector).filter(Boolean))].sort(),
        [catalog]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return catalog.filter(e =>
            (!providerFilter || e.provider === providerFilter) &&
            (!sectorFilter || e.sector === sectorFilter) &&
            (!q || e.symbol.toLowerCase().includes(q) || (e.name || '').toLowerCase().includes(q))
        );
    }, [catalog, query, providerFilter, sectorFilter]);

    const select = (entry) => {
        onSelectSymbol({ symbol: entry.symbol, provider: entry.provider || null });
        onClose();
    };

    const openInNewChart = (e, entry) => {
        e.stopPropagation();
        onOpenInNewChart({ symbol: entry.symbol, provider: entry.provider || null });
        onClose();
    };

    const filterStyle = {
        background: '#111',
        color: '#ddd',
        border: '1px solid #333',
        borderRadius: '4px',
        padding: '6px 8px',
        fontSize: '13px',
    };

    return (
        <div className="indicator-search-overlay symbol-search-overlay" ref={containerRef} style={{ maxHeight: '70vh' }}>
            <div className="indicator-search-header" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Filter catalog..."
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ flex: 1 }}
                />
                <select style={filterStyle} value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
                    <option value="">All providers</option>
                    {providers.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select style={filterStyle} value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
                    <option value="">All sectors</option>
                    {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <div className="indicator-search-list">
                {loading ? (
                    <div className="indicator-search-no-results">Loading catalog...</div>
                ) : filtered.length > 0 ? (
                    filtered.slice(0, 300).map((res) => (
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
                                        <span style={{ fontSize: '10px', opacity: 0.75, marginLeft: '8px', border: '1px solid #4fc3f7', borderRadius: '4px', padding: '1px 5px', color: '#4fc3f7' }}>
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
                ) : (
                    <div className="indicator-search-no-results">No symbols match the filters</div>
                )}
            </div>
        </div>
    );
};

export default SymbolCatalogModal;