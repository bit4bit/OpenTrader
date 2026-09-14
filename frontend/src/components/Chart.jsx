import React, { useEffect, useRef, useState } from 'react';
import { createChartEngine } from '../engine';
import { formatADLValue } from '../Indicators/adl';
import { registerChart, broadcastRange, broadcastCrosshair, isApplyingSync } from '../sync/chartSync';
import { formatCrosshairTime, crosshairLineColor } from '../chart/timeFormat';
import { priceSeriesData } from '../chart/heikinAshi';
import { findNearestBar } from '../chart/barSearch';
import { isDrawingTool, buildPreviewDrawing } from '../chart/drawingTools';
import { applyDrawingClick, edgeRange } from '../chart/drawingInteraction';
import { buildLegendResults } from '../chart/crosshairLegend';
import {
    computeActivePaneTypes,
    paneIndexOf as paneIndexOfType,
    paneStretchFactors,
    computeRenderableIds,
    isScriptIndicator,
    scriptPaneKey,
    sliceToWindow,
} from '../chart/paneLayout';
import { getNoteCoordinates, noteBoxOffset, updateTextNote, deleteDrawing } from '../chart/noteGeometry';
import {
    buildDrawingScene,
    buildFillShapes,
    buildVolumeProfileShapes,
} from '../chart/drawingGeometry';
import { createSvgRenderer } from '../render/svgRenderer';
import { LAYERS, SVG_LAYER_NAMES } from '../render/layers';

const Chart = ({
    data,
    chartType,
    symbol,
    provider = null,
    interval,
    onVisibleLogicalRangeChange,
    onCrosshairMove,
    indicators = [],
    drawings = [],
    setDrawings,
    activeTool,
    setActiveTool,
    magnetEnabled = true,
    chartId,
    isActive = false,
    syncEnabled = false,
    indicatorResults = {}
}) => {
    const containerRef = useRef();
    const engineRef = useRef(null);
    const layerSurfacesRef = useRef({});
    const layerRenderersRef = useRef({});
    const [previewDrawing, setPreviewDrawing] = useState(null);
    const drawingPointsRef = useRef([]);
    const genericSeriesRef = useRef({});
    const lastPaneKey = useRef('');
    const [histogramsData, setHistogramsData] = useState([]);
    const [fillsData, setFillsData] = useState([]);
    const [chartTick, setChartTick] = useState(0);
    const [noteDrag, setNoteDrag] = useState(null);
    const [notePositions, setNotePositions] = useState({});
    const [engineReady, setEngineReady] = useState(false);
    const [engineError, setEngineError] = useState(null);
    const currentCrosshairColor = useRef('#758696');

    const updateNote = React.useCallback((id, updater) => {
        setDrawings(prev => updateTextNote(prev, id, updater));
    }, []);

    const deleteNote = (id) => {
        setDrawings(prev => deleteDrawing(prev, id));
    };

    const commitNoteText = (id, text) => {
        updateNote(id, d => ({ ...d, text, editing: false }));
    };

    const isFirstLoad = useRef(true);
    const pendingScrollRef = useRef(null);
    const lastSymbolInterval = useRef(`${symbol}-${provider}-${interval}`);

    const onRangeChangeRef = useRef(onVisibleLogicalRangeChange);
    const onCrosshairMoveRef = useRef(onCrosshairMove);
    const syncEnabledRef = useRef(syncEnabled);
    const dataRef = useRef(data);
    const activeToolRef = useRef(activeTool);
    const isActiveRef = useRef(isActive);
    const intervalRef = useRef(interval);
    useEffect(() => { onRangeChangeRef.current = onVisibleLogicalRangeChange; }, [onVisibleLogicalRangeChange]);
    useEffect(() => { intervalRef.current = interval; }, [interval]);
    useEffect(() => { onCrosshairMoveRef.current = onCrosshairMove; }, [onCrosshairMove]);
    useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
    useEffect(() => { syncEnabledRef.current = syncEnabled; }, [syncEnabled]);
    useEffect(() => { dataRef.current = data; }, [data]);

    // Converter context shared by the overlay geometry builders.
    const geometryCtx = () => {
        const engine = engineRef.current;
        const { width, height } = engine.size();
        return {
            timeToX: t => engine.timeToX(t),
            priceToY: p => engine.priceToY(p),
            width,
            height,
            data: dataRef.current,
        };
    };

    // Renderer entity for a named overlay layer (see render/layers.js).
    // Each renderer owns its surface: every draw clears the layer first.
    const layerRenderer = (name) => {
        const el = layerSurfacesRef.current[name];
        if (!el) return null;
        if (!layerRenderersRef.current[name]) {
            layerRenderersRef.current[name] = createSvgRenderer(el);
        }
        return layerRenderersRef.current[name];
    };

    // Initialize Chart
    useEffect(() => {
        let cancelled = false;
        const unsubscribers = [];

        createChartEngine(containerRef.current, {
            timeFormatter: (time) => formatCrosshairTime(time, intervalRef.current),
        }).then(engine => {
            if (cancelled) {
                engine.dispose();
                return;
            }
            engineRef.current = engine;
            setEngineReady(true);

            // Sync peers see an engine-agnostic entry: logical range for
            // zoom/pan, nearest-bar snapping for the crosshair.
            const syncEntry = {
                setVisibleRange: (range) => engine.setVisibleRange(range),
                showCrosshair: (time) => {
                    const bar = time == null ? null : findNearestBar(dataRef.current, time);
                    if (bar) engine.setCrosshairPosition(bar.price, bar.time);
                    else engine.clearCrosshair();
                },
            };
            const unregister = chartId ? registerChart(chartId, syncEntry) : null;

            unsubscribers.push(
                engine.onVisibleRangeChange((range) => {
                    if (onRangeChangeRef.current) onRangeChangeRef.current(range);
                    if (chartId && !isApplyingSync()) broadcastRange(chartId, range, syncEnabledRef.current);
                }),
                engine.onCrosshairMove((evt) => {
                    // Highlight the vertical crosshair line on weekend bars
                    if (evt?.time) {
                        const color = crosshairLineColor(evt.time);
                        if (color !== currentCrosshairColor.current) {
                            currentCrosshairColor.current = color;
                            engine.setCrosshairColor(color);
                        }
                    }

                    const currentTool = activeToolRef.current;
                    if (evt && isDrawingTool(currentTool) && drawingPointsRef.current.length > 0) {
                        setPreviewDrawing(buildPreviewDrawing(currentTool, drawingPointsRef.current, { time: evt.time, price: evt.price }));
                    }

                    if (chartId && !isApplyingSync() && syncEnabledRef.current) {
                        broadcastCrosshair(chartId, evt?.time ?? null, evt?.price ?? null, true);
                    }

                    if (!onCrosshairMoveRef.current) return;
                    if (!evt) {
                        onCrosshairMoveRef.current(null);
                        return;
                    }

                    // Script-based indicators (built-ins + custom): one entry
                    // per plot, in plot declaration order. Values are keyed by
                    // engine handle, so reads stay engine-neutral.
                    const results = buildLegendResults(
                        evt.priceBar,
                        genericSeriesRef.current,
                        series => evt.seriesValues.get(series)
                    );

                    onCrosshairMoveRef.current(results);
                }),
                engine.onRedraw(() => setChartTick(t => t + 1)),
                () => { if (unregister) unregister(); }
            );
        }).catch((err) => {
            console.error('Chart engine failed to initialize:', err);
            if (!cancelled) setEngineError(err?.message);
        });

        return () => {
            cancelled = true;
            unsubscribers.forEach(off => off());
            engineRef.current?.dispose();
            engineRef.current = null;
            lastPaneKey.current = '';
            genericSeriesRef.current = {};
        };
    }, []); // Removed [activeTool] to prevent chart recreation

    // Magnet off: free crosshair (Normal mode) so the cursor isn't anchored to bars
    useEffect(() => {
        engineRef.current?.setMagnet(magnetEnabled);
    }, [magnetEnabled]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            const target = e.target;
            const inEditable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
            if (e.ctrlKey && e.key === 'z' && !inEditable) {
                setDrawings(prev => prev.slice(0, -1));
                drawingPointsRef.current = [];
                setPreviewDrawing(null);
                setActiveTool('cursor');
            }
            if (e.key === 'Escape') {
                setActiveTool('cursor');
                drawingPointsRef.current = [];
                setPreviewDrawing(null);
            }
            if (isActiveRef.current && (e.key === 'Home' || e.key === 'End')
                && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const target = e.target;
                if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
                const engine = engineRef.current;
                const data = dataRef.current;
                if (!engine || data.length === 0) return;
                e.preventDefault();
                // Slide the current window to the edge, preserving zoom (bar width).
                const range = engine.getVisibleRange();
                if (!range) return;
                pendingScrollRef.current = e.key === 'End' ? 'end' : 'start';
                engine.setVisibleRange(edgeRange(e.key, range.to - range.from, data.length));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setDrawings, setActiveTool]);

    // Handle Clicks for Drawing
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !isDrawingTool(activeTool)) {
            drawingPointsRef.current = [];
            setPreviewDrawing(null);
            return;
        }

        const offClick = engine.onClick((evt) => {
            if (!evt) return;
            const { drawing, pendingPoints, finished } = applyDrawingClick(
                activeTool, { time: evt.time, price: evt.price }, drawingPointsRef.current, Date.now().toString()
            );
            drawingPointsRef.current = pendingPoints;
            if (drawing) setDrawings(prev => [...prev, drawing]);
            if (finished) {
                setPreviewDrawing(null);
                setActiveTool('cursor');
            }
        });

        return offClick;
    }, [activeTool, setDrawings, setActiveTool]);

    // Script indicator fills (BB band shade, Ichimoku cloud, ...).
    useEffect(() => {
        if (!engineReady) return;
        layerRenderer('fills')?.drawShapes(buildFillShapes(fillsData, geometryCtx()));
    }, [engineReady, fillsData, indicators, data]); // Redraw on data change as well to sync with timeScale

    // Script histogram overlays (Volume Profile-style price-by-volume)
    useEffect(() => {
        if (!engineReady) return;
        layerRenderer('volumeProfile')?.drawShapes(buildVolumeProfileShapes(histogramsData, geometryCtx()));
    }, [engineReady, histogramsData, indicators]);

    // Render Drawings and Annotations
    useEffect(() => {
        if (!engineReady) return;
        layerRenderer('drawings')?.drawScene(buildDrawingScene(drawings, previewDrawing, geometryCtx()));
    }, [engineReady, drawings, previewDrawing, data, chartTick]);

    // Erase single drawing: click a <g data-drawing-id> to remove it
    useEffect(() => {
        const surface = layerSurfacesRef.current.drawings;
        if (!surface) return;
        if (activeTool !== 'eraserOne') {
            surface.style.pointerEvents = 'none';
            return;
        }
        surface.style.pointerEvents = 'auto';
        const handleErase = (e) => {
            const g = e.target.closest?.('[data-drawing-id]');
            if (!g) return;
            const id = g.getAttribute('data-drawing-id');
            setDrawings(prev => deleteDrawing(prev, id));
        };
        surface.addEventListener('click', handleErase);
        return () => {
            surface.style.pointerEvents = 'none';
            surface.removeEventListener('click', handleErase);
        };
    }, [activeTool, setDrawings]);

    // Reset FirstLoad tracking on Symbol or Interval change
    useEffect(() => {
        const key = `${symbol}-${provider}-${interval}`;
        if (lastSymbolInterval.current !== key) {
            isFirstLoad.current = true;
            lastSymbolInterval.current = key;
        }
    }, [symbol, provider, interval]);

    // MAIN UPDATE LOOP: Price, Volume, and Indicators
    useEffect(() => {
        const engine = engineRef.current;
        if (!engineReady || !engine || !data || data.length === 0) return;

        // Pane indicators (oscillators) each get their own dedicated pane,
        // TradingView-style, stacked in canonical order. When the active set
        // changes, extra panes are rebuilt so ordering stays deterministic.
        const activePaneTypes = computeActivePaneTypes(indicators, indicatorResults.paneIds);
        const paneKey = activePaneTypes.join(',');
        if (paneKey !== lastPaneKey.current) {
            while (engine.paneCount() > 1) {
                engine.removeLastPane();
            }
            // Drop every tracked series explicitly: series in pane 0 survive
            // pane removal, so forgetting refs here would orphan them.
            Object.values(genericSeriesRef.current).forEach(entry => {
                entry.forEach(e => engine.removeSeries(e.series));
            });
            genericSeriesRef.current = {};
            for (let i = 0; i < activePaneTypes.length; i++) engine.addPane();
            lastPaneKey.current = paneKey;
        }
        // Price pane gets 3x the height of each indicator pane so pane
        // boundaries are deterministic: share = 100 / (3 + n) percent.
        engine.setPaneStretchFactors(paneStretchFactors(engine.paneCount()));
        const paneIndexOf = (type) => paneIndexOfType(activePaneTypes, type);

        engine.applyPriceScaleMargins({ top: 0.02, bottom: 0.02 });
        engine.setPriceSeries(chartType, priceSeriesData(data, chartType));

        // Indicator Management
        // A tracked series is renderable only while its indicator is visible
        // AND has a usable script result — a deleted or broken script must
        // drop its series instead of leaving them on the chart.
        const renderableIds = computeRenderableIds(indicators, indicatorResults.resultsById);
        Object.keys(genericSeriesRef.current).forEach(id => {
            if (!renderableIds.has(id)) {
                genericSeriesRef.current[id].forEach(e => engine.removeSeries(e.series));
                delete genericSeriesRef.current[id];
            }
        });

        const nextFills = [];
        const nextHistograms = [];
        indicators.forEach(ind => {
            if (isScriptIndicator(ind) && ind.visible) {
                // All script-based indicators (built-ins from the registry
                // and user custom scripts) render through one descriptor path.
                const res = indicatorResults.resultsById[ind.id];
                if (!res || res.error) return;

                const paneKey = scriptPaneKey(ind);
                const hasPanes = res.plots.some(p => !p.overlay);
                const paneIndex = hasPanes ? paneIndexOf(paneKey) : 0;
                // Cumulative indicators run over full history; slice plots
                // back to the currently loaded window (like the old A/D path).
                const firstTime = data.length > 0 ? data[0].time : null;

                let existing = genericSeriesRef.current[ind.id];
                if (existing && existing.length !== res.plots.length) {
                    existing.forEach(e => engine.removeSeries(e.series));
                    existing = null;
                }
                if (!existing) {
                    existing = res.plots.map(p => {
                        const options = {
                            color: p.color,
                            lineWidth: p.lineWidth ?? 1.5,
                            lineStyle: p.lineStyle,
                            crosshairMarkerVisible: false,
                            title: p.title,
                            ...(p.lastValueVisible != null ? { lastValueVisible: p.lastValueVisible } : {}),
                            ...(p.priceLineVisible != null ? { priceLineVisible: p.priceLineVisible } : {}),
                            ...(ind.type === 'ad' ? {
                                priceFormat: { type: 'custom', minMove: 1, formatter: formatADLValue },
                            } : {}),
                        };
                        const series = p.style === 'histogram'
                            ? engine.addHistogramSeries(options, p.overlay ? 0 : paneIndex)
                            : engine.addLineSeries(options, p.overlay ? 0 : paneIndex);
                        return { series, title: p.title, color: p.color };
                    });
                    genericSeriesRef.current[ind.id] = existing;
                }

                res.plots.forEach((p, i) => {
                    const entry = existing[i];
                    entry.series.applyOptions({ color: p.color, title: p.title });
                    entry.series.setData(sliceToWindow(p.series, ind.type, firstTime));
                    entry.title = p.title;
                    entry.color = p.color;
                });

                if (res.fills.length > 0 && res.plots.every(p => p.overlay)) {
                    res.fills.forEach(f => nextFills.push({
                        a: res.plots[f.a].series,
                        b: res.plots[f.b].series,
                        color: f.color,
                        colorAlt: f.colorAlt,
                    }));
                }
                if (res.histograms.length > 0) {
                    nextHistograms.push(...res.histograms);
                }
            }
        });
        setHistogramsData(nextHistograms);
        setFillsData(nextFills);

        if (isFirstLoad.current && data.length > 0) {
            engine.fitContent();
            const lr = engine.getVisibleRange();
            if (lr) engine.setVisibleRange({ from: lr.from, to: lr.to + 20 });
            isFirstLoad.current = false;
        }

        // Re-anchor edge jumps after data updates so prepended/appended
        // bars don't leave the view stranded mid-history.
        if (pendingScrollRef.current && data.length > 0) {
            const range = engine.getVisibleRange();
            if (range) {
                const width = range.to - range.from;
                if (pendingScrollRef.current === 'end') {
                    engine.setVisibleRange({ from: data.length - 1 + 20 - width, to: data.length - 1 + 20 });
                } else {
                    engine.setVisibleRange({ from: 0, to: width });
                }
            }
            pendingScrollRef.current = null;
        }
    }, [data, chartType, indicators, symbol, interval, indicatorResults, engineReady]);

    const updateNoteRef = useRef(updateNote);
    useEffect(() => { updateNoteRef.current = updateNote; }, [updateNote]);

    // Text note drag: move box (offset in px) or anchor (time+price).
    useEffect(() => {
        if (!noteDrag) return;
        const engine = engineRef.current;
        if (!engine) return;

        const handleMove = (e) => {
            const rect = containerRef.current.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;

            if (noteDrag.mode === 'box') {
                const { anchorX, anchorY } = noteDrag;
                updateNoteRef.current(noteDrag.id, d => ({
                    ...d,
                    boxOffset: noteBoxOffset(anchorX, anchorY, px, py)
                }));
            } else {
                const time = engine.xToTime(px);
                const price = engine.yToPrice(py);
                if (time !== null && price !== null) {
                    updateNoteRef.current(noteDrag.id, d => ({ ...d, anchor: { time, price } }));
                }
            }
        };

        const handleUp = () => setNoteDrag(null);

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [noteDrag]);

    const startNoteAnchorDrag = (note, e) => {
        e.preventDefault();
        e.stopPropagation();
        setNoteDrag({ id: note.id, mode: 'anchor' });
    };

    // Compute note screen positions on every redraw tick (pan/zoom/data).
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;
        const positions = {};
        drawings.forEach(d => {
            if (d.type !== 'textNote') return;
            positions[d.id] = getNoteCoordinates(d, t => engine.timeToX(t), p => engine.priceToY(p));
        });
        setNotePositions(positions);
    }, [engineReady, drawings, chartTick]);

    const startNoteBoxDrag = (note, e) => {
        if (note.editing) return;
        e.preventDefault();
        e.stopPropagation();
        const coords = notePositions[note.id];
        if (!coords) return;
        setNoteDrag({ id: note.id, mode: 'box', anchorX: coords.anchorX, anchorY: coords.anchorY });
    };

    const renderNotes = () => {
        return drawings.filter(d => d.type === 'textNote').map(d => {
            const coords = notePositions[d.id];
            if (!coords) return null;
            const { anchorX, anchorY, boxX, boxY } = coords;

            return (
                <React.Fragment key={d.id}>
                    <div
                        className="chart-note-anchor"
                        style={{ left: anchorX - 5, top: anchorY - 5 }}
                        onPointerDown={(e) => startNoteAnchorDrag(d, e)}
                        title="Drag to re-anchor the note"
                    />
                    <div
                        className={`chart-note ${noteDrag?.id === d.id ? 'dragging' : ''}`}
                        style={{ left: boxX, top: boxY }}
                        onPointerDown={(e) => startNoteBoxDrag(d, e)}
                        onDoubleClick={() => updateNote(d.id, n => ({ ...n, editing: true }))}
                    >
                        {d.editing ? (
                            <textarea
                                autoFocus
                                className="chart-note-textarea"
                                defaultValue={d.text}
                                onBlur={(e) => commitNoteText(d.id, e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') commitNoteText(d.id, e.target.value);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <>
                                <button
                                    className="chart-note-close"
                                    onClick={(e) => { e.stopPropagation(); deleteNote(d.id); }}
                                    title="Delete note"
                                >
                                    ×
                                </button>
                                <span className="chart-note-text">{d.text}</span>
                            </>
                        )}
                    </div>
                </React.Fragment>
            );
        });
    };

    if (engineError) {
        const message = engineError === 'WEBGPU_NO_ADAPTER'
            ? 'WebGPU is present but no GPU adapter was found (Vulkan driver issue on Linux). For Chrome, try launching with --enable-features=Vulkan or update GPU drivers.'
            : engineError === 'WEBGPU_UNSUPPORTED'
                ? 'WebGPU is not available in this browser. Use Chrome 113+, Edge 113+ or Safari 18+.'
                : 'Chart engine failed to start. See the browser console for details.';
        return (
            <div className="chart-engine-unavailable" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', height: '100%', color: '#787b86', fontSize: 13, padding: 24,
            }}>
                {message}
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', zIndex: 0, width: '100%', height: '100%' }} className={`${activeTool !== 'cursor' ? 'drawing-active' : ''} ${activeTool === 'eraserOne' ? 'erase-mode' : ''}`}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            {/* Overlay layers (see render/layers.js): fills, volume profile,
                drawings as SVG surfaces; notes as interactive DOM on top. */}
            {SVG_LAYER_NAMES.map(name => (
                <svg
                    key={name}
                    ref={el => { if (el) layerSurfacesRef.current[name] = el; }}
                    style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        pointerEvents: 'none',
                        zIndex: LAYERS[name].zIndex,
                        opacity: LAYERS[name].opacity ?? 1,
                    }}
                />
            ))}
            <div className="chart-notes-overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: LAYERS.notes.zIndex }}>
                {renderNotes()}
            </div>
        </div>
    );
};

export default Chart;
