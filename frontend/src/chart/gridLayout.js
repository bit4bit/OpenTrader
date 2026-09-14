const AUTO_TEMPLATE = 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))';

export const GRID_LAYOUTS = [
    { id: 'auto', label: 'Auto', cols: null, rows: null },
    { id: '1x1', label: '1 × 1', cols: 1, rows: 1 },
    { id: '2x1', label: '2 × 1', cols: 2, rows: 1 },
    { id: '1x2', label: '1 × 2', cols: 1, rows: 2 },
    { id: '2x2', label: '2 × 2', cols: 2, rows: 2 },
    { id: '3x2', label: '3 × 2', cols: 3, rows: 2 },
];

const findLayout = (id) => GRID_LAYOUTS.find(l => l.id === id) || GRID_LAYOUTS[0];

export const normalizeGridLayoutId = (id) => findLayout(id).id;

export const gridTemplateFor = (id) => {
    const layout = findLayout(id);
    if (layout.cols === null) {
        return { gridTemplateColumns: AUTO_TEMPLATE, gridAutoRows: '1fr' };
    }
    const rowSize = 'minmax(320px, 1fr)';
    return {
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, ${rowSize})`,
        gridAutoRows: rowSize,
    };
};

export const layoutIconCells = (id) => {
    const layout = findLayout(id);
    return { cols: layout.cols ?? 0, rows: layout.rows ?? 0 };
};
