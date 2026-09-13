// Build-time chart engine selection. VITE_CHART_ENGINE picks the
// implementation; 'chartgpu' (WebGPU) is the default, 'lwc'
// (lightweight-charts) is the fallback. Creating an engine is async for
// every implementation (WebGPU initialization makes that unavoidable for
// 'chartgpu'), so consumers must await it. The non-selected engine stays
// out of the eager bundle via dynamic import.

const ENGINES = ['lwc', 'chartgpu'];
const selected = import.meta.env?.VITE_CHART_ENGINE || 'chartgpu';

if (!ENGINES.includes(selected)) {
    throw new Error(`Unknown VITE_CHART_ENGINE "${selected}". Available: ${ENGINES.join(', ')}`);
}

export const CHART_ENGINE = selected;

export function createChartEngine(container, options) {
    if (selected === 'chartgpu') {
        return import('./chartGpuEngine').then(m => m.createChartGpuEngine(container, options));
    }
    return import('./lwcEngine').then(m => m.createLwcEngine(container, options));
}
