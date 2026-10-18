import { createIndicator, isSingleton } from './scripts';

export function addIndicators(list, type) {
    if (isSingleton(type) && list.some(i => i.type === type)) return list;
    const created = createIndicator(type);
    if (!created) return list;
    return [...list, ...(Array.isArray(created) ? created : [created])];
}

export const AVWAP_COLORS = ['#f57c00', '#26a69a', '#ab47bc', '#ec407a', '#7e57c2', '#66bb6a', '#ffee58', '#ef5350', '#29b6f6', '#8d6e63'];

export function addAnchoredVwap(list, inputs) {
    const anchorCount = list.filter(i => i.type === 'vwap' && i.anchor === 'date').length;
    return [...list, {
        id: `vwap-${Math.random().toString(36).slice(2, 8)}`,
        type: 'vwap',
        anchor: 'date',
        ...inputs,
        source: 'ohlc4',
        color: AVWAP_COLORS[anchorCount % AVWAP_COLORS.length],
        visible: true,
    }];
}

export function addCustomIndicator(list, script) {
    return [...list, {
        id: `custom-${script.id}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'custom',
        scriptId: script.id,
        name: script.name,
        visible: true,
        inputs: {},
    }];
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