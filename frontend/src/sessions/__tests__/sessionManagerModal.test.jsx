// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SessionMenu from '../../components/SessionMenu';
import SessionManagerModal from '../../components/SessionManagerModal';

// Reopening the manager must land where the user left it: the last sidebar
// view survives toolbar toggles (which unmount the TopBar) and reloads, and
// the highlighted session is scrolled into view instead of hiding below the
// fold in long views.

vi.mock('axios', () => ({
    default: {
        get: vi.fn(async () => ({ data: [] })),
        post: vi.fn(async () => ({ data: {} })),
        patch: vi.fn(async () => ({ data: {} })),
        defaults: { headers: { common: {} } },
    },
}));

const SESSIONS = [
    { id: 1, name: 'AAPL daily', favorite: true, updated_at: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'BTC swing', favorite: false, updated_at: '2026-03-01T00:00:00Z' },
];

const renderSessionManager = async (props) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(<SessionManagerModal onClose={() => {}} {...props} />);
    });
    return { container, root };
};

const openMenu = async (container) => {
    const menuButton = container.querySelector('button[title^="Manage sessions"]');
    expect(menuButton).toBeTruthy();
    await act(async () => { menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

const clickElement = async (element) => {
    await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

describe('SessionManagerModal', () => {
    it('scrolls the active session row into view when opened', async () => {
        // jsdom has no scrollIntoView; capture the call instead.
        let scrolled = null;
        const originalScrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function scrollIntoView(...args) { scrolled = { element: this, args }; };
        try {
            const { root } = await renderSessionManager({
                sessions: SESSIONS,
                folders: [],
                activeSession: SESSIONS[1],
                initialViewId: 'all',
            });

            expect(scrolled).toBeTruthy();
            expect(scrolled.element.className).toContain('sm-row active');
            expect(scrolled.element.textContent).toContain('BTC swing');
            expect(scrolled.args).toEqual([{ block: 'nearest' }]);
            root.unmount();
        } finally {
            Element.prototype.scrollIntoView = originalScrollIntoView;
        }
    });
});

describe('SessionMenu sidebar view restoration', () => {
    beforeEach(() => { localStorage.clear(); });

    it('reopens on the last viewed sidebar item', async () => {
        localStorage.setItem('opentrader_session_view', 'favorites');
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(<SessionMenu
                sessions={SESSIONS}
                folders={[{ id: 7, name: 'Tech' }]}
                activeSession={null}
                activeFolderId={null}
                onSwitchSession={() => {}}
                onSetActiveFolder={() => {}}
            />);
        });

        await openMenu(container);

        const favoritesItem = [...container.querySelectorAll('.sm-side-item')]
            .find(item => item.textContent.includes('Favorites'));
        expect(favoritesItem.className).toContain('active');
        expect(container.textContent).toContain('AAPL daily');
        expect(container.textContent).not.toContain('BTC swing');
        root.unmount();
    });

    it('falls back to all sessions when the stored folder was deleted', async () => {
        localStorage.setItem('opentrader_session_view', 'folder:99');
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(<SessionMenu
                sessions={SESSIONS}
                folders={[]}
                activeSession={null}
                activeFolderId={null}
                onSwitchSession={() => {}}
                onSetActiveFolder={() => {}}
            />);
        });

        await openMenu(container);

        const allItem = [...container.querySelectorAll('.sm-side-item')]
            .find(item => item.textContent.includes('All sessions'));
        const favoritesItem = [...container.querySelectorAll('.sm-side-item')]
            .find(item => item.textContent.includes('Favorites'));
        expect(allItem.className).toContain('active');
        expect(favoritesItem.className).not.toContain('active');
        expect(container.textContent).toContain('AAPL daily');
        expect(container.textContent).toContain('BTC swing');
        root.unmount();
    });

    it('stores the view the user picks', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(<SessionMenu
                sessions={SESSIONS}
                folders={[]}
                activeSession={null}
                activeFolderId={null}
                onSwitchSession={() => {}}
                onSetActiveFolder={() => {}}
            />);
        });

        await openMenu(container);
        const favoritesItem = [...container.querySelectorAll('.sm-side-item')]
            .find(item => item.textContent.includes('Favorites'));
        await clickElement(favoritesItem);

        expect(localStorage.getItem('opentrader_session_view')).toBe('favorites');
        root.unmount();
    });
});
