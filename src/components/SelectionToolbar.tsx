/**
 * 选中文本浮动工具栏
 * 当用户在编辑器中选中文字时显示，提供 "Add to Chat" 功能
 */

import { useState, useEffect, useCallback } from "react";
import { MessageSquarePlus, Video } from "lucide-react";
import { useAIStore } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";

interface SelectionToolbarProps {
  containerRef: React.RefObject<HTMLElement>;
}

export function SelectionToolbar({ containerRef }: SelectionToolbarProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const { addTextSelection } = useAIStore();
  const { currentFile, openVideoNoteFromContent } = useFileStore();

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setPosition(null);
      setSelectedText("");
      return;
    }

    // 检查选区是否在容器内
    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setPosition(null);
      setSelectedText("");
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      setPosition(null);
      return;
    }

    setSelectedText(text);

    // 计算工具栏位置（在选区右侧）
    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // 考虑滚动偏移
    const scrollTop = container.scrollTop;
    const scrollLeft = container.scrollLeft;
    
    // 工具栏大约宽度 130px
    const toolbarWidth = 140;
    let x = rect.right - containerRect.left + scrollLeft + 8;  // 选区右边 + 8px 间距
    let y = rect.top - containerRect.top + scrollTop + rect.height / 2;  // 垂直居中
    
    // 边界检测：如果右侧放不下，尝试左侧
    if (rect.right - containerRect.left + toolbarWidth + 8 > containerRect.width) {
      const leftX = rect.left - containerRect.left + scrollLeft - toolbarWidth - 8;
      // 如果左侧也放不下（会变成负数），就放在选区正上方
      if (leftX < scrollLeft) {
        x = rect.left - containerRect.left + scrollLeft;
        y = rect.top - containerRect.top + scrollTop - 40;  // 选区上方
      } else {
        x = leftX;
      }
    }
    
    // 确保 x 不小于 0
    x = Math.max(scrollLeft + 8, x);
    
    // 确保 y 在可视区域内（相对于滚动位置）
    const viewportTop = scrollTop;
    const viewportBottom = scrollTop + containerRect.height;
    y = Math.max(viewportTop + 20, Math.min(y, viewportBottom - 40));
    
    setPosition({ x, y });
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // 点击外部时隐藏
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-selection-toolbar]")) {
        // 延迟隐藏，让按钮点击事件先执行
        setTimeout(() => {
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed) {
            setPosition(null);
          }
        }, 100);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const handleAddToChat = () => {
    if (!selectedText) return;
    
    // 获取当前文件名
    const fileName = currentFile 
      ? currentFile.split(/[/\\]/).pop()?.replace(".md", "") || "未知"
      : "未知";
    
    addTextSelection(selectedText, fileName, currentFile || undefined);
    
    // 清除选区
    window.getSelection()?.removeAllRanges();
    setPosition(null);
    setSelectedText("");
  };

  const handleOpenAsVideoNote = () => {
    if (!selectedText.trim()) return;

    // 直接利用现有解析逻辑：允许用户选中完整的视频笔记 Markdown 段落
    // 若解析失败，底层会降级为普通空视频标签
    openVideoNoteFromContent(selectedText, "视频笔记");

    window.getSelection()?.removeAllRanges();
    setPosition(null);
    setSelectedText("");
  };

  if (!position || !selectedText) return null;

  return (
    <div
      data-selection-toolbar
      className="absolute z-50 transform -translate-y-1/2"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 bg-background border border-border rounded-lg shadow-lg">
        <button
          onClick={handleAddToChat}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-foreground hover:bg-accent rounded transition-colors whitespace-nowrap"
          title="添加到对话"
        >
          <MessageSquarePlus size={14} />
          <span>Add to Chat</span>
        </button>
        <button
          onClick={handleOpenAsVideoNote}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-foreground hover:bg-accent rounded transition-colors whitespace-nowrap"
          title="作为视频笔记打开（支持识别时间戳）"
        >
          <Video size={14} />
          <span>Video Note</span>
        </button>
      </div>
      {/* 左侧小三角指向选中文字 */}
      <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-border" />
    </div>
  );
}
