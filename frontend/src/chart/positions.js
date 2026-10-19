// Pure geometry for tracked positions. Every chart of the symbol — on any
// timeframe — shows a full-width dashed price line at the entry price with
// a price label on the axis; the circle marker (with the B/S letter) sits
// at the entry bar when that bar is on the visible time scale, at the
// right edge when the position has no date, and is omitted when the entry
// bar is off-screen. The circle yields to the entry candle: when the
// price level falls on the candle it drops below the candle's low, tied
// back to the price line with a short connector.
// ctx = { timeToX, priceToY, width, interval, formatPrice, candles }

import { INTRADAY_INTERVALS } from './timeFormat';
import { findNearestBar } from './barSearch';
import { line, rect, circle, text } from './drawingGeometry';

export const POSITION_BUY_COLOR = '#089981';
export const POSITION_SELL_COLOR = '#f23645';
const MARKER_RADIUS = 5;
const MARKER_GAP = 3;
const LABEL_HEIGHT = 18;

export const positionColor = (position) =>
    position.side === 'sell' ? POSITION_SELL_COLOR : POSITION_BUY_COLOR;

const sideLetter = (position) => (position.side === 'sell' ? 'S' : 'B');

// Epoch seconds of the position's bar. Daily+ bars are stamped UTC
// midnight, so intraday position times snap to the containing day.
export function positionTime(openedAt, interval) {
    if (!openedAt) return null;
    const seconds = Math.floor(Date.parse(openedAt) / 1000);
    if (Number.isNaN(seconds)) return null;
    if (INTRADAY_INTERVALS.includes(interval)) return seconds;
    return seconds - (seconds % 86400);
}

export function positionsForSymbol(positions, symbol) {
    const wanted = (symbol || '').toLowerCase();
    if (!wanted) return [];
    return positions.filter(p => (p.symbol || '').toLowerCase() === wanted);
}

const priceY = (position, ctx) => {
    const y = ctx.priceToY(position.price);
    return (y === null || y === undefined) ? null : y;
};

// Circle y: the price level, unless that level falls on the entry candle
// (within marker reach of its high-low span) — then below the candle's
// low, so the circle never covers the candles.
function markerY(position, ctx) {
    const levelY = priceY(position, ctx);
    if (levelY === null) return null;
    const time = positionTime(position.opened_at, ctx.interval);
    const nearest = time == null ? null : findNearestBar(ctx.candles || [], time);
    const bar = nearest ? (ctx.candles || []).find(c => c.time === nearest.time) : null;
    if (!bar || bar.low == null || bar.high == null) return levelY;
    const lowY = ctx.priceToY(bar.low);
    const highY = ctx.priceToY(bar.high);
    if (lowY === null || highY === null) return levelY;
    const candleTop = Math.min(highY, lowY) - MARKER_RADIUS;
    const candleBottom = Math.max(highY, lowY) + MARKER_RADIUS;
    if (levelY < candleTop || levelY > candleBottom) return levelY;
    return candleBottom + MARKER_GAP;
}

const positionLabelWidth = (position, ctx) => {
    const label = ctx.formatPrice(position.price);
    return Math.max(48, label.length * 7 + 10);
};

// Axis price-label rect; renders on every chart of the symbol regardless
// of timeframe, so it doubles as the always-available hover target.
export function positionLabelRect(position, ctx) {
    const y = priceY(position, ctx);
    if (y === null) return null;
    const width = positionLabelWidth(position, ctx);
    return { x: ctx.width - width, y: y - LABEL_HEIGHT / 2, width, height: LABEL_HEIGHT };
}

// Circle position, or null when there is nothing to point at: undated
// positions pin to the right edge; dated positions resolve only when the
// entry bar maps inside the viewport.
export function positionScreenPos(position, ctx) {
    const y = markerY(position, ctx);
    if (y === null) return null;
    if (!position.opened_at) return { x: ctx.width - MARKER_RADIUS, y };
    const x = ctx.timeToX(positionTime(position.opened_at, ctx.interval));
    if (x === null || x === undefined || x < MARKER_RADIUS || x > ctx.width - MARKER_RADIUS) return null;
    return { x, y };
}

export function buildPositionShapes(positions, ctx) {
    const shapes = [];
    positions.forEach(p => {
        const levelY = priceY(p, ctx);
        if (levelY === null) return;
        const color = positionColor(p);
        shapes.push(line(0, levelY, ctx.width, levelY, {
            stroke: color, strokeWidth: 1, dash: '4,3', opacity: '0.7',
        }));
        const pos = positionScreenPos(p, ctx);
        if (pos) {
            if (pos.y !== levelY) {
                shapes.push(line(pos.x, levelY, pos.x, pos.y - MARKER_RADIUS, {
                    stroke: color, strokeWidth: 1, dash: '4,3', opacity: '0.7',
                }));
            }
            shapes.push(circle(pos.x, pos.y, MARKER_RADIUS, {
                fill: color, stroke: '#131722', strokeWidth: 1,
            }));
            shapes.push(text(pos.x, pos.y + 3, sideLetter(p), {
                fill: '#ffffff', fontSize: '7px', fontWeight: 'bold', anchor: 'middle',
            }));
        }
        const labelRect = positionLabelRect(p, ctx);
        shapes.push(rect(labelRect.x, labelRect.y, labelRect.width, labelRect.height, {
            fill: color, rx: 2,
        }));
        shapes.push(text(ctx.width - 5, levelY + 4, ctx.formatPrice(p.price), {
            fill: '#ffffff', fontSize: '11px', fontWeight: 'bold', anchor: 'end',
        }));
    });
    return shapes;
}
