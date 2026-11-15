// @vitest-environment jsdom

// useMarketIndexData's data feeds useIndicatorResults, which memoizes on
// object identity. Without multi-symbol indicators (the common chart), the
// returned data object must stay referentially stable across re-renders —
// a fresh {} per render would recompute every indicator script per render.

import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useMarketIndexData } from '../useChartData';

vi.mock('axios', () => ({
    default: {
        get: vi.fn(async () => ({ data: [] })),
        defaults: { headers: { common: {} } },
    },
}));

const Probe = ({ identities }) => {
    const { data } = useMarketIndexData([], '1d');
    identities.push(data);
    return null;
};

const Bumper = ({ identities }) => {
    const [, setCount] = React.useState(0);
    return (
        <>
            <button onClick={() => setCount(c => c + 1)}>bump</button>
            <Probe identities={identities} />
        </>
    );
};

describe('useMarketIndexData', () => {
    it('returns a stable data identity across re-renders', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const identities = [];

        await act(async () => {
            root.render(<Bumper identities={identities} />);
        });
        const bump = container.querySelector('button');
        for (let i = 0; i < 3; i++) {
            await act(async () => {
                bump.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
        }

        expect(identities.length).toBe(4);
        expect(new Set(identities).size).toBe(1);

        act(() => { root.unmount(); });
        container.remove();
    });
});
