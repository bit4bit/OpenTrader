import { useEffect } from 'react';

const TOOL_KEYS = {
    v: 'avwapAnchor',
    d: 'eraserOne',
    t: 'trend',
    p: 'priceRange',
    n: 'textNote',
};

const isEditable = (target) =>
    target?.tagName === 'INPUT'
    || target?.tagName === 'TEXTAREA'
    || target?.tagName === 'SELECT'
    || target?.isContentEditable;

const useDrawingToolShortcuts = (onSelectTool, enabled = true) => {
    useEffect(() => {
        if (!enabled) return undefined;
        const handleKeyDown = (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
            if (isEditable(e.target)) return;
            const tool = TOOL_KEYS[e.key.toLowerCase()];
            if (tool) onSelectTool(tool);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onSelectTool, enabled]);
};

export default useDrawingToolShortcuts;
