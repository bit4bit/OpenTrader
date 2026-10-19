import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Global per-user tracked positions (not session-scoped): the same marker
// set shows on every chart of a matching symbol.
export function usePositions(enabled) {
    const [positions, setPositions] = useState([]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        axios.get('/api/positions/')
            .then(res => { if (!cancelled) setPositions(res.data); })
            .catch(err => console.warn('Failed to load positions:', err));
        return () => { cancelled = true; };
    }, [enabled]);

    const addPosition = useCallback((data) =>
        axios.post('/api/positions/', data).then(res => {
            setPositions(prev => [...prev, res.data]);
            return res.data;
        }), []);

    const updatePosition = useCallback((id, data) =>
        axios.patch(`/api/positions/${id}/`, data).then(res => {
            setPositions(prev => prev.map(p => (p.id === id ? res.data : p)));
            return res.data;
        }), []);

    const deletePosition = useCallback((id) =>
        axios.delete(`/api/positions/${id}/`).then(() => {
            setPositions(prev => prev.filter(p => p.id !== id));
        }), []);

    return { positions, addPosition, updatePosition, deletePosition };
}
