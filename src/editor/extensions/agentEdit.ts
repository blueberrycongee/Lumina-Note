/**
 * Agent 编辑动画扩展
 * 
 * 提供 Agent 编辑时的实时预览效果：
 * - 逐字动画播放
 * - 变更高亮显示
 * - 滚动跟随
 */

import {
  EditorView,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import {
  StateField,
  StateEffect,
  Range,
} from "@codemirror/state";
import { Change } from "diff";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

// ==================== Effects ====================

// 开始动画播放
export const startAgentEdit = StateEffect.define<{
  changes: Change[];
  targetContent: string;
}>();

// 更新光标位置
export const updateCursorPosition = StateEffect.define<{
  position: number;
}>();

// 完成动画，设置高亮
export const completeAgentEdit = StateEffect.define<{
  highlights: Array<{ from: number; to: number; type: "added" | "modified" }>;
}>();

// 清除所有状态
export const clearAgentEdit = StateEffect.define<void>();

// ==================== Cursor Widget ====================

class TypingCursorWidget extends WidgetType {
  toDOM() {
    const cursor = document.createElement("span");
    cursor.className = "cm-agent-cursor";
    cursor.textContent = "▌";
    return cursor;
  }

  eq() {
    return true;
  }
}

// ==================== Decorations ====================

const getAgentEditTitles = () => {
  const t = getCurrentTranslations();
  return t.editor.agentEdit;
};

// 添加内容的高亮样式
const addedHighlight = Decoration.mark({
  class: "cm-agent-added",
  attributes: { title: getAgentEditTitles().added },
});

// 修改内容的高亮样式
const modifiedHighlight = Decoration.mark({
  class: "cm-agent-modified",
  attributes: { title: getAgentEditTitles().modified },
});

// 正在输入的光标
const typingCursor = Decoration.widget({
  widget: new TypingCursorWidget(),
  side: 1,
});

// ==================== State Field ====================

interface AgentEditState {
  isPlaying: boolean;
  highlights: DecorationSet;
  cursorPos: number | null;
}

export const agentEditState = StateField.define<AgentEditState>({
  create() {
    return {
      isPlaying: false,
      highlights: Decoration.none,
      cursorPos: null,
    };
  },
  
  update(state, tr) {
    let { isPlaying, highlights, cursorPos } = state;
    
    for (const effect of tr.effects) {
      if (effect.is(startAgentEdit)) {
        isPlaying = true;
        cursorPos = 0;
        highlights = Decoration.none;
      }
      
      if (effect.is(updateCursorPosition)) {
        cursorPos = effect.value.position;
        // 更新光标装饰
        if (cursorPos !== null) {
          highlights = Decoration.set([
            typingCursor.range(cursorPos),
          ]);
        }
      }
      
      if (effect.is(completeAgentEdit)) {
        isPlaying = false;
        cursorPos = null;
        
        // 构建高亮 decorations
        const ranges: Range<Decoration>[] = [];
        for (const h of effect.value.highlights) {
          // 确保范围有效
          if (h.from < h.to && h.from >= 0) {
            const deco = h.type === "added" ? addedHighlight : modifiedHighlight;
            ranges.push(deco.range(h.from, h.to));
          }
        }
        highlights = Decoration.set(ranges.sort((a, b) => a.from - b.from), true);
      }
      
      if (effect.is(clearAgentEdit)) {
        isPlaying = false;
        cursorPos = null;
        highlights = Decoration.none;
      }
    }
    
    // 映射位置（处理文档变化）
    if (tr.docChanged && highlights !== Decoration.none) {
      highlights = highlights.map(tr.changes);
    }
    
    return { isPlaying, highlights, cursorPos };
  },
  
  provide: (field) =>
    EditorView.decorations.from(field, (state) => state.highlights),
});

// ==================== CSS 样式 ====================

export const agentEditTheme = EditorView.baseTheme({
  ".cm-agent-added": {
    backgroundColor: "rgba(34, 197, 94, 0.2)", // green-500/20
    borderBottom: "2px solid rgb(34, 197, 94)",
    borderRadius: "2px",
  },
  ".cm-agent-modified": {
    backgroundColor: "rgba(234, 179, 8, 0.2)", // yellow-500/20
    borderBottom: "2px solid rgb(234, 179, 8)",
    borderRadius: "2px",
  },
  ".cm-agent-cursor": {
    color: "rgb(59, 130, 246)", // blue-500
    animation: "cm-agent-blink 0.5s infinite",
    fontWeight: "bold",
    marginLeft: "-2px",
  },
  "@keyframes cm-agent-blink": {
    "0%, 100%": { opacity: "1" },
    "50%": { opacity: "0" },
  },
});

// ==================== 动画步骤类型 ====================

interface AnimationStep {
  type: "insert" | "newline" | "skip";
  position: number;
  char?: string;
  length?: number;
}

// ==================== 动画控制器 ====================

export class AgentEditAnimator {
  private view: EditorView;
  private abortController: AbortController | null = null;
  private maxAnimationTime = 10000; // 最大动画时间 10 秒
  
  constructor(view: EditorView) {
    this.view = view;
  }
  
  /**
   * 播放编辑动画
   */
  async playAnimation(
    oldContent: string,
    newContent: string,
    changes: Change[],
    options: {
      charDelay?: number;      // 每字符延迟（ms）
      lineDelay?: number;      // 每行延迟（ms）
      onProgress?: (progress: number) => void;
    } = {}
  ): Promise<Array<{ from: number; to: number; type: "added" | "modified" }>> {
    const { charDelay = 15, lineDelay = 50, onProgress } = options;
    
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    
    // 设置最大动画时间保护
    const timeoutId = setTimeout(() => this.abort(), this.maxAnimationTime);
    
    try {
      // 1. 通知开始
      this.view.dispatch({
        effects: startAgentEdit.of({ changes, targetContent: newContent }),
      });
      
      // 2. 计算动画步骤
      const { steps, highlights } = this.calculateSteps(oldContent, newContent, changes);
      const totalSteps = steps.length;
      
      // 如果步骤太多，加快速度
      const adjustedCharDelay = totalSteps > 500 ? Math.max(5, charDelay / 2) : charDelay;
      const adjustedLineDelay = totalSteps > 500 ? Math.max(20, lineDelay / 2) : lineDelay;
      
      // 3. 逐步执行动画
      for (let i = 0; i < steps.length; i++) {
        if (signal.aborted) break;
        
        const step = steps[i];
        await this.executeStep(step);
        
        // 延迟
        const delay = step.type === "newline" ? adjustedLineDelay : adjustedCharDelay;
        await this.sleep(delay, signal);
        
        // 进度回调
        onProgress?.(Math.round(((i + 1) / totalSteps) * 100));
      }
      
      // 4. 完成动画
      this.view.dispatch({
        effects: completeAgentEdit.of({ highlights }),
      });
      
      return highlights;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  /**
   * 中止动画
   */
  abort(): void {
    this.abortController?.abort();
  }
  
  /**
   * 清除高亮
   */
  clearHighlights(): void {
    this.view.dispatch({
      effects: clearAgentEdit.of(),
    });
  }
  
  // ========== 私有方法 ==========
  
  private calculateSteps(
    _oldContent: string,
    _newContent: string,
    changes: Change[]
  ): {
    steps: AnimationStep[];
    highlights: Array<{ from: number; to: number; type: "added" | "modified" }>;
  } {
    const steps: AnimationStep[] = [];
    const highlights: Array<{ from: number; to: number; type: "added" | "modified" }> = [];
    
    let position = 0;
    
    for (const change of changes) {
      if (change.added) {
        const startPos = position;
        
        // 添加的内容：逐字动画
        for (const char of change.value) {
          steps.push({
            type: char === "\n" ? "newline" : "insert",
            position,
            char,
          });
          position++;
        }
        
        // 记录高亮范围
        if (position > startPos) {
          highlights.push({
            from: startPos,
            to: position,
            type: "added",
          });
        }
      } else if (change.removed) {
        // 删除的内容：跳过（不占位置）
        // 在新内容中不存在
      } else {
        // 未变化的内容：快速跳过
        steps.push({
          type: "skip",
          position,
          length: change.value.length,
        });
        position += change.value.length;
      }
    }
    
    return { steps, highlights };
  }
  
  private async executeStep(step: AnimationStep): Promise<void> {
    if (step.type === "skip") {
      // 跳过未变化的部分，不需要动画
      return;
    }
    
    // 更新光标位置并滚动
    this.view.dispatch({
      effects: [
        updateCursorPosition.of({ position: step.position }),
        EditorView.scrollIntoView(step.position, { y: "center" }),
      ],
    });
  }
  
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    if (signal.aborted) {
      return Promise.reject(new Error("Aborted"));
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
        reject(new Error("Aborted"));
      };
      const timeout = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
