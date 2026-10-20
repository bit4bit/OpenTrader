import React, { useState } from 'react';
import SessionManagerModal from './SessionManagerModal';
import { folderViewId } from '../sessions/sessionList';

const SessionMenu = (props) => {
    const [open, setOpen] = useState(false);
    const [lastViewId, setLastViewId] = useState(null);
    const { activeSession, folders, activeFolderId } = props;
    const initialViewId = lastViewId
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
                    onViewChange={setLastViewId}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
};

export default SessionMenu;
