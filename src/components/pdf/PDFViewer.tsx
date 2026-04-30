import { useState, useCallback, useEffect, useMemo } from "react";
import { PDFToolbar } from "./PDFToolbar";
import { PDFCanvas } from "./PDFCanvas";
import { PDFOutline } from "./PDFOutline";
import { PDFSearch } from "./PDFSearch";
import { AnnotationPopover } from "./AnnotationPopover";
import { usePDFStore } from "@/stores/usePDFStore";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, FileText } from 'lucide-react';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { readBinaryFile as readFile } from "@/lib/host";

interface PDFViewerProps {
  filePath: string;
  className?: string;
}

export function PDFViewer({ filePath, className }: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const { currentPage, scale, setCurrentPage, setScale } = usePDFStore();
  const { t } = useLocaleStore();

  // 加载 PDF 文件
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await readFile(filePath);
        if (!cancelled) {
          // 不要共享 ArrayBuffer，直接存储原始数据
          setPdfData(data);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to read PDF file:", err);
        if (!cancelled) {
          const errorMessage = t.pdfViewer.readFailed.replace("{error}", String(err));
          setError(errorMessage);
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => { cancelled = true; };
  }, [filePath, t]);

  const handleDocumentLoad = useCallback((pages: number) => {
    setNumPages(pages);
    // 重置到第一页
    setCurrentPage(1);
  }, [setCurrentPage]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, [setCurrentPage]);

  const handleScaleChange = useCallback((newScale: number) => {
    setScale(newScale);
  }, [setScale]);

  // 为不同组件创建独立的数据副本，避免 ArrayBuffer detached 错误
  const pdfDataForSearch = useMemo(() => {
    if (!pdfData) return null;
    return pdfData.slice();
  }, [pdfData]);

  const pdfDataForOutline = useMemo(() => {
    if (!pdfData) return null;
    return pdfData.slice();
  }, [pdfData]);

  const pdfDataForCanvas = useMemo(() => {
    if (!pdfData) return null;
    return pdfData.slice();
  }, [pdfData]);

  // 加载中状态
  if (loading) {
    return (
      <div className={cn("flex flex-col h-full bg-popover", className)}>
        <div className="h-9 flex items-center px-3 gap-2 border-b border-border/60 bg-popover shrink-0">
          <FileText size={14} className="text-red-500" />
          <span className="text-sm font-medium truncate">
            {filePath.split(/[\/\\]/).pop() || t.pdfViewer.defaultFileName}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin mr-2" />
          <span>{t.pdfViewer.readingFile}</span>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className={cn("flex flex-col h-full bg-popover", className)}>
        <div className="h-9 flex items-center px-3 gap-2 border-b border-border/60 bg-popover shrink-0">
          <FileText size={14} className="text-red-500" />
          <span className="text-sm font-medium truncate">
            {filePath.split(/[\/\\]/).pop() || t.pdfViewer.defaultFileName}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-destructive">
            <p className="text-lg font-medium">{t.pdfViewer.loadFailed}</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-popover", className)}>
      {/* 文件名标题 */}
      <div className="h-9 flex items-center px-3 gap-2 border-b border-border/60 bg-popover shrink-0">
        <FileText size={14} className="text-red-500" />
        <span className="text-sm font-medium truncate">
          {filePath.split(/[\/\\]/).pop() || "PDF"}
        </span>
      </div>

      {/* 工具栏 */}
      <PDFToolbar
        currentPage={currentPage}
        totalPages={numPages}
        scale={scale}
        onPageChange={handlePageChange}
        onScaleChange={handleScaleChange}
        searchSlot={
          <PDFSearch
            pdfData={pdfDataForSearch}
            onNavigate={handlePageChange}
          />
        }
      />

      {/* 主内容区：目录 + PDF 渲染 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧边栏：目录 */}
        {showOutline ? (
          <div className="flex flex-col w-64 border-r border-border/60 bg-popover">
            {/* 头部 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
              <span className="text-sm font-medium">{t.pdfViewer.catalog}</span>
              <button
                onClick={() => setShowOutline(false)}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
                title={t.pdfViewer.collapseCatalog}
              >
                <ChevronLeft size={14} />
              </button>
            </div>

            {/* 目录内容 */}
            <div className="flex-1 overflow-hidden">
              <PDFOutline
                pdfData={pdfDataForOutline}
                onPageClick={handlePageChange}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowOutline(true)}
            className="absolute left-0 top-2 z-10 flex items-center justify-center w-5 h-6 bg-popover/80 border border-border/60 border-l-0 rounded-r shadow-elev-1 hover:bg-accent transition-colors"
            title={t.pdfViewer.expandCatalog}
          >
            <ChevronRight size={14} className="text-muted-foreground" />
          </button>
        )}

        {/* PDF 渲染区域 */}
        <PDFCanvas
          pdfData={pdfDataForCanvas}
          filePath={filePath}
          currentPage={currentPage}
          scale={scale}
          onDocumentLoad={handleDocumentLoad}
          onPageChange={handlePageChange}
          onScaleChange={handleScaleChange}
          className="flex-1"
        />
      </div>
      
      {/* 批注弹窗 */}
      <AnnotationPopover />
    </div>
  );
}
