// Build-time chart engine selection. VITE_CHART_ENGINE picks the
// implementation; 'lwc' (lightweight-charts) is the default. A WebGPU
// engine (e.g. ChartGPU) is added here later behind 'chartgpu'.

import { createLwcEngine } from './lwcEngine';

const ENGINES = {
    lwc: createLwcEngine,
};

const selected = import.meta.env?.VITE_CHART_ENGINE || 'lwc';

if (!ENGINES[selected]) {
    throw new Error(`Unknown VITE_CHART_ENGINE "${selected}". Available: ${Object.keys(ENGINES).join(', ')}`);
}

export const CHART_ENGINE = selected;
export const createChartEngine = ENGINES[selected];
