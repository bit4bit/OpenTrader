// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../markdown';

describe('renderMarkdown', () => {
    it('renders headings, bold, lists and links', () => {
        const html = renderMarkdown('# Title\n\n**bold** text\n\n- item one\n- item two\n\nLook at [this](https://example.com)');
        expect(html).toContain('<h1>Title</h1>');
        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('<li>item one</li>');
        expect(html).toContain('<a href="https://example.com"');
    });

    it('renders GFM tables and strikethrough', () => {
        const html = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\ndone ~~soon~~');
        expect(html).toContain('<table>');
        expect(html).toContain('<del>soon</del>');
    });

    it('keeps plain-text line breaks as <br>', () => {
        const html = renderMarkdown('first line\nsecond line');
        expect(html).toContain('first line<br>second line');
    });

    it('strips scripts and unsafe markup', () => {
        const html = renderMarkdown('hello <script>alert(1)</script> <img src=x onerror=alert(1)> [click](javascript:alert(1))');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('onerror');
        expect(html).not.toContain('javascript:');
    });

    it('renders empty and nullish text to an empty string', () => {
        expect(renderMarkdown('')).toBe('');
        expect(renderMarkdown(null)).toBe('');
        expect(renderMarkdown(undefined)).toBe('');
    });
});
