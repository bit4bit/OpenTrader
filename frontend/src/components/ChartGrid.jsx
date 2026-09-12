import React from 'react';
import ChartPanel from './ChartPanel';

const ChartGrid = ({
    charts,
    activeChartId,
    locked,
    activeTool,
    setActiveTool,
    magnetEnabled,
    onActivate,
    onClose,
    onUpdate,
    onAddChart,
    scriptsById,
}) => {
    if (charts.length === 0) {
        return (
            <div className="chart-grid-empty" onClick={onAddChart}>
                <div className="chart-grid-empty-tile">
                    <span className="chart-grid-empty-plus">+</span>
                    <span>Add chart</span>
                </div>
            </div>
        );
    }

    return (
        <div className="chart-grid">
            {charts.map(chart => (
                <ChartPanel
                    key={chart.id}
                    chart={chart}
                    isActive={chart.id === activeChartId}
                    locked={locked}
                    activeTool={chart.id === activeChartId ? activeTool : 'cursor'}
                    magnetEnabled={magnetEnabled}
                    setActiveTool={setActiveTool}
                    onActivate={() => onActivate(chart.id)}
                    onClose={() => onClose(chart.id)}
                    onUpdate={onUpdate}
                    scriptsById={scriptsById}
                />
            ))}
        </div>
    );
};

export default ChartGrid;
