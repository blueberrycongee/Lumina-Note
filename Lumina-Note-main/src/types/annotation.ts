/**
 * PDF 批注类型定义
 */

// 批注类型
export type AnnotationType = 'highlight' | 'underline' | 'note';

// 批注颜色
export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

// 文本选择位置信息
export interface TextPosition {
  pageIndex: number;
  // 选中文本在页面中的矩形区域（可能有多个，跨行时）
  rects: Array<{
    x: number;      // 相对页面宽度的百分比 (0-1)
    y: number;      // 相对页面高度的百分比 (0-1)
    width: number;  // 相对页面宽度的百分比 (0-1)
    height: number; // 相对页面高度的百分比 (0-1)
  }>;
  // 用于定位的文本上下文
  textBefore?: string;  // 前面的文本（用于精确定位）
  textAfter?: string;   // 后面的文本（用于精确定位）
}

// 单条批注
export interface Annotation {
  id: string;                    // 唯一标识符 ann-xxx
  type: AnnotationType;          // 批注类型
  color: AnnotationColor;        // 颜色
  pageIndex: number;             // 页码（1-based）
  selectedText: string;          // 高亮的文本内容
  note?: string;                 // 用户笔记
  position: TextPosition;        // 位置信息
  createdAt: string;             // 创建时间 ISO string
  updatedAt: string;             // 更新时间 ISO string
}

// 批注文件元数据
export interface AnnotationFile {
  pdfPath: string;               // 关联的 PDF 路径
  pdfName: string;               // PDF 文件名
  annotations: Annotation[];     // 所有批注
  createdAt: string;
  updatedAt: string;
}

// 批注弹窗状态
export interface AnnotationPopoverState {
  isOpen: boolean;
  // 触发位置（屏幕坐标）
  x: number;
  y: number;
  // 选中的文本信息
  selectedText: string;
  position: TextPosition | null;
}

// 颜色配置
export const ANNOTATION_COLORS: Record<AnnotationColor, { bg: string; border: string; label: string }> = {
  yellow: { bg: 'rgba(255, 235, 59, 0.35)', border: 'rgba(255, 235, 59, 0.7)', label: 'Yellow' },
  green: { bg: 'rgba(76, 175, 80, 0.35)', border: 'rgba(76, 175, 80, 0.7)', label: 'Green' },
  blue: { bg: 'rgba(33, 150, 243, 0.35)', border: 'rgba(33, 150, 243, 0.7)', label: 'Blue' },
  pink: { bg: 'rgba(233, 30, 99, 0.35)', border: 'rgba(233, 30, 99, 0.7)', label: 'Pink' },
  purple: { bg: 'rgba(156, 39, 176, 0.35)', border: 'rgba(156, 39, 176, 0.7)', label: 'Purple' },
};
