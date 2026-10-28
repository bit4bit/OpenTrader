import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    sessionsInView,
    folderViewId,
    folderIdFromView,
    stageFromView,
    STAGES,
    filterByQuery,
    sortSessions,
    countSessions,
} from '../sessions/sessionList';
import { useSymbolQuotes } from '../hooks/useSymbolQuotes';
import {
    sessionSymbols,
    symbolsOfSessions,
    quoteDisplayFields,
} from '../quotes/quoteRow';
import { useProviderPriceDecimals } from '../hooks/useProviderPriceDecimals';
import { DEFAULT_PRICE_DECIMALS } from '../chart/priceFormat';

const SMART_VIEWS = [
    { id: 'all', label: 'All sessions', icon: '☰' },
    { id: 'favorites', label: 'Favorites', icon: '★' },
    { id: 'portfolio', label: 'Portfolio', icon: '💼' },
    { id: 'uncategorized', label: 'No folder', icon: '⬚' },
];

const STAGE_ICONS = { 1: '①', 2: '②', 3: '③', 4: '④' };

const STAGE_VIEWS = STAGES.map(stage => ({
    id: `stage:${stage}`,
    stage,
    label: `Stage ${stage}`,
    icon: STAGE_ICONS[stage],
}));

const formatRelativeTime = (iso) => {    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const seconds = Math.max(0, (Date.now() - then) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(then).toLocaleDateString();
};

const NameInput = ({ initial = '', placeholder = '', onCommit, onCancel }) => {
    const [value, setValue] = useState(initial);
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const commit = () => {
        const name = value.trim();
        if (name) onCommit(name);
        else onCancel();
    };

    return (
        <input
            ref={inputRef}
            className="sm-inline-input"
            placeholder={placeholder}
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
            }}
            onClick={e => e.stopPropagation()}
        />
    );
};

const SessionManagerModal = ({
    sessions,
    folders,
    activeSession,
    activeFolderId,
    initialViewId,
    showQuotes,
    onToggleQuotes,
    onViewChange,
    onSwitchSession,
    onCreateSession,
    onRenameSession,
    onDeleteSession,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveSession,
    onSetActiveFolder,
    onToggleFavorite,
    onTogglePortfolio,
    onSetSessionStage,
    onClose,
}) => {
    const [viewId, setViewId] = useState(initialViewId ?? 'all');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('recent');
    const [renaming, setRenaming] = useState(null); // { kind: 'session'|'folder', id }
    const [dropTarget, setDropTarget] = useState(null); // sidebar viewId being dragged over
    const [creatingSession, setCreatingSession] = useState(false);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const searchRef = useRef(null);

    const counts = useMemo(() => countSessions(sessions, folders), [sessions, folders]);
    const folderById = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);
    const searching = query.trim() !== '';

    const smartViews = SMART_VIEWS.map(view => ({
        ...view,
        count: view.id === 'all' ? counts.total
            : view.id === 'favorites' ? counts.favorites
                : view.id === 'portfolio' ? counts.portfolio
                    : counts.uncategorized,
    }));

    const visibleSessions = useMemo(() => {
        const scoped = searching ? sessions : sessionsInView(sessions, viewId);
        return sortSessions(filterByQuery(scoped, folders, query), sort);
    }, [sessions, folders, viewId, query, sort, searching]);

    const decimalsMap = useProviderPriceDecimals();
    const quoteSymbols = useMemo(
        () => (showQuotes ? symbolsOfSessions(visibleSessions) : []),
        [showQuotes, visibleSessions],
    );
    const quotes = useSymbolQuotes(quoteSymbols);

    useEffect(() => { searchRef.current?.focus(); }, []);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const viewFolderId = folderIdFromView(viewId);
    const viewStage = stageFromView(viewId);
    const viewTitle = searching
        ? 'Search results'
        : (smartViews.find(v => v.id === viewId)?.label
            ?? (viewStage ? `Stage ${viewStage}` : null)
            ?? folderById.get(viewFolderId)?.name
            ?? 'Sessions');

    const selectView = (id, folderId = null) => {
        setQuery('');
        setViewId(id);
        onViewChange?.(id);
        if (id === 'uncategorized') onSetActiveFolder(null);
        else if (folderId != null) onSetActiveFolder(folderId);
    };

    const deleteFolder = (id) => {
        onDeleteFolder(id);
        if (folderIdFromView(viewId) === id) selectView('all');
    };

    const createSession = (name) => {
        const folderId = viewId === 'uncategorized'
            ? null
            : (viewFolderId ?? activeFolderId);
        setCreatingSession(false);
        onCreateSession(name, folderId);
        onClose();
    };

    const dropProps = (targetViewId) => ({
        onDragOver: (e) => { e.preventDefault(); setDropTarget(targetViewId); },
        onDragLeave: () => setDropTarget(current => current === targetViewId ? null : current),
        onDrop: (e) => {
            e.preventDefault();
            setDropTarget(null);
            const sessionId = Number(e.dataTransfer.getData('application/x-session-id'));
            if (sessionId) onMoveSession(sessionId, folderIdFromView(targetViewId));
        },
    });

    const emptyMessage = () => {
        if (searching) return 'No sessions match your search';
        if (viewId === 'favorites') return 'No favorite sessions — click ★ on a session';
        if (viewId === 'portfolio') return 'No portfolio sessions — click 💼 on a session';
        if (viewStage) return `No sessions at stage ${viewStage} — pick one in a session's row`;
        if (viewId === 'uncategorized') return 'No sessions without a folder';
        return 'No sessions here yet';
    };

    const renderSession = (session) => {
        const isActive = session.id === activeSession?.id;
        const isRenaming = renaming?.kind === 'session' && renaming.id === session.id;
        const stripSymbols = showQuotes ? sessionSymbols(session) : [];
        const stripFields = stripSymbols.map(entry =>
            quoteDisplayFields(quotes.get(entry.symbol), decimalsMap[entry.provider] ?? DEFAULT_PRICE_DECIMALS));
        return (
            <div
                key={session.id}
                className={`sm-row${isActive ? ' active' : ''}${showQuotes ? ' quotes-grid' : ''}`}
                draggable={!isRenaming}
                onDragStart={e => e.dataTransfer.setData('application/x-session-id', String(session.id))}
                onClick={() => { onClose(); onSwitchSession(session.id); }}
            >
                {isRenaming ? (
                    <NameInput
                        initial={session.name}
                        onCommit={name => { setRenaming(null); onRenameSession(session.id, name); }}
                        onCancel={() => setRenaming(null)}
                    />
                ) : (
                    <>
                        <button
                            className={`sm-flag star${session.favorite ? ' on' : ''}`}
                            title={session.favorite ? 'Remove from favorites' : 'Add to favorites'}
                            onClick={(e) => { e.stopPropagation(); onToggleFavorite(session.id); }}
                        >★</button>
                        <button
                            className={`sm-flag portfolio${session.portfolio ? ' on' : ''}`}
                            title={session.portfolio ? 'Remove from portfolio' : 'Add to portfolio'}
                            onClick={(e) => { e.stopPropagation(); onTogglePortfolio(session.id); }}
                        >💼</button>
                        <span className="sm-row-name">{session.name}</span>
                        <select
                            className="sm-move-select sm-stage-select"
                            title="Stage (1-4)"
                            value={session.stage ?? ''}
                            onClick={e => e.stopPropagation()}
                            onChange={(e) => {
                                e.stopPropagation();
                                const stage = e.target.value === '' ? null : Number(e.target.value);
                                if (stage !== session.stage) onSetSessionStage?.(session.id, stage);
                            }}
                        >
                            <option value="">—</option>
                            {STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                        </select>
                        {showQuotes ? (
                            stripSymbols.length === 0 ? (
                                <div className="sm-quotes-empty">—</div>
                            ) : (
                                <>
                                    <div className="sm-quote-cell sym">
                                        {stripSymbols.map(entry => <span key={entry.symbol} title={entry.provider || undefined}>{entry.symbol}</span>)}
                                    </div>
                                    <div className="sm-quote-cell num">
                                        {stripFields.map((f, i) => <span key={i}>{f.price}</span>)}
                                    </div>
                                    {['dayChange', 'weekChange', 'monthChange', 'quarterChange', 'volumeChange'].map(field => (
                                        <div className="sm-quote-cell num" key={field}>
                                            {stripFields.map((f, i) => <span key={i} className={`sm-quote-change ${f[field].tone}`} title={field === 'volumeChange' ? 'Volume vs 10-day average' : undefined}>{f[field].text}</span>)}
                                        </div>
                                    ))}
                                    <div className="sm-quote-cell num">
                                        {stripFields.map((f, i) => <span key={i} title="52-week low — high">{f.yearRange.text}</span>)}
                                    </div>
                                </>
                            )
                        ) : (
                            folders.length > 0 && (
                                <select
                                    className="sm-move-select"
                                    title="Move to folder"
                                    value={session.folder ?? ''}
                                    onClick={e => e.stopPropagation()}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        const folderId = e.target.value === '' ? null : Number(e.target.value);
                                        if (folderId !== session.folder) onMoveSession(session.id, folderId);
                                    }}
                                >
                                    <option value="">No folder</option>
                                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            )
                        )}
                        <span className="sm-updated">{formatRelativeTime(session.updated_at)}</span>
                        <div className="sm-row-actions">
                            <button className="sm-action" title="Rename session" onClick={(e) => { e.stopPropagation(); setRenaming({ kind: 'session', id: session.id }); }}>✏️</button>
                            <button className="sm-action" title="Delete session" onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}>🗑</button>
                        </div>
                    </>
                )}
            </div>
        );
    };

    const renderFolder = (folder) => {
        const id = folderViewId(folder.id);
        const isActive = !searching && viewId === id;
        const isRenaming = renaming?.kind === 'folder' && renaming.id === folder.id;
        return (
            <div
                key={folder.id}
                className={`sm-side-item${isActive ? ' active' : ''}${dropTarget === id ? ' drop-target' : ''}`}
                {...dropProps(id)}
                onClick={() => selectView(id, folder.id)}
            >
                <span className="sm-side-icon">📁</span>
                {isRenaming ? (
                    <NameInput
                        initial={folder.name}
                        onCommit={name => { setRenaming(null); onRenameFolder(folder.id, name); }}
                        onCancel={() => setRenaming(null)}
                    />
                ) : (
                    <>
                        <span className="sm-side-name">{folder.name}</span>
                        <span className="sm-side-count">{counts.byFolder.get(folder.id) || 0}</span>
                        <button className="sm-action" title="Rename folder" onClick={(e) => { e.stopPropagation(); setRenaming({ kind: 'folder', id: folder.id }); }}>✏️</button>
                        <button className="sm-action" title="Delete folder (sessions are kept)" onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}>🗑</button>
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="session-manager-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="session-manager">
                <div className="session-manager-header">
                    <span className="session-manager-title">Sessions</span>
                    <input
                        ref={searchRef}
                        className="session-manager-search"
                        placeholder="Search sessions or folders…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <select className="session-manager-select" value={sort} onChange={e => setSort(e.target.value)} title="Sort sessions">
                        <option value="recent">Recently updated</option>
                        <option value="name">Name</option>
                    </select>
                    <button
                        className={`session-manager-quotes-toggle${showQuotes ? ' on' : ''}`}
                        title="Show quote data (price, day change, volume change, 52-week range) for the symbols in this view"
                        onClick={onToggleQuotes}
                    >📈 Quotes</button>
                    <button className="session-manager-close" onClick={onClose} title="Close (Esc)">✕</button>
                </div>
                <div className="session-manager-body">
                    <div className="session-manager-side">
                        {smartViews.map(view => (
                            <div
                                key={view.id}
                                className={`sm-side-item${!searching && viewId === view.id ? ' active' : ''}${dropTarget === view.id ? ' drop-target' : ''}`}
                                {...(view.id === 'uncategorized' ? dropProps(view.id) : null)}
                                onClick={() => selectView(view.id)}
                            >
                                <span className="sm-side-icon">{view.icon}</span>
                                <span className="sm-side-name">{view.label}</span>
                                <span className="sm-side-count">{view.count}</span>
                            </div>
                        ))}
                        <div className="sm-side-label">Stages</div>
                        {STAGE_VIEWS.map(view => (
                            <div
                                key={view.id}
                                className={`sm-side-item${!searching && viewId === view.id ? ' active' : ''}`}
                                onClick={() => selectView(view.id)}
                            >
                                <span className="sm-side-icon">{view.icon}</span>
                                <span className="sm-side-name">{view.label}</span>
                                <span className="sm-side-count">{counts.byStage.get(view.stage) || 0}</span>
                            </div>
                        ))}
                        <div className="sm-side-label">Folders</div>
                        {folders.map(renderFolder)}
                        {creatingFolder ? (
                            <div className="sm-side-item">
                                <span className="sm-side-icon">📁</span>
                                <NameInput
                                    placeholder="New folder name"
                                    onCommit={name => { setCreatingFolder(false); onCreateFolder(name); }}
                                    onCancel={() => setCreatingFolder(false)}
                                />
                            </div>
                        ) : (
                            <button className="sm-new-folder" onClick={() => setCreatingFolder(true)}>＋ New folder</button>
                        )}
                    </div>
                    <div className="session-manager-main">
                        <div className="sm-list-header">
                            <span className="sm-list-title">{viewTitle} · {visibleSessions.length}</span>
                            <button className="sm-list-new" onClick={() => setCreatingSession(true)}>＋ New session</button>
                        </div>
                        {creatingSession && (
                            <div className="sm-row new-session">
                                <NameInput
                                    placeholder="New session name"
                                    onCommit={createSession}
                                    onCancel={() => setCreatingSession(false)}
                                />
                            </div>
                        )}
                        <div className="session-manager-list">
                            {showQuotes && (
                                <div className="sm-quotes-head">
                                    <span /><span />
                                    <span>Name</span>
                                    <span className="sm-col-sep">Stage</span>
                                    <span className="sm-col-sep">Symbol</span>
                                    <span className="sm-col-sep">Price</span>
                                    <span className="sm-col-sep">Day</span>
                                    <span className="sm-col-sep">Week</span>
                                    <span className="sm-col-sep">Month</span>
                                    <span className="sm-col-sep">Quarter</span>
                                    <span className="sm-col-sep">Vol Δ</span>
                                    <span className="sm-col-sep" title="52-week low — high">52w range</span>
                                    <span /><span />
                                </div>
                            )}
                            {visibleSessions.map(renderSession)}
                            {visibleSessions.length === 0 && !creatingSession && (
                                <div className="sm-empty">{emptyMessage()}</div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="session-manager-footer">
                    <span>Drag a session onto a folder, or pick a folder in its row dropdown, to move it.</span>
                </div>
            </div>
        </div>
    );
};

export default SessionManagerModal;
