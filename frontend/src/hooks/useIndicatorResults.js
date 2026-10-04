import { useMemo } from 'react';
import { runScript } from '../Indicators/dsl/runtime';
import { scriptCode, scriptValues, scriptPaneType, SCRIPT_TYPES, needsFullData } from '../Indicators/scripts';

/**
 * Runs all script-based indicators for a chart: built-in types defined in
 * the registry (Indicators/scripts.js) and user custom scripts. Returns
 * { resultsById, paneIds, errorsById } — recomputed only when data,
 * indicators or the loaded scripts change.
 *
 * A script with at least one non-overlay plot gets one dedicated pane.
 * Built-in pane types keep their canonical name (rsi, macd, ...) so the
 * pane legend layout in ChartPanel stays deterministic; custom indicators
 * get `custom-<indicator id>`.
 */
export function useIndicatorResults(data, adFullData, indicators, scriptsById, barsBySymbol = {}, symbolInfo = null, earnings = null) {
    return useMemo(() => {
        const resultsById = {};
        const errorsById = {};
        const paneIds = [];

        // Turnover mode is a property of the Volume bars; the pane companions
        // (vol_sma/vol_ema) must plot in the same units, so expose the
        // active flag and share count to every script via symbolInfo.
        const volumeBars = indicators.find(i => i.type === 'volume' && i.visible);
        const pctShares = volumeBars?.pctShares === true;
        const context = {
            ...(symbolInfo || {}),
            volumePctShares: pctShares,
            earnings: earnings || [],
        };

        indicators.forEach(ind => {
            if (!ind.visible) return;
            if (ind.type === 'custom') {
                const script = scriptsById?.[ind.scriptId];
                if (!script) return;
                const result = runScript(script.code, data, ind.inputs || {}, {}, context);
                resultsById[ind.id] = result;
                if (result.error) errorsById[ind.id] = result.error;
                if (result.plots.some(p => !p.overlay)) paneIds.push(`custom-${ind.id}`);
            } else if (SCRIPT_TYPES.includes(ind.type)) {
                // Full-history indicators (A/D) render nothing until the
                // full-range fetch resolves, instead of an error result.
                if (needsFullData(ind.type) && !adFullData) return;
                const result = runScript(
                    scriptCode(ind.type),
                    needsFullData(ind.type) ? adFullData : data,
                    scriptValues(ind.type, ind),
                    barsBySymbol,
                    context,
                );
                resultsById[ind.id] = result;
                if (result.error) errorsById[ind.id] = result.error;
                if (result.plots.some(p => !p.overlay)) paneIds.push(scriptPaneType(ind.type));
            }
        });

        return { resultsById, paneIds, errorsById };
    }, [data, adFullData, indicators, scriptsById, barsBySymbol, symbolInfo, earnings]);
}