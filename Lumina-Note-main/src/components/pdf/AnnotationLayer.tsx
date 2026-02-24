/**
 * PDF 批注高亮层
 * 在 PDF 页面上叠加显示高亮和批注
 */

import { useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { usePDFAnnotationStore } from '@/stores/usePDFAnnotationStore';
import { ANNOTATION_COLORS } from '@/types/annotation';
import type { Annotation } from '@/types/annotation';
import { useLocaleStore } from '@/stores/useLocaleStore';

interface AnnotationLayerProps {
  pageIndex: number;        // 当前页码 (1-based)
  pageWidth: number;        // 页面原始宽度
  pageHeight: number;       // 页面原始高度
  scale: number;            // 缩放比例
  className?: string;
}

export function AnnotationLayer({
  pageIndex,
  pageWidth,
  pageHeight,
  scale,
  className,
}: AnnotationLayerProps) {
  const { t } = useLocaleStore();
  const { 
    currentFile, 
    highlightedAnnotationId,
    deleteAnnotation,
  } = usePDFAnnotationStore();
  
  // 获取当前页的批注
  const pageAnnotations = useMemo(() => {
    if (!currentFile) return [];
    return currentFile.annotations.filter(ann => ann.pageIndex === pageIndex);
  }, [currentFile, pageIndex]);
  
  // 处理批注点击
  const handleAnnotationClick = useCallback((ann: Annotation, e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: 可以显示编辑弹窗
    console.log('Annotation clicked:', ann);
  }, []);
  
  // 处理批注右键菜单
  const handleContextMenu = useCallback((ann: Annotation, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 简单的确认删除
    const previewText = ann.selectedText.slice(0, 50);
    const confirmText = t.pdfViewer.annotation.deleteConfirm.replace("{text}", previewText);
    if (confirm(confirmText)) {
      deleteAnnotation(ann.id);
    }
  }, [deleteAnnotation, t]);
  
  if (pageAnnotations.length === 0) {
    return null;
  }
  
  return (
    <div
      className={cn(
        'absolute inset-0 pointer-events-none',
        className
      )}
      style={{
        width: pageWidth * scale,
        height: pageHeight * scale,
      }}
    >
      {pageAnnotations.map((ann) => {
        const colorConfig = ANNOTATION_COLORS[ann.color];
        const isHighlighted = highlightedAnnotationId === ann.id;
        
        return (
          <div key={ann.id} className="contents">
            {ann.position.rects.map((rect, idx) => {
              // 将百分比转换为像素
              const left = rect.x * pageWidth * scale;
              const top = rect.y * pageHeight * scale;
              const width = rect.width * pageWidth * scale;
              const height = rect.height * pageHeight * scale;
              
              return (
                <div
                  key={`${ann.id}-${idx}`}
                  className={cn(
                    'absolute pointer-events-auto cursor-pointer transition-all duration-200',
                    'hover:ring-2 hover:ring-offset-1',
                    isHighlighted && 'animate-pulse ring-2 ring-offset-1'
                  )}
                  style={{
                    left,
                    top,
                    width,
                    height,
                    backgroundColor: colorConfig.bg,
                    borderBottom: ann.type === 'underline' 
                      ? `2px solid ${colorConfig.border}` 
                      : 'none',
                    '--tw-ring-color': colorConfig.border,
                  } as React.CSSProperties}
                  onClick={(e) => handleAnnotationClick(ann, e)}
                  onContextMenu={(e) => handleContextMenu(ann, e)}
                  title={ann.note || ann.selectedText}
                />
              );
            })}
            
            {/* 笔记图标（如果有笔记） */}
            {ann.note && ann.position.rects.length > 0 && (
              <div
                className="absolute pointer-events-auto cursor-pointer"
                style={{
                  left: (ann.position.rects[0].x + ann.position.rects[0].width) * pageWidth * scale + 2,
                  top: ann.position.rects[0].y * pageHeight * scale,
                  width: 16,
                  height: 16,
                }}
                onClick={(e) => handleAnnotationClick(ann, e)}
                title={ann.note}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill={colorConfig.border}
                  className="w-4 h-4"
                >
                  <path d="M14 1a1 1 0 0 1 1 1v8.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 0-.5.5V14a.5.5 0 0 1-.5.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v11.5a2 2 0 0 0 2 2h9.793l3.707-3.707V2a2 2 0 0 0-2-2H2z"/>
                  <path d="M4.5 4a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm-6 3a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5z"/>
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
