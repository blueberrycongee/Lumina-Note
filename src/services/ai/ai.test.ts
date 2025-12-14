/**
 * AI 工具函数测试
 */
import { describe, it, expect } from 'vitest';
import { 
  parseFileReferences, 
  parseEditSuggestions, 
  applyEdit,
  type EditSuggestion 
} from './ai';

describe('parseFileReferences', () => {
  it('should parse @[filename] format', () => {
    const message = 'Please look at @[notes/test.md] and @[docs/readme.md]';
    const result = parseFileReferences(message);
    expect(result).toEqual(['notes/test.md', 'docs/readme.md']);
  });

  it('should parse @filename.md format', () => {
    const message = 'Check @test.md and @another.md';
    const result = parseFileReferences(message);
    expect(result).toEqual(['test.md', 'another.md']);
  });

  it('should parse mixed formats', () => {
    const message = 'See @[folder/file.md] and @simple.md';
    const result = parseFileReferences(message);
    expect(result).toEqual(['folder/file.md', 'simple.md']);
  });

  it('should return empty array for no references', () => {
    const message = 'No file references here';
    const result = parseFileReferences(message);
    expect(result).toEqual([]);
  });

  it('should handle empty string', () => {
    const result = parseFileReferences('');
    expect(result).toEqual([]);
  });
});

describe('parseEditSuggestions', () => {
  it('should parse single edit suggestion', () => {
    const response = `
Here is my suggestion:
<edit file="test.md">
<description>Update title</description>
<original># Old Title</original>
<modified># New Title</modified>
</edit>
`;
    const result = parseEditSuggestions(response);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      filePath: 'test.md',
      originalContent: '# Old Title',
      newContent: '# New Title',
      description: 'Update title',
    });
  });

  it('should parse multiple edit suggestions', () => {
    const response = `
<edit file="file1.md">
<description>Edit 1</description>
<original>A</original>
<modified>B</modified>
</edit>
<edit file="file2.md">
<description>Edit 2</description>
<original>X</original>
<modified>Y</modified>
</edit>
`;
    const result = parseEditSuggestions(response);
    expect(result).toHaveLength(2);
    expect(result[0].filePath).toBe('file1.md');
    expect(result[1].filePath).toBe('file2.md');
  });

  it('should use default description if missing', () => {
    const response = `
<edit file="test.md">
<original>Old</original>
<modified>New</modified>
</edit>
`;
    const result = parseEditSuggestions(response);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('内容修改');
  });

  it('should return empty array for no edit tags', () => {
    const response = 'Just some text without any edits';
    const result = parseEditSuggestions(response);
    expect(result).toEqual([]);
  });

  it('should skip incomplete edit tags', () => {
    const response = `
<edit file="test.md">
<description>Missing original/modified</description>
</edit>
`;
    const result = parseEditSuggestions(response);
    expect(result).toEqual([]);
  });
});

describe('applyEdit', () => {
  it('should apply exact match', () => {
    const content = '# Title\n\nOld content here.';
    const suggestion: EditSuggestion = {
      filePath: 'test.md',
      originalContent: 'Old content here.',
      newContent: 'New content here.',
      description: 'Update content',
    };
    const result = applyEdit(content, suggestion);
    expect(result).toBe('# Title\n\nNew content here.');
  });

  it('should apply multiline edit', () => {
    const content = '# Title\n\nLine 1\nLine 2\nLine 3';
    const suggestion: EditSuggestion = {
      filePath: 'test.md',
      originalContent: 'Line 1\nLine 2',
      newContent: 'New Line 1\nNew Line 2',
      description: 'Update lines',
    };
    const result = applyEdit(content, suggestion);
    expect(result).toBe('# Title\n\nNew Line 1\nNew Line 2\nLine 3');
  });

  it('should handle whitespace differences with fuzzy match', () => {
    const content = '# Title\n\n  Line 1  \n  Line 2  ';
    const suggestion: EditSuggestion = {
      filePath: 'test.md',
      originalContent: 'Line 1\nLine 2',
      newContent: 'New content',
      description: 'Fuzzy match',
    };
    const result = applyEdit(content, suggestion);
    // Should find a match despite whitespace differences
    expect(result).toContain('New content');
  });

  it('should append if no match found', () => {
    const content = '# Title\n\nSome content.';
    const suggestion: EditSuggestion = {
      filePath: 'test.md',
      originalContent: 'Non-existent content',
      newContent: 'New content',
      description: 'No match',
    };
    const result = applyEdit(content, suggestion);
    expect(result).toContain('<!-- AI 修改 -->');
    expect(result).toContain('New content');
  });

  it('should preserve content before and after edit', () => {
    const content = 'Before\n\nTarget\n\nAfter';
    const suggestion: EditSuggestion = {
      filePath: 'test.md',
      originalContent: 'Target',
      newContent: 'Replaced',
      description: 'Replace target',
    };
    const result = applyEdit(content, suggestion);
    expect(result).toBe('Before\n\nReplaced\n\nAfter');
  });
});
