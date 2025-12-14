/**
 * Markdown 解析测试
 */
import { describe, it, expect } from 'vitest';
import { parseMarkdown, htmlToMarkdown, editorToMarkdown } from './markdown';

describe('parseMarkdown', () => {
  describe('basic markdown', () => {
    it('should parse headings', () => {
      const result = parseMarkdown('# Heading 1');
      expect(result).toContain('<h1');
      expect(result).toContain('Heading 1');
    });

    it('should parse bold text', () => {
      const result = parseMarkdown('**bold text**');
      expect(result).toContain('<strong>bold text</strong>');
    });

    it('should parse italic text', () => {
      const result = parseMarkdown('*italic text*');
      expect(result).toContain('<em>italic text</em>');
    });

    it('should parse links', () => {
      const result = parseMarkdown('[link](https://example.com)');
      expect(result).toContain('<a');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('link');
    });

    it('should parse unordered lists', () => {
      const result = parseMarkdown('- item 1\n- item 2');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
      expect(result).toContain('item 1');
      expect(result).toContain('item 2');
    });

    it('should parse ordered lists', () => {
      const result = parseMarkdown('1. first\n2. second');
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>');
    });

    it('should parse code blocks', () => {
      const result = parseMarkdown('```js\nconst x = 1;\n```');
      expect(result).toContain('<pre>');
      expect(result).toContain('<code');
      expect(result).toContain('const x = 1;');
    });

    it('should parse inline code', () => {
      const result = parseMarkdown('use `const` keyword');
      expect(result).toContain('<code>const</code>');
    });
  });

  describe('Obsidian wiki links', () => {
    it('should parse simple wiki links', () => {
      const result = parseMarkdown('[[note name]]');
      expect(result).toContain('class="wikilink"');
      expect(result).toContain('data-wikilink="note name"');
      expect(result).toContain('note name');
    });

    it('should parse wiki links with display text', () => {
      const result = parseMarkdown('[[actual note|display text]]');
      expect(result).toContain('data-wikilink="actual note"');
      expect(result).toContain('display text');
    });
  });

  describe('callouts', () => {
    it('should parse note callout', () => {
      const result = parseMarkdown('> [!note] Title\n> Content');
      expect(result).toContain('class="callout');
      expect(result).toContain('callout-note');
    });

    it('should parse warning callout', () => {
      const result = parseMarkdown('> [!warning]\n> Be careful');
      expect(result).toContain('callout-warning');
    });

    it('should parse tip callout', () => {
      const result = parseMarkdown('> [!tip] Pro tip\n> Do this');
      expect(result).toContain('callout-tip');
      expect(result).toContain('callout-green');
    });
  });

  describe('math (KaTeX)', () => {
    it('should parse inline math', () => {
      const result = parseMarkdown('The equation $E=mc^2$ is famous');
      expect(result).toContain('katex');
    });

    it('should parse block math', () => {
      const result = parseMarkdown('$$\n\\int_0^1 x dx\n$$');
      expect(result).toContain('katex');
    });
  });

  describe('tags', () => {
    it('should parse tags', () => {
      const result = parseMarkdown('This has #tag1 and #tag2');
      expect(result).toContain('class="tag"');
      expect(result).toContain('data-tag="tag1"');
      expect(result).toContain('data-tag="tag2"');
    });

    it('should not parse tags in code blocks', () => {
      const result = parseMarkdown('```\n#notATag\n```');
      expect(result).not.toContain('class="tag"');
    });
  });

  describe('highlight', () => {
    it('should parse ==highlight== syntax', () => {
      const result = parseMarkdown('This is ==highlighted== text');
      expect(result).toContain('<mark>highlighted</mark>');
    });
  });

  describe('tables', () => {
    it('should wrap tables in container', () => {
      const table = '| a | b |\n|---|---|\n| 1 | 2 |';
      const result = parseMarkdown(table);
      expect(result).toContain('class="table-wrapper"');
      expect(result).toContain('<table>');
    });
  });

  describe('mermaid diagrams', () => {
    it('should parse mermaid code blocks', () => {
      const result = parseMarkdown('```mermaid\ngraph TD\nA-->B\n```');
      expect(result).toContain('class="mermaid-container"');
      expect(result).toContain('class="mermaid"');
    });
  });

  describe('error handling', () => {
    it('should handle empty input', () => {
      expect(parseMarkdown('')).toBe('');
    });

    it('should handle undefined input', () => {
      expect(parseMarkdown(undefined as any)).toBe('');
    });
  });
});

describe('htmlToMarkdown', () => {
  it('should convert simple HTML to markdown', () => {
    const result = htmlToMarkdown('<p>Hello</p>');
    expect(result.trim()).toBe('Hello');
  });

  it('should convert bold', () => {
    const result = htmlToMarkdown('<strong>bold</strong>');
    expect(result).toContain('**bold**');
  });

  it('should convert links', () => {
    const result = htmlToMarkdown('<a href="https://example.com">link</a>');
    expect(result).toContain('[link](https://example.com)');
  });

  it('should handle empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
  });
});

describe('editorToMarkdown', () => {
  it('should convert editor content', () => {
    const result = editorToMarkdown('<p>Hello <strong>world</strong></p>');
    expect(result).toContain('Hello');
    expect(result).toContain('**world**');
  });

  it('should handle empty paragraph', () => {
    expect(editorToMarkdown('<p></p>')).toBe('');
  });

  it('should handle empty input', () => {
    expect(editorToMarkdown('')).toBe('');
  });
});
