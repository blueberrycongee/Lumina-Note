/**
 * PDF 智能阅读器类型定义
 */

// PDF 元素类型
export type PDFElementType = 'text' | 'image' | 'table' | 'equation';

// PDF 元素
export interface PDFElement {
  id: string;
  type: PDFElementType;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  pageIndex: number;
  
  // 内容（根据类型不同）
  content?: string;      // 文本/Markdown
  latex?: string;        // 公式的 LaTeX
  imagePath?: string;    // 图片路径
  caption?: string;      // 图/表标题
}

// 页面结构
export interface PageStructure {
  pageIndex: number;
  width: number;
  height: number;
  blocks: PDFElement[];
}

// PDF 结构化数据
export interface PDFStructure {
  pageCount: number;
  pages: PageStructure[];
}

// PDF 解析状态
export type ParseStatus = 'idle' | 'parsing' | 'done' | 'error';

// PDF 解析后端
export type ParseBackend = 'pp-structure' | 'cloud-api' | 'deepseek-ocr' | 'none';
