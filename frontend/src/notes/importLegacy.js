// One-time import of the retired 🌍 global note (UserPreference.note)
// into the notes system: it becomes an undated journal note tagged
// 'imported'.

export const LEGACY_NOTE_TAG = 'imported';

export const legacyNotePayload = (text) => ({
    text,
    tags: [LEGACY_NOTE_TAG],
});
