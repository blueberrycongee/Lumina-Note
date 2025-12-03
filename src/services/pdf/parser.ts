/**
 * PDF 解析服务
 * 支持多种后端：PP-Structure、云 API、DeepSeek OCR
 */

import type { ParseRequest, ParseResponse, CacheEntry } from "./types";
import type { PDFStructure, ParseBackend } from "@/types/pdf";

// 缓存管理
class ParseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly MAX_CACHE_SIZE = 50;

  getCacheKey(pdfPath: string, modifiedTime: number): string {
    return `${pdfPath}:${modifiedTime}`;
  }

  get(pdfPath: string, modifiedTime: number): PDFStructure | null {
    const key = this.getCacheKey(pdfPath, modifiedTime);
    const entry = this.cache.get(key);
    if (entry && entry.modifiedTime === modifiedTime) {
      return entry.structure;
    }
    return null;
  }

  set(pdfPath: string, modifiedTime: number, structure: PDFStructure, backend: ParseBackend) {
    const key = this.getCacheKey(pdfPath, modifiedTime);
    
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

/**
 * 使用 PP-Structure 解析 PDF
 */
async function parsePPStructure(pdfPath: string, config: ParseRequest['config']): Promise<PDFStructure> {
  const apiUrl = config.ppStructure?.apiUrl || 'http://localhost:18765/parse';
  
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

  try {
    // 检查缓存
    if (request.useCache !== false) {
      // TODO: 获取文件修改时间
      const modifiedTime = Date.now(); // 临时使用当前时间
      const cached = parseCache.get(request.pdfPath, modifiedTime);
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
    if (request.useCache !== false && structure.pages.length > 0) {
      const modifiedTime = Date.now();
      parseCache.set(request.pdfPath, modifiedTime, structure, request.config.backend);
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
