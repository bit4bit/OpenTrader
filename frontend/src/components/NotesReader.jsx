import React from 'react';
import { renderMarkdown } from '../notes/markdown';
import { noteTime } from '../chart/noteMarkers';
import { formatCrosshairTime } from '../chart/timeFormat';

// Full-document view of a note: the text is rendered as sanitized
// markdown (plain notes keep their line breaks).
const NotesReader = ({ note, onBack, onEdit }) => {
    const time = noteTime(note.pinned_at, '1d');
    return (
        <>
            <div className="sm-list-header">
                <button className="header-action-btn" onClick={onBack} title="Back to the list">←</button>
                <span className="sm-list-title">
                    {note.symbol ? `${note.symbol}` : 'Journal'}
                    {note.pinned_at ? ` · 📌 ${formatCrosshairTime(time, '1d')}` : ''}
                </span>
                {note.favorite && <span className="notes-reader-favorite">★</span>}
                <button className="sm-list-new" onClick={onEdit} title="Edit source">✎ Edit</button>
            </div>
            <div className="notes-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(note.text) }} />
        </>
    );
};

export default NotesReader;
