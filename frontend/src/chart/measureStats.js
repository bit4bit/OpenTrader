// Statistics for the measure tool: aggregated OHLC/volume/bar-color stats
// over the bars whose time falls within the selection window (inclusive at
// both ends; bars sorted by time).
import { INTRADAY_INTERVALS } from './timeFormat';
import { buyFractionOf } from '../Indicators/tradingActivity';

export function measureStats(bars, t1, t2) {
    if (!bars?.length || t1 == null || t2 == null) return null;
    const from = Math.min(t1, t2);
    const to = Math.max(t1, t2);
    const windowBars = bars.filter(b => b.time >= from && b.time <= to);
    if (windowBars.length === 0) return null;

    let sumOpen = 0, sumHigh = 0, sumLow = 0, sumClose = 0, sumTypical = 0;
    let greenBars = 0, redBars = 0;
    let volumeSum = 0, volumeCount = 0, boughtVolumeSum = 0;
    let maxVolume = null, minVolume = null;
    windowBars.forEach(bar => {
        sumOpen += bar.open;
        sumHigh += bar.high;
        sumLow += bar.low;
        sumClose += bar.close;
        sumTypical += (bar.high + bar.low + bar.close) / 3;
        if (bar.close >= bar.open) greenBars += 1; else redBars += 1;
        if (bar.volume != null) {
            volumeSum += bar.volume;
            volumeCount += 1;
            boughtVolumeSum += bar.volume * buyFractionOf(bar);
            if (!maxVolume || bar.volume > maxVolume.volume) maxVolume = { volume: bar.volume, time: bar.time };
            if (!minVolume || bar.volume < minVolume.volume) minVolume = { volume: bar.volume, time: bar.time };
        }
    });
    const n = windowBars.length;
    return {
        barCount: n,
        avgOpen: sumOpen / n,
        avgHigh: sumHigh / n,
        avgLow: sumLow / n,
        avgClose: sumClose / n,
        avgPrice: sumTypical / n,
        avgVolume: volumeCount > 0 ? volumeSum / volumeCount : null,
        totalVolume: volumeCount > 0 ? volumeSum : null,
        boughtVolume: volumeCount > 0 ? boughtVolumeSum : null,
        soldVolume: volumeCount > 0 ? volumeSum - boughtVolumeSum : null,
        maxVolume,
        minVolume,
        greenBars,
        redBars,
    };
}

// Hit-test for the measure rectangle: is the (time, price) point inside the
// drawing's selection window (inclusive)?
export function measureContains(d, time, price) {
    if (!d || d.type !== 'measure' || time == null || price == null) return false;
    return time >= Math.min(d.p1.time, d.p2.time)
        && time <= Math.max(d.p1.time, d.p2.time)
        && price >= Math.min(d.p1.price, d.p2.price)
        && price <= Math.max(d.p1.price, d.p2.price);
}

// Compact volume for legend rows: 1.23K / 4.56M / 7.89B.
export function formatMeasureVolume(volume) {
    if (volume == null) return '—';
    const abs = Math.abs(volume);
    if (abs >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(volume / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(volume / 1e3).toFixed(2)}K`;
    return `${volume}`;
}

// UTC date label for the max/min volume rows (time-of-day on intraday
// intervals, matching the crosshair label conventions).
export function formatMeasureDate(time, interval) {
    const d = new Date(time * 1000);
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
    if (!INTRADAY_INTERVALS.includes(interval)) return date;
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${date} ${hh}:${mm}`;
}
