import React, { useState, useEffect, useRef } from 'react';
import { GRID_LAYOUTS, layoutIconCells } from '../chart/gridLayout';

const LayoutIcon = ({ layoutId }) => {
    const { cols, rows } = layoutIconCells(layoutId);
    if (!cols) {
        return <span className="layout-icon-auto">A</span>;
    }
    return (
        <span
            className="layout-icon"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        >
            {Array.from({ length: cols * rows }, (_, i) => <span key={i} className="layout-icon-cell" />)}
        </span>
    );
};

export const LayoutOptions = ({ gridLayout, onSelect }) => (
    <>
        {GRID_LAYOUTS.map(layout => (
            <button
                key={layout.id}
                className={`layout-option ${layout.id === gridLayout ? 'active' : ''}`}
                onClick={() => onSelect(layout.id)}
            >
                <LayoutIcon layoutId={layout.id} />
                <span>{layout.label}</span>
            </button>
        ))}
    </>
);

const LayoutPicker = ({ gridLayout, onSetGridLayout }) => {
    const [open, setOpen] = useState(false);
    const [menuPos, setMenuPos] = useState(null);
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

    return (
        <div style={{ position: 'relative' }}>
            <button ref={buttonRef} className="toolbar-btn" onClick={toggle} title="Chart layout">
                <span style={{ fontSize: '14px' }}>▦</span>
            </button>
            {open && menuPos && (
                <div ref={menuRef} className="layout-picker" style={{ top: menuPos.top, left: menuPos.left }}>
                    <LayoutOptions
                        gridLayout={gridLayout}
                        onSelect={(id) => { setOpen(false); onSetGridLayout(id); }}
                    />
                </div>
            )}
        </div>
    );
};

export default LayoutPicker;
