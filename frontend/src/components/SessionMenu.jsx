import React, { useState, useEffect, useRef } from 'react';

const EXPANDED_KEY = 'opentrader_session_folders_expanded';

const loadExpanded = () => {
    try {
        return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) || '[]'));
    } catch {
        return new Set();
    }
};

const saveExpanded = (expanded) => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
};

const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '6px 12px',
    background: 'none',
    border: 'none',
    color: '#ddd',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
};

const actionButtonStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '0 3px',
    opacity: 0.6,
};

const renameInputStyle = {
    flex: 1,
    background: '#0f0f1e',
    border: '1px solid #4fc3f7',
    borderRadius: '3px',
    color: '#ddd',
    fontSize: '13px',
    padding: '2px 6px',
    minWidth: 0,
};

const RenameInput = ({ initialName, onCommit, onCancel }) => {
    const [value, setValue] = useState(initialName);
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const commit = () => {
        const name = value.trim();
        if (name && name !== initialName) onCommit(name);
        else onCancel();
    };

    return (
        <input
            ref={inputRef}
            style={renameInputStyle}
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') onCancel();
            }}
            onClick={e => e.stopPropagation()}
        />
    );
};

const SessionMenu = ({
    sessions,
    folders,
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
    onToggleFavorite,
    onTogglePortfolio,
}) => {
    const [open, setOpen] = useState(false);
    const [menuPos, setMenuPos] = useState(null);
    const [expanded, setExpanded] = useState(loadExpanded);
    const [renaming, setRenaming] = useState(null); // { kind: 'session'|'folder', id }
    const [dropTarget, setDropTarget] = useState(null); // folder id or 'uncategorized'
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

    const toggleExpanded = (folderId) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            saveExpanded(next);
            return next;
        });
    };

    const startRename = (kind, id) => setRenaming({ kind, id });

    const commitRename = (name) => {
        if (renaming?.kind === 'session') onRenameSession(renaming.id, name);
        if (renaming?.kind === 'folder') onRenameFolder(renaming.id, name);
        setRenaming(null);
    };

    const dropProps = (target) => ({
        onDragOver: (e) => { e.preventDefault(); setDropTarget(target); },
        onDragLeave: () => setDropTarget(current => current === target ? null : current),
        onDrop: (e) => {
            e.preventDefault();
            setDropTarget(null);
            const sessionId = Number(e.dataTransfer.getData('application/x-session-id'));
            if (sessionId) onMoveSession(sessionId, target === 'uncategorized' ? null : target);
        },
    });

    const renderSession = (session, indent) => {
        const isActive = session.id === activeSession?.id;
        const isRenaming = renaming?.kind === 'session' && renaming.id === session.id;
        return (
            <div
                key={session.id}
                draggable={!isRenaming}
                onDragStart={e => e.dataTransfer.setData('application/x-session-id', String(session.id))}
                style={{
                    ...rowStyle,
                    paddingLeft: indent ? '28px' : '12px',
                    fontWeight: isActive ? 'bold' : 'normal',
                    color: isActive ? '#4fc3f7' : '#ddd',
                }}
                onClick={() => { setOpen(false); onSwitchSession(session.id); }}
            >
                {isRenaming ? (
                    <RenameInput initialName={session.name} onCommit={commitRename} onCancel={() => setRenaming(null)} />
                ) : (
                    <>
                        <button
                            style={{
                                ...actionButtonStyle,
                                marginRight: '6px',
                                fontSize: '13px',
                                opacity: session.favorite ? 1 : 0.35,
                                color: session.favorite ? '#ffd54f' : '#888',
                                textShadow: session.favorite ? 'none' : '0 0 3px rgba(255, 255, 255, 0.4)',
                            }}
                            title={session.favorite ? 'Remove from favorites' : 'Add to favorites'}
                            onClick={(e) => { e.stopPropagation(); onToggleFavorite(session.id); }}
                        >★</button>
                        <button
                            style={{
                                ...actionButtonStyle,
                                marginRight: '6px',
                                fontSize: '13px',
                                opacity: session.portfolio ? 1 : 0.35,
                                color: session.portfolio ? '#66bb6a' : '#888',
                                textShadow: session.portfolio ? 'none' : '0 0 3px rgba(255, 255, 255, 0.4)',
                            }}
                            title={session.portfolio ? 'Remove from portfolio' : 'Add to portfolio'}
                            onClick={(e) => { e.stopPropagation(); onTogglePortfolio(session.id); }}
                        >💼</button>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</span>
                        <button style={actionButtonStyle} title="Rename session" onClick={(e) => { e.stopPropagation(); startRename('session', session.id); }}>✏️</button>
                        <button style={actionButtonStyle} title="Delete session" onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}>🗑</button>
                    </>
                )}
            </div>
        );
    };

    const renderFolder = (folder) => {
        const folderSessions = sessions.filter(s => s.folder === folder.id);
        const isExpanded = expanded.has(folder.id);
        const isActive = folder.id === activeFolderId;
        const isRenaming = renaming?.kind === 'folder' && renaming.id === folder.id;
        const isDropTarget = dropTarget === folder.id;
        return (
            <div key={folder.id}>
                <div
                    {...dropProps(folder.id)}
                    style={{
                        ...rowStyle,
                        fontWeight: isActive ? 'bold' : 'normal',
                        color: isActive ? '#4fc3f7' : '#bbb',
                        backgroundColor: isDropTarget ? 'rgba(79, 195, 247, 0.15)' : 'transparent',
                        outline: isDropTarget ? '1px dashed #4fc3f7' : 'none',
                    }}
                    onClick={() => { toggleExpanded(folder.id); onSetActiveFolder(folder.id); }}
                >
                    <span style={{ marginRight: '6px', fontSize: '10px' }}>{isExpanded ? '▾' : '▸'}</span>
                    {isRenaming ? (
                        <RenameInput initialName={folder.name} onCommit={commitRename} onCancel={() => setRenaming(null)} />
                    ) : (
                        <>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📁 {folder.name}</span>
                            <button style={actionButtonStyle} title="Rename folder" onClick={(e) => { e.stopPropagation(); startRename('folder', folder.id); }}>✏️</button>
                            <button style={actionButtonStyle} title="Delete folder (sessions are kept)" onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }}>🗑</button>
                        </>
                    )}
                </div>
                {isExpanded && folderSessions.map(s => renderSession(s, true))}
            </div>
        );
    };

    const uncategorized = sessions.filter(s => s.folder == null);

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
                    minWidth: '220px',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                    zIndex: 3000,
                    padding: '4px 0',
                }}>
                    {folders.map(renderFolder)}
                    {uncategorized.length > 0 && (
                        <div {...dropProps('uncategorized')} style={{
                            backgroundColor: dropTarget === 'uncategorized' ? 'rgba(79, 195, 247, 0.15)' : 'transparent',
                            outline: dropTarget === 'uncategorized' ? '1px dashed #4fc3f7' : 'none',
                        }}>
                            {folders.length > 0 && (
                                <div style={{ ...rowStyle, color: '#777', fontSize: '11px', cursor: 'default', textTransform: 'uppercase' }}>
                                    Uncategorized
                                </div>
                            )}
                            {uncategorized.map(s => renderSession(s, folders.length > 0))}
                        </div>
                    )}
                    <div style={{ borderTop: '1px solid #333', margin: '4px 0' }} />
                    <button style={rowStyle} onClick={() => { setOpen(false); onCreateSession(); }}>➕ New session</button>
                    <button style={rowStyle} onClick={() => { setOpen(false); onCreateFolder(); }}>📁 New folder</button>
                </div>
            )}
        </div>
    );
};

export default SessionMenu;
