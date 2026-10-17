import React, { useState } from 'react';
import SessionManagerModal from './SessionManagerModal';

const SessionMenu = (props) => {
    const [open, setOpen] = useState(false);
    const { activeSession } = props;
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
            {open && <SessionManagerModal {...props} onClose={() => setOpen(false)} />}
        </div>
    );
};

export default SessionMenu;
