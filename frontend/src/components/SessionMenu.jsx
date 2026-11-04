import React, { useState } from 'react';
import SessionManagerModal from './SessionManagerModal';
import { folderViewId, validViewId } from '../sessions/sessionList';

// The last sidebar view survives toolbar toggles (TopBar unmounts) and
// reloads, so reopening the manager lands where the user left it.
const SESSION_VIEW_KEY = 'opentrader_session_view';

const SessionMenu = (props) => {
    const [open, setOpen] = useState(false);
    const { activeSession, folders, activeFolderId } = props;
    const initialViewId = validViewId(localStorage.getItem(SESSION_VIEW_KEY), folders)
        ?? (activeFolderId != null && folders.some(f => f.id === activeFolderId)
            ? folderViewId(activeFolderId)
            : 'all');
    return (
        <div style={{ position: 'relative' }}>
            <button
                className="toolbar-btn"
                onClick={() => setOpen(true)}
                title="Manage sessions (search, folders, favorites)"
            >
                <span style={{ fontSize: '13px', marginRight: '4px' }}>📁</span>
                {activeSession?.name || 'No session'}
                <span style={{ fontSize: '10px', marginLeft: '4px' }}>▾</span>
            </button>
            {open && (
                <SessionManagerModal
                    {...props}
                    initialViewId={initialViewId}
                    onViewChange={id => localStorage.setItem(SESSION_VIEW_KEY, id)}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
};

export default SessionMenu;
