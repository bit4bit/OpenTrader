import { describe, it, expect } from 'vitest';
import {
    positionTime,
    positionsForSymbol,
    positionScreenPos,
    positionLabelRect,
    buildPositionShapes,
    positionColor,
    POSITION_BUY_COLOR,
    POSITION_SELL_COLOR,
} from '../positions';

const ENTRY_BAR_TIME = 1767312000; // 2026-01-02T00:00:00Z
const CANDLES = [
    { time: ENTRY_BAR_TIME - 86400, open: 90, high: 108, low: 84, close: 100 },
    { time: ENTRY_BAR_TIME, open: 100, high: 110, low: 85, close: 105 },
    { time: ENTRY_BAR_TIME + 86400, open: 105, high: 112, low: 95, close: 108 },
];

const ctx = (overrides = {}) => ({
    timeToX: t => 100 + ((t / 86400) % 600),
    priceToY: p => 500 - p,
    width: 800,
    interval: '1d',
    formatPrice: p => p.toFixed(2),
    candles: CANDLES,
    ...overrides,
});

describe('positionTime', () => {
    it('converts an ISO datetime to epoch seconds', () => {
        expect(positionTime('2026-01-02T00:00:00Z', '1d')).toBe(1767312000);
    });

    it('snaps intraday times to UTC midnight for daily intervals', () => {
        expect(positionTime('2026-01-02T14:30:00Z', '1d')).toBe(1767312000);
        expect(positionTime('2026-01-02T14:30:00Z', '1wk')).toBe(1767312000);
    });

    it('keeps the time for intraday intervals', () => {
        expect(positionTime('2026-01-02T14:30:00Z', '15m'))
            .toBe(1767312000 + 14 * 3600 + 30 * 60);
    });

    it('returns null without a date or for invalid input', () => {
        expect(positionTime(null, '1d')).toBeNull();
        expect(positionTime('not-a-date', '1d')).toBeNull();
    });
});

describe('positionsForSymbol', () => {
    const positions = [
        { id: 1, symbol: 'AAPL' },
        { id: 2, symbol: 'msft' },
        { id: 3, symbol: 'AAPL' },
    ];

    it('matches case-insensitively', () => {
        expect(positionsForSymbol(positions, 'aapl').map(p => p.id)).toEqual([1, 3]);
        expect(positionsForSymbol(positions, 'MSFT').map(p => p.id)).toEqual([2]);
    });

    it('matches nothing without a symbol', () => {
        expect(positionsForSymbol(positions, '')).toEqual([]);
        expect(positionsForSymbol(positions, null)).toEqual([]);
    });
});

describe('positionScreenPos', () => {
    it('converts an on-screen entry bar to screen coordinates', () => {
        const pos = positionScreenPos(
            { price: 100, opened_at: '2026-01-02T00:00:00Z' },
            ctx()
        );
        expect(pos).toEqual({ x: 100 + ((ENTRY_BAR_TIME / 86400) % 600), y: 423 });
    });

    it('drops the circle below the entry candle when the price level falls on it', () => {
        // price 100 is inside the entry bar's [85, 110] range: the circle
        // yields below the low (priceToY(85) = 415).
        const pos = positionScreenPos(
            { price: 100, opened_at: '2026-01-02T00:00:00Z' },
            ctx()
        );
        expect(pos.y).toBe(415 + 5 + 3);
    });

    it('keeps the circle at the price level when it clears the candle span', () => {
        const pos = positionScreenPos(
            { price: 70, opened_at: '2026-01-02T00:00:00Z' },
            ctx()
        );
        expect(pos.y).toBe(430);
    });

    it('pins to the right edge without a date', () => {
        const pos = positionScreenPos({ price: 100, opened_at: null }, ctx());
        expect(pos.x).toBe(795);
        expect(pos.y).toBe(400);
    });

    it('is null when the entry bar is off-screen', () => {
        expect(positionScreenPos(
            { price: 100, opened_at: '2026-01-02T00:00:00Z' },
            ctx({ timeToX: () => null })
        )).toBeNull();
        expect(positionScreenPos(
            { price: 100, opened_at: '2026-01-02T00:00:00Z' },
            ctx({ timeToX: () => 900 })
        )).toBeNull();
        expect(positionScreenPos(
            { price: 100, opened_at: '2026-01-02T00:00:00Z' },
            ctx({ timeToX: () => -20 })
        )).toBeNull();
    });

    it('is null when the price cannot be projected', () => {
        expect(positionScreenPos({ price: 100, opened_at: null }, ctx({ priceToY: () => null }))).toBeNull();
    });
});

describe('positionLabelRect', () => {
    it('sits at the right edge, centered on the price level', () => {
        const rect = positionLabelRect({ price: 100 }, ctx());
        expect(rect).toEqual({ x: 800 - Math.max(48, '100.00'.length * 7 + 10), y: 400 - 9, width: Math.max(48, '100.00'.length * 7 + 10), height: 18 });
    });

    it('is null when the price cannot be projected', () => {
        expect(positionLabelRect({ price: 100 }, ctx({ priceToY: () => null }))).toBeNull();
    });

    it('matches the rect shape drawn by buildPositionShapes', () => {
        const shapes = buildPositionShapes([{ id: 1, price: 100, opened_at: null, side: 'buy' }], ctx());
        const rectShape = shapes.find(s => s.kind === 'rect');
        const rect = positionLabelRect({ price: 100 }, ctx());
        expect(rectShape.x).toBe(rect.x);
        expect(rectShape.y).toBe(rect.y);
        expect(rectShape.width).toBe(rect.width);
        expect(rectShape.height).toBe(rect.height);
    });
});

describe('positionColor', () => {
    it('is green for buys and red for sells', () => {
        expect(positionColor({ side: 'buy' })).toBe(POSITION_BUY_COLOR);
        expect(positionColor({ side: 'sell' })).toBe(POSITION_SELL_COLOR);
    });
});

describe('buildPositionShapes', () => {
    const position = { id: 1, price: 100, opened_at: null, side: 'buy' };

    it('draws a full-width price line, a marker, and the price label', () => {
        const shapes = buildPositionShapes([position], ctx());
        const kinds = shapes.map(s => s.kind);
        expect(kinds).toEqual(['line', 'circle', 'text', 'rect', 'text']);
        const [lineShape, circleShape, sideLetter, labelRect, labelText] = shapes;
        expect(lineShape.x1).toBe(0);
        expect(lineShape.x2).toBe(800);
        expect(lineShape.y1).toBe(400);
        expect(circleShape.cx).toBe(795);
        expect(circleShape.cy).toBe(400);
        expect(sideLetter.text).toBe('B');
        expect(labelRect.y).toBe(391);
        expect(labelText.text).toBe('100.00');
    });

    it('keeps the line and label but drops the circle for off-screen entry bars', () => {
        const shapes = buildPositionShapes(
            [{ ...position, opened_at: '2026-01-02T00:00:00Z' }],
            ctx({ timeToX: () => null })
        );
        expect(shapes.map(s => s.kind)).toEqual(['line', 'rect', 'text']);
    });

    it('ties a displaced circle back to the price line with a connector', () => {
        const shapes = buildPositionShapes(
            [{ ...position, opened_at: '2026-01-02T00:00:00Z' }],
            ctx()
        );
        expect(shapes.map(s => s.kind)).toEqual(['line', 'line', 'circle', 'text', 'rect', 'text']);
        const [, connector] = shapes;
        const x = 100 + ((ENTRY_BAR_TIME / 86400) % 600);
        expect(connector.x1).toBe(x);
        expect(connector.x2).toBe(x);
        expect(connector.y1).toBe(400);
        expect(connector.y2).toBe(418); // the circle's top edge
    });

    it('colors the shapes by side', () => {
        const [buyLine, buyCircle, , buyRect] = buildPositionShapes([position], ctx());
        expect(buyLine.style.stroke).toBe(POSITION_BUY_COLOR);
        expect(buyCircle.style.fill).toBe(POSITION_BUY_COLOR);
        expect(buyRect.style.fill).toBe(POSITION_BUY_COLOR);

        const [sellLine, sellCircle, sellLetter, sellRect] = buildPositionShapes(
            [{ ...position, side: 'sell' }], ctx());
        expect(sellLine.style.stroke).toBe(POSITION_SELL_COLOR);
        expect(sellCircle.style.fill).toBe(POSITION_SELL_COLOR);
        expect(sellLetter.text).toBe('S');
        expect(sellRect.style.fill).toBe(POSITION_SELL_COLOR);
    });

    it('skips positions whose price cannot be projected', () => {
        expect(buildPositionShapes([position], ctx({ priceToY: () => null }))).toEqual([]);
    });
});
