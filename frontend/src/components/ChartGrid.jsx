import React, { useEffect } from 'react';
import ChartPanel from './ChartPanel';
import { LayoutOptions } from './LayoutPicker';
import { gridTemplateFor, maximizedTemplate } from '../chart/gridLayout';

const ChartGrid = ({
    charts,
    activeChartId,
    locked,
    gridLayout,
    onSetGridLayout,
    onToggleMaximize,
    activeTool,
    setActiveTool,
    magnetEnabled,
    onActivate,
    onClose,
    onUpdate,
    onAddChart,
    scriptsById,
    positions = [],
    notes = [],
    onDatePick,
    refreshTick = 0,
    refreshMs = null,
}) => {
    const maximizedChart = charts.find(c => c.maximized);

    // Escape restores the maximized chart to the grid, unless a drawing
    // tool is armed: Esc then cancels the tool instead.
    useEffect(() => {
        if (!maximizedChart) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && activeTool === 'cursor') onToggleMaximize(maximizedChart.id);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [maximizedChart, onToggleMaximize, activeTool]);

    if (charts.length === 0) {
        return (
            <div className="chart-grid-empty" onClick={onAddChart}>
                <div className="chart-grid-empty-tile">
                    <span className="chart-grid-empty-plus">+</span>
                    <span>Add chart</span>
                    <div className="chart-grid-empty-layouts" onClick={e => e.stopPropagation()}>
                        <LayoutOptions gridLayout={gridLayout} onSelect={onSetGridLayout} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`chart-grid${maximizedChart ? ' maximized' : ''}`}
            style={maximizedChart ? maximizedTemplate() : gridTemplateFor(gridLayout)}
        >
            {charts.map(chart => (
                <ChartPanel
                    key={chart.id}
                    chart={chart}
                    isActive={chart.id === activeChartId}
                    locked={locked}
                    onToggleMaximize={onToggleMaximize}
                    activeTool={chart.id === activeChartId ? activeTool : 'cursor'}
                    magnetEnabled={magnetEnabled}
                    setActiveTool={setActiveTool}
                    onActivate={() => onActivate(chart.id)}
                    onClose={() => onClose(chart.id)}
                    onUpdate={onUpdate}
                    scriptsById={scriptsById}
                    positions={positions}
                    notes={notes}
                    onDatePick={onDatePick}
                    refreshTick={refreshTick}
                    refreshMs={refreshMs}
                />
            ))}
        </div>
    );
};

export default ChartGrid;
