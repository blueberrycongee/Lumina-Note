import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { PDFElement } from "@/types/pdf";

interface InteractiveLayerProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  elements: PDFElement[];
  selectedElementIds: string[];
  hoveredElementId: string | null;
  onElementHover: (elementId: string | null) => void;
  onElementClick: (element: PDFElement, isMultiSelect: boolean) => void;
  className?: string;
}

export function InteractiveLayer({
  pageIndex,
  pageWidth,
  pageHeight,
  scale,
  elements,
  selectedElementIds,
  hoveredElementId,
  onElementHover,
  onElementClick,
  className,
}: InteractiveLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  // 过滤当前页的元素
  const pageElements = elements.filter(el => el.pageIndex === pageIndex);
  
  
  // 处理鼠标进入元素
  const handleMouseEnter = useCallback((elementId: string) => {
    if (!isDragging) {
      onElementHover(elementId);
    }
  }, [isDragging, onElementHover]);

  // 处理鼠标离开元素
  const handleMouseLeave = useCallback(() => {
    if (!isDragging) {
      onElementHover(null);
    }
  }, [isDragging, onElementHover]);

  // 处理点击元素
  const handleElementClick = useCallback((e: React.MouseEvent, element: PDFElement) => {
    e.stopPropagation();
    const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
    onElementClick(element, isMultiSelect);
  }, [onElementClick]);

  // 处理框选开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只在空白区域按下时启动框选
    if (e.target === containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setIsDragging(true);
      setSelectionBox({
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        endX: e.clientX - rect.left,
        endY: e.clientY - rect.top,
      });
    }
  }, []);

  // 处理框选移动
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && containerRef.current && selectionBox) {
      const rect = containerRef.current.getBoundingClientRect();
      setSelectionBox(prev => prev ? {
        ...prev,
        endX: e.clientX - rect.left,
        endY: e.clientY - rect.top,
      } : null);
    }
  }, [isDragging, selectionBox]);

  // 处理框选结束
  const handleMouseUp = useCallback(() => {
    if (isDragging && selectionBox) {
      // TODO: 计算框选区域内的元素并选中
      setIsDragging(false);
      setSelectionBox(null);
    }
  }, [isDragging, selectionBox]);

  // 注册全局鼠标事件
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 计算元素的实际位置（考虑缩放）
  const getElementStyle = (element: PDFElement) => {
    const [x1, y1, x2, y2] = element.bbox;
    return {
      left: `${x1 * scale}px`,
      top: `${y1 * scale}px`,
      width: `${(x2 - x1) * scale}px`,
      height: `${(y2 - y1) * scale}px`,
    };
  };

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 pointer-events-auto", className)}
      style={{
        width: `${pageWidth * scale}px`,
        height: `${pageHeight * scale}px`,
        zIndex: 10,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* 渲染元素覆盖层 */}
      {pageElements.map((element) => {
        const isSelected = selectedElementIds.includes(element.id);
        const isHovered = hoveredElementId === element.id;

        return (
          <div
            key={element.id}
            className={cn(
              "absolute cursor-pointer transition-all",
              isSelected && "ring-2 ring-primary bg-primary/10",
              isHovered && !isSelected && "ring-2 ring-primary/50 bg-primary/5"
            )}
            style={getElementStyle(element)}
            onMouseEnter={() => handleMouseEnter(element.id)}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => handleElementClick(e, element)}
            title={element.type}
          />
        );
      })}

      {/* 框选矩形 */}
      {isDragging && selectionBox && (
        <div
          className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
          style={{
            left: `${Math.min(selectionBox.startX, selectionBox.endX)}px`,
            top: `${Math.min(selectionBox.startY, selectionBox.endY)}px`,
            width: `${Math.abs(selectionBox.endX - selectionBox.startX)}px`,
            height: `${Math.abs(selectionBox.endY - selectionBox.startY)}px`,
          }}
        />
      )}
    </div>
  );
}
