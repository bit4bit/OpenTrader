import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatPriceValue } from '../chart/priceFormat';
import { positionTime, positionColor, POSITION_BUY_COLOR, POSITION_SELL_COLOR } from '../chart/positions';
import { formatCrosshairTime } from '../chart/timeFormat';
import {
    symbolViewId,
    symbolFromView,
    positionsInView,
    filterByQuery,
    sortPositions,
    symbolsWithCounts,
    countPositions,
} from '../positions/positionList';

const EMPTY_FORM = { symbol: '', side: 'buy', shares: '', price: '', opened_at: '', note: '' };
const DEFAULT_PRICE_DECIMALS = 2;

const SMART_VIEWS = [
    { id: 'all', label: 'All positions', icon: '☰' },
    { id: 'buys', label: 'Buys', icon: '▲' },
    { id: 'sells', label: 'Sells', icon: '▼' },
    { id: 'undated', label: 'No date', icon: '⬚' },
];

// ISO datetime -> local datetime-local input value ("YYYY-MM-DDTHH:mm").
const toLocalInput = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Chart bar time (epoch seconds) -> datetime-local input value.
const timeToLocalInput = (time) => (time == null ? '' : toLocalInput(new Date(time * 1000).toISOString()));

const formatShares = (shares) =>
    Number.isInteger(shares) ? String(shares) : String(Number(shares.toFixed(6)));

const positionDate = (position, interval) => {
    const time = positionTime(position.opened_at, interval);
    return time == null ? null : formatCrosshairTime(time, interval);
};

const PositionsModal = ({ positionsState, defaultSymbol = '', priceDecimals = DEFAULT_PRICE_DECIMALS, initialTime = null, canPickDate = false, onPickDate, hidden = false, onClose }) => {
    const { positions, addPosition, updatePosition, deletePosition } = positionsState;
    const [viewId, setViewId] = useState('all');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('recent');
    const [form, setForm] = useState(() => ({ ...EMPTY_FORM, symbol: defaultSymbol }));
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState(null);
    const searchRef = useRef(null);

    // A date picked from a candle re-opens the (kept-mounted) modal; only
    // the datetime field changes, everything typed before is preserved.
    const [lastPickedTime, setLastPickedTime] = useState(initialTime);
    if (initialTime !== lastPickedTime) {
        setLastPickedTime(initialTime);
        if (initialTime != null) {
            setForm(f => ({ ...f, opened_at: timeToLocalInput(initialTime) }));
        }
    }

    const counts = useMemo(() => countPositions(positions), [positions]);
    const symbols = useMemo(() => symbolsWithCounts(positions), [positions]);
    const searching = query.trim() !== '';

    const visiblePositions = useMemo(() => {
        const scoped = searching ? positions : positionsInView(positions, viewId);
        return sortPositions(filterByQuery(scoped, query), sort);
    }, [positions, viewId, query, sort, searching]);

    useEffect(() => { searchRef.current?.focus(); }, []);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const setField = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const startEdit = (p) => {
        setEditingId(p.id);
        setError(null);
        setForm({
            symbol: p.symbol,
            side: p.side === 'sell' ? 'sell' : 'buy',
            shares: String(p.shares),
            price: String(p.price),
            opened_at: p.opened_at ? toLocalInput(p.opened_at) : '',
            note: p.note || '',
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setError(null);
        setForm({ ...EMPTY_FORM, symbol: defaultSymbol, opened_at: timeToLocalInput(initialTime) });
    };

    const save = async () => {
        const payload = {
            symbol: form.symbol.trim(),
            side: form.side,
            shares: Number(form.shares),
            price: Number(form.price),
            opened_at: form.opened_at ? new Date(form.opened_at).toISOString() : null,
            note: form.note,
        };
        if (!payload.symbol || !Number.isFinite(payload.shares) || !Number.isFinite(payload.price)) return;
        try {
            if (editingId != null) await updatePosition(editingId, payload);
            else await addPosition(payload);
            cancelEdit();
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        }
    };

    const remove = async (p) => {
        if (!window.confirm(`Delete position ${p.symbol} (${formatShares(p.shares)} @ ${formatPriceValue(p.price, priceDecimals)})?`)) return;
        await deletePosition(p.id);
        if (editingId === p.id) cancelEdit();
    };

    const selectView = (id) => {
        setQuery('');
        setViewId(id);
    };

    const symbolInView = symbolFromView(viewId);
    const viewTitle = searching
        ? 'Search results'
        : (SMART_VIEWS.find(v => v.id === viewId)?.label ?? symbolInView ?? 'Positions');

    const emptyMessage = () => {
        if (searching) return 'No positions match your search';
        if (viewId === 'buys') return 'No buy positions';
        if (viewId === 'sells') return 'No sell positions';
        if (viewId === 'undated') return 'No positions without a date';
        if (symbolInView) return `No positions for ${symbolInView}`;
        return 'No positions tracked yet';
    };

    return (
        <div
            className="session-manager-backdrop"
            style={hidden ? { display: 'none' } : undefined}
            onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="session-manager">
                <div className="session-manager-header">
                    <span className="session-manager-title">💼 Positions</span>
                    <input
                        ref={searchRef}
                        className="session-manager-search"
                        placeholder="Search symbol or note…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <select className="session-manager-select" value={sort} onChange={e => setSort(e.target.value)} title="Sort positions">
                        <option value="recent">Most recent</option>
                        <option value="symbol">Symbol</option>
                    </select>
                    <button className="session-manager-close" onClick={onClose} title="Close (Esc)">✕</button>
                </div>
                <div className="session-manager-body">
                    <div className="session-manager-side">
                        {SMART_VIEWS.map(view => (
                            <div
                                key={view.id}
                                className={`sm-side-item${!searching && viewId === view.id ? ' active' : ''}`}
                                onClick={() => selectView(view.id)}
                            >
                                <span className="sm-side-icon">{view.icon}</span>
                                <span className="sm-side-name">{view.label}</span>
                                <span className="sm-side-count">{view.id === 'all' ? counts.total : view.id === 'buys' ? counts.buys : view.id === 'sells' ? counts.sells : counts.undated}</span>
                            </div>
                        ))}
                        <div className="sm-side-label">Symbols</div>
                        {symbols.map(({ symbol, count }) => (
                            <div
                                key={symbol}
                                className={`sm-side-item${!searching && viewId === symbolViewId(symbol) ? ' active' : ''}`}
                                onClick={() => selectView(symbolViewId(symbol))}
                            >
                                <span className="sm-side-icon">🏷</span>
                                <span className="sm-side-name">{symbol}</span>
                                <span className="sm-side-count">{count}</span>
                            </div>
                        ))}
                    </div>
                    <div className="session-manager-main">
                        <div className="sm-list-header">
                            <span className="sm-list-title">{viewTitle} · {visiblePositions.length}</span>
                            {editingId != null && (
                                <button className="sm-list-new" onClick={cancelEdit}>＋ New position</button>
                            )}
                        </div>
                        <div className="positions-modal-form">
                            <label>
                                Symbol
                                <input type="text" placeholder="AAPL" value={form.symbol} onChange={setField('symbol')} />
                            </label>
                            <label>
                                Side
                                <div className="positions-modal-side">
                                    <button
                                        type="button"
                                        className={form.side !== 'sell' ? 'active buy' : ''}
                                        style={form.side !== 'sell' ? { backgroundColor: POSITION_BUY_COLOR } : undefined}
                                        onClick={() => setForm(f => ({ ...f, side: 'buy' }))}
                                    >
                                        Buy
                                    </button>
                                    <button
                                        type="button"
                                        className={form.side === 'sell' ? 'active sell' : ''}
                                        style={form.side === 'sell' ? { backgroundColor: POSITION_SELL_COLOR } : undefined}
                                        onClick={() => setForm(f => ({ ...f, side: 'sell' }))}
                                    >
                                        Sell
                                    </button>
                                </div>
                            </label>
                            <label>
                                Shares
                                <input type="number" min="0" step="any" placeholder="100" value={form.shares} onChange={setField('shares')} />
                            </label>
                            <label>
                                Price
                                <input type="number" min="0" step="any" placeholder="150.25" value={form.price} onChange={setField('price')} />
                            </label>
                            <label className="positions-modal-datetime">
                                Date &amp; time (optional)
                                <input type="datetime-local" value={form.opened_at} onChange={setField('opened_at')} />
                                {canPickDate && onPickDate && (
                                    <button type="button" className="positions-modal-pick" onClick={onPickDate}>
                                        📅 Pick from chart
                                    </button>
                                )}
                            </label>
                            <label className="positions-modal-note">
                                Note
                                <textarea placeholder="Why did you open this position?" value={form.note} onChange={setField('note')} />
                            </label>
                            <div className="positions-modal-actions">
                                <button className="toolbar-btn primary" onClick={save} disabled={!form.symbol.trim() || form.shares === '' || form.price === ''}>
                                    {editingId != null ? 'Save' : 'Add position'}
                                </button>
                                {editingId != null && (
                                    <button className="toolbar-btn" onClick={cancelEdit}>Cancel</button>
                                )}
                            </div>
                            {error && <div className="positions-modal-error">{error}</div>}
                        </div>
                        <div className="session-manager-list">
                            {visiblePositions.map(p => {
                                const date = positionDate(p, '1d');
                                const side = p.side === 'sell' ? 'SELL' : 'BUY';
                                const isEditing = editingId === p.id;
                                return (
                                    <div key={p.id} className={`positions-modal-item${isEditing ? ' active' : ''}`}>
                                        <div className="positions-modal-item-main">
                                            <span className="positions-modal-symbol">{p.symbol}</span>
                                            <span className="positions-modal-side-badge" style={{ color: positionColor(p) }}>{side}</span>
                                            <span>{formatShares(p.shares)} @ {formatPriceValue(p.price, priceDecimals)}</span>
                                            {date && <span className="positions-modal-date">{date}</span>}
                                        </div>
                                        {p.note && <div className="positions-modal-item-note">{p.note}</div>}
                                        <div className="positions-modal-item-actions">
                                            <button className="header-action-btn" onClick={() => startEdit(p)} title="Edit">✎</button>
                                            <button className="header-action-btn remove" onClick={() => remove(p)} title="Delete">✕</button>
                                        </div>
                                    </div>
                                );
                            })}
                            {visiblePositions.length === 0 && (
                                <div className="sm-empty">{emptyMessage()}</div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="session-manager-footer">
                    <span>Markers appear on every chart of the same symbol, on any timeframe. Hover the circle or the price label to read the note.</span>
                </div>
            </div>
        </div>
    );
};

export default PositionsModal;
