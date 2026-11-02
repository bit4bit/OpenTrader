import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatCrosshairTime } from '../chart/timeFormat';
import { noteTime } from '../chart/noteMarkers';
import {
    tagViewId,
    tagFromView,
    symbolViewId,
    symbolFromView,
    notesInView,
    filterByQuery,
    sortNotes,
    tagsWithCounts,
    symbolsWithCounts,
    countNotes,
} from '../notes/noteList';
import NotesReader from './NotesReader';

const EMPTY_FORM = { symbol: '', pinned_at: '', tags: '', favorite: false, text: '' };

const SMART_VIEWS = [
    { id: 'all', label: 'All notes', icon: '☰', count: 'total' },
    { id: 'favorites', label: 'Favorites', icon: '★', count: 'favorites' },
    { id: 'dated', label: 'Pinned', icon: '📌', count: 'dated' },
    { id: 'undated', label: 'No date', icon: '⬚', count: 'undated' },
    { id: 'journal', label: 'Journal (no symbol)', icon: '📄', count: 'journal' },
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

const noteDate = (note, interval) => {
    const time = noteTime(note.pinned_at, interval);
    return time == null ? null : formatCrosshairTime(time, interval);
};

const NotesModal = ({ notesState, defaultSymbol = '', initialTime = null, canPickDate = false, onPickDate, hidden = false, onClose }) => {
    const { notes, addNote, updateNote, deleteNote } = notesState;
    const [viewId, setViewId] = useState('all');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('recent');
    const [form, setForm] = useState(() => ({ ...EMPTY_FORM, symbol: defaultSymbol }));
    const [editingId, setEditingId] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [error, setError] = useState(null);
    const searchRef = useRef(null);
    const openNote = openId == null ? null : notes.find(n => n.id === openId);

    // A date picked from a candle re-opens the (kept-mounted) modal; only
    // the datetime field changes, everything typed before is preserved.
    const [lastPickedTime, setLastPickedTime] = useState(initialTime);
    if (initialTime !== lastPickedTime) {
        setLastPickedTime(initialTime);
        if (initialTime != null) {
            setForm(f => ({ ...f, pinned_at: timeToLocalInput(initialTime) }));
        }
    }

    const counts = useMemo(() => countNotes(notes), [notes]);
    const tags = useMemo(() => tagsWithCounts(notes), [notes]);
    const symbols = useMemo(() => symbolsWithCounts(notes), [notes]);
    const searching = query.trim() !== '';

    const visibleNotes = useMemo(() => {
        const scoped = searching ? notes : notesInView(notes, viewId);
        return sortNotes(filterByQuery(scoped, query), sort);
    }, [notes, viewId, query, sort, searching]);

    useEffect(() => { searchRef.current?.focus(); }, []);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const setField = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const startEdit = (n) => {
        setEditingId(n.id);
        setError(null);
        setForm({
            symbol: n.symbol,
            pinned_at: n.pinned_at ? toLocalInput(n.pinned_at) : '',
            tags: (n.tags || []).join(', '),
            favorite: !!n.favorite,
            text: n.text,
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setError(null);
        setForm({ ...EMPTY_FORM, symbol: defaultSymbol, pinned_at: timeToLocalInput(initialTime) });
    };

    const save = async () => {
        const payload = {
            symbol: form.symbol.trim().toUpperCase(),
            pinned_at: form.pinned_at ? new Date(form.pinned_at).toISOString() : null,
            tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
            favorite: form.favorite,
            text: form.text.trim(),
        };
        if (!payload.text) return;
        try {
            if (editingId != null) await updateNote(editingId, payload);
            else await addNote(payload);
            cancelEdit();
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        }
    };

    const remove = async (n) => {
        const where = n.symbol ? `${n.symbol}` : 'journal';
        const when = n.pinned_at ? ` at ${noteDate(n, '1d')}` : '';
        if (!window.confirm(`Delete note "${n.text.slice(0, 40)}" (${where}${when})?`)) return;
        await deleteNote(n.id);
        if (editingId === n.id) cancelEdit();
    };

    const toggleFavorite = async (n) => {
        await updateNote(n.id, { favorite: !n.favorite });
    };

    const selectView = (id) => {
        setQuery('');
        setViewId(id);
    };

    const tagInView = tagFromView(viewId);
    const symbolInView = symbolFromView(viewId);
    const viewTitle = searching
        ? 'Search results'
        : (SMART_VIEWS.find(v => v.id === viewId)?.label ?? (tagInView ? `#${tagInView}` : symbolInView ?? 'Notes'));

    const emptyMessage = () => {
        if (searching) return 'No notes match your search';
        if (viewId === 'favorites') return 'No favorite notes';
        if (viewId === 'dated') return 'No pinned notes';
        if (viewId === 'undated') return 'No notes without a date';
        if (viewId === 'journal') return 'No notes without a symbol';
        if (tagInView) return `No notes tagged ${tagInView}`;
        if (symbolInView) return `No notes for ${symbolInView}`;
        return 'No notes yet';
    };

    return (
        <div
            className="session-manager-backdrop"
            style={hidden ? { display: 'none' } : undefined}
            onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="session-manager">
                <div className="session-manager-header">
                    <span className="session-manager-title">🗒 Notes</span>
                    <input
                        ref={searchRef}
                        className="session-manager-search"
                        placeholder="Search symbol, text or tag…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <select className="session-manager-select" value={sort} onChange={e => setSort(e.target.value)} title="Sort notes">
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
                                <span className="sm-side-count">{counts[view.count]}</span>
                            </div>
                        ))}
                        {tags.length > 0 && (
                            <>
                                <div className="sm-side-label">Tags</div>
                                {tags.map(({ tag, count }) => (
                                    <div
                                        key={tag}
                                        className={`sm-side-item${!searching && viewId === tagViewId(tag) ? ' active' : ''}`}
                                        onClick={() => selectView(tagViewId(tag))}
                                    >
                                        <span className="sm-side-icon">🏷</span>
                                        <span className="sm-side-name">{tag}</span>
                                        <span className="sm-side-count">{count}</span>
                                    </div>
                                ))}
                            </>
                        )}
                        {symbols.length > 0 && (
                            <>
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
                            </>
                        )}
                    </div>
                    <div className="session-manager-main">
                        {openNote ? (
                            <NotesReader
                                note={openNote}
                                onBack={() => setOpenId(null)}
                                onEdit={() => { startEdit(openNote); setOpenId(null); }}
                            />
                        ) : (
                        <>
                        <div className="sm-list-header">
                            <span className="sm-list-title">{viewTitle} · {visibleNotes.length}</span>
                            {editingId != null && (
                                <button className="sm-list-new" onClick={cancelEdit}>＋ New note</button>
                            )}
                        </div>
                        <div className="positions-modal-form">
                            <label>
                                Symbol (optional)
                                <input type="text" placeholder="AAPL — leave empty for a journal note" value={form.symbol} onChange={setField('symbol')} />
                            </label>
                            <label>
                                Tags (comma-separated, optional)
                                <input type="text" placeholder="earnings, thesis" value={form.tags} onChange={setField('tags')} />
                            </label>
                            <label className="positions-modal-datetime">
                                Pin to date &amp; time (optional)
                                <input type="datetime-local" value={form.pinned_at} onChange={setField('pinned_at')} />
                                {canPickDate && onPickDate && (
                                    <button type="button" className="positions-modal-pick" onClick={onPickDate}>
                                        📅 Pick from chart
                                    </button>
                                )}
                            </label>
                            <label className="positions-modal-note">
                                Note
                                <textarea placeholder="What did you notice on this chart? Markdown is supported." value={form.text} onChange={setField('text')} />
                            </label>
                            <div className="positions-modal-actions">
                                <button className="toolbar-btn primary" onClick={save} disabled={!form.text.trim()}>
                                    {editingId != null ? 'Save' : 'Add note'}
                                </button>
                                {editingId != null && (
                                    <button className="toolbar-btn" onClick={cancelEdit}>Cancel</button>
                                )}
                            </div>
                            {error && <div className="positions-modal-error">{error}</div>}
                        </div>
                        <div className="session-manager-list">
                            {visibleNotes.map(n => {
                                const date = noteDate(n, '1d');
                                const isEditing = editingId === n.id;
                                return (
                                    <div key={n.id} className={`positions-modal-item${isEditing ? ' active' : ''}`}>
                                        <div className="positions-modal-item-main">
                                            <button
                                                className={`header-action-btn${n.favorite ? ' active' : ''}`}
                                                onClick={() => toggleFavorite(n)}
                                                title={n.favorite ? 'Unfavorite' : 'Favorite'}
                                            >
                                                {n.favorite ? '★' : '☆'}
                                            </button>
                                            <span className="positions-modal-symbol">{n.symbol || 'journal'}</span>
                                            {date && <span className="positions-modal-date">📌 {date}</span>}
                                            {(n.tags || []).map(tag => (
                                                <span key={tag} className="notes-modal-tag">{tag}</span>
                                            ))}
                                        </div>
                                        <div className="notes-modal-item-note" onClick={() => setOpenId(n.id)} title="Open note">{n.text}</div>
                                        <div className="positions-modal-item-actions">
                                            <button className="header-action-btn" onClick={() => startEdit(n)} title="Edit">✎</button>
                                            <button className="header-action-btn remove" onClick={() => remove(n)} title="Delete">✕</button>
                                        </div>
                                    </div>
                                );
                            })}
                            {visibleNotes.length === 0 && (
                                <div className="sm-empty">{emptyMessage()}</div>
                            )}
                        </div>
                        </>
                        )}
                    </div>
                </div>
                <div className="session-manager-footer">
                    <span>Click a note to open it rendered (markdown supported). Pinned, symbol-bound notes show a marker on every chart of the same symbol, on any timeframe.</span>
                </div>
            </div>
        </div>
    );
};

export default NotesModal;
