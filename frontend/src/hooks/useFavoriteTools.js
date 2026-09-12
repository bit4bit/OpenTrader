import { useState, useCallback } from 'react';

const STORAGE_KEY = 'opentrader_favorite_tools';

const loadFavorites = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const useFavoriteTools = () => {
    const [favorites, setFavorites] = useState(loadFavorites);

    const toggleFavorite = useCallback((toolId) => {
        setFavorites(prev => {
            const next = prev.includes(toolId)
                ? prev.filter(id => id !== toolId)
                : [...prev, toolId];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    return { favorites, toggleFavorite };
};
