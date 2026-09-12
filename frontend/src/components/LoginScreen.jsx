import React, { useState } from 'react';

const LoginScreen = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!username.trim()) return;
        setLoading(true);
        setError(null);
        try {
            await onLogin(username.trim());
        } catch {
            setError('Login failed. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            backgroundColor: '#0f0f1a',
        }}>
            <form onSubmit={submit} style={{
                backgroundColor: '#1a1a2e',
                padding: '32px',
                borderRadius: '12px',
                border: '1px solid #333',
                width: '320px',
                textAlign: 'center',
            }}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', color: '#4fc3f7' }}>Open Trader</h2>
                <input
                    autoFocus
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px 12px',
                        marginBottom: '12px',
                        borderRadius: '6px',
                        border: '1px solid #444',
                        backgroundColor: '#0f0f1a',
                        color: '#fff',
                        fontSize: '14px',
                    }}
                />
                {error && <p style={{ color: '#ff6b6b', fontSize: '13px', margin: '0 0 12px 0' }}>{error}</p>}
                <button
                    type="submit"
                    disabled={loading || !username.trim()}
                    style={{
                        width: '100%',
                        backgroundColor: '#4fc3f7',
                        color: '#000',
                        border: 'none',
                        padding: '10px 0',
                        borderRadius: '6px',
                        fontSize: '15px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                    }}
                >
                    {loading ? 'Logging in…' : 'Log in'}
                </button>
            </form>
        </div>
    );
};

export default LoginScreen;
