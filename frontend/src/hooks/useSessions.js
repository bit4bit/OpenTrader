import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const SAVE_DEBOUNCE_MS = 1000;

export function useSessions(enabled) {
    const [sessions, setSessions] = useState([]);
    const [folders, setFolders] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [activeFolderId, setActiveFolderId] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const saveTimers = useRef(new Map());
    const pendingLayouts = useRef(new Map());

    const flushLayout = useCallback((sessionId) => {
        const timer = saveTimers.current.get(sessionId);
        if (timer == null) return;
        clearTimeout(timer);
        saveTimers.current.delete(sessionId);
        const layout = pendingLayouts.current.get(sessionId);
        pendingLayouts.current.delete(sessionId);
        axios.patch(`/api/sessions/${sessionId}/`, { layout })
            .catch(err => console.warn('Failed to save layout:', err));
    }, []);

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
        }).catch(err => console.warn('Failed to load sessions:', err));
        return () => { cancelled = true; };
    }, [enabled]);

    useEffect(() => () => {
        saveTimers.current.forEach((_, sessionId) => flushLayout(sessionId));
    }, [flushLayout]);

    useEffect(() => {
        const flushOnUnload = () => {
            pendingLayouts.current.forEach((layout, sessionId) => {
                fetch(`/api/sessions/${sessionId}/`, {
                    method: 'PATCH',
                    keepalive: true,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': axios.defaults.headers.common['Authorization'] || '',
                    },
                    body: JSON.stringify({ layout }),
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

    const deleteSession = useCallback(async (id) => {
        clearTimeout(saveTimers.current.get(id));
        saveTimers.current.delete(id);
        pendingLayouts.current.delete(id);
        await axios.delete(`/api/sessions/${id}/`);
        setSessions(prev => {
            const next = prev.filter(s => s.id !== id);
            setActiveSessionId(current => current === id ? (next[0]?.id ?? null) : current);
            return next;
        });
    }, []);

    const switchSession = useCallback((id) => {
        setActiveSessionId(current => {
            if (current != null && current !== id) flushLayout(current);
            return id;
        });
    }, [flushLayout]);

    const saveLayout = useCallback((sessionId, layout) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, layout } : s));
        pendingLayouts.current.set(sessionId, layout);
        clearTimeout(saveTimers.current.get(sessionId));
        saveTimers.current.set(sessionId, setTimeout(() => flushLayout(sessionId), SAVE_DEBOUNCE_MS));
    }, [flushLayout]);

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
        switchSession,
        saveLayout,
        createFolder,
        renameFolder,
        deleteFolder,
        moveSession,
        setActiveFolder,
    };
}
