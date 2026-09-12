export const INTRADAY_INTERVALS = ['1m', '5m', '15m', '1h', '4h'];

// Crosshair time-scale label: weekday name + date (UTC, matching the library's rendering)
export function formatCrosshairTime(time, interval) {
    const d = new Date(time * 1000);
    const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    if (!INTRADAY_INTERVALS.includes(interval)) return `${day}, ${date}`;
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day}, ${date} ${hh}:${mm}`;
}

export function isWeekend(time) {
    const day = new Date(time * 1000).getUTCDay();
    return day === 0 || day === 6;
}

export const CROSSHAIR_COLOR = '#758696';
export const CROSSHAIR_WEEKEND_COLOR = '#4da3ff';

export function crosshairLineColor(time) {
    return isWeekend(time) ? CROSSHAIR_WEEKEND_COLOR : CROSSHAIR_COLOR;
}
