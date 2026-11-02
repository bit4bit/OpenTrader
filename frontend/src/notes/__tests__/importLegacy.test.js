import { describe, it, expect } from 'vitest';
import { legacyNotePayload, LEGACY_NOTE_TAG } from '../importLegacy';

describe('legacyNotePayload', () => {
    it('turns the preference note into an imported journal note', () => {
        expect(legacyNotePayload('macro thoughts')).toEqual({
            text: 'macro thoughts',
            tags: [LEGACY_NOTE_TAG],
        });
    });
});
