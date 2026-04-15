import { create } from "zustand";
import { readFile, saveFile } from "@/lib/tauri";
import { useFavoriteStore } from "@/stores/useFavoriteStore";
import { reportOperationError } from "@/lib/reportError";

// 分栏文件类型
export type SplitFileType = 'markdown' | 'pdf';

// 活动面板
export type ActivePane = 'primary' | 'secondary';

// Secondary editor state for split view
interface SplitState {
  // 活动面板（最后点击的面板）
  activePane: ActivePane;
  setActivePane: (pane: ActivePane) => void;
  
  // Secondary file
  secondaryFile: string | null;
  secondaryFileType: SplitFileType;
  secondaryContent: string;
  secondaryIsDirty: boolean;
  isLoadingSecondary: boolean;
  
  // PDF 特有状态
  secondaryPdfPage: number;
  secondaryPdfAnnotationId: string | null;
  
  // Actions
  openSecondaryFile: (path: string) => Promise<void>;
  openSecondaryPdf: (path: string, page?: number, annotationId?: string) => void;
  updateSecondaryContent: (content: string) => void;
  saveSecondary: () => Promise<void>;
  closeSecondary: () => void;
  promoteSecondaryToPrimary: () => Promise<{
    path: string;
    fileType: SplitFileType;
    page: number;
    annotationId: string | null;
  } | null>;
  swapPanels: () => void;
  reloadSecondaryIfOpen: (path: string, options?: { skipIfDirty?: boolean }) => Promise<void>;
}

export const useSplitStore = create<SplitState>((set, get) => ({
  activePane: 'primary',
  setActivePane: (pane) => set({ activePane: pane }),
  
  secondaryFile: null,
  secondaryFileType: 'markdown',
  secondaryContent: "",
  secondaryIsDirty: false,
  isLoadingSecondary: false,
  secondaryPdfPage: 1,
  secondaryPdfAnnotationId: null,

  openSecondaryFile: async (path: string) => {
    set({ isLoadingSecondary: true });
    try {
      const content = await readFile(path);
      set({
        secondaryFile: path,
        secondaryFileType: 'markdown',
        secondaryContent: content,
        secondaryIsDirty: false,
        isLoadingSecondary: false,
      });
      useFavoriteStore.getState().markOpened(path);
    } catch (error) {
      reportOperationError({
        source: "SplitStore.openSecondaryFile",
        action: "Open secondary file",
        error,
        context: { path },
      });
      set({ isLoadingSecondary: false });
    }
  },
  
  openSecondaryPdf: (path: string, page: number = 1, annotationId?: string) => {
    set({
      secondaryFile: path,
      secondaryFileType: 'pdf',
      secondaryContent: '',
      secondaryIsDirty: false,
      isLoadingSecondary: false,
      secondaryPdfPage: page,
      secondaryPdfAnnotationId: annotationId || null,
    });
  },

  updateSecondaryContent: (content: string) => {
    set({ secondaryContent: content, secondaryIsDirty: true });
  },

  saveSecondary: async () => {
    const { secondaryFile, secondaryContent, secondaryIsDirty } = get();
    if (!secondaryFile || !secondaryIsDirty) return;
    
    try {
      await saveFile(secondaryFile, secondaryContent);
      set({ secondaryIsDirty: false });
    } catch (error) {
      reportOperationError({
        source: "SplitStore.saveSecondary",
        action: "Save secondary file",
        error,
        context: { path: secondaryFile },
      });
    }
  },

  closeSecondary: () => {
    set({
      secondaryFile: null,
      secondaryFileType: 'markdown',
      secondaryContent: "",
      secondaryIsDirty: false,
      secondaryPdfPage: 1,
      secondaryPdfAnnotationId: null,
      activePane: 'primary', // 关闭分栏后重置为主面板
    });
  },

  promoteSecondaryToPrimary: async () => {
    const {
      secondaryFile,
      secondaryFileType,
      secondaryIsDirty,
      secondaryPdfPage,
      secondaryPdfAnnotationId,
    } = get();
    if (!secondaryFile) return null;

    // Ensure unsaved markdown edits are persisted before promoting.
    if (secondaryFileType === "markdown" && secondaryIsDirty) {
      await get().saveSecondary();
      if (get().secondaryIsDirty) {
        return null;
      }
    }

    const result = {
      path: secondaryFile,
      fileType: secondaryFileType,
      page: secondaryPdfPage,
      annotationId: secondaryPdfAnnotationId,
    };

    set({
      secondaryFile: null,
      secondaryFileType: "markdown",
      secondaryContent: "",
      secondaryIsDirty: false,
      secondaryPdfPage: 1,
      secondaryPdfAnnotationId: null,
      activePane: "primary",
    });

    return result;
  },

  swapPanels: () => {
    // This will be handled at the UI level by swapping with main store
  },
  
  // Reload secondary file if it's currently open (for external updates)
  reloadSecondaryIfOpen: async (path: string, options?: { skipIfDirty?: boolean }) => {
    const { secondaryFile, secondaryIsDirty } = get();
    if (secondaryFile !== path) return;
    if (options?.skipIfDirty && secondaryIsDirty) return;
    
    try {
      const content = await readFile(path);
      set({
        secondaryContent: content,
        secondaryIsDirty: false,
      });
    } catch (error) {
      reportOperationError({
        source: "SplitStore.reloadSecondaryIfOpen",
        action: "Reload secondary file",
        error,
        level: "warning",
        context: { path },
      });
    }
  },
}));
