import React from 'react';
import { useFavoriteTools } from '../hooks/useFavoriteTools';

const DrawingToolbar = ({ activeTool, onSelectTool }) => {
    const [openCategory, setOpenCategory] = React.useState(null);
    const { favorites, toggleFavorite } = useFavoriteTools();

    const categories = [
        {
            id: 'cursor_cat',
            type: 'single',
            tool: { id: 'cursor', icon: '↖️', label: 'Cursor' }
        },
        {
            id: 'trend_cat',
            type: 'group',
            label: 'Trend Line Tools',
            icon: '╱',
            tools: [
                { id: 'trend', icon: '╱', label: 'Trend Line' },
                { id: 'arrow', icon: '↗', label: 'Arrow' },
                { id: 'ray', icon: '→', label: 'Ray' },
                { id: 'extendedLine', icon: '⟷', label: 'Extended Line' },
                { id: 'infoLine', icon: 'ⓘ', label: 'Info Line' },
                { id: 'trendAngle', icon: '∠', label: 'Trend Angle' },
                { id: 'horizontalLine', icon: '―', label: 'Horizontal Line' },
                { id: 'horizontalRay', icon: '⎯→', label: 'Horizontal Ray' },
                { id: 'verticalLine', icon: '｜', label: 'Vertical Line' },
                { id: 'crossLine', icon: '╓', label: 'Cross Line' },
            ]
        },
        {
            id: 'channels_cat',
            type: 'group',
            label: 'Channels',
            icon: '▚',
            tools: [
                { id: 'parallelChannel', icon: '⫖', label: 'Parallel Channel' },
                { id: 'regressionTrend', icon: '📈', label: 'Regression Trend' },
                { id: 'flatTopBottom', icon: '⌸', label: 'Flat Top / Bottom' },
                { id: 'disjointChannel', icon: '⩕', label: 'Disjoint Channel' },
            ]
        },
        {
            id: 'shapes_cat',
            type: 'group',
            label: 'Shapes',
            icon: '⬛',
            tools: [
                { id: 'rectangle', icon: '⬜', label: 'Rectangle' },
                { id: 'rotatedRectangle', icon: '▱', label: 'Rotated Rectangle' },
                { id: 'circle', icon: '○', label: 'Circle' },
                { id: 'ellipse', icon: '◯', label: 'Ellipse' },
                { id: 'triangle', icon: '△', label: 'Triangle' },
                { id: 'polyline', icon: '⌇', label: 'Polyline' },
                { id: 'curve', icon: '⌒', label: 'Curve' },
                { id: 'doubleCurve', icon: '∼', label: 'Double Curve' },
                { id: 'arc', icon: '◡', label: 'Arc' },
            ]
        },
        {
            id: 'annotations_cat',
            type: 'group',
            label: 'Annotations',
            icon: '💬',
            tools: [
                { id: 'buyLabel', icon: '🏷️⬆️', label: 'Buy Label' },
                { id: 'sellLabel', icon: '🏷️⬇️', label: 'Sell Label' },
                { id: 'arrowMark', icon: '➚', label: 'Arrow Mark' },
                { id: 'textNote', icon: '📝', label: 'Text Note' },
            ]
        },
        {
            id: 'measure_cat',
            type: 'group',
            label: 'Prediction & Risk',
            icon: '📏',
            tools: [
                { id: 'longPosition', icon: '📈', label: 'Long Position' },
                { id: 'shortPosition', icon: '📉', label: 'Short Position' },
                { id: 'riskReward', icon: '⚖️', label: 'Risk/Reward Tool' },
                { id: 'forecast', icon: '🔮', label: 'Forecast' },
                { id: 'priceRange', icon: '↕', label: 'Price Range' },
                { id: 'dateRange', icon: '↔', label: 'Date Range' },
                { id: 'ghostFeed', icon: '👻', label: 'Ghost Feed' },
            ]
        },
        {
            id: 'patterns_cat',
            type: 'group',
            label: 'Patterns',
            icon: '📉',
            tools: [
                { id: 'xabcd', icon: '🗠', label: 'XABCD Pattern' },
                { id: 'cypher', icon: '⬡', label: 'Cypher Pattern' },
                { id: 'abcd', icon: '⩉', label: 'ABCD Pattern' },
                { id: 'threeDrives', icon: '🌊', label: 'Three Drives Pattern' },
                { id: 'shark', icon: '🦈', label: 'Shark Pattern' },
                { id: 'fiveO', icon: '⚄', label: '5-0 Pattern' },
                { id: 'elliottImpulse', icon: '①', label: 'Elliott Impulse Wave' },
                { id: 'elliottCorrection', icon: 'Ⓐ', label: 'Elliott Correction' },
                { id: 'elliottTriangle', icon: '⊿', label: 'Elliott Triangle' },
                { id: 'elliottDoubleCombo', icon: 'Ⓦ', label: 'Elliott Double Combo' },
                { id: 'elliottTripleCombo', icon: 'ⓩ', label: 'Elliott Triple Combo' },
                { id: 'headAndShoulders', icon: '👤', label: 'Head & Shoulders' },
                { id: 'trianglePattern', icon: '▽', label: 'Triangle Pattern' },
                { id: 'wedgePattern', icon: '◹', label: 'Wedge Pattern' },
                { id: 'rectanglePattern', icon: '▭', label: 'Rectangle Pattern' },
                { id: 'channelPattern', icon: '⫖', label: 'Channel Pattern' },
                { id: 'doubleTop', icon: '⩰', label: 'Double Top' },
                { id: 'doubleBottom', icon: '⩯', label: 'Double Bottom' },
            ]
        },
        {
            id: 'pitchfork_cat',
            type: 'group',
            label: 'Pitchfork & Advanced',
            icon: 'ψ',
            tools: [
                { id: 'pitchfork', icon: 'ψ', label: 'Pitchfork' },
                { id: 'schiffPitchfork', icon: '⚔', label: 'Schiff Pitchfork' },
                { id: 'modifiedSchiffPitchfork', icon: '⚔', label: 'Modified Schiff Pitchfork' },
                { id: 'insidePitchfork', icon: '⩰', label: 'Inside Pitchfork' },
                { id: 'regressionChannel', icon: '📈', label: 'Regression Channel' },
            ]
        },
        {
            id: 'fib_cat',
            type: 'group',
            label: 'Gann & Fibonacci',
            icon: '≡',
            tools: [
                { id: 'fibRetracement', icon: '≡', label: 'Fib Retracement' },
                { id: 'fibExtension', icon: '↗', label: 'Trend-Based Fib Extension' },
                { id: 'fibSpeedArcs', icon: '➰', label: 'Fib Speed Resistance Arcs' },
                { id: 'fibFan', icon: '∠', label: 'Fib Fan' },
                { id: 'fibTimeZone', icon: '◴', label: 'Fib Time Zone' },
                { id: 'fibChannel', icon: '⧬', label: 'Fib Channel' },
                { id: 'fibWedge', icon: '◹', label: 'Fib Wedge' },
                { id: 'fibSpiral', icon: '🌀', label: 'Fib Spiral' },
                { id: 'fibCircles', icon: '◎', label: 'Fib Circles' },
                { id: 'gannFan', icon: '📐', label: 'Gann Fan' },
                { id: 'gannSquare', icon: '⊞', label: 'Gann Square' },
                { id: 'gannBox', icon: '⊠', label: 'Gann Box' },
            ]
        },
        {
            id: 'eraser_cat',
            type: 'single',
            tool: { id: 'eraserOne', icon: '🧽', label: 'Erase Drawing' }
        },
        {
            id: 'utils_cat',
            type: 'single',
            tool: { id: 'eraser', icon: '🧹', label: 'Clear All' }
        }
    ];

    const handleToolSelect = (toolId) => {
        onSelectTool(toolId);
        setOpenCategory(null);
    };

    const allTools = categories.flatMap(cat => cat.type === 'single' ? [cat.tool] : cat.tools);
    const favoriteTools = favorites
        .map(id => allTools.find(t => t.id === id))
        .filter(Boolean);

    return (
        <div className="drawing-toolbar">
            <div className="toolbar-category-container">
                <button
                    className={`drawing-tool-btn group-btn favorites-toggle ${favoriteTools.some(t => t.id === activeTool) ? 'active' : ''}`}
                    onClick={() => setOpenCategory(openCategory === 'favorites_cat' ? null : 'favorites_cat')}
                    title="Favorites"
                >
                    <span className="tool-icon">★</span>
                    <span className="category-arrow">›</span>
                </button>

                {openCategory === 'favorites_cat' && (
                    <div className="tool-flyout">
                        <div className="flyout-header">Favorites</div>
                        <div className="flyout-grid">
                            {favoriteTools.length === 0 && (
                                <div className="flyout-empty">No favorites yet. Star a tool in any category.</div>
                            )}
                            {favoriteTools.map(tool => (
                                <button
                                    key={tool.id}
                                    className={`flyout-tool-btn ${activeTool === tool.id ? 'active' : ''}`}
                                    onClick={() => handleToolSelect(tool.id)}
                                    title={tool.label}
                                >
                                    <span className="tool-icon">{tool.icon}</span>
                                    <span className="tool-label">{tool.label}</span>
                                    <span
                                        className="flyout-star starred"
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(tool.id); }}
                                        title="Remove from favorites"
                                    >
                                        ★
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div className="toolbar-divider" />
            {categories.map((cat) => (
                <div key={cat.id} className="toolbar-category-container">
                    {cat.type === 'single' ? (
                        <button
                            className={`drawing-tool-btn ${activeTool === cat.tool.id ? 'active' : ''}`}
                            onClick={() => onSelectTool(cat.tool.id)}
                            title={cat.tool.label}
                        >
                            <span className="tool-icon">{cat.tool.icon}</span>
                        </button>
                    ) : (
                        <>
                            <button
                                className={`drawing-tool-btn group-btn ${cat.tools.some(t => t.id === activeTool) ? 'active' : ''}`}
                                onClick={() => setOpenCategory(openCategory === cat.id ? null : cat.id)}
                                title={cat.label}
                            >
                                <span className="tool-icon">{cat.icon}</span>
                                <span className="category-arrow">›</span>
                            </button>

                            {openCategory === cat.id && (
                                <div className="tool-flyout">
                                    <div className="flyout-header">{cat.label}</div>
                                    <div className="flyout-grid">
                                        {cat.tools.map(tool => (
                                            <button
                                                key={tool.id}
                                                className={`flyout-tool-btn ${activeTool === tool.id ? 'active' : ''}`}
                                                onClick={() => handleToolSelect(tool.id)}
                                                title={tool.label}
                                            >
                                                <span className="tool-icon">{tool.icon}</span>
                                                <span className="tool-label">{tool.label}</span>
                                                <span
                                                    className={`flyout-star ${favorites.includes(tool.id) ? 'starred' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); toggleFavorite(tool.id); }}
                                                    title={favorites.includes(tool.id) ? 'Remove from favorites' : 'Add to favorites'}
                                                >
                                                    {favorites.includes(tool.id) ? '★' : '☆'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ))}
        </div>
    );
};

export default DrawingToolbar;
