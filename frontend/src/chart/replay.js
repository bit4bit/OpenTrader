// Pure bar-replay logic. Replay hides the future: the chart and its
// indicators only see the bars at or before a cursor time, and a playback
// loop reveals one bar per tick at a chosen speed (bars per second).

import { indexOfTime } from './viewport';

// Bars per second the playback clock can reveal.
export const REPLAY_SPEEDS = [0.5, 1, 2, 4, 8, 16];

// Whitespace bars the engine keeps past the last bar (lwcEngine's
// rightOffset, edgeRange's default) — the anchor for replay view jumps.
export const REPLAY_RIGHT_BARS = 20;

export const replayTickMs = (speed) => Math.round(1000 / speed);

// Everything the replay is allowed to show: bars at or before the cursor.
export function sliceReplayData(rows, cursorTime) {
    if (!rows || rows.length === 0) return rows ?? [];
    if (cursorTime == null) return rows;
    const index = indexOfTime(rows, cursorTime);
    return index < 0 ? [] : rows.slice(0, index + 1);
}

// Time of the next hidden bar — what one step or playback tick reveals.
// Null at the end of the loaded history.
export function nextReplayTime(rows, cursorTime) {
    if (!rows || rows.length === 0 || cursorTime == null) return null;
    const next = rows[indexOfTime(rows, cursorTime) + 1];
    return next ? next.time : null;
}

// Cursor to store for a wanted start time: the bar the chart will sit
// on. A time older than the loaded history keeps the raw time — the
// missing bars load around it, and it slices to nothing until they do.
export function replayCursorFor(rows, wantedTime) {
    if (!rows || rows.length === 0 || wantedTime < rows[0].time) return wantedTime;
    return rows[indexOfTime(rows, wantedTime)].time;
}

// Start-time validation; null when the replay can start.
export function replayStartError(rows, wantedTime) {
    if (wantedTime == null || !Number.isFinite(wantedTime)) {
        return 'Pick a date and time to start from';
    }
    if (rows && rows.length > 0 && wantedTime > rows[rows.length - 1].time) {
        return 'No bars at or before this date';
    }
    return null;
}

// Default start point: 100 bars back, so there is history to look at
// and a future to reveal.
export function defaultReplayTime(rows) {
    if (!rows || rows.length === 0) return null;
    return rows[Math.max(0, rows.length - 100)].time;
}

// datetime-local value ("YYYY-MM-DDTHH:mm") -> epoch seconds, read as
// UTC: the bars are UTC-stamped and every chart label renders in UTC,
// so the picked date must mean the same thing on the time scale.
export function parseReplayInput(value) {
    if (!value) return null;
    const normalized = value.length === 16 ? `${value}:00Z` : `${value}Z`;
    const ms = Date.parse(normalized);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

const pad = (n) => String(n).padStart(2, '0');

// Bar time -> datetime-local input value (UTC).
export function replayInputValue(time) {
    if (time == null) return '';
    const d = new Date(time * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
        + `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
