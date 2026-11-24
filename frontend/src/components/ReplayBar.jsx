import React from 'react';
import { REPLAY_SPEEDS } from '../chart/replay';
import { formatCrosshairTime } from '../chart/timeFormat';

// Playback controls over a chart tile in replay: play/pause, step one
// bar, speed, the cursor's time, and exit. At the end of the loaded
// history playing keeps the clock armed: new bars reveal as they form.
const ReplayBar = ({ replay, interval, atEnd, onTogglePlay, onStep, onSetSpeed, onExit }) => (
    <div className="replay-bar">
        <button
            className="replay-bar-btn"
            onClick={onTogglePlay}
            title={replay.playing ? 'Pause' : 'Play forward'}
        >
            {replay.playing ? '⏸' : '▶'}
        </button>
        <button
            className="replay-bar-btn"
            onClick={onStep}
            disabled={replay.playing}
            title="Reveal one bar"
        >
            ⏭
        </button>
        <select
            className="replay-bar-speed"
            value={String(replay.speed)}
            onChange={e => onSetSpeed(Number(e.target.value))}
            title="Bars revealed per second"
        >
            {REPLAY_SPEEDS.map(s => (
                <option key={s} value={String(s)}>{s}×</option>
            ))}
        </select>
        <span className="replay-bar-time" title="Replay cursor">
            {formatCrosshairTime(replay.cursorTime, interval)}
        </span>
        {atEnd && (
            <span className="replay-bar-time" title="No hidden bars left; new bars reveal as they form">
                ⦿ latest
            </span>
        )}
        <button
            className="replay-bar-btn replay-bar-exit"
            onClick={onExit}
            title="Cancel the replay and return to the live chart"
        >
            ✕ Exit replay
        </button>
    </div>
);

export default ReplayBar;
