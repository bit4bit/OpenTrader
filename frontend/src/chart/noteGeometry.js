// Screen coordinates of a text note's anchor and box, given coordinate
// converters (timeScale.timeToCoordinate / series.priceToCoordinate).
export function getNoteCoordinates(drawing, timeToX, priceToY) {
    const x = timeToX(drawing.anchor.time);
    const y = priceToY(drawing.anchor.price);
    if (x === null || y === null) return null;
    const { dx, dy } = drawing.boxOffset;
    return { anchorX: x, anchorY: y, boxX: x + dx, boxY: y + dy };
}

// Box drag keeps the anchor fixed and re-derives the pixel offset.
export function noteBoxOffset(anchorX, anchorY, pointerX, pointerY) {
    return { dx: pointerX - anchorX, dy: pointerY - anchorY };
}

// Array transforms for note CRUD (shared with the drawings collection).
export function updateTextNote(drawings, id, updater) {
    return drawings.map(d => (d.type === 'textNote' && d.id === id ? updater(d) : d));
}

export function deleteDrawing(drawings, id) {
    return drawings.filter(d => d.id !== id);
}
