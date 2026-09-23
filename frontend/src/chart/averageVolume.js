export const AVERAGE_VOLUME_BARS = 20;

const INTRADAY_INTERVALS = ['1m', '5m', '15m', '1h', '4h'];

// Mean volume over the most recent daily+ bars; null on intraday intervals
// (their loaded range is too short to average whole days).
export const averageVolume = (data, interval) => {
    if (INTRADAY_INTERVALS.includes(interval)) return null;
    const volumes = data
        .map(bar => bar.volume)
        .filter(volume => volume != null)
        .slice(-AVERAGE_VOLUME_BARS);
    if (volumes.length === 0) return null;
    return volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length;
};
