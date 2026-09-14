/**
 * Indicator pane layout constants.
 *
 * Overlay indicators (sma, bb, supertrend, ichimoku, volume_profile) render on
 * the main price pane (pane 0). Oscillator/pane indicators each get their own
 * dedicated pane (TradingView-style), stacked in this canonical order so pane
 * positions are deterministic for the legend layout. Scripts with a `paneType`
 * (e.g. vol_sma) share the named pane instead of getting their own.
 */
import { scriptPaneType } from './scripts';

export const PANE_ORDER = ['volume', 'rsi', 'stoch', 'macd', 'atr', 'tsi', 'ad', 'smi'];

/**
 * Given the indicators array, return the active pane types in canonical order.
 */
export function getActivePaneTypes(indicators) {
    return PANE_ORDER.filter(t => indicators.some(i => i.visible && scriptPaneType(i.type) === t));
}
