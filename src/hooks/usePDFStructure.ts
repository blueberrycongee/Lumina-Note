import { useState, useCallback } from "react";
import type { PDFStructure, PDFElement, ParseStatus, ParseBackend } from "@/types/pdf";
import { parsePDF } from "@/services/pdf";

/**
 * PDF 结构解析 Hook
 * 管理 PDF 的结构化数据，包括文本块、图片、表格、公式等元素
 */
export function usePDFStructure() {
  const [structure, setStructure] = useState<PDFStructure | null>(null);
  const [parseStatus, setParseStatus] = useState<ParseStatus>('idle');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseBackend, setParseBackend] = useState<ParseBackend>('none');

  // 解析 PDF 结构
  const parseStructure = useCallback(async (pdfPath: string, backend: ParseBackend = 'none') => {
    setParseStatus('parsing');
    setParseError(null);
    setParseBackend(backend);

    try {
      let result;
      
      if (backend === 'none') {
        // 使用模拟数据
        await new Promise(resolve => setTimeout(resolve, 500));
        result = {
          success: true,
          structure: generateMockStructure(),
          fromCache: false,
        };
      } else {
        // 使用真实的解析服务（不管 backend 名称，都调用本地服务）
        result = await parsePDF({
          pdfPath,
          config: {
            backend: 'pp-structure',
            ppStructure: {
              apiUrl: 'http://localhost:18765/parse',
              layoutAnalysis: true,
              tableRecognition: true,
              ocrEngine: 'paddleocr',
            },
          },
          useCache: true,
        });
      }

      if (result.success && result.structure) {
        setStructure(result.structure);
        setParseStatus('done');
      } else {
        setParseError(result.error || '解析失败');
        setParseStatus('error');
      }
    } catch (err) {
      console.error('Failed to parse PDF structure:', err);
      setParseError(err instanceof Error ? err.message : '解析失败');
      setParseStatus('error');
    }
  }, []);

  // 清除结构数据
  const clearStructure = useCallback(() => {
    setStructure(null);
    setParseStatus('idle');
    setParseError(null);
    setParseBackend('none');
  }, []);

  // 获取指定页的元素
  const getPageElements = useCallback((pageIndex: number): PDFElement[] => {
    if (!structure) return [];
    const page = structure.pages.find(p => p.pageIndex === pageIndex);
    return page?.blocks || [];
  }, [structure]);

  // 获取所有元素
  const getAllElements = useCallback((): PDFElement[] => {
    if (!structure) return [];
    return structure.pages.flatMap(p => p.blocks);
  }, [structure]);

  return {
    structure,
    parseStatus,
    parseError,
    parseBackend,
    parseStructure,
    clearStructure,
    getPageElements,
    getAllElements,
  };
}

// 生成模拟结构数据（用于开发测试）
function generateMockStructure(): PDFStructure {
  return {
    pageCount: 1,
    pages: [
      {
        pageIndex: 1,
        width: 595,
        height: 842,
        blocks: [
          {
            id: 'mock-text-1',
            type: 'text',
            bbox: [50, 50, 300, 80],
            pageIndex: 1,
            content: '这是一段模拟的文本内容',
          },
          {
            id: 'mock-text-2',
            type: 'text',
            bbox: [50, 100, 400, 150],
            pageIndex: 1,
            content: '这是另一段更长的模拟文本内容，用于测试元素识别和交互功能。',
          },
          {
            id: 'mock-image-1',
            type: 'image',
            bbox: [50, 200, 250, 350],
            pageIndex: 1,
            caption: '图 1: 示例图片',
          },
        ],
      },
    ],
  };
}
