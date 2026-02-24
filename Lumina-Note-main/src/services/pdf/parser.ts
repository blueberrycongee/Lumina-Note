/**
 * PDF 解析服务
 * 支持多种后端：PP-Structure、云 API、DeepSeek OCR
 */

import type { ParseRequest, ParseResponse, CacheEntry } from "./types";
import type { PDFStructure, ParseBackend } from "@/types/pdf";
import { isTauri } from "@tauri-apps/api/core";
import { stat } from "@tauri-apps/plugin-fs";

// 缓存管理
class ParseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly MAX_CACHE_SIZE = 50;

  getCacheKey(pdfPath: string, modifiedTime: number, backend: ParseBackend, config: ParseRequest['config']): string {
    return `${pdfPath}:${modifiedTime}:${backend}:${stableStringify(config)}`;
  }

  get(
    pdfPath: string,
    modifiedTime: number,
    backend: ParseBackend,
    config: ParseRequest['config']
  ): PDFStructure | null {
    const key = this.getCacheKey(pdfPath, modifiedTime, backend, config);
    const entry = this.cache.get(key);
    if (entry && entry.modifiedTime === modifiedTime) {
      return entry.structure;
    }
    return null;
  }

  set(
    pdfPath: string,
    modifiedTime: number,
    structure: PDFStructure,
    backend: ParseBackend,
    config: ParseRequest['config']
  ) {
    const key = this.getCacheKey(pdfPath, modifiedTime, backend, config);
    
    // LRU 缓存：删除最老的条目
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      pdfPath,
      modifiedTime,
      structure,
      backend,
      createdAt: Date.now(),
    });
  }

  clear() {
    this.cache.clear();
  }
}

const parseCache = new ParseCache();

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const serialized = entries.map(([key, val]) => `"${key}":${stableStringify(val)}`);
  return `{${serialized.join(',')}}`;
}

async function resolveModifiedTime(request: ParseRequest): Promise<number> {
  if (typeof request.modifiedTime === 'number') {
    return request.modifiedTime;
  }

  if (!isTauri()) {
    return Date.now();
  }

  try {
    const info = await stat(request.pdfPath);
    const mtime = info.mtime;
    if (mtime instanceof Date) {
      return mtime.getTime();
    }
    if (typeof mtime === 'number') {
      return mtime;
    }
    if (typeof mtime === 'string') {
      const parsed = new Date(mtime).getTime();
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to read PDF modified time:', err);
  }

  return Date.now();
}

/**
 * 使用 PP-Structure 解析 PDF
 */
async function parsePPStructure(pdfPath: string, config: ParseRequest['config']): Promise<PDFStructure> {
  const apiUrl = config.ppStructure?.apiUrl || 'http://localhost:8080/parse';
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdf_path: pdfPath,
        layout_analysis: config.ppStructure?.layoutAnalysis ?? true,
        table_recognition: config.ppStructure?.tableRecognition ?? true,
        ocr_engine: config.ppStructure?.ocrEngine ?? 'paddleocr',
      }),
    });

    if (!response.ok) {
      throw new Error(`PP-Structure API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.structure as PDFStructure;
  } catch (err) {
    console.error('PP-Structure parsing failed:', err);
    throw err;
  }
}

/**
 * 使用云 API 解析 PDF
 */
async function parseCloudApi(_pdfPath: string, _config: ParseRequest['config']): Promise<PDFStructure> {
  // TODO: 实现云 API 调用（Azure Document Intelligence 等）
  throw new Error('Cloud API parsing not implemented yet');
}

/**
 * 使用 DeepSeek OCR 解析 PDF
 */
async function parseDeepSeekOcr(_pdfPath: string, _config: ParseRequest['config']): Promise<PDFStructure> {
  // TODO: 实现 DeepSeek OCR 调用
  throw new Error('DeepSeek OCR parsing not implemented yet');
}

/**
 * 主解析函数
 */
export async function parsePDF(request: ParseRequest): Promise<ParseResponse> {
  const startTime = Date.now();
  const shouldUseCache = request.useCache !== false;
  const cacheModifiedTime = shouldUseCache ? await resolveModifiedTime(request) : null;

  try {
    // 检查缓存
    if (shouldUseCache && cacheModifiedTime !== null) {
      const cached = parseCache.get(
        request.pdfPath,
        cacheModifiedTime,
        request.config.backend,
        request.config
      );
      if (cached) {
        return {
          success: true,
          structure: cached,
          fromCache: true,
          parseTime: Date.now() - startTime,
        };
      }
    }

    // 根据后端选择解析方法
    let structure: PDFStructure;
    
    switch (request.config.backend) {
      case 'pp-structure':
        structure = await parsePPStructure(request.pdfPath, request.config);
        break;
      case 'cloud-api':
        structure = await parseCloudApi(request.pdfPath, request.config);
        break;
      case 'deepseek-ocr':
        structure = await parseDeepSeekOcr(request.pdfPath, request.config);
        break;
      case 'none':
      default:
        // 返回空结构
        structure = { pageCount: 0, pages: [] };
    }

    // 缓存结果
    if (shouldUseCache && cacheModifiedTime !== null && structure.pages.length > 0) {
      parseCache.set(
        request.pdfPath,
        cacheModifiedTime,
        structure,
        request.config.backend,
        request.config
      );
    }

    return {
      success: true,
      structure,
      fromCache: false,
      parseTime: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      parseTime: Date.now() - startTime,
    };
  }
}

/**
 * 清除解析缓存
 */
export function clearParseCache() {
  parseCache.clear();
}
