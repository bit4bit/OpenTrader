import { describe, it, expect } from 'vitest';
import {
    formatCrosshairTime,
    isWeekend,
    crosshairLineColor,
    CROSSHAIR_COLOR,
    CROSSHAIR_WEEKEND_COLOR,
} from '../timeFormat';

const SATURDAY = Date.UTC(2024, 0, 6, 12, 30, 0) / 1000; // 2024-01-06 12:30 UTC
const MONDAY = Date.UTC(2024, 0, 8, 9, 5, 0) / 1000;      // 2024-01-08 09:05 UTC

describe('formatCrosshairTime', () => {
    it('omits the clock on daily and higher intervals', () => {
        expect(formatCrosshairTime(MONDAY, '1d')).toBe('Mon, 08 Jan 2024');
        expect(formatCrosshairTime(MONDAY, '1w')).toBe('Mon, 08 Jan 2024');
    });

    it('appends HH:mm UTC on intraday intervals', () => {
        expect(formatCrosshairTime(MONDAY, '1h')).toBe('Mon, 08 Jan 2024 09:05');
        expect(formatCrosshairTime(MONDAY, '15m')).toBe('Mon, 08 Jan 2024 09:05');
    });

    it('zero-pads hours and minutes', () => {
        expect(formatCrosshairTime(MONDAY, '5m')).toContain('09:05');
    });
});

describe('weekend highlighting', () => {
    it('detects Saturday and Sunday', () => {
        expect(isWeekend(SATURDAY)).toBe(true);
        expect(isWeekend(MONDAY)).toBe(false);
    });

    it('switches crosshair color only on weekends', () => {
        expect(crosshairLineColor(SATURDAY)).toBe(CROSSHAIR_WEEKEND_COLOR);
        expect(crosshairLineColor(MONDAY)).toBe(CROSSHAIR_COLOR);
    });
});
