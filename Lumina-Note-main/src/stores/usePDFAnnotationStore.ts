/**
 * PDF 批注状态管理
 */

import { create } from 'zustand';
import { readFile, writeFile } from '@/lib/tauri';
import type { 
  Annotation, 
  AnnotationFile, 
  AnnotationPopoverState, 
  TextPosition,
  AnnotationType,
  AnnotationColor 
} from '@/types/annotation';
import {
  getAnnotationFilePath,
  parseAnnotationsMarkdown,
  stringifyAnnotationsMarkdown,
  createEmptyAnnotationFile,
  generateAnnotationId,
} from '@/services/pdf/annotations';
import { getCurrentTranslations } from '@/stores/useLocaleStore';

interface PDFAnnotationState {
  // 当前加载的批注文件
  currentFile: AnnotationFile | null;
  currentPdfPath: string | null;
  
  // 加载状态
  loading: boolean;
  error: string | null;
  
  // 弹窗状态
  popover: AnnotationPopoverState;
  
  // 当前高亮的批注 ID（用于跳转定位）
  highlightedAnnotationId: string | null;
  
  // 动作
  loadAnnotations: (pdfPath: string) => Promise<void>;
  saveAnnotations: () => Promise<void>;
  
  // 批注操作
  addAnnotation: (params: {
    type: AnnotationType;
    color: AnnotationColor;
    pageIndex: number;
    selectedText: string;
    position: TextPosition;
    note?: string;
  }) => Promise<Annotation>;
  
  updateAnnotation: (id: string, updates: Partial<Annotation>) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
  
  // 弹窗控制
  openPopover: (params: {
    x: number;
    y: number;
    selectedText: string;
    position: TextPosition;
  }) => void;
  closePopover: () => void;
  
  // 高亮控制
  setHighlightedAnnotation: (id: string | null) => void;
  
  // 获取当前页的批注
  getAnnotationsForPage: (pageIndex: number) => Annotation[];
  
  // 重置
  reset: () => void;
}

const initialPopoverState: AnnotationPopoverState = {
  isOpen: false,
  x: 0,
  y: 0,
  selectedText: '',
  position: null,
};

export const usePDFAnnotationStore = create<PDFAnnotationState>((set, get) => ({
  currentFile: null,
  currentPdfPath: null,
  loading: false,
  error: null,
  popover: initialPopoverState,
  highlightedAnnotationId: null,
  
  loadAnnotations: async (pdfPath: string) => {
    // 如果已经加载了相同的文件，跳过
    if (get().currentPdfPath === pdfPath && get().currentFile) {
      return;
    }
    
    set({ loading: true, error: null, currentPdfPath: pdfPath });
    
    const annotationPath = getAnnotationFilePath(pdfPath);
    
    try {
      const content = await readFile(annotationPath);
      const file = parseAnnotationsMarkdown(content, pdfPath);
      set({ currentFile: file, loading: false });
    } catch (err) {
      // 文件不存在，创建空文件
      if (String(err).includes('not found') || String(err).includes('No such file')) {
        const emptyFile = createEmptyAnnotationFile(pdfPath);
        set({ currentFile: emptyFile, loading: false });
      } else {
        console.error('Failed to load annotations:', err);
        const t = getCurrentTranslations();
        set({ 
          error: t.pdfViewer.annotation.loadFailed.replace("{error}", String(err)),
          loading: false,
          currentFile: createEmptyAnnotationFile(pdfPath),
        });
      }
    }
  },
  
  saveAnnotations: async () => {
    const { currentFile, currentPdfPath } = get();
    if (!currentFile || !currentPdfPath) return;
    
    const annotationPath = getAnnotationFilePath(currentPdfPath);
    const content = stringifyAnnotationsMarkdown(currentFile);
    
    try {
      console.log('Saving annotations to:', annotationPath);
      await writeFile(annotationPath, content);
      console.log('Annotations saved successfully');
      
      // 通知其他 store 刷新批注文件（如果已打开）
      const { useFileStore } = await import('./useFileStore');
      const { useSplitStore } = await import('./useSplitStore');
      
      const fileStore = useFileStore.getState();
      const splitStore = useSplitStore.getState();
      
      // 检查主编辑器是否打开了批注文件
      if (fileStore.currentFile === annotationPath) {
        fileStore.openFile(annotationPath, false, true); // forceReload
      }
      
      // 检查分栏是否打开了批注文件
      if (splitStore.secondaryFile === annotationPath) {
        splitStore.reloadSecondaryIfOpen(annotationPath);
      }
    } catch (err) {
      console.error('Failed to save annotations:', err);
      const t = getCurrentTranslations();
      set({ error: t.pdfViewer.annotation.saveFailed.replace("{error}", String(err)) });
    }
  },
  
  addAnnotation: async (params) => {
    const { currentFile, currentPdfPath } = get();
    if (!currentFile || !currentPdfPath) {
      throw new Error('No annotation file loaded');
    }
    
    const now = new Date().toISOString();
    const newAnnotation: Annotation = {
      id: generateAnnotationId(),
      type: params.type,
      color: params.color,
      pageIndex: params.pageIndex,
      selectedText: params.selectedText,
      note: params.note,
      position: params.position,
      createdAt: now,
      updatedAt: now,
    };
    
    const updatedFile: AnnotationFile = {
      ...currentFile,
      annotations: [...currentFile.annotations, newAnnotation],
      updatedAt: now,
    };
    
    set({ currentFile: updatedFile });
    
    // 自动保存
    await get().saveAnnotations();
    
    return newAnnotation;
  },
  
  updateAnnotation: async (id: string, updates: Partial<Annotation>) => {
    const { currentFile } = get();
    if (!currentFile) return;
    
    const now = new Date().toISOString();
    const updatedFile: AnnotationFile = {
      ...currentFile,
      annotations: currentFile.annotations.map(ann =>
        ann.id === id
          ? { ...ann, ...updates, updatedAt: now }
          : ann
      ),
      updatedAt: now,
    };
    
    set({ currentFile: updatedFile });
    await get().saveAnnotations();
  },
  
  deleteAnnotation: async (id: string) => {
    const { currentFile } = get();
    if (!currentFile) return;
    
    const updatedFile: AnnotationFile = {
      ...currentFile,
      annotations: currentFile.annotations.filter(ann => ann.id !== id),
      updatedAt: new Date().toISOString(),
    };
    
    set({ currentFile: updatedFile });
    await get().saveAnnotations();
  },
  
  openPopover: (params) => {
    set({
      popover: {
        isOpen: true,
        x: params.x,
        y: params.y,
        selectedText: params.selectedText,
        position: params.position,
      },
    });
  },
  
  closePopover: () => {
    set({ popover: initialPopoverState });
  },
  
  setHighlightedAnnotation: (id: string | null) => {
    set({ highlightedAnnotationId: id });
    
    // 3秒后自动清除高亮
    if (id) {
      setTimeout(() => {
        if (get().highlightedAnnotationId === id) {
          set({ highlightedAnnotationId: null });
        }
      }, 3000);
    }
  },
  
  getAnnotationsForPage: (pageIndex: number) => {
    const { currentFile } = get();
    if (!currentFile) return [];
    return currentFile.annotations.filter(ann => ann.pageIndex === pageIndex);
  },
  
  reset: () => {
    set({
      currentFile: null,
      currentPdfPath: null,
      loading: false,
      error: null,
      popover: initialPopoverState,
      highlightedAnnotationId: null,
    });
  },
}));
