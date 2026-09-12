import { describe, it, expect } from 'vitest';
import {
    getNoteCoordinates,
    noteBoxOffset,
    updateTextNote,
    deleteDrawing,
} from '../noteGeometry';

const note = {
    id: 'n1',
    type: 'textNote',
    anchor: { time: 100, price: 50 },
    boxOffset: { dx: 20, dy: -50 },
    text: 'hello',
};

describe('getNoteCoordinates', () => {
    it('offsets the box from the anchor', () => {
        const coords = getNoteCoordinates(note, t => t * 2, p => 500 - p);
        expect(coords).toEqual({ anchorX: 200, anchorY: 450, boxX: 220, boxY: 400 });
    });

    it('returns null when the anchor is off-chart', () => {
        expect(getNoteCoordinates(note, () => null, p => p)).toBeNull();
        expect(getNoteCoordinates(note, t => t, () => null)).toBeNull();
    });
});

describe('noteBoxOffset', () => {
    it('re-derives the pixel offset from the pointer', () => {
        expect(noteBoxOffset(200, 450, 230, 470)).toEqual({ dx: 30, dy: 20 });
    });
});

describe('note array transforms', () => {
    const drawings = [
        note,
        { id: 't1', type: 'trend', points: [] },
        { id: 'n2', type: 'textNote', anchor: { time: 1, price: 1 }, boxOffset: { dx: 0, dy: 0 }, text: '' },
    ];

    it('updates only the targeted text note', () => {
        const next = updateTextNote(drawings, 'n1', d => ({ ...d, text: 'edited', editing: false }));
        expect(next[0].text).toBe('edited');
        expect(next[1]).toBe(drawings[1]);
        expect(next[2]).toBe(drawings[2]);
    });

    it('never touches non-note drawings sharing the id shape', () => {
        const next = updateTextNote(drawings, 't1', d => ({ ...d, text: 'nope' }));
        expect(next[1]).toBe(drawings[1]);
    });

    it('deletes a drawing by id', () => {
        expect(deleteDrawing(drawings, 'n1').map(d => d.id)).toEqual(['t1', 'n2']);
    });
});
