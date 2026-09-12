import { createIndicator, isSingleton } from './scripts';

export function addIndicators(list, type) {
    if (isSingleton(type) && list.some(i => i.type === type)) return list;
    const created = createIndicator(type);
    if (!created) return list;
    return [...list, ...(Array.isArray(created) ? created : [created])];
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