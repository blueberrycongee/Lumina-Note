/**
 * ToolOutputCache 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  cacheToolOutput,
  getCachedToolOutput,
  clearToolOutputCache,
} from './ToolOutputCache';

describe('ToolOutputCache', () => {
  beforeEach(() => {
    clearToolOutputCache();
  });

  describe('cacheToolOutput', () => {
    it('should return unique id', () => {
      const id1 = cacheToolOutput('read_note', 'content 1');
      const id2 = cacheToolOutput('read_note', 'content 2');
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should include tool name in id', () => {
      const id = cacheToolOutput('search_notes', 'results');
      expect(id).toContain('search_notes');
    });

    it('should store content correctly', () => {
      const content = 'Full search results here';
      const id = cacheToolOutput('search_notes', content);
      
      const cached = getCachedToolOutput(id);
      expect(cached?.content).toBe(content);
    });

    it('should store params signature', () => {
      const id = cacheToolOutput('read_note', 'content', 'path=/test.md');
      
      const cached = getCachedToolOutput(id);
      expect(cached?.paramsSignature).toBe('path=/test.md');
    });

    it('should store tool name', () => {
      const id = cacheToolOutput('list_notes', 'file list');
      
      const cached = getCachedToolOutput(id);
      expect(cached?.tool).toBe('list_notes');
    });

    it('should store creation timestamp', () => {
      const before = Date.now();
      const id = cacheToolOutput('read_note', 'content');
      const after = Date.now();
      
      const cached = getCachedToolOutput(id);
      expect(cached?.createdAt).toBeGreaterThanOrEqual(before);
      expect(cached?.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe('getCachedToolOutput', () => {
    it('should return undefined for non-existent id', () => {
      const result = getCachedToolOutput('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should return cached output', () => {
      const id = cacheToolOutput('edit_note', 'edit result');
      
      const cached = getCachedToolOutput(id);
      expect(cached).toBeDefined();
      expect(cached?.id).toBe(id);
    });
  });

  describe('clearToolOutputCache', () => {
    it('should clear all cached outputs', () => {
      const id1 = cacheToolOutput('tool1', 'content1');
      const id2 = cacheToolOutput('tool2', 'content2');
      
      clearToolOutputCache();
      
      expect(getCachedToolOutput(id1)).toBeUndefined();
      expect(getCachedToolOutput(id2)).toBeUndefined();
    });
  });
});
