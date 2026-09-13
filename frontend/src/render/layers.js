// Overlay layer stack, bottom to top. Each layer is a named surface above
// the chart canvas with its own renderer entity; layers are cleared and
// redrawn independently of each other.
//
// zIndex is the stacking order relative to the chart container; notes stay
// above everything because they are interactive DOM (drag/edit).

export const LAYERS = {
    fills: { zIndex: 0, opacity: 0.8 },   // indicator band fills (BB, Ichimoku)
    volumeProfile: { zIndex: 1 },         // price-by-volume histogram bars
    drawings: { zIndex: 100 },            // user drawings, preview, anchors
    notes: { zIndex: 200 },               // text-note boxes (React DOM)
};

// Layers rendered as SVG surfaces (notes are DOM, not shapes).
export const SVG_LAYER_NAMES = ['fills', 'volumeProfile', 'drawings'];
