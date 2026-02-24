/**
 * PDF 解析服务类型定义
 */

import type { PDFStructure, ParseBackend } from "@/types/pdf";

// 解析配置
export interface ParseConfig {
  backend: ParseBackend;
  // PP-Structure 配置
  ppStructure?: {
    apiUrl?: string;
    layoutAnalysis?: boolean;
    tableRecognition?: boolean;
    ocrEngine?: 'paddleocr' | 'tesseract';
  };
  // 云 API 配置
  cloudApi?: {
    provider: 'azure' | 'aws' | 'google';
    apiKey: string;
    endpoint: string;
  };
  // DeepSeek OCR 配置
  deepseekOcr?: {
    apiKey: string;
    model?: string;
  };
}

// 解析请求
export interface ParseRequest {
  pdfPath: string;
  config: ParseConfig;
  useCache?: boolean;
  modifiedTime?: number;
}

// 解析响应
export interface ParseResponse {
  success: boolean;
  structure?: PDFStructure;
  error?: string;
  parseTime?: number;
  fromCache?: boolean;
}

// 缓存条目
export interface CacheEntry {
  pdfPath: string;
  modifiedTime: number;
  structure: PDFStructure;
  backend: ParseBackend;
  createdAt: number;
}
