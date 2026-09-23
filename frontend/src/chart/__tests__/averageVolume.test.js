import { describe, it, expect } from 'vitest';
import { averageVolume, AVERAGE_VOLUME_BARS } from '../averageVolume';

const bar = (volume) => ({ volume });

describe('averageVolume', () => {
    it('returns null for intraday intervals', () => {
        expect(averageVolume([bar(100)], '5m')).toBeNull();
        expect(averageVolume([bar(100)], '4h')).toBeNull();
    });

    it('averages volumes over daily and above intervals', () => {
        expect(averageVolume([bar(100), bar(200), bar(300)], '1d')).toBe(200);
        expect(averageVolume([bar(100), bar(200)], '1wk')).toBe(150);
        expect(averageVolume([bar(100)], '1mo')).toBe(100);
    });

    it('uses only the most recent bars', () => {
        const data = Array.from({ length: AVERAGE_VOLUME_BARS + 5 }, (_, i) => bar(i));
        const expected = data.slice(-AVERAGE_VOLUME_BARS).reduce((s, b) => s + b.volume, 0) / AVERAGE_VOLUME_BARS;
        expect(averageVolume(data, '1d')).toBe(expected);
    });

    it('skips bars with null volume (weekend placeholders)', () => {
        expect(averageVolume([bar(100), bar(null), bar(300)], '1d')).toBe(200);
    });

    it('returns null when no volumes exist', () => {
        expect(averageVolume([], '1d')).toBeNull();
        expect(averageVolume([bar(null)], '1d')).toBeNull();
    });
});
