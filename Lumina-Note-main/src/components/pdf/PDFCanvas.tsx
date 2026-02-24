import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import "@/pdfWorker";
import { Document, Page } from "react-pdf";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveLayer } from "./InteractiveLayer";
import { AnnotationLayer } from "./AnnotationLayer";
import { usePDFAnnotationStore } from "@/stores/usePDFAnnotationStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { PDFElement } from "@/types/pdf";
import type { TextPosition } from "@/types/annotation";

// 引入 react-pdf 样式
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface PDFCanvasProps {
  pdfData: Uint8Array | null;
  filePath: string; // 仅用于错误显示
  currentPage: number;
  scale: number;
  onDocumentLoad?: (numPages: number) => void;
  onPageChange?: (page: number) => void;
  onScaleChange?: (scale: number) => void;
  // 交互层相关
  showInteractiveLayer?: boolean;
  elements?: PDFElement[];
  selectedElementIds?: string[];
  hoveredElementId?: string | null;
  onElementHover?: (elementId: string | null) => void;
  onElementClick?: (element: PDFElement, isMultiSelect: boolean) => void;
  // 批注相关
  enableAnnotations?: boolean;
  className?: string;
}

export function PDFCanvas({
  pdfData,
  filePath,
  currentPage,
  scale,
  onDocumentLoad,
  onPageChange,
  onScaleChange,
  showInteractiveLayer = false,
  elements = [],
  selectedElementIds = [],
  hoveredElementId = null,
  onElementHover,
  onElementClick,
  enableAnnotations = true,
  className,
}: PDFCanvasProps) {
  const { t } = useLocaleStore();
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  
  const { openPopover, loadAnnotations } = usePDFAnnotationStore();
  
  // 加载批注
  useEffect(() => {
    if (enableAnnotations && filePath) {
      loadAnnotations(filePath);
    }
  }, [enableAnnotations, filePath, loadAnnotations]);

  // 处理文档加载
  const handleDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
    onDocumentLoad?.(numPages);
  }, [onDocumentLoad]);

  // 处理页面加载成功
  const handlePageLoadSuccess = useCallback((page: any) => {
    const viewport = page.getViewport({ scale: 1 });
    setPageSize({ width: viewport.width, height: viewport.height });
  }, []);
  
  // 处理文本选择
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!enableAnnotations || !pageSize) return;
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
    
    const selectedText = selection.toString().trim();
    if (!selectedText) return;
    
    // 获取选区的所有矩形
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    
    if (rects.length === 0) return;
    
    // 获取页面容器的位置
    const pageElement = pageRef.current;
    if (!pageElement) return;
    
    const pageRect = pageElement.getBoundingClientRect();
    
    // 转换为相对于页面的百分比坐标
    const positionRects: TextPosition['rects'] = [];
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      // 只处理在页面范围内的矩形
      if (rect.width > 0 && rect.height > 0) {
        positionRects.push({
          x: (rect.left - pageRect.left) / (pageSize.width * scale),
          y: (rect.top - pageRect.top) / (pageSize.height * scale),
          width: rect.width / (pageSize.width * scale),
          height: rect.height / (pageSize.height * scale),
        });
      }
    }
    
    if (positionRects.length === 0) return;
    
    // 打开批注弹窗
    const lastRect = rects[rects.length - 1];
    let anchorX = e.clientX;
    let anchorY = e.clientY;

    // Fallback for edge cases where mouse coordinates are unreliable.
    if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY) || (anchorX === 0 && anchorY === 0)) {
      try {
        if (selection.focusNode) {
          const focusRange = document.createRange();
          focusRange.setStart(selection.focusNode, selection.focusOffset);
          focusRange.setEnd(selection.focusNode, selection.focusOffset);
          const focusRect = focusRange.getBoundingClientRect();
          anchorX = focusRect.right || lastRect.right;
          anchorY = focusRect.bottom || lastRect.bottom;
        } else {
          anchorX = lastRect.right;
          anchorY = lastRect.bottom;
        }
      } catch {
        anchorX = lastRect.right;
        anchorY = lastRect.bottom;
      }
    }

    openPopover({
      x: anchorX,
      y: anchorY,
      selectedText,
      position: {
        pageIndex: currentPage,
        rects: positionRects,
      },
    });
  }, [enableAnnotations, pageSize, scale, currentPage, openPopover]);

  // 处理加载错误
  const handleDocumentLoadError = useCallback((err: Error) => {
    console.error("PDF load error:", err);
    setError(t.pdfViewer.readFailed.replace("{error}", err.message));
  }, [t]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!onPageChange) return;
      
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (currentPage > 1) onPageChange(currentPage - 1);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (currentPage < numPages) onPageChange(currentPage + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        onPageChange(1);
      } else if (e.key === "End") {
        e.preventDefault();
        onPageChange(numPages);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, numPages, onPageChange]);

  // Ctrl+滚轮缩放（以鼠标为中心）
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onScaleChange) return;

    const handleWheel = (e: WheelEvent) => {
      // 检测 Ctrl 键（Windows/Linux）或 Cmd 键（Mac）
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        // 获取鼠标在容器中的位置
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 记录缩放前的滚动位置
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;

        // 计算鼠标在内容中的相对位置
        const contentX = scrollLeft + mouseX;
        const contentY = scrollTop + mouseY;

        // 计算新的缩放比例
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(0.5, Math.min(3, scale + delta));

        // 应用新的缩放
        onScaleChange(newScale);

        // 等待下一帧后调整滚动位置，保持鼠标位置不变
        requestAnimationFrame(() => {
          const scaleRatio = newScale / scale;
          const newScrollLeft = contentX * scaleRatio - mouseX;
          const newScrollTop = contentY * scaleRatio - mouseY;
          container.scrollLeft = newScrollLeft;
          container.scrollTop = newScrollTop;
        });
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [scale, onScaleChange]);

  // 创建 PDF 数据源（避免 ArrayBuffer detached）
  const pdfSource = useMemo(() => {
    if (!pdfData) return null;
    // 确保每次都是新的副本，独立的 ArrayBuffer
    const buffer = new ArrayBuffer(pdfData.byteLength);
    const copy = new Uint8Array(buffer);
    copy.set(new Uint8Array(pdfData.buffer, pdfData.byteOffset, pdfData.byteLength));
    return { data: copy };
  }, [pdfData]);

  if (error) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">{t.pdfViewer.loadFailed}</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <p className="text-xs text-muted-foreground mt-2">{filePath}</p>
        </div>
      </div>
    );
  }

  // 正在加载文件
  if (!pdfSource) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        <Loader2 className="animate-spin mr-2" />
        <span>{t.pdfViewer.readingFile}</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "flex-1 overflow-auto bg-muted/30",
        className
      )}
    >
      <Document
        file={pdfSource}
        onLoadSuccess={handleDocumentLoadSuccess}
        onLoadError={handleDocumentLoadError}
        loading={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin mr-2" />
            <span>{t.pdfViewer.parsingPdf}</span>
          </div>
        }
        className="flex flex-col items-center py-4"
      >
        <div 
          ref={pageRef}
          className="relative shadow-lg"
          onMouseUp={handleMouseUp}
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            onLoadSuccess={handlePageLoadSuccess}
            loading={
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin" size={20} />
              </div>
            }
            className="bg-white"
          />
          
          {/* 批注层 */}
          {enableAnnotations && pageSize && (
            <AnnotationLayer
              pageIndex={currentPage}
              pageWidth={pageSize.width}
              pageHeight={pageSize.height}
              scale={scale}
            />
          )}
          
          {/* 交互层 */}
          {showInteractiveLayer && pageSize && onElementHover && onElementClick && (
            <InteractiveLayer
              pageIndex={currentPage}
              pageWidth={pageSize.width}
              pageHeight={pageSize.height}
              scale={scale}
              elements={elements}
              selectedElementIds={selectedElementIds}
              hoveredElementId={hoveredElementId}
              onElementHover={onElementHover}
              onElementClick={onElementClick}
            />
          )}
        </div>
      </Document>
    </div>
  );
}
