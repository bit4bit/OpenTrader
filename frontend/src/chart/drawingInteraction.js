import {
    REQUIRED_POINTS,
    SINGLE_CLICK_TOOLS,
    createLineDrawing,
    createMultiPointDrawing,
    createTextNote,
    createTextLabel,
} from './drawingTools';

// Drawing click state machine: given the active tool, the clicked point and
// the points collected so far, decide what happens next.
// Returns { drawing?, pendingPoints, finished } — a committed drawing means
// the tool deactivates; otherwise pendingPoints keeps accumulating.
export function applyDrawingClick(tool, point, pendingPoints, id) {
    if (SINGLE_CLICK_TOOLS.includes(tool)) {
        return { drawing: createLineDrawing(tool, point, id), pendingPoints: [], finished: true };
    }
    if (tool === 'textNote') {
        return { drawing: createTextNote(point, id), pendingPoints: [], finished: true };
    }
    if (tool === 'textLabel') {
        return { drawing: createTextLabel(point, id), pendingPoints: [], finished: true };
    }
    const nextPoints = [...pendingPoints, point];
    if (nextPoints.length >= (REQUIRED_POINTS[tool] ?? Infinity)) {
        return { drawing: createMultiPointDrawing(tool, nextPoints, id), pendingPoints: [], finished: true };
    }
    return { drawing: null, pendingPoints: nextPoints, finished: false };
}

// Home/End jump target: slide the current window to an edge, preserving zoom.
export function edgeRange(key, width, dataLength, rightOffset = 20) {
    if (key === 'End') return { from: dataLength - 1 + rightOffset - width, to: dataLength - 1 + rightOffset };
    return { from: 0, to: width };
}
