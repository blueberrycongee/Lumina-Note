/**
 * Reranker 测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reranker } from './reranker';
import type { RAGConfig, SearchResult } from './types';

const baseConfig: RAGConfig = {
  enabled: true,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  rerankerEnabled: false,
  chunkSize: 500,
  chunkOverlap: 50,
  minScore: 0.5,
  maxResults: 10,
};

const mockResults: SearchResult[] = [
  { id: '1', filePath: '/note1.md', heading: 'Note 1', content: 'Content 1', score: 0.8, startLine: 1, endLine: 10 },
  { id: '2', filePath: '/note2.md', heading: 'Note 2', content: 'Content 2', score: 0.7, startLine: 1, endLine: 10 },
  { id: '3', filePath: '/note3.md', heading: 'Note 3', content: 'Content 3', score: 0.6, startLine: 1, endLine: 10 },
];

describe('Reranker', () => {
  let reranker: Reranker;

  beforeEach(() => {
    reranker = new Reranker(baseConfig);
    vi.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('should return false when rerankerEnabled is false', () => {
      expect(reranker.isEnabled()).toBe(false);
    });

    it('should return false when no API key', () => {
      reranker.updateConfig({ ...baseConfig, rerankerEnabled: true });
      expect(reranker.isEnabled()).toBe(false);
    });

    it('should return true when enabled with API key', () => {
      reranker.updateConfig({ 
        ...baseConfig, 
        rerankerEnabled: true,
        rerankerApiKey: 'test-key',
      });
      expect(reranker.isEnabled()).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      reranker.updateConfig({ 
        ...baseConfig, 
        rerankerEnabled: true,
        rerankerApiKey: 'new-key',
      });
      expect(reranker.isEnabled()).toBe(true);
    });
  });

  describe('rerank', () => {
    it('should return original results when disabled', async () => {
      const results = await reranker.rerank('query', mockResults);
      expect(results).toEqual(mockResults);
    });

    it('should return original results when empty array', async () => {
      reranker.updateConfig({ 
        ...baseConfig, 
        rerankerEnabled: true,
        rerankerApiKey: 'test-key',
      });
      const results = await reranker.rerank('query', []);
      expect(results).toEqual([]);
    });

    it('should return original results when no API key after enable check', async () => {
      // Edge case: enabled but key removed
      const result = await reranker.rerank('query', mockResults);
      expect(result).toEqual(mockResults);
    });

    it('should call API when enabled', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [
            { index: 2, relevanceScore: 0.95 },
            { index: 0, relevanceScore: 0.85 },
            { index: 1, relevanceScore: 0.75 },
          ],
        }),
      });
      global.fetch = mockFetch;

      reranker.updateConfig({ 
        ...baseConfig, 
        rerankerEnabled: true,
        rerankerApiKey: 'test-key',
        rerankerTopN: 5,
      });

      const results = await reranker.rerank('test query', mockResults);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.siliconflow.cn/v1/rerank',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
          }),
        }),
      );

      // Should be reordered by relevance score
      expect(results[0].id).toBe('3'); // highest score 0.95
      expect(results[0].score).toBe(0.95);
    });

    it('should return original results on API error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('API Error'),
      });
      global.fetch = mockFetch;

      reranker.updateConfig({ 
        ...baseConfig, 
        rerankerEnabled: true,
        rerankerApiKey: 'test-key',
      });

      const results = await reranker.rerank('query', mockResults);
      expect(results).toEqual(mockResults);
    });

    it('should return original results on fetch exception', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      reranker.updateConfig({ 
        ...baseConfig, 
        rerankerEnabled: true,
        rerankerApiKey: 'test-key',
      });

      const results = await reranker.rerank('query', mockResults);
      expect(results).toEqual(mockResults);
    });

    it('should use custom base URL and model', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });
      global.fetch = mockFetch;

      reranker.updateConfig({ 
        ...baseConfig, 
        rerankerEnabled: true,
        rerankerApiKey: 'test-key',
        rerankerBaseUrl: 'https://custom.api.com/v1',
        rerankerModel: 'custom-model',
      });

      await reranker.rerank('query', mockResults);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/v1/rerank',
        expect.objectContaining({
          body: expect.stringContaining('"model":"custom-model"'),
        }),
      );
    });
  });
});
