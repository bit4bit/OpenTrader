import React, { useState, useRef, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'opentrader_note_modal';
const MIN_WIDTH = 260;
const MIN_HEIGHT = 180;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const loadGeometry = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved) {
            return {
                x: clamp(saved.x ?? 120, 0, window.innerWidth - MIN_WIDTH),
                y: clamp(saved.y ?? 120, 0, window.innerHeight - MIN_HEIGHT),
                width: Math.max(saved.width ?? 360, MIN_WIDTH),
                height: Math.max(saved.height ?? 260, MIN_HEIGHT),
            };
        }
    } catch { /* corrupted localStorage: fall through to defaults */ }
    return { x: 120, y: 120, width: 360, height: 260 };
};

const SessionNote = ({ notes = '', onChange, onClose }) => {
    const [geometry, setGeometry] = useState(loadGeometry);
    const geometryRef = useRef(geometry);
    const dragState = useRef(null);

    useEffect(() => {
        geometryRef.current = geometry;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(geometry));
    }, [geometry]);

    const startDrag = useCallback((e) => {
        const { x, y } = geometryRef.current;
        dragState.current = { mode: 'move', startX: e.clientX, startY: e.clientY, origX: x, origY: y };
        e.currentTarget.setPointerCapture(e.pointerId);
    }, []);

    const startResize = useCallback((e) => {
        const { width, height } = geometryRef.current;
        dragState.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, origWidth: width, origHeight: height };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
    }, []);

    const onPointerMove = useCallback((e) => {
        const drag = dragState.current;
        if (!drag) return;
        if (drag.mode === 'move') {
            setGeometry(g => ({
                ...g,
                x: clamp(drag.origX + e.clientX - drag.startX, -g.width + 80, window.innerWidth - 80),
                y: clamp(drag.origY + e.clientY - drag.startY, 0, window.innerHeight - 40),
            }));
        } else {
            setGeometry(g => ({
                ...g,
                width: clamp(drag.origWidth + e.clientX - drag.startX, MIN_WIDTH, window.innerWidth),
                height: clamp(drag.origHeight + e.clientY - drag.startY, MIN_HEIGHT, window.innerHeight),
            }));
        }
    }, []);

    const endDrag = useCallback(() => { dragState.current = null; }, []);

    return (
        <div
            className="session-note"
            style={{ left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }}
        >
            <div
                className="session-note-header"
                onPointerDown={startDrag}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
            >
                <span>📝 Session note</span>
                <button
                    className="header-action-btn remove"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={onClose}
                >
                    ✕
                </button>
            </div>
            <textarea
                className="session-note-text"
                placeholder="Write your notes for this session…"
                value={notes}
                onChange={(e) => onChange(e.target.value)}
                spellCheck={false}
            />
            <div
                className="session-note-resize"
                onPointerDown={startResize}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
            />
        </div>
    );
};

export default SessionNote;
