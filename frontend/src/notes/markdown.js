// Note-text rendering: markdown to sanitized HTML. `breaks` keeps plain
// multi-line notes (single newlines become line breaks) and GFM adds
// tables/strikethrough/task lists; DOMPurify strips scripts and unsafe
// markup, so user-authored notes can't inject HTML.
import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

export const renderMarkdown = (text) =>
    DOMPurify.sanitize(marked.parse(String(text ?? '')));
