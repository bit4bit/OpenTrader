import { useMemo } from 'react';
import { runScript } from '../Indicators/dsl/runtime';

/**
 * Runs custom indicator scripts for a chart.
 *
 * Each visible custom indicator whose script is loaded is executed against
 * the current OHLCV data. Scripts with at least one non-overlay plot get a
 * dedicated pane keyed `custom-<indicator id>`, TradingView-style (one pane
 * per script).
 *
 * Returns { resultsById, paneIds, errorsById } — recomputed only when data,
 * indicators or the loaded scripts change.
 */
export function useCustomIndicatorResults(data, indicators, scriptsById) {
    return useMemo(() => {
        const resultsById = {};
        const errorsById = {};
        const paneIds = [];

        indicators.forEach(ind => {
            if (ind.type !== 'custom' || !ind.visible) return;
            const script = scriptsById?.[ind.scriptId];
            if (!script) return;
            const result = runScript(script.code, data, ind.inputs || {});
            resultsById[ind.id] = result;
            if (result.error) errorsById[ind.id] = result.error;
            if (result.panes.length > 0) paneIds.push(`custom-${ind.id}`);
        });

        return { resultsById, paneIds, errorsById };
    }, [data, indicators, scriptsById]);
}
