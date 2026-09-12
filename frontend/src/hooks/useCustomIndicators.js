import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

/**
 * Custom indicator scripts stored server-side (owner-scoped).
 * `scriptsById` doubles as the render-time cache for Chart.jsx.
 */
export function useCustomIndicators(enabled) {
    const [scripts, setScripts] = useState([]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        axios.get('/api/indicators/').then(response => {
            if (!cancelled) setScripts(response.data);
        }).catch(err => console.warn('Failed to load custom indicators:', err));
        return () => { cancelled = true; };
    }, [enabled]);

    const createScript = useCallback(async (name, code) => {
        const response = await axios.post('/api/indicators/', { name, code });
        setScripts(prev => [...prev, response.data]);
        return response.data;
    }, []);

    const updateScript = useCallback(async (id, updates) => {
        const response = await axios.patch(`/api/indicators/${id}/`, updates);
        setScripts(prev => prev.map(s => s.id === id ? response.data : s));
        return response.data;
    }, []);

    const deleteScript = useCallback(async (id) => {
        await axios.delete(`/api/indicators/${id}/`);
        setScripts(prev => prev.filter(s => s.id !== id));
    }, []);

    const scriptsById = useMemo(() => Object.fromEntries(scripts.map(s => [s.id, s])), [scripts]);

    return { scripts, scriptsById, createScript, updateScript, deleteScript };
}
