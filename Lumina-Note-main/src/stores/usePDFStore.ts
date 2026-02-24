import { create } from "zustand";
import type { PDFElement, PDFStructure, ParseStatus, ParseBackend } from "@/types/pdf";

interface PDFState {
  // 当前打开的 PDF
  currentFile: string | null;
  
  // 解析状态
  parseStatus: ParseStatus;
  parseBackend: ParseBackend;
  parseError: string | null;
  
  // 结构化数据
  structure: PDFStructure | null;
  
  // 选中的元素引用
  selectedElements: PDFElement[];
  
  // 视图状态
  currentPage: number;
  scale: number;
  
  // 动作
  setCurrentFile: (path: string | null) => void;
  setParseStatus: (status: ParseStatus) => void;
  setParseBackend: (backend: ParseBackend) => void;
  setParseError: (error: string | null) => void;
  setStructure: (structure: PDFStructure | null) => void;
  
  // 元素选择
  addElement: (element: PDFElement) => void;
  removeElement: (elementId: string) => void;
  clearElements: () => void;
  
  // 视图控制
  setCurrentPage: (page: number) => void;
  setScale: (scale: number) => void;
  
  // 重置状态
  reset: () => void;
}

const initialState = {
  currentFile: null,
  parseStatus: 'idle' as ParseStatus,
  parseBackend: 'none' as ParseBackend,
  parseError: null,
  structure: null,
  selectedElements: [],
  currentPage: 1,
  scale: 1,
};

export const usePDFStore = create<PDFState>((set, get) => ({
  ...initialState,
  
  setCurrentFile: (path) => set({ currentFile: path }),
  
  setParseStatus: (status) => set({ parseStatus: status }),
  
  setParseBackend: (backend) => set({ parseBackend: backend }),
  
  setParseError: (error) => set({ parseError: error }),
  
  setStructure: (structure) => set({ structure }),
  
  addElement: (element) => {
    const { selectedElements } = get();
    // 避免重复添加
    if (selectedElements.some(e => e.id === element.id)) return;
    set({ selectedElements: [...selectedElements, element] });
  },
  
  removeElement: (elementId) => {
    const { selectedElements } = get();
    set({ selectedElements: selectedElements.filter(e => e.id !== elementId) });
  },
  
  clearElements: () => set({ selectedElements: [] }),
  
  setCurrentPage: (page) => set({ currentPage: page }),
  
  setScale: (scale) => set({ scale: Math.max(0.25, Math.min(3, scale)) }),
  
  reset: () => set(initialState),
}));
