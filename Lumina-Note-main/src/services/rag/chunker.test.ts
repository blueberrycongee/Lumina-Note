/**
 * MarkdownChunker 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MarkdownChunker } from './chunker';
import type { RAGConfig } from './types';

const defaultConfig: RAGConfig = {
  enabled: true,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  rerankerEnabled: false,
  chunkSize: 500,
  chunkOverlap: 50,
  minScore: 0.5,
  maxResults: 10,
};

describe('MarkdownChunker', () => {
  let chunker: MarkdownChunker;

  beforeEach(() => {
    chunker = new MarkdownChunker(defaultConfig);
  });

  describe('chunk', () => {
    it('should return empty array for empty content', () => {
      const result = chunker.chunk('', '/test.md');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace only', () => {
      const result = chunker.chunk('   \n\n   ', '/test.md');
      expect(result).toEqual([]);
    });

    it('should create single chunk for small content', () => {
      const content = '# Title\n\nSome content here.';
      const result = chunker.chunk(content, '/note.md');
      
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('Title');
      expect(result[0].content).toContain('Some content');
    });

    it('should split on headings', () => {
      const content = `# Section 1

Content for section 1.

## Section 2

Content for section 2.`;
      
      const result = chunker.chunk(content, '/note.md');
      
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].metadata.heading).toBe('Section 1');
    });

    it('should include file path in metadata', () => {
      const content = '# Test\n\nContent';
      const result = chunker.chunk(content, '/path/to/note.md');
      
      expect(result[0].metadata.filePath).toBe('/path/to/note.md');
    });

    it('should generate unique chunk IDs', () => {
      const content = `# Section 1

Content 1

## Section 2

Content 2`;
      
      const result = chunker.chunk(content, '/note.md');
      const ids = result.map(c => c.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should include line numbers in metadata', () => {
      const content = '# Title\n\nLine 2\nLine 3';
      const result = chunker.chunk(content, '/note.md');
      
      expect(result[0].metadata.startLine).toBeDefined();
      expect(result[0].metadata.endLine).toBeDefined();
    });

    it('should extract title from first heading', () => {
      const content = '# My Document\n\nContent';
      const result = chunker.chunk(content, '/file.md');
      
      expect(result[0].metadata.heading).toBe('My Document');
    });

    it('should use filename when no heading present', () => {
      const content = 'Just some content without heading';
      const result = chunker.chunk(content, '/my-note.md');
      
      expect(result[0].metadata.heading).toBe('my-note');
    });

    it('should include fileModified when provided', () => {
      const content = '# Test\n\nContent';
      const modified = Date.now();
      const result = chunker.chunk(content, '/note.md', modified);
      
      expect(result[0].metadata.fileModified).toBe(modified);
    });

    it('should handle nested headings', () => {
      const content = `# H1

Content

## H2

More content

### H3

Even more`;
      
      const result = chunker.chunk(content, '/note.md');
      
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('updateConfig', () => {
    it('should update chunk size', () => {
      chunker.updateConfig({ ...defaultConfig, chunkSize: 200 });
      
      // Create content that would be single chunk with 500 but multiple with 200
      const longContent = '# Title\n\n' + 'A'.repeat(300) + '\n\n## Section 2\n\n' + 'B'.repeat(300);
      const result = chunker.chunk(longContent, '/note.md');
      
      // Should have more chunks with smaller chunk size
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('edge cases', () => {
    it('should handle content with only headings', () => {
      const content = '# H1\n## H2\n### H3';
      const result = chunker.chunk(content, '/note.md');
      
      // Should create chunks even for heading-only content
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle very long lines', () => {
      const longLine = 'A'.repeat(1000);
      const content = `# Title\n\n${longLine}`;
      
      // Should not throw
      const result = chunker.chunk(content, '/note.md');
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle special characters', () => {
      const content = '# 中文标题\n\n内容 with émojis 🎉';
      const result = chunker.chunk(content, '/note.md');
      
      expect(result[0].content).toContain('中文标题');
      expect(result[0].content).toContain('🎉');
    });

    it('should handle code blocks', () => {
      const content = `# Code Example

\`\`\`javascript
function test() {
  return true;
}
\`\`\`

After code.`;
      
      const result = chunker.chunk(content, '/note.md');
      expect(result[0].content).toContain('function test');
    });

    it('should handle lists', () => {
      const content = `# List

- Item 1
- Item 2
- Item 3

1. Numbered 1
2. Numbered 2`;
      
      const result = chunker.chunk(content, '/note.md');
      expect(result[0].content).toContain('Item 1');
    });
  });
});
