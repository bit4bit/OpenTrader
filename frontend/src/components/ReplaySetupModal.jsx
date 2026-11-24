import React, { useState, useEffect, useRef } from 'react';
import {
    REPLAY_SPEEDS,
    parseReplayInput,
    replayInputValue,
    replayStartError,
} from '../chart/replay';
import { INTRADAY_INTERVALS } from '../chart/timeFormat';

// Start-point picker for bar replay: a date/time (UTC, like the chart's
// time scale) and the playback speed. Everything before the picked bar
// stays visible; the future reveals one bar at a time. The date can be
// typed or picked by clicking a candle on the chart (the datePick
// tool); while picking, the modal stays mounted but hidden so the typed
// form state survives the round trip.
const ReplaySetupModal = ({
    data,
    interval,
    initialTime = null,
    pickedTime = null,
    initialSpeed = 1,
    canPickDate = false,
    onPickDate,
    hidden = false,
    onStart,
    onClose,
}) => {
    const [value, setValue] = useState(() => replayInputValue(initialTime));
    const [speed, setSpeed] = useState(initialSpeed);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    // A candle picked on the chart prefills the date/time field. The
    // picked time arrives as a fresh object per pick, so the same candle
    // picked twice still triggers the prefill.
    const [lastPicked, setLastPicked] = useState(pickedTime);
    if (pickedTime !== lastPicked) {
        setLastPicked(pickedTime);
        if (pickedTime != null) {
            setValue(replayInputValue(pickedTime.time));
            setError(null);
        }
    }

    useEffect(() => { if (!hidden) inputRef.current?.focus(); }, [hidden]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const start = () => {
        const time = parseReplayInput(value);
        const message = replayStartError(data, time);
        if (message) {
            setError(message);
            return;
        }
        onStart(time, speed);
    };

    return (
        <div className="replay-modal-backdrop" onMouseDown={onClose} style={hidden ? { display: 'none' } : undefined}>
            <div className="replay-modal" onMouseDown={e => e.stopPropagation()}>
                <div className="replay-modal-title">Replay {interval}</div>
                <label className="replay-modal-field">
                    Start from (UTC)
                    <input
                        ref={inputRef}
                        type="datetime-local"
                        value={value}
                        onChange={e => { setValue(e.target.value); setError(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') start(); }}
                    />
                    {canPickDate && onPickDate && (
                        <button type="button" className="replay-modal-pick" onClick={onPickDate}>
                            📅 Pick from chart
                        </button>
                    )}
                </label>
                <label className="replay-modal-field">
                    Speed
                    <select
                        value={String(speed)}
                        onChange={e => setSpeed(Number(e.target.value))}
                        title="How many bars appear per second"
                    >
                        {REPLAY_SPEEDS.map(s => (
                            <option key={s} value={String(s)}>
                                {s} bar{s === 1 ? '' : 's'} / second
                            </option>
                        ))}
                    </select>
                </label>
                <div className="replay-modal-hint">
                    {INTRADAY_INTERVALS.includes(interval)
                        ? 'Bars appear from this moment onward; the time matters.'
                        : 'Only the date matters on this timeframe; the time is ignored.'}
                    {' '}The chart shows everything up to that point and hides the future.
                </div>
                <div className="replay-modal-actions">
                    <button className="toolbar-btn primary" onClick={start}>Start replay</button>
                    <button className="toolbar-btn" onClick={onClose}>Cancel</button>
                </div>
                {error && <div className="replay-modal-error">{error}</div>}
            </div>
        </div>
    );
};

export default ReplaySetupModal;
