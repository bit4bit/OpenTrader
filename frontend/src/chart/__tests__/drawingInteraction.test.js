import { describe, it, expect } from 'vitest';
import { applyDrawingClick, edgeRange } from '../drawingInteraction';
import { isDrawingTool, REQUIRED_POINTS } from '../drawingTools';

const p = (time, price) => ({ time, price });

describe('applyDrawingClick', () => {
    it('commits single-click line tools immediately', () => {
        const r = applyDrawingClick('horizontalLine', p(10, 100), [], 'id1');
        expect(r.finished).toBe(true);
        expect(r.drawing).toMatchObject({
            id: 'id1',
            type: 'horizontalLine',
            points: [p(10, 100)],
            p1: p(10, 100),
            p2: p(10, 100),
        });
        expect(r.pendingPoints).toEqual([]);
    });

    it('commits a text note in editing mode', () => {
        const r = applyDrawingClick('textNote', p(10, 100), [], 'id2');
        expect(r.finished).toBe(true);
        expect(r.drawing).toMatchObject({
            type: 'textNote',
            anchor: p(10, 100),
            boxOffset: { dx: 20, dy: -50 },
            text: '',
            editing: true,
        });
    });

    it('commits a text label in editing mode', () => {
        const r = applyDrawingClick('textLabel', p(10, 100), [], 'id5');
        expect(r.finished).toBe(true);
        expect(r.drawing).toMatchObject({
            id: 'id5',
            type: 'textLabel',
            points: [p(10, 100)],
            p1: p(10, 100),
            text: '',
            editing: true,
        });
        expect(r.pendingPoints).toEqual([]);
    });

    it('accumulates points until the tool requirement is met', () => {
        const first = applyDrawingClick('trend', p(10, 100), [], 'id3');
        expect(first.finished).toBe(false);
        expect(first.drawing).toBeNull();
        expect(first.pendingPoints).toEqual([p(10, 100)]);

        const second = applyDrawingClick('trend', p(20, 120), first.pendingPoints, 'id3');
        expect(second.finished).toBe(true);
        expect(second.drawing.points).toEqual([p(10, 100), p(20, 120)]);
        expect(second.drawing.p1).toEqual(p(10, 100));
        expect(second.drawing.p2).toEqual(p(20, 120));
        expect(second.pendingPoints).toEqual([]);
    });

    it('handles long multi-point tools', () => {
        let pending = [];
        let result = null;
        const clicks = [p(1, 1), p(2, 2), p(3, 3), p(4, 4), p(5, 5), p(6, 6), p(7, 7)];
        for (let i = 0; i < clicks.length; i++) {
            result = applyDrawingClick('headAndShoulders', clicks[i], pending, 'id4');
            pending = result.pendingPoints;
            expect(result.finished).toBe(i === REQUIRED_POINTS.headAndShoulders - 1);
        }
        expect(result.drawing.points).toHaveLength(7);
    });
});

describe('isDrawingTool', () => {
    it('excludes cursor and eraserOne', () => {
        expect(isDrawingTool('cursor')).toBe(false);
        expect(isDrawingTool('eraserOne')).toBe(false);
        expect(isDrawingTool(null)).toBe(false);
        expect(isDrawingTool('trend')).toBe(true);
    });
});

describe('edgeRange', () => {
    it('jumps to the start preserving window width', () => {
        expect(edgeRange('Home', 50, 500)).toEqual({ from: 0, to: 50 });
    });

    it('jumps past the last bar by the right offset', () => {
        expect(edgeRange('End', 50, 500)).toEqual({ from: 469, to: 519 });
    });
});
