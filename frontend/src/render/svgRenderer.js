// SVG renderer for engine-neutral shapes (see chart/drawingGeometry.js).
// Rebuilds the target <svg> from scratch on every draw — cheap enough at
// our shape counts and keeps the renderer stateless.

const SVG_NS = 'http://www.w3.org/2000/svg';

const STYLE_ATTRS = {
    stroke: 'stroke',
    strokeWidth: 'stroke-width',
    lineCap: 'stroke-linecap',
    lineJoin: 'stroke-linejoin',
    dash: 'stroke-dasharray',
    opacity: 'opacity',
    fill: 'fill',
    fontSize: 'font-size',
    fontWeight: 'font-weight',
    fontFamily: 'font-family',
};

const applyStyle = (el, style = {}) => {
    Object.entries(STYLE_ATTRS).forEach(([key, attr]) => {
        if (style[key] !== undefined) el.setAttribute(attr, style[key]);
    });
};

const setAttrs = (el, attrs) => {
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
};

const pointsAttr = (points) => points.map(p => `${p.x},${p.y}`).join(' ');

function createShapeElement(shape) {
    switch (shape.kind) {
        case 'line': {
            const el = document.createElementNS(SVG_NS, 'line');
            setAttrs(el, { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2 });
            applyStyle(el, shape.style);
            return el;
        }
        case 'polyline':
        case 'polygon': {
            const el = document.createElementNS(SVG_NS, shape.kind);
            el.setAttribute('points', pointsAttr(shape.points));
            applyStyle(el, shape.style);
            return el;
        }
        case 'rect': {
            const el = document.createElementNS(SVG_NS, 'rect');
            setAttrs(el, { x: shape.x, y: shape.y, width: shape.width, height: shape.height });
            if (shape.style?.rx !== undefined) el.setAttribute('rx', shape.style.rx);
            applyStyle(el, shape.style);
            return el;
        }
        case 'circle': {
            const el = document.createElementNS(SVG_NS, 'circle');
            setAttrs(el, { cx: shape.cx, cy: shape.cy, r: shape.r });
            applyStyle(el, shape.style);
            return el;
        }
        case 'ellipse': {
            const el = document.createElementNS(SVG_NS, 'ellipse');
            setAttrs(el, { cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry });
            applyStyle(el, shape.style);
            return el;
        }
        case 'path': {
            const el = document.createElementNS(SVG_NS, 'path');
            el.setAttribute('d', shape.d);
            applyStyle(el, shape.style);
            return el;
        }
        case 'text': {
            const el = document.createElementNS(SVG_NS, 'text');
            el.textContent = shape.text;
            setAttrs(el, { x: shape.x, y: shape.y });
            if (shape.style?.anchor) el.setAttribute('text-anchor', shape.style.anchor);
            applyStyle(el, shape.style);
            return el;
        }
        default:
            return null;
    }
}

export function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
}

// Flat shape list (fills, volume profile).
export function drawShapes(svg, shapes) {
    clearSvg(svg);
    shapes.forEach(shape => {
        const el = createShapeElement(shape);
        if (el) svg.appendChild(el);
    });
}

// Drawing layer: each committed drawing's shapes are wrapped in
// <g data-drawing-id> so eraserOne hit-tests via DOM event delegation;
// the preview stays ungrouped.
export function drawDrawingScene(svg, scene) {
    clearSvg(svg);
    scene.committed.forEach(({ id, shapes }) => {
        if (shapes.length === 0) return;
        if (id === undefined) {
            shapes.forEach(shape => {
                const el = createShapeElement(shape);
                if (el) svg.appendChild(el);
            });
            return;
        }
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('data-drawing-id', id);
        shapes.forEach(shape => {
            const el = createShapeElement(shape);
            if (el) g.appendChild(el);
        });
        svg.appendChild(g);
    });
    scene.preview.forEach(shape => {
        const el = createShapeElement(shape);
        if (el) svg.appendChild(el);
    });
}
