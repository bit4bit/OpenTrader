import { getActivePaneTypes } from '../Indicators/panes';
import { SCRIPT_TYPES, needsFullData, scriptPaneType } from '../Indicators/scripts';

// Ordered pane keys for every active pane indicator (built-in + custom).
// Built-in pane types appear in both sources; dedupe keeps one pane each.
export function computeActivePaneTypes(indicators, paneIds) {
    return [...new Set([...getActivePaneTypes(indicators), ...paneIds])];
}

export function paneIndexOf(activePaneTypes, type) {
    return activePaneTypes.indexOf(type) + 1;
}

// Price pane gets 3x the height of each indicator pane so pane boundaries
// are deterministic: share = 100 / (3 + n) percent.
export function paneStretchFactors(paneCount) {
    return [3, ...Array(Math.max(0, paneCount - 1)).fill(1)];
}

// A tracked series is renderable only while its indicator is visible AND has
// a usable script result — a deleted or broken script must drop its series.
export function computeRenderableIds(indicators, resultsById) {
    return new Set(
        indicators
            .filter(ind => ind.visible)
            .filter(ind => {
                const res = resultsById[ind.id];
                return res && !res.error;
            })
            .map(ind => ind.id)
    );
}

export function isScriptIndicator(ind) {
    return SCRIPT_TYPES.includes(ind.type) || ind.type === 'custom';
}

export function scriptPaneKey(ind) {
    return ind.type === 'custom' ? `custom-${ind.id}` : scriptPaneType(ind.type);
}

// Cumulative indicators run over full history; slice plots back to the
// currently loaded window. The window can also end early (replay hides
// the future): full-history series must not draw past the cursor.
export function sliceToWindow(series, indicatorType, firstTime, lastTime = null) {
    const needsStart = needsFullData(indicatorType) && firstTime != null;
    if (!needsStart && lastTime == null) return series;
    return series.filter(b =>
        (!needsStart || b.time >= firstTime)
        && (lastTime == null || b.time <= lastTime));
}
