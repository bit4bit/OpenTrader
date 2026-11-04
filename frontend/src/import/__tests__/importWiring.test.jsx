// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TopBar from '../../components/TopBar';
import { useSessions } from '../../hooks/useSessions';

// The import flow crosses four components (TopBar → SessionMenu →
// SessionManagerModal → ImportCsvModal), several of which forward props
// explicitly — this guards the whole chain against a missing forward
// (which once left onImportSessions undefined and aborted every import
// right after the folder was created).

vi.mock('axios', () => ({
    default: {
        post: vi.fn(async (url, body) => {
            if (url === '/api/folders/') {
                return { data: { id: 9, name: body.name, created_at: 'x' } };
            }
            return { data: { id: 100, name: body.name, layout: { charts: [] }, notes: 'template notes' } };
        }),
        patch: vi.fn(async () => ({ data: {} })),
        get: vi.fn(async () => ({ data: [] })),
        defaults: { headers: { common: {} } },
    },
}));
import axios from 'axios';

const CSV_TEXT = 'Symbol,Company Name,Price\nPAYS,Paysign Inc.,15.36\nAAPL,Apple Inc.,230.10\n';
const SESSIONS = [{
    id: 5,
    name: 'Template',
    layout: { charts: [{ id: 'c', symbol: { symbol: 'AAPL', provider: 'yahoo' } }] },
}];

const Harness = () => {
    const state = useSessions(true);
    return (
        <TopBar
            sessions={SESSIONS}
            folders={state.folders}
            activeFolderId={null}
            onCreateFolder={name => state.createFolder(name.trim())}
            onImportSessions={(rows, options, onProgress) => state.importCsvSessions(rows, options, onProgress)}
            onSwitchSession={() => {}}
            onCreateSession={() => {}}
            onRenameSession={() => {}}
            onDeleteSession={() => {}}
            onRenameFolder={() => {}}
            onDeleteFolder={() => {}}
            onMoveSession={() => {}}
            onSetActiveFolder={() => {}}
            onToggleFavorite={() => {}}
            onTogglePortfolio={() => {}}
            onSetSessionStage={() => {}}
            onSetSessionDevelopment={() => {}}
            onToggleToolbar={() => {}}
        />
    );
};

const actTick = async () => { await act(async () => { await Promise.resolve(); }); };

const clickByText = async (element, text) => {
    const target = [...element.querySelectorAll('button')]
        .find(button => button.textContent.includes(text));
    expect(target, `no button containing "${text}"`).toBeTruthy();
    await act(async () => { target.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

const setNative = (el, value) => {
    Object.defineProperty(el, 'value', { value, configurable: true });
    el.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('CSV import wiring', () => {
    it('creates the folder and clones a session per selected row through TopBar', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        let root = createRoot(container);
        await act(async () => { root.render(<Harness />); });

        // open the sessions modal, then the import dialog
        const menuButton = container.querySelector('button[title^="Manage sessions"]');
        expect(menuButton).toBeTruthy();
        await act(async () => { menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        await clickByText(container, 'Import CSV');

        const input = container.querySelector('input[type="file"]');
        const file = new File([CSV_TEXT], 'IBD Sector Leaders.csv', { type: 'text/csv' });
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
        await actTick();

        expect(container.textContent).toContain('Paysign Inc.');

        const templateSelect = [...container.querySelectorAll('select')]
            .find(select => [...select.options].some(option => option.textContent.includes('Choose the session layout')));
        await act(async () => { setNative(templateSelect, '5'); });

        const button = container.querySelector('.csv-import-btn');
        expect(button.disabled).toBe(false);
        await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        await actTick();
        await actTick();

        const urls = axios.post.mock.calls.map(call => call[0]);
        expect(urls.filter(url => url === '/api/folders/')).toHaveLength(1);
        expect(urls.filter(url => url.endsWith('/clone/'))).toEqual([
            '/api/sessions/5/clone/',
            '/api/sessions/5/clone/',
        ]);
        const clones = axios.post.mock.calls.filter(call => call[0].endsWith('/clone/'));
        expect(clones.map(call => call[1])).toEqual([
            { name: 'PAYS · Paysign Inc.', new_symbol: 'PAYS', folder: 9 },
            { name: 'AAPL · Apple Inc.', new_symbol: 'AAPL', folder: 9 },
        ]);
        expect(container.querySelector('.csv-import-btn')).toBeNull();
        root.unmount();
    });
});
