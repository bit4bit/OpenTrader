import { useState, useCallback } from 'react';
import axios from 'axios';

const AUTH_KEY = 'opentrader_auth';

function loadAuth() {
    try {
        const saved = JSON.parse(localStorage.getItem(AUTH_KEY));
        if (saved?.token && saved?.username) return saved;
    } catch (e) {
        console.warn('Failed to load auth:', e);
    }
    return null;
}

function applyToken(token) {
    if (token) {
        axios.defaults.headers.common['Authorization'] = `Token ${token}`;
    } else {
        delete axios.defaults.headers.common['Authorization'];
    }
}

export function useAuth() {
    const [auth, setAuth] = useState(() => {
        const saved = loadAuth();
        applyToken(saved?.token);
        return saved;
    });

    const login = useCallback(async (username) => {
        const response = await axios.post('/api/auth/login/', { username });
        const next = { token: response.data.token, username: response.data.username };
        localStorage.setItem(AUTH_KEY, JSON.stringify(next));
        applyToken(next.token);
        setAuth(next);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(AUTH_KEY);
        applyToken(null);
        setAuth(null);
    }, []);

    return { token: auth?.token ?? null, username: auth?.username ?? null, login, logout };
}
