import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const SAVE_DEBOUNCE_MS = 1000;

export function useSessions(enabled) {
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
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
        axios.get('/api/sessions/').then(response => {
            if (cancelled) return;
            setSessions(response.data);
            setActiveSessionId(response.data[0]?.id ?? null);
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

    const createSession = useCallback(async (name) => {
        const response = await axios.post('/api/sessions/', { name });
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

    return {
        sessions,
        activeSession,
        activeSessionId,
        loaded,
        createSession,
        renameSession,
        deleteSession,
        switchSession,
        saveLayout,
    };
}
