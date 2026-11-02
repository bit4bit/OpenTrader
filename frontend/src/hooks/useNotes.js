import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Global per-user notes (not session-scoped): pinned markers show on
// every chart of the matching symbol.
export function useNotes(enabled) {
    const [notes, setNotes] = useState([]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        axios.get('/api/notes/')
            .then(res => { if (!cancelled) setNotes(res.data); })
            .catch(err => console.warn('Failed to load notes:', err));
        return () => { cancelled = true; };
    }, [enabled]);

    const addNote = useCallback((data) =>
        axios.post('/api/notes/', data).then(res => {
            setNotes(prev => [...prev, res.data]);
            return res.data;
        }), []);

    const updateNote = useCallback((id, data) =>
        axios.patch(`/api/notes/${id}/`, data).then(res => {
            setNotes(prev => prev.map(n => (n.id === id ? res.data : n)));
            return res.data;
        }), []);

    const deleteNote = useCallback((id) =>
        axios.delete(`/api/notes/${id}/`).then(() => {
            setNotes(prev => prev.filter(n => n.id !== id));
        }), []);

    return { notes, addNote, updateNote, deleteNote };
}
