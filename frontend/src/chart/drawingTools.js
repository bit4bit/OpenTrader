// How many clicks each multi-point drawing tool needs before it commits.
export const REQUIRED_POINTS = {
    trend: 2,
    arrow: 2,
    ray: 2,
    extendedLine: 2,
    infoLine: 2,
    trendAngle: 2,
    rectangle: 2,
    rotatedRectangle: 3,
    circle: 2,
    ellipse: 2,
    triangle: 3,
    polyline: 4,
    curve: 3,
    doubleCurve: 4,
    arc: 3,
    xabcd: 5,
    cypher: 5,
    abcd: 4,
    threeDrives: 6,
    shark: 5,
    fiveO: 6,
    elliottImpulse: 5,
    elliottCorrection: 3,
    elliottTriangle: 5,
    elliottDoubleCombo: 3,
    elliottTripleCombo: 5,
    headAndShoulders: 7,
    trianglePattern: 4,
    wedgePattern: 4,
    rectanglePattern: 4,
    channelPattern: 3,
    doubleTop: 5,
    doubleBottom: 5,
    pitchfork: 3,
    schiffPitchfork: 3,
    modifiedSchiffPitchfork: 3,
    insidePitchfork: 3,
    regressionChannel: 3,
    buyLabel: 1,
    sellLabel: 1,
    arrowMark: 1,
    longPosition: 2,
    shortPosition: 2,
    riskReward: 2,
    forecast: 2,
    priceRange: 2,
    dateRange: 2,
    ghostFeed: 2,
    fibRetracement: 2,
    fibExtension: 3,
    fibSpeedArcs: 2,
    fibFan: 2,
    fibTimeZone: 2,
    fibChannel: 3,
    fibWedge: 3,
    fibSpiral: 2,
    fibCircles: 2,
    gannFan: 2,
    gannSquare: 2,
    gannBox: 2,
    parallelChannel: 3,
    flatTopBottom: 3,
    disjointChannel: 4,
    regressionTrend: 2,
};

// Tools that complete with a single click instead of accumulating points.
export const SINGLE_CLICK_TOOLS = ['horizontalLine', 'verticalLine', 'horizontalRay', 'crossLine'];

export const DEFAULT_DRAWING_COLOR = '#2962ff';
export const DEFAULT_LINE_WIDTH = 2;

export function isDrawingTool(tool) {
    return Boolean(tool) && tool !== 'cursor' && tool !== 'eraserOne';
}

export function createLineDrawing(tool, point, id) {
    return {
        id,
        type: tool,
        points: [point],
        p1: point,
        p2: point,
        color: DEFAULT_DRAWING_COLOR,
        lineWidth: DEFAULT_LINE_WIDTH,
    };
}

export function createMultiPointDrawing(tool, points, id) {
    return {
        id,
        type: tool,
        points,
        p1: points[0],
        p2: points[1],
        color: DEFAULT_DRAWING_COLOR,
        lineWidth: DEFAULT_LINE_WIDTH,
    };
}

export function createTextNote(point, id) {
    return {
        id,
        type: 'textNote',
        anchor: point,
        boxOffset: { dx: 20, dy: -50 },
        text: '',
        editing: true,
    };
}

export function createTextLabel(point, id) {
    return {
        id,
        type: 'textLabel',
        points: [point],
        p1: point,
        p2: point,
        color: DEFAULT_DRAWING_COLOR,
        text: '',
        editing: true,
    };
}

// Preview shape shown while a multi-point tool tracks the mouse.
export function buildPreviewDrawing(tool, pendingPoints, mousePoint) {
    return {
        type: tool,
        points: [...pendingPoints, mousePoint],
        p1: pendingPoints[0],
        p2: mousePoint,
    };
}
