import { create } from "zustand";

interface PDFState {
  // 当前打开的 PDF
  currentFile: string | null;

  // 视图状态
  currentPage: number;
  scale: number;

  // 动作
  setCurrentFile: (path: string | null) => void;
  setCurrentPage: (page: number) => void;
  setScale: (scale: number) => void;

  // 重置状态
  reset: () => void;
}

const initialState = {
  currentFile: null,
  currentPage: 1,
  scale: 1,
};

export const usePDFStore = create<PDFState>((set) => ({
  ...initialState,

  setCurrentFile: (path) => set({ currentFile: path }),

  setCurrentPage: (page) => set({ currentPage: page }),

  setScale: (scale) => set({ scale: Math.max(0.25, Math.min(3, scale)) }),

  reset: () => set(initialState),
}));
