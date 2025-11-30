import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import katex from "katex";

interface CodeMirrorEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
  isDark?: boolean;
  /** 是否启用实时预览（隐藏语法标记、渲染数学公式），默认 true */
  livePreview?: boolean;
}

// 暴露给父组件的方法
export interface CodeMirrorEditorRef {
  getScrollLine: () => number;
  scrollToLine: (line: number) => void;
}

// 自定义主题 - 浅色模式
const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "16px",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "16px 0",
    caretColor: "hsl(221.2 83.2% 53.3%)",
  },
  ".cm-line": {
    padding: "0 16px",
    lineHeight: "1.75",
  },
  ".cm-cursor": {
    borderLeftColor: "hsl(221.2 83.2% 53.3%)",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "hsl(221.2 83.2% 53.3% / 0.2) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "hsl(221.2 83.2% 53.3% / 0.3) !important",
  },
  ".cm-gutters": {
    display: "none",
  },
  // Markdown 样式
  ".cm-header-1": { fontSize: "2em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-header-2": { fontSize: "1.5em", fontWeight: "600", lineHeight: "1.4" },
  ".cm-header-3": { fontSize: "1.25em", fontWeight: "600", lineHeight: "1.5" },
  ".cm-header-4": { fontSize: "1.1em", fontWeight: "600" },
  ".cm-strong": { fontWeight: "700" },
  ".cm-emphasis": { fontStyle: "italic" },
  ".cm-strikethrough": { textDecoration: "line-through" },
  ".cm-link": { color: "hsl(221.2 83.2% 53.3%)", textDecoration: "underline" },
  ".cm-url": { color: "hsl(215.4 16.3% 46.9%)" },
  ".cm-code": {
    backgroundColor: "hsl(210 40% 96.1%)",
    padding: "2px 4px",
    borderRadius: "3px",
    fontFamily: "monospace",
  },
  // Live Preview 隐藏的语法标记
  ".cm-formatting": {
    color: "hsl(215.4 16.3% 70%)",
  },
  ".cm-formatting-hidden": {
    fontSize: "0",
    width: "0",
    display: "inline-block",
    overflow: "hidden",
  },
  // 数学公式样式
  ".cm-math-inline": {
    display: "inline-block",
    verticalAlign: "middle",
  },
  ".cm-math-block": {
    display: "block",
    textAlign: "center",
    padding: "0.5em 0",
    overflow: "auto",
  },
  ".cm-math-error": {
    color: "red",
    fontFamily: "monospace",
  },
});

// KaTeX 数学公式 Widget
class MathWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly displayMode: boolean
  ) {
    super();
  }

  eq(other: MathWidget) {
    return other.formula === this.formula && other.displayMode === this.displayMode;
  }

  toDOM() {
    const container = document.createElement("span");
    container.className = this.displayMode ? "cm-math-block" : "cm-math-inline";
    
    try {
      katex.render(this.formula, container, {
        displayMode: this.displayMode,
        throwOnError: false,
        trust: true,
      });
    } catch (e) {
      container.textContent = this.formula;
      container.className += " cm-math-error";
    }
    
    return container;
  }

  ignoreEvent() {
    return false;
  }
}

// Math 渲染插件 - 只处理可见区域，性能优化
const mathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    
    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }
    
    update(update: ViewUpdate) {
      // 只在文档或视口变化时更新（选择变化不触发，避免卡顿）
      if (update.docChanged || update.viewportChanged) {
        // 直接同步更新，避免 setTimeout 导致的渲染不同步
        this.decorations = this.buildDecorations(update.view);
      }
    }
    
    buildDecorations(view: EditorView): DecorationSet {
      try {
        const decorations: any[] = [];
        const { from: viewFrom, to: viewTo } = view.viewport;
        const doc = view.state.doc.toString();
        
        // 记录已处理的区域，避免重复匹配
        const processedRanges: Array<{ from: number; to: number }> = [];
        
        // 1. 处理单行块级公式 $$...$$（CodeMirror replace decoration 不支持跨行）
        const blockMathRegex = /\$\$(.+?)\$\$/g;
        let blockMatch;
        
        while ((blockMatch = blockMathRegex.exec(doc)) !== null) {
          const from = blockMatch.index;
          const to = from + blockMatch[0].length;
          
          // 只处理可见区域
          if (to < viewFrom || from > viewTo) continue;
          
          // 确保不跨行（CodeMirror replace decoration 限制）
          const content = blockMatch[0];
          if (content.includes('\n')) continue;
          
          processedRanges.push({ from, to });
          
          const formula = blockMatch[1].trim();
          if (formula) {
            decorations.push(
              Decoration.replace({
                widget: new MathWidget(formula, true), // displayMode = true
              }).range(from, to)
            );
          }
        }
        
        // 2. 处理行内公式 $...$（单行）
        const inlineMathRegex = /\$([^$\n]+?)\$/g;
        let match;
        while ((match = inlineMathRegex.exec(doc)) !== null) {
          const from = match.index;
          const to = from + match[0].length;
          
          // 只处理可见区域
          if (to < viewFrom || from > viewTo) continue;
          
          // 跳过已处理的区域（块级公式、跨行公式）
          const isProcessed = processedRanges.some(
            (range: { from: number; to: number }) => from >= range.from && to <= range.to
          );
          if (isProcessed) continue;
          
          // 跳过 $$ 开头或结尾（避免误匹配块级公式的边界）
          if (doc[from - 1] === '$' || doc[to] === '$') continue;
          
          // 确保不跨行
          const fromLine = view.state.doc.lineAt(from).number;
          const toLine = view.state.doc.lineAt(to).number;
          if (fromLine !== toLine) continue;
          
          const formula = match[1].trim();
          if (formula) {
            decorations.push(
              Decoration.replace({
                widget: new MathWidget(formula, false), // displayMode = false
              }).range(from, to)
            );
          }
        }
        
        return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
      } catch (e) {
        console.error("Error creating math decorations:", e);
        return Decoration.none;
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// 创建 Live Preview 装饰 - 只有选择区域显示源码（不响应光标，避免卡顿）
function createLivePreviewDecorations(view: EditorView): DecorationSet {
  try {
    const decorations: any[] = [];
    const { state } = view;
    const selection = state.selection;
    
    // 只获取选择范围（不含光标）
    const selectedRanges: Array<{ from: number; to: number }> = [];
    for (const range of selection.ranges) {
      if (range.from !== range.to) {
        selectedRanges.push({ from: range.from, to: range.to });
      }
    }
    
    // 检查是否与选择重叠
    const shouldShowSource = (from: number, to: number) => {
      for (const range of selectedRanges) {
        if (range.from < to && range.to > from) return true;
      }
      return false;
    };
    
    // 安全创建装饰的辅助函数
    const safeDecoration = (from: number, to: number) => {
      // 确保不跨行
      if (from >= to) return;
      const fromLine = state.doc.lineAt(from).number;
      const toLine = state.doc.lineAt(to).number;
      if (fromLine !== toLine) return;
      // 检查范围内是否有换行符
      const text = state.doc.sliceString(from, to);
      if (text.includes('\n')) return;
      
      decorations.push(
        Decoration.mark({ class: "cm-formatting-hidden" }).range(from, to)
      );
    };
    
    // 遍历语法树，找到需要隐藏的语法标记
    syntaxTree(state).iterate({
      enter: (node) => {
        // 如果与选择重叠，不隐藏（显示源码）
        if (shouldShowSource(node.from, node.to)) return;
        
        const nodeType = node.name;
        
        // 处理各种 Markdown 语法标记
        if (nodeType === "HeaderMark") {
          // 只隐藏 # 标记本身，不包含后面的空格
          safeDecoration(node.from, node.to);
        } else if (nodeType === "EmphasisMark") {
          safeDecoration(node.from, node.to);
        } else if (nodeType === "StrikethroughMark") {
          safeDecoration(node.from, node.to);
        } else if (nodeType === "CodeMark") {
          safeDecoration(node.from, node.to);
        }
      },
    });
    
    return Decoration.set(decorations, true);
  } catch (e) {
    console.error("Error creating live preview decorations:", e);
    return Decoration.none;
  }
}

// Live Preview ViewPlugin - 只在有实际选择时更新
const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    hadSelection: boolean = false;
    
    constructor(view: EditorView) {
      this.decorations = createLivePreviewDecorations(view);
    }
    
    update(update: ViewUpdate) {
      const hasSelection = update.state.selection.ranges.some(r => r.from !== r.to);
      
      // 只在以下情况更新：
      // 1. 文档变化
      // 2. 选择状态变化（有→无 或 无→有）
      // 3. 有选择时选择范围变化
      if (update.docChanged || 
          hasSelection !== this.hadSelection ||
          (hasSelection && update.selectionSet)) {
        this.decorations = createLivePreviewDecorations(update.view);
      }
      this.hadSelection = hasSelection;
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// Markdown 样式装饰
const markdownStylePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    
    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }
    
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }
    
    buildDecorations(view: EditorView): DecorationSet {
      const decorations: any[] = [];
      const { state } = view;
      
      syntaxTree(state).iterate({
        enter: (node) => {
          const nodeType = node.name;
          
          if (nodeType === "ATXHeading1") {
            decorations.push(Decoration.mark({ class: "cm-header-1" }).range(node.from, node.to));
          } else if (nodeType === "ATXHeading2") {
            decorations.push(Decoration.mark({ class: "cm-header-2" }).range(node.from, node.to));
          } else if (nodeType === "ATXHeading3") {
            decorations.push(Decoration.mark({ class: "cm-header-3" }).range(node.from, node.to));
          } else if (nodeType === "ATXHeading4" || nodeType === "ATXHeading5" || nodeType === "ATXHeading6") {
            decorations.push(Decoration.mark({ class: "cm-header-4" }).range(node.from, node.to));
          } else if (nodeType === "StrongEmphasis") {
            decorations.push(Decoration.mark({ class: "cm-strong" }).range(node.from, node.to));
          } else if (nodeType === "Emphasis") {
            decorations.push(Decoration.mark({ class: "cm-emphasis" }).range(node.from, node.to));
          } else if (nodeType === "Strikethrough") {
            decorations.push(Decoration.mark({ class: "cm-strikethrough" }).range(node.from, node.to));
          } else if (nodeType === "InlineCode") {
            decorations.push(Decoration.mark({ class: "cm-code" }).range(node.from, node.to));
          } else if (nodeType === "Link") {
            decorations.push(Decoration.mark({ class: "cm-link" }).range(node.from, node.to));
          } else if (nodeType === "URL") {
            decorations.push(Decoration.mark({ class: "cm-url" }).range(node.from, node.to));
          }
        },
      });
      
      return Decoration.set(decorations, true);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorRef, CodeMirrorEditorProps>(
  function CodeMirrorEditor({ content, onChange, className = "", isDark = false, livePreview = true }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isExternalChange = useRef(false);
  const lastInternalContent = useRef<string>(content); // 跟踪编辑器内部的最新内容
  
  const { openVideoNoteTab } = useFileStore();
  
  // 处理 B站链接点击
  const handleBilibiliLinkClick = useCallback((url: string) => {
    if (url.includes('bilibili.com/video/') || url.includes('b23.tv')) {
      openVideoNoteTab(url);
    }
  }, [openVideoNoteTab]);

  // 暴露滚动控制方法
  useImperativeHandle(ref, () => ({
    getScrollLine: () => {
      const view = viewRef.current;
      if (!view) return 1;
      // 获取可见区域第一行
      const firstVisiblePos = view.lineBlockAtHeight(
        view.scrollDOM.scrollTop
      ).from;
      return view.state.doc.lineAt(firstVisiblePos).number;
    },
    scrollToLine: (line: number) => {
      const view = viewRef.current;
      if (!view) return;
      const lineCount = view.state.doc.lines;
      const targetLine = Math.min(Math.max(1, line), lineCount);
      const pos = view.state.doc.line(targetLine).from;
      view.dispatch({
        effects: EditorView.scrollIntoView(pos, { y: "start" })
      });
    }
  }), []);
  
  // 创建编辑器
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalChange.current) {
        const newContent = update.state.doc.toString();
        lastInternalContent.current = newContent; // 记录内部变更
        onChange(newContent);
      }
    });
    
    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        lightTheme,
        isDark ? oneDark : [],
        // 实时预览模式：隐藏语法标记、渲染数学公式
        // 源码模式：显示原始 Markdown
        ...(livePreview ? [livePreviewPlugin, mathPlugin] : []),
        markdownStylePlugin,
        updateListener,
        EditorView.lineWrapping,
      ],
    });
    
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    
    viewRef.current = view;
    
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [isDark, livePreview]);
  
  // 同步外部内容变化（只处理真正的外部变更，例如切换文件、撤销等）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    
    // 如果 content 和 lastInternalContent 相同，说明是编辑器内部变更触发的，跳过
    if (content === lastInternalContent.current) {
      return;
    }
    
    const currentContent = view.state.doc.toString();
    if (currentContent !== content) {
      isExternalChange.current = true;
      
      // 保存光标位置
      const selection = view.state.selection;
      const cursorPos = selection.main.head;
      
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
        // 尝试恢复光标位置（不超过新内容长度）
        selection: { anchor: Math.min(cursorPos, content.length) },
      });
      
      lastInternalContent.current = content;
      isExternalChange.current = false;
    }
  }, [content]);
  
  // 监听 Ctrl+Click B站链接
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let currentCleanup: (() => void) | null = null;
    
    const handleClick = (e: MouseEvent) => {
      const view = viewRef.current;
      if (!view) return;
      
      // Ctrl+Click 或 Cmd+Click
      if (!(e.ctrlKey || e.metaKey)) return;
      
      // 方法1：检查点击的 DOM 元素是否是链接
      const target = e.target as HTMLElement;
      const linkElement = target.closest('a[href]');
      if (linkElement) {
        const href = linkElement.getAttribute('href') || '';
        if (href.includes('bilibili.com/video/') || href.includes('b23.tv')) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[CodeMirror] 检测到链接元素点击:', href);
          handleBilibiliLinkClick(href);
          return;
        }
      }
      
      // 方法2：检查点击位置附近的文本内容
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return;
      
      // 获取点击位置前后的文本（扩大搜索范围）
      const from = Math.max(0, pos - 100);
      const to = Math.min(view.state.doc.length, pos + 100);
      const textAround = view.state.doc.sliceString(from, to);
      
      // 匹配 B站链接
      const bilibiliRegex = /(https?:\/\/)?(www\.)?(bilibili\.com\/video\/[A-Za-z0-9]+|b23\.tv\/[A-Za-z0-9]+)/g;
      let match;
      while ((match = bilibiliRegex.exec(textAround)) !== null) {
        const matchStart = from + match.index;
        const matchEnd = matchStart + match[0].length;
        
        // 检查点击位置是否在链接范围内（放宽判断）
        if (pos >= matchStart - 5 && pos <= matchEnd + 5) {
          e.preventDefault();
          e.stopPropagation();
          
          let url = match[0];
          if (!url.startsWith('http')) {
            url = 'https://' + url;
          }
          
          console.log('[CodeMirror] 检测到B站链接点击:', url);
          handleBilibiliLinkClick(url);
          return;
        }
      }
    };
    
    // 等待编辑器创建后添加监听
    const tryAddListener = () => {
      const view = viewRef.current;
      if (!view) {
        timer = setTimeout(tryAddListener, 100);
        return;
      }
      
      view.contentDOM.addEventListener('click', handleClick);
      currentCleanup = () => view.contentDOM.removeEventListener('click', handleClick);
      console.log('[CodeMirror] B站链接点击监听已添加');
    };
    
    tryAddListener();
    
    return () => {
      if (timer) clearTimeout(timer);
      if (currentCleanup) currentCleanup();
    };
  }, [handleBilibiliLinkClick, isDark, livePreview]);
  
  return (
    <div 
      ref={containerRef} 
      className={`codemirror-wrapper h-full overflow-auto ${className}`}
    />
  );
});

export default CodeMirrorEditor;
