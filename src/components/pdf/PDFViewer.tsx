import { useState, useCallback, useEffect, useMemo } from "react";
import { PDFToolbar } from "./PDFToolbar";
import { PDFCanvas } from "./PDFCanvas";
import { PDFOutline } from "./PDFOutline";
import { PDFSearch } from "./PDFSearch";
import { ElementPanel } from "./ElementPanel";
import { AnnotationPopover } from "./AnnotationPopover";
import { usePDFStore } from "@/stores/usePDFStore";
import { useElementSelection } from "@/hooks/useElementSelection";
import { usePDFStructure } from "@/hooks/usePDFStructure";
import { useAIStore } from "@/stores/useAIStore";
import { useUIStore } from "@/stores/useUIStore";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ListTree, Loader2, FileText } from 'lucide-react';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { readFile, stat } from "@tauri-apps/plugin-fs";

interface PDFViewerProps {
  filePath: string;
  className?: string;
}

export function PDFViewer({ filePath, className }: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(true);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const { currentPage, scale, setCurrentPage, setScale } = usePDFStore();
  const { t } = useLocaleStore();
  
  // 元素选择
  const {
    selectedElements,
    selectedElementIds,
    hoveredElementId,
    selectElement,
    clearSelection,
    removeFromSelection,
    setHoveredElementById,
  } = useElementSelection();
  
  // PDF 结构解析
  const {
    parseStructure,
    getAllElements,
  } = usePDFStructure();

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
          
          // 自动解析 PDF 结构
          // 'none': 模拟数据, 'pp-structure': PP-Structure 服务
          let modifiedTime: number | undefined;
          try {
            const info = await stat(filePath);
            if (info.mtime instanceof Date) {
              modifiedTime = info.mtime.getTime();
            } else if (typeof info.mtime === 'number') {
              modifiedTime = info.mtime;
            } else if (typeof info.mtime === 'string') {
              const parsed = new Date(info.mtime).getTime();
              if (!Number.isNaN(parsed)) {
                modifiedTime = parsed;
              }
            }
          } catch (err) {
            console.warn('Failed to read PDF modified time:', err);
          }

          parseStructure(filePath, 'pp-structure', modifiedTime);
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
  }, [filePath, parseStructure, t]);

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

  // 处理元素悬浮
  const handleElementHover = useCallback((elementId: string | null) => {
    const allElements = getAllElements();
    setHoveredElementById(elementId, allElements);
  }, [getAllElements, setHoveredElementById]);

  // 处理元素点击
  const handleElementClick = useCallback((element: any, isMultiSelect: boolean) => {
    selectElement(element, isMultiSelect);
  }, [selectElement]);

  // 处理复制为引用
  const handleCopyAsReference = useCallback(() => {
    const references = selectedElements.map(el => {
      return `[PDF:${el.type}:P${el.pageIndex}] ${el.content || el.caption || ''}`;
    }).join('\n\n');
    navigator.clipboard.writeText(references);
  }, [selectedElements]);

  // 处理与 AI 对话
  const handleChatWithAI = useCallback(() => {
    if (selectedElements.length === 0) return;
    
    // 格式化选中的元素为引用文本
    const pdfFileName = filePath.split(/[/\\]/).pop() || t.pdfViewer.defaultFileName;
    const citations = selectedElements.map((el, index) => {
      const typeLabels = t.pdfViewer.elementTypes as Record<string, string> | undefined;
      const typeLabel = typeLabels?.[el.type] || el.type;
      
      const content = el.content ? `\n${el.content}` : '';
      return `[${index + 1}] ${typeLabel} (P${el.pageIndex})${content}`;
    }).join('\n\n');
    
    const referenceText = `# ${t.pdfViewer.referenceHeader} - ${pdfFileName}\n\n${citations}`;
    
    // 添加到 AI Store 的结构化引用
    const pages = Array.from(new Set(selectedElements.map((el) => el.pageIndex))).sort((a, b) => a - b);
    const locator = pages.length === 1
      ? `P${pages[0]}`
      : `P${pages[0]}-${pages[pages.length - 1]}`;
    useAIStore.getState().addTextSelection({
      text: referenceText,
      source: pdfFileName,
      sourcePath: filePath,
      summary: `${t.pdfViewer.referenceHeader} (${selectedElements.length})`,
      locator,
      range: {
        kind: "pdf",
        page: pages[0] || currentPage,
      },
    });
    
    // 打开 AI 悬浮面板
    useUIStore.getState().setFloatingPanelOpen(true);
    
    // 清空选择
    clearSelection();
  }, [selectedElements, filePath, clearSelection, t, currentPage]);

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
      <div className={cn("flex flex-col h-full", className)}>
        <div className="h-9 flex items-center px-3 gap-2 border-b border-border bg-muted/30 shrink-0">
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
      <div className={cn("flex flex-col h-full", className)}>
        <div className="h-9 flex items-center px-3 gap-2 border-b border-border bg-muted/30 shrink-0">
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
    <div className={cn("flex flex-col h-full", className)}>
      {/* 文件名标题 */}
      <div className="h-9 flex items-center justify-between px-3 gap-2 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-red-500" />
          <span className="text-sm font-medium truncate">
            {filePath.split(/[\/\\]/).pop() || "PDF"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 交互模式切换 */}
          <button
            onClick={() => setInteractiveMode(!interactiveMode)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
              interactiveMode
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
            title={t.pdfViewer.elementRecognition}
          >
            <ListTree size={16} />
            <span>{interactiveMode ? t.pdfViewer.interacting : t.pdfViewer.elementRecognition}</span>
          </button>
        </div>
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
          <div className="flex flex-col w-64 border-r border-border bg-muted/30">
            {/* 头部 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
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
            className="absolute left-0 top-2 z-10 flex items-center justify-center w-5 h-6 bg-muted/80 border border-border border-l-0 rounded-r shadow-sm hover:bg-background transition-colors"
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
          showInteractiveLayer={interactiveMode}
          elements={getAllElements()}
          selectedElementIds={selectedElementIds}
          hoveredElementId={hoveredElementId}
          onElementHover={handleElementHover}
          onElementClick={handleElementClick}
          className="flex-1"
        />

        {/* 元素面板 */}
        {interactiveMode && selectedElements.length > 0 && (
          <ElementPanel
            elements={selectedElements}
            onRemove={removeFromSelection}
            onClear={clearSelection}
            onCopyAsReference={handleCopyAsReference}
            onChatWithAI={handleChatWithAI}
            className="w-64"
          />
        )}
      </div>
      
      {/* 批注弹窗 */}
      <AnnotationPopover />
    </div>
  );
}
