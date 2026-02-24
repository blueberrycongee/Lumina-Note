/**
 * 编辑器状态管理 - Agent 编辑实时预览
 */

import { create } from "zustand";
import { diffLines, Change } from "diff";

export interface PendingEdit {
  id: string;              // 唯一标识（用于去重）
  path: string;            // 目标文件路径
  oldContent: string;      // 原始内容
  newContent: string;      // 新内容
  changes: Change[];       // diff 结果
  timestamp: number;       // 触发时间
}

export interface HighlightRange {
  from: number;
  to: number;
  type: "added" | "removed" | "modified";
}

interface EditorState {
  // 待播放的编辑
  pendingEdit: PendingEdit | null;
  
  // 动画状态
  animationState: "idle" | "playing" | "completed";
  animationProgress: number; // 0-100
  
  // 高亮状态
  highlightedRanges: HighlightRange[];
  highlightExpireAt: number | null;
  
  // Actions
  setPendingEdit: (edit: Omit<PendingEdit, "id" | "changes" | "timestamp">) => void;
  startAnimation: () => void;
  updateProgress: (progress: number) => void;
  completeAnimation: (highlights: HighlightRange[]) => void;
  clearHighlight: () => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  pendingEdit: null,
  animationState: "idle",
  animationProgress: 0,
  highlightedRanges: [],
  highlightExpireAt: null,

  setPendingEdit: ({ path, oldContent, newContent }) => {
    const changes = diffLines(oldContent, newContent);
    set({
      pendingEdit: {
        id: `${path}-${Date.now()}`,
        path,
        oldContent,
        newContent,
        changes,
        timestamp: Date.now(),
      },
      animationState: "idle",
      animationProgress: 0,
    });
  },

  startAnimation: () => {
    set({ animationState: "playing" });
  },

  updateProgress: (progress) => {
    set({ animationProgress: progress });
  },

  completeAnimation: (highlights) => {
    set({
      animationState: "completed",
      animationProgress: 100,
      highlightedRanges: highlights,
      highlightExpireAt: Date.now() + 5000, // 5秒后清除高亮
    });
  },

  clearHighlight: () => {
    set({
      highlightedRanges: [],
      highlightExpireAt: null,
      pendingEdit: null,
      animationState: "idle",
    });
  },

  reset: () => {
    set({
      pendingEdit: null,
      animationState: "idle",
      animationProgress: 0,
      highlightedRanges: [],
      highlightExpireAt: null,
    });
  },
}));
