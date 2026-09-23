import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const SAVE_DEBOUNCE_MS = 1000;

export function useSessions(enabled, onAuthFailed) {
    const onAuthFailedRef = useRef(onAuthFailed);
    useEffect(() => { onAuthFailedRef.current = onAuthFailed; }, [onAuthFailed]);
    const [sessions, setSessions] = useState([]);
    const [folders, setFolders] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [activeFolderId, setActiveFolderId] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const saveTimers = useRef(new Map());
    const pendingUpdates = useRef(new Map()); // sessionId -> { layout?, notes? }

    const flushSession = useCallback((sessionId) => {
        const timer = saveTimers.current.get(sessionId);
        if (timer != null) {
            clearTimeout(timer);
            saveTimers.current.delete(sessionId);
        }
        const update = pendingUpdates.current.get(sessionId);
        if (!update) return;
        pendingUpdates.current.delete(sessionId);
        axios.patch(`/api/sessions/${sessionId}/`, update)
            .catch(err => console.warn('Failed to save session:', err));
    }, []);

    const scheduleSave = useCallback((sessionId, fields) => {
        const update = pendingUpdates.current.get(sessionId) || {};
        pendingUpdates.current.set(sessionId, { ...update, ...fields });
        clearTimeout(saveTimers.current.get(sessionId));
        saveTimers.current.set(sessionId, setTimeout(() => flushSession(sessionId), SAVE_DEBOUNCE_MS));
    }, [flushSession]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        Promise.all([
            axios.get('/api/sessions/'),
            axios.get('/api/folders/'),
            axios.get('/api/preferences/'),
        ]).then(([sessionsRes, foldersRes, preferencesRes]) => {
            if (cancelled) return;
            setSessions(sessionsRes.data);
            setActiveSessionId(sessionsRes.data[0]?.id ?? null);
            setFolders(foldersRes.data);
            setActiveFolderId(preferencesRes.data.active_folder ?? null);
            setLoaded(true);
        }).catch(err => {
            console.warn('Failed to load sessions:', err);
            // A rejected token (e.g. server DB recreated) must not leave the
            // app in a logged-in-looking state where nothing persists.
            if (err?.response?.status === 401) onAuthFailedRef.current?.();
        });
        return () => { cancelled = true; };
    }, [enabled]);

    useEffect(() => () => {
        saveTimers.current.forEach((_, sessionId) => flushSession(sessionId));
    }, [flushSession]);

    useEffect(() => {
        const flushOnUnload = () => {
            pendingUpdates.current.forEach((update, sessionId) => {
                fetch(`/api/sessions/${sessionId}/`, {
                    method: 'PATCH',
                    keepalive: true,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': axios.defaults.headers.common['Authorization'] || '',
                    },
                    body: JSON.stringify(update),
                });
            });
        };
        window.addEventListener('beforeunload', flushOnUnload);
        return () => window.removeEventListener('beforeunload', flushOnUnload);
    }, []);

    const createSession = useCallback(async (name, folderId = null) => {
        const response = await axios.post('/api/sessions/', { name, folder: folderId });
        setSessions(prev => [...prev, response.data]);
        setActiveSessionId(response.data.id);
    }, []);

    const renameSession = useCallback(async (id, name) => {
        const response = await axios.patch(`/api/sessions/${id}/`, { name });
        setSessions(prev => prev.map(s => s.id === id ? response.data : s));
    }, []);

    const toggleSessionFlag = useCallback(async (id, flag) => {
        let nextValue = false;
        setSessions(prev => prev.map(s => {
            if (s.id !== id) return s;
            nextValue = !s[flag];
            return { ...s, [flag]: nextValue };
        }));
        try {
            await axios.patch(`/api/sessions/${id}/`, { [flag]: nextValue });
        } catch (err) {
            console.warn(`Failed to toggle session ${flag}:`, err);
        }
    }, []);

    const toggleFavoriteSession = useCallback((id) => toggleSessionFlag(id, 'favorite'), [toggleSessionFlag]);

    const togglePortfolioSession = useCallback((id) => toggleSessionFlag(id, 'portfolio'), [toggleSessionFlag]);

    const deleteSession = useCallback(async (id) => {
        clearTimeout(saveTimers.current.get(id));
        saveTimers.current.delete(id);
        pendingUpdates.current.delete(id);
        await axios.delete(`/api/sessions/${id}/`);
        setSessions(prev => {
            const next = prev.filter(s => s.id !== id);
            setActiveSessionId(current => current === id ? (next[0]?.id ?? null) : current);
            return next;
        });
    }, []);

    const switchSession = useCallback((id) => {
        setActiveSessionId(current => {
            if (current != null && current !== id) flushSession(current);
            return id;
        });
    }, [flushSession]);

    const saveLayout = useCallback((sessionId, layout) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, layout } : s));
        scheduleSave(sessionId, { layout });
    }, [scheduleSave]);

    const saveNotes = useCallback((sessionId, notes) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes } : s));
        scheduleSave(sessionId, { notes });
    }, [scheduleSave]);

    const activeSession = sessions.find(s => s.id === activeSessionId) || null;

    const createFolder = useCallback(async (name) => {
        const response = await axios.post('/api/folders/', { name });
        setFolders(prev => [...prev, response.data]);
        return response.data;
    }, []);

    const renameFolder = useCallback(async (id, name) => {
        const response = await axios.patch(`/api/folders/${id}/`, { name });
        setFolders(prev => prev.map(f => f.id === id ? response.data : f));
    }, []);

    const deleteFolder = useCallback(async (id) => {
        await axios.delete(`/api/folders/${id}/`);
        setFolders(prev => prev.filter(f => f.id !== id));
        setSessions(prev => prev.map(s => s.folder === id ? { ...s, folder: null } : s));
        setActiveFolderId(current => current === id ? null : current);
    }, []);

    const moveSession = useCallback(async (sessionId, folderId) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, folder: folderId } : s));
        try {
            await axios.patch(`/api/sessions/${sessionId}/`, { folder: folderId });
        } catch (err) {
            console.warn('Failed to move session:', err);
        }
    }, []);

    const setActiveFolder = useCallback((folderId) => {
        setActiveFolderId(folderId);
        axios.patch('/api/preferences/', { active_folder: folderId })
            .catch(err => console.warn('Failed to save active folder:', err));
    }, []);

    return {
        sessions,
        folders,
        activeSession,
        activeSessionId,
        activeFolderId,
        loaded,
        createSession,
        renameSession,
        deleteSession,
        toggleFavoriteSession,
        togglePortfolioSession,
        switchSession,
        saveLayout,
        saveNotes,
        createFolder,
        renameFolder,
        deleteFolder,
        moveSession,
        setActiveFolder,
    };
}
