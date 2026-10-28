const FOLDER_VIEW_PREFIX = 'folder:';
const STAGE_VIEW_PREFIX = 'stage:';

export const STAGES = [1, 2, 3, 4];

const SMART_VIEW_FILTERS = {
    all: () => true,
    favorites: session => !!session.favorite,
    portfolio: session => !!session.portfolio,
    uncategorized: session => session.folder == null,
};

export const folderViewId = (folderId) => `${FOLDER_VIEW_PREFIX}${folderId}`;

export const folderIdFromView = (viewId) =>
    viewId.startsWith(FOLDER_VIEW_PREFIX) ? Number(viewId.slice(FOLDER_VIEW_PREFIX.length)) : null;

export const stageViewId = (stage) => `${STAGE_VIEW_PREFIX}${stage}`;

export const stageFromView = (viewId) =>
    viewId.startsWith(STAGE_VIEW_PREFIX) ? Number(viewId.slice(STAGE_VIEW_PREFIX.length)) : null;

export const sessionsInView = (sessions, viewId) => {
    const folderId = folderIdFromView(viewId);
    if (folderId != null) return sessions.filter(session => session.folder === folderId);
    const stage = stageFromView(viewId);
    if (stage != null) return sessions.filter(session => session.stage === stage);
    const filter = SMART_VIEW_FILTERS[viewId] || SMART_VIEW_FILTERS.all;
    return sessions.filter(filter);
};

export const filterByQuery = (sessions, folders, query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return sessions;
    const folderNames = new Map(folders.map(folder => [folder.id, folder.name.toLowerCase()]));
    return sessions.filter(session =>
        session.name.toLowerCase().includes(q) ||
        (session.folder != null && (folderNames.get(session.folder) || '').includes(q))
    );
};

export const sortSessions = (sessions, sort) => {
    const sorted = [...sessions];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    return sorted;
};

export const countSessions = (sessions, folders) => {
    const byFolder = new Map(folders.map(folder => [folder.id, 0]));
    const byStage = new Map(STAGES.map(stage => [stage, 0]));
    let uncategorized = 0;
    let favorites = 0;
    let portfolio = 0;
    for (const session of sessions) {
        if (session.folder == null) uncategorized += 1;
        else if (byFolder.has(session.folder)) byFolder.set(session.folder, byFolder.get(session.folder) + 1);
        if (session.favorite) favorites += 1;
        if (session.portfolio) portfolio += 1;
        if (byStage.has(session.stage)) byStage.set(session.stage, byStage.get(session.stage) + 1);
    }
    return { byFolder, uncategorized, favorites, portfolio, byStage, total: sessions.length };
};
