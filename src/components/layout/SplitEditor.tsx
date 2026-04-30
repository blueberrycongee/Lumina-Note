import { useCallback, useEffect, useState, useRef } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { usePDFAnnotationStore } from "@/stores/usePDFAnnotationStore";
import { usePDFStore } from "@/stores/usePDFStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { CodeMirrorEditor, ViewMode } from "@/editor/CodeMirrorEditor";
import { PDFViewer } from "@/components/pdf/PDFViewer";
import { getFileName, cn } from "@/lib/utils";
import {
  X,
  Columns,
  Rows,
  FileText,
  Loader2,
} from "lucide-react";

interface EditorPaneProps {
  file: string | null;
  content: string;
  isDirty: boolean;
  isLoading: boolean;
  onContentChange: (content: string) => void;
  onClose?: () => void;
  isPrimary?: boolean;
}

function EditorPane({
  file,
  content,
  isDirty,
  isLoading,
  onContentChange,
  onClose,
}: EditorPaneProps) {
  const { editorMode } = useUIStore();
  const { t } = useLocaleStore();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-popover">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-popover text-muted-foreground">
        <FileText size={32} className="opacity-30 mb-2" />
        <p className="text-sm">{t.layout.emptyFileTitle}</p>
        <p className="text-xs opacity-70">{t.layout.emptyFileHint}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-popover">
      {/* Pane header */}
      <div className="h-9 flex items-center px-3 justify-between border-b border-border/60 bg-popover shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">
            {getFileName(file)}
          </span>
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" title={t.layout.unsaved} />
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
            title={t.layout.closePanel}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-auto bg-popover">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <CodeMirrorEditor 
            content={content} 
            onChange={onContentChange} 
            viewMode={editorMode as ViewMode}
            filePath={file}
          />
        </div>
      </div>
    </div>
  );
}

export function SplitEditor() {
  const { t } = useLocaleStore();
  const {
    currentFile,
    currentContent,
    isDirty,
    isLoadingFile,
    updateContent,
    openFile,
    openPDFTab,
  } = useFileStore();

  const {
    splitDirection,
    setSplitDirection,
    toggleSplitView,
    setSplitView,
  } = useUIStore();

  const {
    secondaryFile,
    secondaryFileType,
    secondaryContent,
    secondaryIsDirty,
    isLoadingSecondary,
    secondaryPdfPage,
    secondaryPdfAnnotationId,
    activePane,
    setActivePane,
    updateSecondaryContent,
    closeSecondary,
    promoteSecondaryToPrimary,
  } = useSplitStore();
  
  const { setHighlightedAnnotation } = usePDFAnnotationStore();
  const { setCurrentPage } = usePDFStore();
  
  // 当打开 PDF 时，设置初始页码
  useEffect(() => {
    if (secondaryFileType === 'pdf' && secondaryPdfPage > 0) {
      setCurrentPage(secondaryPdfPage);
    }
  }, [secondaryFileType, secondaryPdfPage, setCurrentPage]);
  
  // 当有批注 ID 时，高亮该批注
  useEffect(() => {
    if (secondaryPdfAnnotationId) {
      setHighlightedAnnotation(secondaryPdfAnnotationId);
    }
  }, [secondaryPdfAnnotationId, setHighlightedAnnotation]);

  const handlePrimaryChange = useCallback((content: string) => {
    updateContent(content);
  }, [updateContent]);

  const handleSecondaryChange = useCallback((content: string) => {
    updateSecondaryContent(content);
  }, [updateSecondaryContent]);

  const handleCloseSecondaryPane = useCallback(() => {
    closeSecondary();
    setSplitView(false);
  }, [closeSecondary, setSplitView]);

  const handleClosePrimaryPane = useCallback(async () => {
    if (!secondaryFile) {
      setSplitView(false);
      return;
    }

    const promoted = await promoteSecondaryToPrimary();
    if (!promoted) return;

    if (promoted.fileType === "pdf") {
      openPDFTab(promoted.path);
    } else {
      await openFile(promoted.path);
    }
    setSplitView(false);
  }, [secondaryFile, setSplitView, promoteSecondaryToPrimary, openPDFTab, openFile]);

  const isHorizontal = splitDirection === "horizontal";
  
  // 拖拽调整分栏大小
  const [primarySize, setPrimarySize] = useState(50); // 百分比
  const containerRef = useRef<HTMLDivElement>(null);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    let newSize: number;

    if (isHorizontal) {
      newSize = ((e.clientX - rect.left) / rect.width) * 100;
    } else {
      newSize = ((e.clientY - rect.top) / rect.height) * 100;
    }

    // 限制最小/最大尺寸 (10% - 90%)
    newSize = Math.max(10, Math.min(90, newSize));
    setPrimarySize(newSize);
  }, [isHorizontal]);
  
  // 切换方向时重置大小
  useEffect(() => {
    setPrimarySize(50);
  }, [splitDirection]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-popover">
      {/* Split toolbar */}
      <div className="h-8 flex items-center px-2 gap-1 border-b border-border/60 bg-popover shrink-0">
        <button
          onClick={() => setSplitDirection(isHorizontal ? "vertical" : "horizontal")}
          className={cn(
            "p-1.5 rounded transition-colors",
            "hover:bg-accent text-muted-foreground hover:text-foreground"
          )}
          title={isHorizontal ? t.layout.verticalSplit : t.layout.horizontalSplit}
        >
          {isHorizontal ? <Rows size={14} /> : <Columns size={14} />}
        </button>
        <button
          onClick={toggleSplitView}
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title={t.layout.closeSplit}
        >
          <X size={14} />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          分屏编辑
        </span>
      </div>

      {/* Split panes */}
      <div 
        ref={containerRef}
        className={cn(
          "flex-1 flex overflow-hidden bg-popover",
          isHorizontal ? "flex-row" : "flex-col"
        )}
      >
        {/* Primary pane */}
        <div 
          className={cn(
            "flex flex-col overflow-hidden",
            activePane === 'primary' && "ring-2 ring-primary/30 ring-inset"
          )}
          style={{
            [isHorizontal ? 'width' : 'height']: `${primarySize}%`,
            minWidth: isHorizontal ? '150px' : undefined,
            minHeight: !isHorizontal ? '100px' : undefined,
          }}
          onClick={() => setActivePane('primary')}
        >
          <EditorPane
            file={currentFile}
            content={currentContent}
            isDirty={isDirty}
            isLoading={isLoadingFile}
            onContentChange={handlePrimaryChange}
            onClose={() => {
              void handleClosePrimaryPane();
            }}
          />
        </div>

        {/* Resizable Divider */}
        <div 
          className={cn(
            "shrink-0 bg-border hover:bg-primary/50 transition-colors",
            isHorizontal 
              ? "w-1 cursor-col-resize hover:w-1" 
              : "h-1 cursor-row-resize hover:h-1",
            "group relative touch-none"
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
          {/* 拖拽手柄指示器 */}
          <div className={cn(
            "absolute bg-primary/30 opacity-0 group-hover:opacity-100 transition-opacity",
            isHorizontal 
              ? "w-1 h-8 top-1/2 left-0 -translate-y-1/2 rounded-full" 
              : "h-1 w-8 left-1/2 top-0 -translate-x-1/2 rounded-full"
          )} />
        </div>

        {/* Secondary pane */}
        <div 
          className={cn(
            "flex flex-col overflow-hidden",
            isHorizontal ? "border-l border-border/60" : "border-t border-border/60",
            activePane === 'secondary' && "ring-2 ring-primary/30 ring-inset"
          )}
          style={{
            [isHorizontal ? 'width' : 'height']: `${100 - primarySize}%`,
            minWidth: isHorizontal ? '150px' : undefined,
            minHeight: !isHorizontal ? '100px' : undefined,
          }}
          onClick={() => setActivePane('secondary')}
        >
          {secondaryFileType === 'pdf' && secondaryFile ? (
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {/* Close button for PDF */}
              <button
                onClick={handleCloseSecondaryPane}
                className="absolute top-2 right-2 z-10 p-1 bg-popover/80 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
                title={t.layout.closePanel}
              >
                <X size={14} />
              </button>
              <PDFViewer 
                filePath={secondaryFile} 
                className="flex-1"
              />
            </div>
          ) : (
            <EditorPane
              file={secondaryFile}
              content={secondaryContent}
              isDirty={secondaryIsDirty}
              isLoading={isLoadingSecondary}
              onContentChange={handleSecondaryChange}
              onClose={handleCloseSecondaryPane}
            />
          )}
        </div>
      </div>
    </div>
  );
}
