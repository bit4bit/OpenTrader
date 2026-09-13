// Pure geometry: convert drawings/indicator overlays into engine-neutral
// shapes in pixel coordinates. No DOM, no chart-library imports — renderers
// (SVG, canvas, ...) consume these shapes.
//
// ctx = {
//   timeToX: (time) => px | null,
//   priceToY: (price) => px | null,
//   width, height,          // overlay size in px
//   data,                   // bars, for regression/bar-count tools
//   hasPreview,             // a preview drawing exists (anchor behavior)
// }
//
// Shape kinds: line, polyline, polygon, rect, circle, ellipse, path, text.
// Common style fields: stroke, strokeWidth, lineCap, lineJoin, dash,
// opacity, fill, fontSize, fontWeight, anchor, fontFamily, rx.

import { linearRegression, maxDeviation, stdError, timeWindowIndices } from './regression';
import { getNoteCoordinates } from './noteGeometry';

export const DEFAULT_STROKE = '#2962ff';
export const DEFAULT_FILL = 'rgba(41, 98, 255, 0.1)';
const LABEL_FILL = '#d1d4dc';
const ANCHOR_FILL = '#131722';

const line = (x1, y1, x2, y2, style = {}) => ({ kind: 'line', x1, y1, x2, y2, style });
const polyline = (points, style = {}) => ({ kind: 'polyline', points, style });
const polygon = (points, style = {}) => ({ kind: 'polygon', points, style });
const rect = (x, y, width, height, style = {}) => ({ kind: 'rect', x, y, width, height, style });
const circle = (cx, cy, r, style = {}) => ({ kind: 'circle', cx, cy, r, style });
const ellipse = (cx, cy, rx, ry, style = {}) => ({ kind: 'ellipse', cx, cy, rx, ry, style });
const path = (d, style = {}) => ({ kind: 'path', d, style });
const text = (x, y, content, style = {}) => ({ kind: 'text', x, y, text: content, style });

const strokeOf = (d, extra = {}) => ({
    stroke: d.color || DEFAULT_STROKE,
    strokeWidth: d.lineWidth || 2,
    lineCap: 'round',
    ...extra,
});

const HARMONIC_TYPES = ['xabcd', 'cypher', 'abcd', 'threeDrives', 'shark', 'fiveO'];
const ELLIOTT_TYPES = ['elliottImpulse', 'elliottCorrection', 'elliottTriangle', 'elliottDoubleCombo', 'elliottTripleCombo'];
const PATTERN_TYPES = ['headAndShoulders', 'trianglePattern', 'wedgePattern', 'rectanglePattern', 'channelPattern', 'doubleTop', 'doubleBottom'];
const PITCHFORK_TYPES = ['pitchfork', 'schiffPitchfork', 'modifiedSchiffPitchfork', 'insidePitchfork'];

const harmonicLabels = (type) =>
    type === 'abcd' ? ['A', 'B', 'C', 'D'] :
        type === 'threeDrives' ? ['1', '2', '3', '4', '5', '6'] :
            type === 'fiveO' ? ['0', '1', '2', '3', '4', '5'] :
                ['X', 'A', 'B', 'C', 'D'];

const elliottLabels = (type) =>
    type === 'elliottImpulse' ? ['(1)', '(2)', '(3)', '(4)', '(5)'] :
        type === 'elliottCorrection' ? ['(A)', '(B)', '(C)'] :
            type === 'elliottTriangle' ? ['(A)', '(B)', '(C)', '(D)', '(E)'] :
                type === 'elliottDoubleCombo' ? ['(W)', '(X)', '(Y)'] :
                    ['(W)', '(X)', '(Y)', '(X)', '(Z)'];

// Map drawing points to pixels, dropping unconvertible ones.
const pointsToPx = (points, ctx) =>
    points.map(p => {
        const x = ctx.timeToX(p.time);
        const y = ctx.priceToY(p.price);
        return (x !== null && y !== null) ? { x, y } : null;
    }).filter(Boolean);

const labeledPolyline = (d, ctx, labels, { fontSize = '12px', dy = -10 } = {}) => {
    const pts = pointsToPx(d.points, ctx);
    const shapes = [polyline(pts, strokeOf(d, { fill: 'none', lineJoin: 'round' }))];
    d.points.forEach((p, idx) => {
        const x = ctx.timeToX(p.time);
        const y = ctx.priceToY(p.price);
        if (x !== null && y !== null && labels[idx] !== undefined) {
            shapes.push(text(x, y + dy, labels[idx], {
                fill: LABEL_FILL, fontSize, fontWeight: 'bold', anchor: 'middle',
            }));
        }
    });
    return shapes;
};

function harmonicShapes(d, ctx) {
    const shapes = [];
    // Shading polygons render beneath the polyline.
    if (['xabcd', 'cypher', 'shark'].includes(d.type) && d.points.length >= 3) {
        const [pX, pA, pB] = d.points.map(p => ({ x: ctx.timeToX(p.time), y: ctx.priceToY(p.price) }));
        if (pX.x !== null && pA.x !== null && pB.x !== null) {
            shapes.push(polygon([pX, pA, pB], { fill: d.fillColor || DEFAULT_FILL }));
        }
        if (d.points.length >= 5) {
            const pC = { x: ctx.timeToX(d.points[3].time), y: ctx.priceToY(d.points[3].price) };
            const pD = { x: ctx.timeToX(d.points[4].time), y: ctx.priceToY(d.points[4].price) };
            if (pB.x !== null && pC.x !== null && pD.x !== null) {
                shapes.push(polygon([pB, pC, pD], { fill: d.fillColor || DEFAULT_FILL }));
            }
        }
    }
    shapes.push(...labeledPolyline(d, ctx, harmonicLabels(d.type)));
    return shapes;
}

function patternShapes(d, ctx) {
    const isPolygon = ['trianglePattern', 'rectanglePattern'].includes(d.type);
    const pts = pointsToPx(d.points, ctx);
    const shapes = [
        isPolygon
            ? polygon(pts, strokeOf(d, { fill: d.fillColor || DEFAULT_FILL, lineJoin: 'round' }))
            : polyline(pts, strokeOf(d, { fill: 'none', lineJoin: 'round' })),
    ];
    const labels =
        d.type === 'headAndShoulders' ? ['S1', 'LS', 'N1', 'H', 'N2', 'RS', 'E1'] :
            d.type === 'doubleTop' ? ['S', 'T1', 'N', 'T2', 'E'] :
                d.type === 'doubleBottom' ? ['S', 'B1', 'N', 'B2', 'E'] :
                    null;
    if (labels) {
        d.points.forEach((p, idx) => {
            const x = ctx.timeToX(p.time);
            const y = ctx.priceToY(p.price);
            if (x !== null && y !== null && labels[idx]) {
                shapes.push(text(x, y - 12, labels[idx], {
                    fill: LABEL_FILL, fontSize: '10px', fontWeight: 'bold', anchor: 'middle',
                }));
            }
        });
    }
    return shapes;
}

function pitchforkShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2] || d.points[1];
    let px1 = ctx.timeToX(p1.time), py1 = ctx.priceToY(p1.price);
    const px2 = ctx.timeToX(p2.time), py2 = ctx.priceToY(p2.price);
    const px3 = ctx.timeToX(p3.time), py3 = ctx.priceToY(p3.price);
    if (px1 === null || py1 === null || px2 === null || py2 === null || px3 === null || py3 === null) return [];

    if (d.type === 'schiffPitchfork') {
        py1 = (py1 + py2) / 2;
    } else if (d.type === 'modifiedSchiffPitchfork') {
        px1 = (px1 + px2) / 2;
        py1 = (py1 + py2) / 2;
    } else if (d.type === 'insidePitchfork') {
        py1 = (py1 + (py2 + py3) / 2) / 2;
    }

    const midX = (px2 + px3) / 2;
    const midY = (py2 + py3) / 2;
    const slope = (midY - py1) / (midX - px1);
    const intercept = py1 - slope * px1;
    const base = strokeOf(d);

    const shapes = [line(px1, py1, ctx.width, slope * ctx.width + intercept, base)];
    const dy = py3 - midY;
    [dy, -dy].forEach(offset => {
        shapes.push(line(
            px2 + (offset === dy ? 0 : px3 - px2),
            py2 + (offset === dy ? 0 : py3 - py2),
            ctx.width,
            slope * ctx.width + intercept + offset,
            base
        ));
    });
    return shapes;
}

function regressionChannelShapes(d, ctx) {
    const [p1, p2] = d.points;
    const startIdx = ctx.data.findIndex(item => item.time === p1.time);
    const endIdx = ctx.data.findIndex(item => item.time === p2.time);
    if (startIdx === -1 || endIdx === -1) return [];
    const subset = ctx.data.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
    const closes = subset.map(b => b.close);
    const reg = linearRegression(closes);
    if (!reg) return [];
    const { slope, intercept } = reg;
    const n = subset.length;
    const lx1 = ctx.timeToX(subset[0].time);
    const lx2 = ctx.timeToX(subset[n - 1].time);
    const ly1 = ctx.priceToY(intercept);
    const ly2 = ctx.priceToY(slope * (n - 1) + intercept);
    if (lx1 === null || lx2 === null || ly1 === null || ly2 === null) return [];

    const base = strokeOf(d);
    const shapes = [line(lx1, ly1, lx2, ly2, base)];
    const devY = Math.abs(ctx.priceToY(intercept + maxDeviation(closes, slope, intercept)) - ly1);
    [devY, -devY].forEach(off => {
        shapes.push(line(lx1, ly1 + off, lx2, ly2 + off, { ...base, opacity: '0.4' }));
    });
    return shapes;
}

function arrowShapes(d, ctx, x1, y1, x2, y2) {
    const shapes = [line(x1, y1, x2, y2, strokeOf(d))];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headSize = 10;
    shapes.push(polygon([
        { x: x2, y: y2 },
        { x: x2 - headSize * Math.cos(angle - Math.PI / 6), y: y2 - headSize * Math.sin(angle - Math.PI / 6) },
        { x: x2 - headSize * Math.cos(angle + Math.PI / 6), y: y2 - headSize * Math.sin(angle + Math.PI / 6) },
    ], { fill: d.color || DEFAULT_STROKE }));
    return shapes;
}

function infoLineShapes(d, ctx, x1, y1, x2, y2) {
    const priceDiff = d.p2.price - d.p1.price;
    const percDiff = (priceDiff / d.p1.price) * 100;
    return [
        line(x1, y1, x2, y2, strokeOf(d)),
        text(x2 + 10, y2 - 10, `${priceDiff.toFixed(2)} (${percDiff.toFixed(2)}%)`, {
            fill: LABEL_FILL, fontSize: '12px', fontFamily: 'Inter, sans-serif',
        }),
    ];
}

function trendAngleShapes(d, ctx, x1, y1, x2, y2) {
    const angleDeg = -Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return [
        line(x1, y1, x2, y2, strokeOf(d)),
        line(x1, y1, x1 + 50, y1, { stroke: 'rgba(209, 212, 220, 0.3)', dash: '4' }),
        text(x1 + 20, y1 - 5, `${angleDeg.toFixed(1)}°`, { fill: LABEL_FILL, fontSize: '12px' }),
    ];
}

function rotatedRectangleShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2] || d.points[1];
    const px1 = ctx.timeToX(p1.time), py1 = ctx.priceToY(p1.price);
    const px2 = ctx.timeToX(p2.time), py2 = ctx.priceToY(p2.price);
    const px3 = ctx.timeToX(p3.time), py3 = ctx.priceToY(p3.price);
    if (px1 === null || py1 === null || px2 === null || py2 === null || px3 === null || py3 === null) return [];

    const dx = px2 - px1, dy = py2 - py1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dist = ((px3 - px1) * (-dy) + (py3 - py1) * dx) / len || 0;
    const perpX = -dy / len * dist;
    const perpY = dx / len * dist;

    return [polygon([
        { x: px1, y: py1 },
        { x: px2, y: py2 },
        { x: px2 + perpX, y: py2 + perpY },
        { x: px1 + perpX, y: py1 + perpY },
    ], strokeOf(d, { fill: d.fillColor || DEFAULT_FILL }))];
}

function curveShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2] || d.points[1];
    const px1 = ctx.timeToX(p1.time), py1 = ctx.priceToY(p1.price);
    const px2 = ctx.timeToX(p2.time), py2 = ctx.priceToY(p2.price);
    const px3 = ctx.timeToX(p3.time), py3 = ctx.priceToY(p3.price);
    if (px1 === null || py1 === null || px2 === null || py2 === null || px3 === null || py3 === null) return [];
    return [path(`M ${px1} ${py1} Q ${px2} ${py2} ${px3} ${py3}`, strokeOf(d, { fill: 'none' }))];
}

function doubleCurveShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2] || p1, p4 = d.points[3] || p3;
    const c = [p1, p2, p3, p4].map(p => ({ x: ctx.timeToX(p.time), y: ctx.priceToY(p.price) }));
    if (c.some(pt => pt.x === null || pt.y === null)) return [];
    return [path(`M ${c[0].x} ${c[0].y} C ${c[1].x} ${c[1].y} ${c[2].x} ${c[2].y} ${c[3].x} ${c[3].y}`, strokeOf(d, { fill: 'none' }))];
}

function positionShapes(d, x1, y1, x2, y2, { stopDist, targetDist, profitFirst }) {
    const left = Math.min(x1, x2);
    const w = Math.abs(x2 - x1);
    const profit = rect(left, y1 - targetDist, w, targetDist, { fill: 'rgba(8, 153, 129, 0.2)' });
    const loss = rect(left, y1, w, stopDist, { fill: 'rgba(242, 54, 69, 0.2)' });
    const center = line(left, y1, Math.max(x1, x2), y1, strokeOf(d));
    return profitFirst ? [profit, loss, center] : [loss, profit, center];
}

function priceRangeShapes(d, x1, y1, x2, y2) {
    const priceDiff = Math.abs(d.p2.price - d.p1.price);
    const percentChange = (priceDiff / d.p1.price) * 100;
    return [
        rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), {
            fill: DEFAULT_FILL, stroke: d.color || DEFAULT_STROKE,
        }),
        text(x2 + 5, (y1 + y2) / 2, `${priceDiff.toFixed(2)} (${percentChange.toFixed(2)}%)`, {
            fill: LABEL_FILL, fontSize: '12px',
        }),
    ];
}

function dateRangeShapes(d, ctx, x1, y1, x2) {
    const bars = Math.abs(
        ctx.data.findIndex(item => item.time === d.p2.time) -
        ctx.data.findIndex(item => item.time === d.p1.time)
    );
    return [
        rect(Math.min(x1, x2), 0, Math.abs(x2 - x1), ctx.height, { fill: DEFAULT_FILL }),
        text((x1 + x2) / 2, 20, `${bars} bars`, { fill: LABEL_FILL, fontSize: '12px', anchor: 'middle' }),
    ];
}

function badgeShapes(x, y, label, color, { rectX, rectY, rectW, textY }) {
    return [
        rect(x + rectX, y + rectY, rectW, 20, { fill: color, rx: 4 }),
        text(x, y + textY, label, { fill: 'white', fontSize: '10px', anchor: 'middle', fontWeight: 'bold' }),
    ];
}

function fibRetracementShapes(d, ctx, x1, y1, x2, y2) {
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    const priceRange = d.p2.price - d.p1.price;
    const shapes = [];
    levels.forEach(lvl => {
        const price = d.p1.price + priceRange * lvl;
        const cosY = ctx.priceToY(price);
        if (cosY === null) return;
        shapes.push(line(Math.min(x1, x2), cosY, Math.max(x1, x2), cosY, {
            stroke: d.color || DEFAULT_STROKE, strokeWidth: 1, dash: '2,2',
        }));
        shapes.push(text(Math.max(x1, x2) + 5, cosY + 3, `${lvl.toFixed(3)} (${price.toFixed(2)})`, {
            fill: LABEL_FILL, fontSize: '10px',
        }));
    });
    shapes.push(line(x1, y1, x2, y2, strokeOf(d, { dash: '4,4', opacity: '0.5' })));
    return shapes;
}

function fibExtensionShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2] || d.points[1];
    const px3 = ctx.timeToX(p3.time);
    if ([p1, p2, p3].some(p => ctx.timeToX(p.time) === null || ctx.priceToY(p.price) === null)) return [];
    const priceDiff = p2.price - p1.price;
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618];
    const shapes = [];
    levels.forEach(lvl => {
        const cosY = ctx.priceToY(p3.price + priceDiff * lvl);
        if (cosY === null) return;
        shapes.push(line(px3, cosY, ctx.width, cosY, {
            stroke: d.color || DEFAULT_STROKE, strokeWidth: 1, opacity: '0.6',
        }));
    });
    return shapes;
}

function fibFanShapes(d, x1, y1, x2, y2) {
    return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map(lvl =>
        line(x1, y1, x2, y1 + (y2 - y1) * lvl, {
            stroke: d.color || DEFAULT_STROKE, strokeWidth: 1, opacity: '0.5',
        }));
}

function fibTimeZoneShapes(d, ctx, x1, x2) {
    const dx = Math.abs(x2 - x1);
    return [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]
        .map(f => x1 + f * dx)
        .filter(lx => lx < ctx.width)
        .map(lx => line(lx, 0, lx, ctx.height, { stroke: d.color || DEFAULT_STROKE, opacity: '0.4' }));
}

function gannFanShapes(d, x1, y1, x2, y2) {
    return [1 / 8, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 8].map(angle =>
        line(x1, y1, x1 + 10000, y1 + ((y2 - y1) / (x2 - x1)) * angle * 10000, {
            stroke: d.color || DEFAULT_STROKE, strokeWidth: 1, opacity: '0.3',
        }));
}

function fibCirclesShapes(d, x1, y1, x2, y2) {
    const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    return [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618].map(lvl =>
        circle(x1, y1, radius * lvl, { stroke: d.color || DEFAULT_STROKE, fill: 'none', opacity: '0.3' }));
}

function fibSpeedArcsShapes(d, x1, y1, x2) {
    const radius = Math.abs(x2 - x1);
    return [0.236, 0.382, 0.5, 0.618, 0.786, 1].map(lvl => {
        const r = radius * lvl;
        return path(`M ${x1} ${y1 - r} A ${r} ${r} 0 0 1 ${x1 + r} ${y1}`, {
            stroke: d.color || DEFAULT_STROKE, fill: 'none', opacity: '0.4',
        });
    });
}

function gannSquareShapes(d, x1, y1, x2, y2) {
    return [
        rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), {
            stroke: d.color || DEFAULT_STROKE, fill: 'none',
        }),
        line(x1, y1, x2, y2, { stroke: d.color, opacity: '0.3' }),
        line(x1, y2, x2, y1, { stroke: d.color, opacity: '0.3' }),
    ];
}

function gannBoxShapes(d, x1, y1, x2, y2) {
    const left = Math.min(x1, x2), top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    const shapes = [rect(left, top, w, h, { stroke: d.color || DEFAULT_STROKE, fill: 'none' })];
    [0.25, 0.382, 0.5, 0.618, 0.75].forEach(lvl => {
        const hy = top + h * lvl;
        const vx = left + w * lvl;
        shapes.push(line(left, hy, left + w, hy, { ...strokeOf(d), opacity: '0.2' }));
        shapes.push(line(vx, top, vx, top + h, { ...strokeOf(d), opacity: '0.2' }));
    });
    return shapes;
}

function fibChannelShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2] || p1;
    const px1 = ctx.timeToX(p1.time), py1 = ctx.priceToY(p1.price);
    const px2 = ctx.timeToX(p2.time), py2 = ctx.priceToY(p2.price);
    const px3 = ctx.timeToX(p3.time), py3 = ctx.priceToY(p3.price);
    if (px1 === null || py1 === null || px2 === null || py2 === null) return [];
    const slope = (py2 - py1) / (px2 - px1);
    const offsetBase = py3 !== null ? py3 - (py1 + (px3 - px1) * slope) : 0;
    return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map(lvl => {
        const off = offsetBase * lvl;
        return line(0, py1 + off - px1 * slope, ctx.width, py1 + off + (ctx.width - px1) * slope, {
            ...strokeOf(d), opacity: lvl === 0 || lvl === 1 ? '0.6' : '0.3',
        });
    });
}

function fibWedgeShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2] || p1;
    const px1 = ctx.timeToX(p1.time), py1 = ctx.priceToY(p1.price);
    const px2 = ctx.timeToX(p2.time), py2 = ctx.priceToY(p2.price);
    const px3 = ctx.timeToX(p3.time), py3 = ctx.priceToY(p3.price);
    if (px1 === null || py1 === null || px2 === null || py2 === null || px3 === null || py3 === null) return [];
    return [0.382, 0.5, 0.618, 0.786, 1].map(lvl => {
        const r1 = Math.sqrt(Math.pow(px2 - px1, 2) + Math.pow(py2 - py1, 2)) * lvl;
        const r2 = Math.sqrt(Math.pow(px3 - px1, 2) + Math.pow(py3 - py1, 2)) * lvl;
        return path(`M ${px1} ${py1 - r1} L ${px1 + r2} ${py1}`, {
            stroke: d.color, fill: 'none', opacity: '0.3',
        });
    });
}

function fibSpiralShapes(d, x1, y1, x2, y2) {
    const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    let pathStr = `M ${x1} ${y1}`;
    for (let a = 0; a < Math.PI * 4; a += 0.1) {
        const r = (radius / (Math.PI * 4)) * a;
        pathStr += ` L ${x1 + Math.cos(a) * r} ${y1 + Math.sin(a) * r}`;
    }
    return [path(pathStr, { stroke: d.color, fill: 'none', opacity: '0.5' })];
}

function parallelChannelShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2] || d.points[1];
    const px1 = ctx.timeToX(p1.time), py1 = ctx.priceToY(p1.price);
    const px2 = ctx.timeToX(p2.time), py2 = ctx.priceToY(p2.price);
    const px3 = ctx.timeToX(p3.time), py3 = ctx.priceToY(p3.price);
    if (px1 === null || py1 === null || px2 === null || py2 === null) return [];

    const base = strokeOf(d);
    const shapes = [line(px1, py1, px2, py2, base)];
    if (px3 !== null && py3 !== null) {
        const dyOffset = py3 - (py1 + (px3 - px1) * ((py2 - py1) / (px2 - px1)));
        shapes.push(line(px1, py1 + dyOffset, px2, py2 + dyOffset, base));
        shapes.push(polygon([
            { x: px1, y: py1 }, { x: px2, y: py2 },
            { x: px2, y: py2 + dyOffset }, { x: px1, y: py1 + dyOffset },
        ], { fill: d.fillColor || DEFAULT_FILL }));
    }
    return shapes;
}

function flatTopBottomShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2] || d.points[1];
    const px1 = ctx.timeToX(p1.time), py1 = ctx.priceToY(p1.price);
    const px2 = ctx.timeToX(p2.time), py2 = ctx.priceToY(p2.price);
    const px3 = ctx.timeToX(p3.time), py3 = ctx.priceToY(p3.price);
    if (px1 === null || py1 === null || px2 === null || py2 === null) return [];

    const base = strokeOf(d);
    const shapes = [line(px1, py1, px2, py1, base)];
    if (px3 !== null && py3 !== null) {
        shapes.push(line(px1, py3, px2, py3, base));
        shapes.push(polygon([
            { x: px1, y: py1 }, { x: px2, y: py1 },
            { x: px2, y: py3 }, { x: px1, y: py3 },
        ], { fill: d.fillColor || DEFAULT_FILL }));
    }
    return shapes;
}

function disjointChannelShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[1], p3 = d.points[2];
    const px1 = ctx.timeToX(p1.time), py1 = ctx.priceToY(p1.price);
    const px2 = ctx.timeToX(p2.time), py2 = ctx.priceToY(p2.price);
    if (px1 === null || py1 === null || px2 === null || py2 === null) return [];

    const base = strokeOf(d);
    const shapes = [line(px1, py1, px2, py2, base)];
    if (p3) {
        const px3 = ctx.timeToX(p3.time);
        const py3 = ctx.priceToY(p3.price);
        // During preview the last point is the moving mouse (p4).
        const mousePoint = d.points[3] || d.points[d.points.length - 1];
        const px4 = ctx.timeToX(mousePoint.time);
        const py4 = ctx.priceToY(mousePoint.price);
        if (px3 !== null && py3 !== null && px4 !== null && py4 !== null) {
            shapes.push(line(px3, py3, px4, py4, base));
        }
    }
    return shapes;
}

function regressionTrendShapes(d, ctx, x1, y1, x2, y2) {
    const t1 = Math.min(d.p1.time, d.p2.time);
    const t2 = Math.max(d.p1.time, d.p2.time);
    const window_ = timeWindowIndices(ctx.data, t1, t2);
    const base = strokeOf(d);
    if (!window_) return [line(x1, y1, x2, y2, base)];

    const closes = ctx.data.slice(window_.start, window_.end + 1).map(b => b.close);
    const n = closes.length;
    const reg = linearRegression(closes);
    if (!reg) return [];
    const { slope, intercept } = reg;
    const startPrice = intercept;
    const endPrice = intercept + slope * (n - 1);
    const ry1 = ctx.priceToY(startPrice);
    const ry2 = ctx.priceToY(endPrice);
    if (ry1 === null || ry2 === null) return [];

    const shapes = [line(x1, ry1, x2, ry2, base)];
    const bandOffset = Math.abs(ctx.priceToY(startPrice + stdError(closes, slope, intercept)) - ry1);
    [1, -1].forEach(dir => {
        shapes.push(line(x1, ry1 + dir * bandOffset, x2, ry2 + dir * bandOffset, {
            ...base, opacity: '0.4', dash: '2,2',
        }));
    });
    return shapes;
}

function arcShapes(d, ctx) {
    const p1 = d.points[0], p2 = d.points[2] || d.points[1], p3 = d.points[1];
    const px1 = ctx.timeToX(p1.time), py1 = ctx.priceToY(p1.price);
    const px2 = ctx.timeToX(p2.time), py2 = ctx.priceToY(p2.price);
    const px3 = ctx.timeToX(p3.time), py3 = ctx.priceToY(p3.price);
    if (px1 === null || py1 === null || px2 === null || py2 === null || px3 === null || py3 === null) return [];
    return [path(`M ${px1} ${py1} Q ${px3} ${py3} ${px2} ${py2}`, strokeOf(d, { fill: 'none' }))];
}

function textNoteShapes(d, ctx) {
    const coords = getNoteCoordinates(d, ctx.timeToX, ctx.priceToY);
    if (!coords) return [];
    const { anchorX, anchorY, boxX, boxY } = coords;
    return [
        line(anchorX, anchorY, boxX, boxY, {
            stroke: d.color || DEFAULT_STROKE, strokeWidth: 1.5, dash: '4,3', opacity: '0.8',
        }),
        circle(anchorX, anchorY, 4, {
            fill: ANCHOR_FILL, stroke: d.color || DEFAULT_STROKE, strokeWidth: 2,
        }),
    ];
}

// Anchor handles shown on each committed point. While a preview exists the
// moving last point is not anchored (matches the previous renderer, where
// the flag applied globally to every drawing in the pass).
function anchorShapes(d, ctx) {
    if (ctx.hasPreview && d.points.length <= 1) return [];
    const shapes = [];
    d.points.forEach((p, idx) => {
        if (ctx.hasPreview && idx === d.points.length - 1) return;
        const x = ctx.timeToX(p.time);
        const y = ctx.priceToY(p.price);
        if (x !== null && y !== null) {
            shapes.push(circle(x, y, 4, {
                fill: ANCHOR_FILL, stroke: d.color || DEFAULT_STROKE, strokeWidth: 2,
            }));
        }
    });
    return shapes;
}

// Build the shape list for one drawing. Returns [] when the drawing is
// unknown or not convertible in the current view.
export function buildDrawingShapes(d, ctx) {
    if (d.type === 'textNote') return textNoteShapes(d, ctx);
    if (d.points && d.points.some(p => !p || p.time === undefined || p.time === null)) return [];
    if (!d.p1 || d.p1.time === undefined || d.p1.time === null) return [];

    const x1 = ctx.timeToX(d.p1.time);
    const y1 = ctx.priceToY(d.p1.price);
    if (x1 === null || y1 === null) return [];

    const hasP2 = d.p2 && d.p2.time !== undefined && d.p2.time !== null;
    const x2 = hasP2 ? ctx.timeToX(d.p2.time) : null;
    const y2 = hasP2 ? ctx.priceToY(d.p2.price) : null;
    const hasBoth = x2 !== null && y2 !== null;

    let shapes;
    if (HARMONIC_TYPES.includes(d.type) && d.points.length >= 2) shapes = harmonicShapes(d, ctx);
    else if (ELLIOTT_TYPES.includes(d.type) && d.points.length >= 2) shapes = labeledPolyline(d, ctx, elliottLabels(d.type), { dy: -12 });
    else if (PATTERN_TYPES.includes(d.type) && d.points.length >= 2) shapes = patternShapes(d, ctx);
    else if (PITCHFORK_TYPES.includes(d.type) && d.points.length >= 2) shapes = pitchforkShapes(d, ctx);
    else if (d.type === 'regressionChannel' && d.points.length >= 2) shapes = regressionChannelShapes(d, ctx);
    else if (d.type === 'trend' && hasBoth) shapes = [line(x1, y1, x2, y2, strokeOf(d))];
    else if (d.type === 'arrow' && hasBoth) shapes = arrowShapes(d, ctx, x1, y1, x2, y2);
    else if (d.type === 'ray' && hasBoth) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        shapes = [line(x1, y1, x1 + Math.cos(angle) * 10000, y1 + Math.sin(angle) * 10000, strokeOf(d))];
    } else if (d.type === 'extendedLine' && hasBoth) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        shapes = [line(x1 - Math.cos(angle) * 10000, y1 - Math.sin(angle) * 10000,
            x1 + Math.cos(angle) * 10000, y1 + Math.sin(angle) * 10000, strokeOf(d))];
    } else if (d.type === 'infoLine' && hasBoth) shapes = infoLineShapes(d, ctx, x1, y1, x2, y2);
    else if (d.type === 'trendAngle' && hasBoth) shapes = trendAngleShapes(d, ctx, x1, y1, x2, y2);
    else if (d.type === 'horizontalLine') shapes = [line(0, y1, ctx.width, y1, strokeOf(d))];
    else if (d.type === 'horizontalRay') shapes = [line(x1, y1, ctx.width, y1, strokeOf(d))];
    else if (d.type === 'verticalLine') shapes = [line(x1, 0, x1, ctx.height, strokeOf(d))];
    else if (d.type === 'crossLine') shapes = [
        line(0, y1, ctx.width, y1, strokeOf(d)),
        line(x1, 0, x1, ctx.height, strokeOf(d)),
    ];
    else if (d.type === 'triangle') shapes = [polygon(pointsToPx(d.points, ctx), strokeOf(d, { fill: d.fillColor || DEFAULT_FILL }))];
    else if (d.type === 'ellipse' && hasBoth) shapes = [ellipse(x1, y1, Math.abs(x2 - x1), Math.abs(y2 - y1), strokeOf(d, { fill: d.fillColor || DEFAULT_FILL }))];
    else if (d.type === 'rectangle' && hasBoth) shapes = [rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), strokeOf(d, { fill: d.fillColor || DEFAULT_FILL }))];
    else if (d.type === 'circle' && hasBoth) shapes = [circle(x1, y1, Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)), strokeOf(d, { fill: d.fillColor || DEFAULT_FILL }))];
    else if (d.type === 'rotatedRectangle' && d.points.length >= 2) shapes = rotatedRectangleShapes(d, ctx);
    else if (d.type === 'polyline' && d.points.length >= 2) shapes = [polyline(pointsToPx(d.points, ctx), strokeOf(d, { fill: 'none' }))];
    else if (d.type === 'curve' && d.points.length >= 2) shapes = curveShapes(d, ctx);
    else if (d.type === 'doubleCurve' && d.points.length >= 2) shapes = doubleCurveShapes(d, ctx);
    else if (d.type === 'longPosition' && hasBoth) shapes = positionShapes(d, x1, y1, x2, y2, { stopDist: 50, targetDist: 100, profitFirst: true });
    else if (d.type === 'shortPosition' && hasBoth) shapes = positionShapes(d, x1, y1, x2, y2, { stopDist: 50, targetDist: 100, profitFirst: false });
    else if (d.type === 'priceRange' && hasBoth) shapes = priceRangeShapes(d, x1, y1, x2, y2);
    else if (d.type === 'dateRange' && hasBoth) shapes = dateRangeShapes(d, ctx, x1, y1, x2);
    else if (d.type === 'forecast' && hasBoth) shapes = [
        line(x1, y1, x2, y2, strokeOf(d, { dash: '4,4' })),
        text(x2 + 5, y2 - 5, 'Forecast', { fill: d.color, fontSize: '10px' }),
    ];
    else if (d.type === 'ghostFeed' && hasBoth) shapes = [line(x1, y1, x2, y2, strokeOf(d, { dash: '2,4', opacity: '0.5' }))];
    else if (d.type === 'buyLabel') shapes = badgeShapes(x1, y1, 'BUY', '#089981', { rectX: -20, rectY: 10, rectW: 40, textY: 24 });
    else if (d.type === 'sellLabel') shapes = badgeShapes(x1, y1, 'SELL', '#f23645', { rectX: -22, rectY: -30, rectW: 44, textY: -16 });
    else if (d.type === 'arrowMark') shapes = [text(x1, y1, '➚', { fill: d.color || DEFAULT_STROKE, fontSize: '24px', anchor: 'middle' })];
    else if (d.type === 'riskReward' && hasBoth) {
        const stopDist = 40, targetDist = 80;
        shapes = [
            rect(Math.min(x1, x2), y1 - targetDist, Math.abs(x2 - x1), targetDist, { fill: 'rgba(8, 153, 129, 0.15)' }),
            rect(Math.min(x1, x2), y1, Math.abs(x2 - x1), stopDist, { fill: 'rgba(242, 54, 69, 0.15)' }),
            text(x2 + 5, y1, `R/R: ${(targetDist / stopDist).toFixed(2)}`, { fill: LABEL_FILL, fontSize: '12px' }),
        ];
    }
    else if (d.type === 'arc' && d.points.length >= 2) shapes = arcShapes(d, ctx);
    else if (d.type === 'fibRetracement' && hasBoth) shapes = fibRetracementShapes(d, ctx, x1, y1, x2, y2);
    else if (d.type === 'fibExtension' && d.points.length >= 2) shapes = fibExtensionShapes(d, ctx);
    else if (d.type === 'fibFan' && hasBoth) shapes = fibFanShapes(d, x1, y1, x2, y2);
    else if (d.type === 'fibTimeZone' && hasBoth) shapes = fibTimeZoneShapes(d, ctx, x1, x2);
    else if (d.type === 'gannFan' && hasBoth) shapes = gannFanShapes(d, x1, y1, x2, y2);
    else if (d.type === 'fibCircles' && hasBoth) shapes = fibCirclesShapes(d, x1, y1, x2, y2);
    else if (d.type === 'fibSpeedArcs' && hasBoth) shapes = fibSpeedArcsShapes(d, x1, y1, x2);
    else if (d.type === 'gannSquare' && hasBoth) shapes = gannSquareShapes(d, x1, y1, x2, y2);
    else if (d.type === 'gannBox' && hasBoth) shapes = gannBoxShapes(d, x1, y1, x2, y2);
    else if (d.type === 'fibChannel' && d.points.length >= 2) shapes = fibChannelShapes(d, ctx);
    else if (d.type === 'fibWedge' && d.points.length >= 2) shapes = fibWedgeShapes(d, ctx);
    else if (d.type === 'fibSpiral' && hasBoth) shapes = fibSpiralShapes(d, x1, y1, x2, y2);
    else if (d.type === 'parallelChannel' && d.points.length >= 2) shapes = parallelChannelShapes(d, ctx);
    else if (d.type === 'flatTopBottom' && d.points.length >= 2) shapes = flatTopBottomShapes(d, ctx);
    else if (d.type === 'disjointChannel' && d.points.length >= 2) shapes = disjointChannelShapes(d, ctx);
    else if (d.type === 'regressionTrend' && hasBoth) shapes = regressionTrendShapes(d, ctx, x1, y1, x2, y2);
    else return [];

    return [...shapes, ...anchorShapes(d, ctx)];
}

// Full drawing layer: committed drawings keep their id for hit-testing;
// the preview (id-less) stays ungrouped.
export function buildDrawingScene(drawings, previewDrawing, ctx) {
    const sceneCtx = { ...ctx, hasPreview: !!previewDrawing };
    return {
        committed: drawings.map(d => ({ id: d.id, shapes: buildDrawingShapes(d, sceneCtx) })),
        preview: previewDrawing ? buildDrawingShapes(previewDrawing, sceneCtx) : [],
    };
}

// Script indicator band fills (BB bands, Ichimoku cloud). Two-tone fills
// (colorAlt) split into segments where the plot relation flips.
export function buildFillShapes(fillsData, ctx) {
    const shapes = [];
    fillsData.forEach(fill => {
        const bByTime = new Map(fill.b.map(p => [p.time, p]));
        let segment = [];
        let currentTrend = null;

        const segmentToPolygon = (seg, color) => {
            const pts = [];
            seg.forEach(p => {
                const x = ctx.timeToX(p.time);
                const y = ctx.priceToY(p.a);
                if (x !== null && y !== null) pts.push({ x, y });
            });
            for (let i = seg.length - 1; i >= 0; i--) {
                const x = ctx.timeToX(seg[i].time);
                const y = ctx.priceToY(seg[i].b);
                if (x !== null && y !== null) pts.push({ x, y });
            }
            if (pts.length > 2) shapes.push(polygon(pts, { fill: color }));
        };
        const flush = () => {
            if (segment.length > 1) {
                segmentToPolygon(segment, currentTrend === null || currentTrend
                    ? fill.color
                    : (fill.colorAlt || fill.color));
            }
            segment = segment.length ? [segment[segment.length - 1]] : [];
        };

        fill.a.forEach(pA => {
            const pB = bByTime.get(pA.time);
            if (!pB) return;
            if (!fill.colorAlt) {
                segment.push({ time: pA.time, a: pA.value, b: pB.value });
                return;
            }
            const trend = pA.value >= pB.value;
            if (currentTrend === null) currentTrend = trend;
            if (trend !== currentTrend) {
                flush();
                currentTrend = trend;
            }
            segment.push({ time: pA.time, a: pA.value, b: pB.value });
        });
        if (!fill.colorAlt) segmentToPolygon(segment, fill.color);
        else flush();
    });
    return shapes;
}

// Volume Profile-style price-by-volume histogram bars.
export function buildVolumeProfileShapes(histogramsData, ctx) {
    const shapes = [];
    histogramsData.forEach(h => {
        h.bins.forEach(bin => {
            const y1 = ctx.priceToY(bin.low);
            const y2 = ctx.priceToY(bin.high);
            if (y1 === null || y2 === null) return;
            const barWidth = (ctx.width * 0.3) * bin.normalizedVolume;
            shapes.push(rect(
                ctx.width - barWidth,
                Math.min(y1, y2),
                barWidth,
                Math.max(1, Math.abs(y2 - y1) - 1),
                { fill: h.color }
            ));
        });
    });
    return shapes;
}
