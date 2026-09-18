import { describe, it, expect } from 'vitest';
import {
    buildDrawingShapes,
    buildDrawingScene,
    buildFillShapes,
    buildVolumeProfileShapes,
} from '../drawingGeometry';

// Identity converters: time -> x, price -> y.
const makeCtx = (overrides = {}) => ({
    timeToX: t => t,
    priceToY: p => p,
    width: 800,
    height: 600,
    data: [],
    hasPreview: false,
    ...overrides,
});

const makeDrawing = (type, p1, p2, extra = {}) => ({
    id: '1',
    type,
    points: p2 ? [p1, p2] : [p1],
    p1,
    p2: p2 || p1,
    color: '#ff0000',
    lineWidth: 2,
    ...extra,
});

const P1 = { time: 10, price: 100 };
const P2 = { time: 20, price: 200 };

describe('buildDrawingShapes guards', () => {
    it('returns [] for unknown types', () => {
        expect(buildDrawingShapes(makeDrawing('nope', P1, P2), makeCtx())).toEqual([]);
    });

    it('returns [] when p1 is missing or unconvertible', () => {
        expect(buildDrawingShapes({ type: 'trend', points: [P1], p2: P1 }, makeCtx())).toEqual([]);
        const ctx = makeCtx({ timeToX: () => null });
        expect(buildDrawingShapes(makeDrawing('trend', P1, P2), ctx)).toEqual([]);
    });

    it('returns [] when any point lacks a time', () => {
        const d = makeDrawing('trend', P1, P2);
        d.points = [P1, { price: 5 }];
        expect(buildDrawingShapes(d, makeCtx())).toEqual([]);
    });
});

describe('line family', () => {
    it('trend draws one line plus two anchors', () => {
        const shapes = buildDrawingShapes(makeDrawing('trend', P1, P2), makeCtx());
        const line = shapes.find(s => s.kind === 'line');
        expect(line).toMatchObject({ x1: 10, y1: 100, x2: 20, y2: 200 });
        expect(line.style).toMatchObject({ stroke: '#ff0000', strokeWidth: 2 });
        expect(shapes.filter(s => s.kind === 'circle')).toHaveLength(2);
    });

    it('ray extends far past p2 in the p1->p2 direction', () => {
        const shapes = buildDrawingShapes(makeDrawing('ray', P1, P2), makeCtx());
        const line = shapes.find(s => s.kind === 'line');
        expect(line.x1).toBe(10);
        expect(line.y1).toBe(100);
        expect(line.x2).toBeGreaterThan(800);
        expect(line.y2).toBeGreaterThan(600);
    });

    it('extendedLine extends in both directions', () => {
        const line = buildDrawingShapes(makeDrawing('extendedLine', P1, P2), makeCtx())
            .find(s => s.kind === 'line');
        expect(line.x1).toBeLessThan(0);
        expect(line.x2).toBeGreaterThan(800);
    });

    it('horizontalLine spans the full width at p1 price', () => {
        const line = buildDrawingShapes(makeDrawing('horizontalLine', P1), makeCtx())
            .find(s => s.kind === 'line');
        expect(line).toMatchObject({ x1: 0, y1: 100, x2: 800, y2: 100 });
    });

    it('verticalLine spans the full height at p1 time', () => {
        const line = buildDrawingShapes(makeDrawing('verticalLine', P1), makeCtx())
            .find(s => s.kind === 'line');
        expect(line).toMatchObject({ x1: 10, y1: 0, x2: 10, y2: 600 });
    });

    it('crossLine draws horizontal and vertical lines', () => {
        const lines = buildDrawingShapes(makeDrawing('crossLine', P1), makeCtx())
            .filter(s => s.kind === 'line');
        expect(lines).toHaveLength(2);
    });

    it('arrow adds a filled arrowhead polygon at p2', () => {
        const shapes = buildDrawingShapes(makeDrawing('arrow', P1, P2), makeCtx());
        const head = shapes.find(s => s.kind === 'polygon');
        expect(head.points[0]).toEqual({ x: 20, y: 200 });
        expect(head.style.fill).toBe('#ff0000');
    });

    it('infoLine labels price and percent change', () => {
        const shapes = buildDrawingShapes(makeDrawing('infoLine', P1, P2), makeCtx());
        const label = shapes.find(s => s.kind === 'text');
        expect(label.text).toBe('100.00 (100.00%)');
    });
});

describe('anchors', () => {
    it('are skipped for single-point previews when a preview exists', () => {
        const ctx = makeCtx({ hasPreview: true });
        const shapes = buildDrawingShapes(makeDrawing('horizontalLine', P1), ctx);
        expect(shapes.filter(s => s.kind === 'circle')).toHaveLength(0);
    });

    it('skip the moving last point while a preview exists', () => {
        const ctx = makeCtx({ hasPreview: true });
        const shapes = buildDrawingShapes(makeDrawing('trend', P1, P2), ctx);
        const anchors = shapes.filter(s => s.kind === 'circle');
        expect(anchors).toHaveLength(1);
        expect(anchors[0]).toMatchObject({ cx: 10, cy: 100 });
    });
});

describe('shapes family', () => {
    it('rectangle uses min corner and abs size', () => {
        const r = buildDrawingShapes(makeDrawing('rectangle', P2, P1), makeCtx())
            .find(s => s.kind === 'rect');
        expect(r).toMatchObject({ x: 10, y: 100, width: 10, height: 100 });
    });

    it('circle radius is the p1-p2 distance', () => {
        const c = buildDrawingShapes(makeDrawing('circle', P1, P2), makeCtx())
            .find(s => s.kind === 'circle');
        expect(c.r).toBeCloseTo(Math.hypot(10, 100));
    });

    it('ellipse radii are the abs deltas', () => {
        const e = buildDrawingShapes(makeDrawing('ellipse', P1, P2), makeCtx())
            .find(s => s.kind === 'ellipse');
        expect(e).toMatchObject({ cx: 10, cy: 100, rx: 10, ry: 100 });
    });

    it('triangle fills a polygon through all points', () => {
        const d = makeDrawing('triangle', P1, P2, { points: [P1, P2, { time: 15, price: 50 }] });
        const poly = buildDrawingShapes(d, makeCtx()).find(s => s.kind === 'polygon');
        expect(poly.points).toHaveLength(3);
        expect(poly.style.fill).toBe('rgba(41, 98, 255, 0.1)');
    });
});

describe('patterns', () => {
    const points = [0, 1, 2, 3, 4].map(i => ({ time: i * 10, price: 100 + i * 20 }));

    it('xabcd emits shading polygons, polyline and XABCD labels', () => {
        const d = makeDrawing('xabcd', points[0], points[1], { points });
        const shapes = buildDrawingShapes(d, makeCtx());
        expect(shapes.filter(s => s.kind === 'polygon')).toHaveLength(2);
        const labels = shapes.filter(s => s.kind === 'text').map(t => t.text);
        expect(labels).toEqual(['X', 'A', 'B', 'C', 'D']);
    });

    it('elliottImpulse labels (1)..(5)', () => {
        const d = makeDrawing('elliottImpulse', points[0], points[1], { points });
        const labels = buildDrawingShapes(d, makeCtx())
            .filter(s => s.kind === 'text').map(t => t.text);
        expect(labels).toEqual(['(1)', '(2)', '(3)', '(4)', '(5)']);
    });

    it('pitchfork emits median plus two parallel lines', () => {
        const d = makeDrawing('pitchfork', points[0], points[1], { points: points.slice(0, 3) });
        const lines = buildDrawingShapes(d, makeCtx()).filter(s => s.kind === 'line' && s.x2 === 800);
        expect(lines).toHaveLength(3);
    });
});

describe('fib family', () => {
    it('fibRetracement draws 7 levels with labels plus the dashed base line', () => {
        const shapes = buildDrawingShapes(makeDrawing('fibRetracement', P1, P2), makeCtx());
        expect(shapes.filter(s => s.kind === 'line')).toHaveLength(8);
        expect(shapes.filter(s => s.kind === 'text')).toHaveLength(7);
        const first = shapes.find(s => s.kind === 'text');
        expect(first.text).toBe('0.000 (100.00)');
    });

    it('fibTimeZone spaces vertical lines by the p1-p2 distance', () => {
        const lines = buildDrawingShapes(makeDrawing('fibTimeZone', P1, P2), makeCtx())
            .filter(s => s.kind === 'line');
        expect(lines[0]).toMatchObject({ x1: 20, x2: 20, y1: 0, y2: 600 });
        expect(lines[1]).toMatchObject({ x1: 30 });
        expect(lines[2]).toMatchObject({ x1: 40 });
    });
});

describe('regression tools', () => {
    const data = [0, 1, 2, 3].map(i => ({ time: i * 10, close: 10 + i * 10 }));

    it('regressionTrend fits a line through the window closes', () => {
        const d = makeDrawing('regressionTrend', { time: 0, price: 10 }, { time: 30, price: 40 });
        const shapes = buildDrawingShapes(d, makeCtx({ data }));
        const main = shapes.find(s => s.kind === 'line' && !s.style.dash);
        // Perfect linear data: regression passes through the closes.
        expect(main.y1).toBeCloseTo(10);
        expect(main.y2).toBeCloseTo(40);
    });

    it('regressionTrend falls back to the raw line when the window is degenerate', () => {
        const d = makeDrawing('regressionTrend', { time: 1000, price: 1 }, { time: 2000, price: 2 });
        const shapes = buildDrawingShapes(d, makeCtx({ data }));
        expect(shapes.find(s => s.kind === 'line')).toMatchObject({ y1: 1, y2: 2 });
    });
});

describe('positions and ranges', () => {
    it('longPosition stacks profit above and loss below entry', () => {
        const rects = buildDrawingShapes(makeDrawing('longPosition', P1, P2), makeCtx())
            .filter(s => s.kind === 'rect');
        const profit = rects.find(r => r.style.fill.includes('8, 153, 129'));
        const loss = rects.find(r => r.style.fill.includes('242, 54, 69'));
        expect(profit).toMatchObject({ y: 0, height: 100 });
        expect(loss).toMatchObject({ y: 100, height: 50 });
    });

    it('dateRange counts bars between p1 and p2', () => {
        const data = [0, 1, 2, 3].map(i => ({ time: i * 10, close: 1 }));
        const label = buildDrawingShapes(makeDrawing('dateRange', P1, P2), makeCtx({ data }))
            .find(s => s.kind === 'text');
        expect(label.text).toBe('1 bars');
    });

    it('buyLabel renders the badge rect and BUY text', () => {
        const shapes = buildDrawingShapes(makeDrawing('buyLabel', P1), makeCtx());
        expect(shapes.find(s => s.kind === 'text').text).toBe('BUY');
        expect(shapes.find(s => s.kind === 'rect').style.fill).toBe('#089981');
    });

    it('textLabel renders the badge with the custom text', () => {
        const d = makeDrawing('textLabel', P1, null, { text: 'TP1', editing: false });
        const shapes = buildDrawingShapes(d, makeCtx());
        expect(shapes.find(s => s.kind === 'text')).toMatchObject({ text: 'TP1', x: 10, y: 124 });
        expect(shapes.find(s => s.kind === 'rect').style.fill).toBe('#ff0000');
    });

    it('textLabel hides the badge while the inline editor is open', () => {
        const d = makeDrawing('textLabel', P1, null, { text: '', editing: true });
        const shapes = buildDrawingShapes(d, makeCtx());
        expect(shapes.some(s => s.kind === 'rect' || s.kind === 'text')).toBe(false);
    });
});

describe('textNote', () => {
    it('draws the connector and anchor circle only', () => {
        const d = {
            id: 'n1', type: 'textNote',
            anchor: { time: 10, price: 100 },
            boxOffset: { dx: 20, dy: -50 },
            text: 'hello',
        };
        const shapes = buildDrawingShapes(d, makeCtx());
        expect(shapes).toHaveLength(2);
        expect(shapes[0]).toMatchObject({ kind: 'line', x1: 10, y1: 100, x2: 30, y2: 50 });
        expect(shapes[1]).toMatchObject({ kind: 'circle', cx: 10, cy: 100 });
    });
});

describe('buildDrawingScene', () => {
    it('groups committed drawings by id and keeps the preview separate', () => {
        const committed = [makeDrawing('trend', P1, P2)];
        const preview = { type: 'horizontalLine', points: [P1], p1: P1, p2: P1 };
        const scene = buildDrawingScene(committed, preview, makeCtx());
        expect(scene.committed).toHaveLength(1);
        expect(scene.committed[0].id).toBe('1');
        expect(scene.preview.length).toBeGreaterThan(0);
    });
});

describe('buildFillShapes', () => {
    it('builds a polygon per single-tone fill', () => {
        const fills = [{
            a: [{ time: 1, value: 10 }, { time: 2, value: 12 }, { time: 3, value: 11 }],
            b: [{ time: 1, value: 8 }, { time: 2, value: 9 }, { time: 3, value: 7 }],
            color: 'rgba(0,0,255,0.1)',
        }];
        const shapes = buildFillShapes(fills, makeCtx());
        expect(shapes).toHaveLength(1);
        expect(shapes[0].kind).toBe('polygon');
        expect(shapes[0].points).toHaveLength(6);
        expect(shapes[0].style.fill).toBe('rgba(0,0,255,0.1)');
    });

    it('splits two-tone fills where the plot relation flips', () => {
        const fills = [{
            a: [{ time: 1, value: 10 }, { time: 2, value: 5 }, { time: 3, value: 20 }],
            b: [{ time: 1, value: 8 }, { time: 2, value: 9 }, { time: 3, value: 7 }],
            color: 'green',
            colorAlt: 'red',
        }];
        const shapes = buildFillShapes(fills, makeCtx());
        // First flushed segment spans the flip boundary with the prior
        // (below) trend, the trailing segment resumes the initial trend.
        expect(shapes.map(s => s.style.fill)).toEqual(['red', 'green']);
    });
});

describe('buildVolumeProfileShapes', () => {
    it('draws right-aligned bars sized by normalized volume', () => {
        const histograms = [{
            color: 'gray',
            bins: [{ low: 100, high: 110, normalizedVolume: 0.5 }],
        }];
        const shapes = buildVolumeProfileShapes(histograms, makeCtx());
        expect(shapes).toHaveLength(1);
        expect(shapes[0]).toMatchObject({ kind: 'rect', y: 100, height: 9 });
        expect(shapes[0].width).toBeCloseTo(800 * 0.3 * 0.5);
        expect(shapes[0].x).toBeCloseTo(800 - 800 * 0.3 * 0.5);
    });
});
