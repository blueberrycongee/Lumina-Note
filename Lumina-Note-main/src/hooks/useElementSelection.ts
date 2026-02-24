import { useState, useCallback } from "react";
import type { PDFElement } from "@/types/pdf";

export function useElementSelection() {
  const [selectedElements, setSelectedElements] = useState<PDFElement[]>([]);
  const [hoveredElement, setHoveredElement] = useState<PDFElement | null>(null);

  // 选择元素
  const selectElement = useCallback((element: PDFElement, isMultiSelect: boolean) => {
    setSelectedElements(prev => {
      if (isMultiSelect) {
        // 多选模式：切换选中状态
        const isAlreadySelected = prev.some(e => e.id === element.id);
        if (isAlreadySelected) {
          return prev.filter(e => e.id !== element.id);
        } else {
          return [...prev, element];
        }
      } else {
        // 单选模式：替换选中
        return [element];
      }
    });
  }, []);

  // 选择多个元素
  const selectElements = useCallback((elements: PDFElement[], append: boolean = false) => {
    setSelectedElements(prev => {
      if (append) {
        // 追加选择，去重
        const newElements = elements.filter(
          e => !prev.some(p => p.id === e.id)
        );
        return [...prev, ...newElements];
      } else {
        return elements;
      }
    });
  }, []);

  // 清除选择
  const clearSelection = useCallback(() => {
    setSelectedElements([]);
  }, []);

  // 删除选中的元素
  const removeFromSelection = useCallback((elementId: string) => {
    setSelectedElements(prev => prev.filter(e => e.id !== elementId));
  }, []);

  // 设置悬浮元素
  const setHoveredElementById = useCallback((elementId: string | null, allElements: PDFElement[]) => {
    if (elementId) {
      const element = allElements.find(e => e.id === elementId);
      setHoveredElement(element || null);
    } else {
      setHoveredElement(null);
    }
  }, []);

  // 获取选中元素的 ID 列表
  const selectedElementIds = selectedElements.map(e => e.id);

  return {
    selectedElements,
    selectedElementIds,
    hoveredElement,
    hoveredElementId: hoveredElement?.id || null,
    selectElement,
    selectElements,
    clearSelection,
    removeFromSelection,
    setHoveredElementById,
  };
}
