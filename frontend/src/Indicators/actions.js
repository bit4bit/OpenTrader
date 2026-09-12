import { SMA_COLORS } from './sma';

const DEFAULT_SMA_LENGTHS = [5, 10, 20, 50, 100, 200, 7, 14, 30, 150];

const SINGLETON_TYPES = ['macd', 'volume_profile', 'bb', 'stoch', 'supertrend', 'atr', 'ichimoku', 'tsi', 'ad', 'w52', 'vol_sma', 'smi'];

const FACTORIES = {
    sma: () => DEFAULT_SMA_LENGTHS.map((length, i) => ({
        id: `sma-${i}`,
        type: 'sma',
        length,
        source: 'close',
        visible: i < 3,
        color: SMA_COLORS[i],
    })),
    rsi: () => [{
        id: 'rsi-main',
        type: 'rsi',
        length: 14,
        source: 'close',
        visible: true,
        smoothingType: 'SMA',
        smoothingLength: 10,
        showBB: true,
        color: '#2962ff',
        smoothColor: '#ff9800',
        bbColor: 'rgba(255, 255, 255, 0.3)',
    }],
    macd: () => [{
        id: 'macd-main',
        type: 'macd',
        fastLength: 12,
        slowLength: 26,
        signalLength: 9,
        normLookback: 100,
        visible: true,
        color: '#2962ff',
        signalColor: '#ff9800',
    }],
    vp: () => [{
        id: 'vp-main',
        type: 'vp',
        priceBins: 40,
        visible: true,
        color: 'rgba(38, 166, 154, 0.2)',
    }],
    volume_profile: () => [{
        id: 'vp-main',
        type: 'volume_profile',
        priceBins: 40,
        visible: true,
        color: 'rgba(38, 166, 154, 0.4)',
    }],
    bb: () => [{
        id: 'bb-main',
        type: 'bb',
        length: 20,
        stdDev: 2,
        source: 'Close',
        offset: 0,
        precision: 2,
        showPriceLabels: true,
        showStatusValues: true,
        showInputInStatus: true,
        visible: true,
        basisColor: '#2962ff',
        upperColor: '#ff9800',
        lowerColor: '#ff9800',
        fillColor: 'rgba(41, 98, 255, 0.1)',
    }],
    stoch: () => [{
        id: 'stoch-main',
        type: 'stoch',
        length: 14,
        dLength: 3,
        upperLine: 80,
        lowerLine: 20,
        visible: true,
        kColor: '#2962ff',
        dColor: '#ff9800',
        precision: 2,
    }],
    supertrend: () => [{
        id: 'supertrend-main',
        type: 'supertrend',
        atrLength: 10,
        factor: 3,
        visible: true,
        upColor: '#26a69a',
        downColor: '#ef5350',
    }],
    ichimoku: () => [{
        id: 'ichimoku-main',
        type: 'ichimoku',
        conversionLength: 9,
        baseLength: 26,
        spanBLength: 52,
        laggingLength: 26,
        visible: true,
        tenkanColor: '#2962ff',
        kijunColor: '#ff9800',
        spanAColor: 'rgba(38, 166, 154, 0.4)',
        spanBColor: 'rgba(239, 83, 80, 0.4)',
        chikouColor: '#9c27b0',
    }],
    atr: () => [{
        id: 'atr-main',
        type: 'atr',
        length: 14,
        visible: true,
        color: '#ff5252',
    }],
    ad: () => [{
        id: 'ad-main',
        type: 'ad',
        visible: true,
        color: '#2962ff',
    }],
    w52: () => [{
        id: 'w52-main',
        type: 'w52',
        basis: 'highlow',
        visible: true,
        color: '#ff9800',
    }],
    vol_sma: () => [{
        id: 'vol-sma-main',
        type: 'vol_sma',
        length: 20,
        visible: true,
        color: '#ff9800',
    }],
    smi: () => [{
        id: 'smi-main',
        type: 'smi',
        baseValue: 100,
        constituents: [
            { symbol: 'AAPL', weight: 0.5, enabled: true },
            { symbol: 'MSFT', weight: 0.5, enabled: true },
        ],
        visible: true,
        color: '#4fc3f7',
    }],
    tsi: () => [{
        id: 'tsi-main',
        type: 'tsi',
        longLength: 25,
        shortLength: 13,
        signalLength: 13,
        visible: true,
        color: '#2962ff',
        signalColor: '#ff9800',
    }],
};

export function addIndicators(list, type) {
    if (SINGLETON_TYPES.includes(type) && list.some(i => i.type === type)) return list;
    const factory = FACTORIES[type];
    if (!factory) return list;
    return [...list, ...factory()];
}

export function updateIndicator(list, id, updates) {
    return list.map(ind => ind.id === id ? { ...ind, ...updates } : ind);
}

export function removeIndicator(list, id) {
    return list.filter(ind => ind.id !== id);
}

export function removeIndicatorGroup(list, type) {
    return list.filter(ind => ind.type !== type);
}

export function toggleIndicator(list, id) {
    return list.map(ind => ind.id === id ? { ...ind, visible: !ind.visible } : ind);
}
