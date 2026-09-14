import { describe, it, expect } from 'vitest';
import { GRID_LAYOUTS, gridTemplateFor, normalizeGridLayoutId, layoutIconCells } from '../gridLayout';

describe('gridTemplateFor', () => {
    it('returns the legacy auto-fit template for auto', () => {
        expect(gridTemplateFor('auto')).toEqual({
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
            gridAutoRows: '1fr',
        });
    });

    it.each([
        ['1x1', 1, 1],
        ['2x1', 2, 1],
        ['1x2', 1, 2],
        ['2x2', 2, 2],
        ['3x2', 3, 2],
    ])('returns fixed templates for %s', (id, cols, rows) => {
        const template = gridTemplateFor(id);
        expect(template.gridTemplateColumns).toBe(`repeat(${cols}, 1fr)`);
        expect(template.gridTemplateRows).toBe(`repeat(${rows}, minmax(320px, 1fr))`);
        expect(template.gridAutoRows).toBe('minmax(320px, 1fr)');
    });

    it('falls back to auto for unknown ids', () => {
        expect(gridTemplateFor('bogus')).toEqual(gridTemplateFor('auto'));
        expect(gridTemplateFor(undefined)).toEqual(gridTemplateFor('auto'));
    });
});

describe('normalizeGridLayoutId', () => {
    it('keeps known ids', () => {
        for (const layout of GRID_LAYOUTS) {
            expect(normalizeGridLayoutId(layout.id)).toBe(layout.id);
        }
    });

    it('defaults unknown ids to auto', () => {
        expect(normalizeGridLayoutId('9x9')).toBe('auto');
        expect(normalizeGridLayoutId(undefined)).toBe('auto');
    });
});

describe('layoutIconCells', () => {
    it('returns cols and rows for fixed layouts', () => {
        expect(layoutIconCells('2x2')).toEqual({ cols: 2, rows: 2 });
    });

    it('returns zero cells for auto', () => {
        expect(layoutIconCells('auto')).toEqual({ cols: 0, rows: 0 });
    });
});
