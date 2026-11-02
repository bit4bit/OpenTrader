// Pure geometry for pinned notes. Every chart of the note's symbol — on
// any timeframe — shows a marker at the pinned bar when that bar (or its
// nearest neighbour, for weekend/holiday dates) is on the visible time
// scale; the marker sits above the candle's high so it never covers the
// candles. Symbol-less and unpinned notes are modal-only.
// ctx = { timeToX, priceToY, width, interval, candles }

import { INTRADAY_INTERVALS } from './timeFormat';
import { findNearestBar } from './barSearch';
import { circle, text } from './drawingGeometry';

export const NOTE_COLOR = '#4fc3f7';
const MARKER_RADIUS = 5;
const MARKER_GAP = 3;

// Epoch seconds of the note's bar. Daily+ bars are stamped UTC midnight,
// so intraday pin times snap to the containing day.
export function noteTime(pinnedAt, interval) {
    if (!pinnedAt) return null;
    const seconds = Math.floor(Date.parse(pinnedAt) / 1000);
    if (Number.isNaN(seconds)) return null;
    if (INTRADAY_INTERVALS.includes(interval)) return seconds;
    return seconds - (seconds % 86400);
}

// Pinned notes for a symbol (case-insensitive); market charts only show
// notes bound to both the symbol and a date.
export function notesForSymbol(notes, symbol) {
    const wanted = (symbol || '').toLowerCase();
    if (!wanted) return [];
    return notes.filter(n => n.pinned_at != null && (n.symbol || '').toLowerCase() === wanted);
}

// Marker position, or null when the pin has no bar to ride on: the pinned
// time snaps to the nearest stored bar (weekend/holiday pins land on the
// adjacent trading day); pins outside a snap distance of any bar — e.g.
// far beyond the loaded history — stay hidden.
export function noteScreenPos(note, ctx) {
    const time = noteTime(note.pinned_at, ctx.interval);
    if (time == null) return null;
    const bars = ctx.candles || [];
    const nearest = findNearestBar(bars, time);
    if (!nearest) return null;
    const SNAP_DISTANCE = INTRADAY_INTERVALS.includes(ctx.interval) ? 3 * 86400 : 1.5 * 86400;
    if (Math.abs(nearest.time - time) > SNAP_DISTANCE) return null;
    const bar = bars.find(c => c.time === nearest.time);
    const y = markerY(bar, ctx);
    if (y === null) return null;
    const x = ctx.timeToX(nearest.time);
    if (x === null || x === undefined || x < MARKER_RADIUS || x > ctx.width - MARKER_RADIUS) return null;
    return { x, y };
}

function markerY(bar, ctx) {
    const high = bar && bar.high != null ? bar.high
        : (bar && bar.close != null ? bar.close : null);
    if (high == null) return null;
    const highY = ctx.priceToY(high);
    if (highY === null || highY === undefined) return null;
    return highY - MARKER_GAP - MARKER_RADIUS;
}

export function buildNoteShapes(notes, ctx) {
    const shapes = [];
    notes.forEach(n => {
        const pos = noteScreenPos(n, ctx);
        if (!pos) return;
        shapes.push(circle(pos.x, pos.y, MARKER_RADIUS, {
            fill: NOTE_COLOR, stroke: '#131722', strokeWidth: 1,
        }));
        shapes.push(text(pos.x, pos.y + 3, 'N', {
            fill: '#131722', fontSize: '8px', fontWeight: 'bold', anchor: 'middle',
        }));
    });
    return shapes;
}
