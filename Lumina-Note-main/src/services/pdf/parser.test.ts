/**
 * PDF 解析缓存测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parsePDF, clearParseCache } from './parser';
import type { ParseRequest } from './types';

const mockStructure = {
  pageCount: 1,
  pages: [
    {
      pageIndex: 1,
      width: 595,
      height: 842,
      blocks: [],
    },
  ],
};

describe('parsePDF cache', () => {
  beforeEach(() => {
    clearParseCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should reuse cache when modified time is unchanged', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ structure: mockStructure }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const request: ParseRequest = {
      pdfPath: '/path/to/file.pdf',
      config: {
        backend: 'pp-structure',
      },
      useCache: true,
      modifiedTime: 123,
    };

    const first = await parsePDF(request);
    const second = await parsePDF(request);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cache when modified time changes', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ structure: mockStructure }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const baseRequest: Omit<ParseRequest, 'modifiedTime'> = {
      pdfPath: '/path/to/file.pdf',
      config: {
        backend: 'pp-structure',
      },
      useCache: true,
    };

    const first = await parsePDF({ ...baseRequest, modifiedTime: 123 });
    const second = await parsePDF({ ...baseRequest, modifiedTime: 456 });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should not reuse cache across different backend configs', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ structure: mockStructure }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const baseRequest: Omit<ParseRequest, 'modifiedTime'> = {
      pdfPath: '/path/to/file.pdf',
      config: {
        backend: 'pp-structure',
        ppStructure: {
          layoutAnalysis: true,
        },
      },
      useCache: true,
    };

    const first = await parsePDF({ ...baseRequest, modifiedTime: 123 });
    const second = await parsePDF({
      ...baseRequest,
      config: {
        backend: 'pp-structure',
        ppStructure: {
          layoutAnalysis: false,
        },
      },
      modifiedTime: 123,
    });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
