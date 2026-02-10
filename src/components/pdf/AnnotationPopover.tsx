/**
 * PDF 批注添加弹窗
 * 用于添加高亮、下划线和笔记
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { usePDFAnnotationStore } from '@/stores/usePDFAnnotationStore';
import { usePDFStore } from '@/stores/usePDFStore';
import { useAIStore } from '@/stores/useAIStore';
import { useUIStore } from '@/stores/useUIStore';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { ANNOTATION_COLORS, type AnnotationColor, type AnnotationType } from '@/types/annotation';
import { Highlighter, Underline, StickyNote, X, Sparkles } from 'lucide-react';

interface AnnotationPopoverProps {
  className?: string;
}

export function AnnotationPopover({ className }: AnnotationPopoverProps) {
  const { popover, closePopover, addAnnotation } = usePDFAnnotationStore();
  const { currentPage } = usePDFStore();
  const { t } = useLocaleStore();
  const chatMode = useUIStore((state) => state.chatMode);
  const setRightPanelTab = useUIStore((state) => state.setRightPanelTab);
  const setRightSidebarOpen = useUIStore((state) => state.setRightSidebarOpen);
  const setFloatingPanelOpen = useUIStore((state) => state.setFloatingPanelOpen);
  const [selectedColor, setSelectedColor] = useState<AnnotationColor>('yellow');
  const [selectedType, setSelectedType] = useState<AnnotationType>('highlight');
  const [note, setNote] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  // 重置状态
  useEffect(() => {
    if (!popover.isOpen) {
      setNote('');
      setIsExpanded(false);
      setSelectedColor('yellow');
      setSelectedType('highlight');
    }
  }, [popover.isOpen]);
  
  // 点击外部关闭
  useEffect(() => {
    if (!popover.isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [popover.isOpen, closePopover]);
  
  // 快速添加批注（不展开笔记）
  const handleQuickAdd = useCallback(async (type: AnnotationType, color: AnnotationColor) => {
    if (!popover.position) return;
    
    await addAnnotation({
      type,
      color,
      pageIndex: currentPage,
      selectedText: popover.selectedText,
      position: popover.position,
    });
    
    closePopover();
  }, [popover, currentPage, addAnnotation, closePopover]);
  
  // 展开笔记编辑
  const handleExpandNote = useCallback(() => {
    setIsExpanded(true);
  }, []);
  
  // 添加带笔记的批注
  const handleAddWithNote = useCallback(async () => {
    if (!popover.position) return;
    
    await addAnnotation({
      type: selectedType,
      color: selectedColor,
      pageIndex: currentPage,
      selectedText: popover.selectedText,
      position: popover.position,
      note: note.trim() || undefined,
    });
    
    closePopover();
  }, [popover, currentPage, selectedType, selectedColor, note, addAnnotation, closePopover]);

  const handleSendAsReference = useCallback(() => {
    const text = popover.selectedText.trim();
    if (!text) return;

    const citationText = `> PDF Selection (P${currentPage})\n> ${text.split('\n').join('\n> ')}`;
    const source = `PDF P${currentPage}`;
    setRightSidebarOpen(true);
    setRightPanelTab('chat');
    setFloatingPanelOpen(true);
    if (chatMode === 'research') {
      useAIStore.getState().enqueueInputAppend(citationText);
    } else if (chatMode === 'codex') {
      navigator.clipboard.writeText(citationText).catch((err) => {
        console.warn('Failed to copy PDF selection for Codex:', err);
      });
    } else {
      useAIStore.getState().addTextSelection(citationText, source);
    }
    closePopover();
    window.getSelection()?.removeAllRanges();
  }, [popover.selectedText, currentPage, chatMode, setRightSidebarOpen, setRightPanelTab, setFloatingPanelOpen, closePopover]);
  
  if (!popover.isOpen) return null;
  
  // 计算弹窗位置（避免超出屏幕）
  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(popover.x, window.innerWidth - 280),
    top: Math.min(popover.y + 10, window.innerHeight - (isExpanded ? 240 : 80)),
    zIndex: 9999,
  };
  
  return (
    <div
      ref={popoverRef}
      className={cn(
        'bg-popover border border-border rounded-lg shadow-lg p-2',
        'animate-in fade-in-0 zoom-in-95 duration-100',
        className
      )}
      style={popoverStyle}
    >
      {!isExpanded ? (
        // 紧凑模式：快速添加
        <div className="flex items-center gap-1">
          {/* 类型按钮 */}
          <button
            onClick={() => handleQuickAdd('highlight', selectedColor)}
            className="p-2 hover:bg-accent rounded transition-colors"
            title={t.pdfViewer.annotation.highlight}
          >
            <Highlighter size={18} style={{ color: ANNOTATION_COLORS[selectedColor].border }} />
          </button>
          <button
            onClick={() => handleQuickAdd('underline', selectedColor)}
            className="p-2 hover:bg-accent rounded transition-colors"
            title={t.pdfViewer.annotation.underline}
          >
            <Underline size={18} style={{ color: ANNOTATION_COLORS[selectedColor].border }} />
          </button>
          <button
            onClick={handleExpandNote}
            className="p-2 hover:bg-accent rounded transition-colors"
            title={t.pdfViewer.annotation.addNote}
          >
            <StickyNote size={18} />
          </button>

          <div className="w-px h-6 bg-border mx-1" />

          <button
            onClick={handleSendAsReference}
            className="p-2 hover:bg-accent rounded transition-colors"
            title={t.pdfViewer.elementPanel.chatWithAi}
          >
            <Sparkles size={16} />
          </button>
          
          {/* 分隔线 */}
          <div className="w-px h-6 bg-border mx-1" />
          
          {/* 颜色选择 */}
          <div className="flex items-center gap-1">
            {(Object.keys(ANNOTATION_COLORS) as AnnotationColor[]).map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={cn(
                  'w-5 h-5 rounded-full transition-transform',
                  selectedColor === color && 'ring-2 ring-offset-1 ring-foreground scale-110'
                )}
                style={{ backgroundColor: ANNOTATION_COLORS[color].border }}
                title={(t.pdfViewer.annotation.colors as Record<string, string>)?.[color] || ANNOTATION_COLORS[color].label}
              />
            ))}
          </div>
        </div>
      ) : (
        // 展开模式：编辑笔记
        <div className="w-64 space-y-3">
          {/* 头部 */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t.pdfViewer.annotation.addNote}</span>
            <button
              onClick={closePopover}
              className="p-1 hover:bg-accent rounded"
            >
              <X size={14} />
            </button>
          </div>
          
          {/* 选中的文本预览 */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded max-h-16 overflow-y-auto">
            "{popover.selectedText.slice(0, 100)}{popover.selectedText.length > 100 ? '...' : ''}"
          </div>
          
          {/* 类型和颜色选择 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted rounded p-0.5">
              <button
                onClick={() => setSelectedType('highlight')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  selectedType === 'highlight' && 'bg-background shadow-sm'
                )}
              >
                <Highlighter size={14} />
              </button>
              <button
                onClick={() => setSelectedType('underline')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  selectedType === 'underline' && 'bg-background shadow-sm'
                )}
              >
                <Underline size={14} />
              </button>
            </div>
            
            <div className="flex items-center gap-1">
              {(Object.keys(ANNOTATION_COLORS) as AnnotationColor[]).map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    'w-4 h-4 rounded-full transition-transform',
                    selectedColor === color && 'ring-2 ring-offset-1 ring-foreground scale-110'
                  )}
                  style={{ backgroundColor: ANNOTATION_COLORS[color].border }}
                />
              ))}
            </div>
          </div>
          
          {/* 笔记输入 */}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.pdfViewer.annotation.notePlaceholder}
            className="w-full h-20 px-2 py-1.5 text-sm bg-muted/50 border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          
          {/* 操作按钮 */}
          <div className="flex justify-end gap-2">
            <button
              onClick={closePopover}
              className="px-3 py-1.5 text-sm hover:bg-accent rounded transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={handleAddWithNote}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              {t.common.add}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
