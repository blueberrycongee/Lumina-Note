import { parseMarkdown } from "@/lib/markdown";
import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { EditorState, StateField } from "@codemirror/state";
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
import { common, createLowlight } from "lowlight";

// Initialize lowlight with common languages
const lowlight = createLowlight(common);

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
        strict: false, // 忽略 LaTeX 警告（如 display mode 中的换行符）
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

// Table Widget
class TableWidget extends WidgetType {
  constructor(readonly markdown: string) {
    super();
  }

  eq(other: TableWidget) {
    return other.markdown === this.markdown;
  }

  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-table-widget reading-view prose max-w-none"; // Add reading-view class to inherit styles
    // 使用 parseMarkdown 渲染表格，支持单元格内的 Markdown 语法
    container.innerHTML = parseMarkdown(this.markdown);
    return container;
  }

  ignoreEvent() {
    return true; // 表格内部事件不传递给编辑器（避免光标跳入）
  }
}

// Code Block Widget
class CodeBlockWidget extends WidgetType {
  constructor(readonly code: string, readonly language: string) {
    super();
  }

  eq(other: CodeBlockWidget) {
    return other.code === this.code && other.language === this.language;
  }

  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-code-block-widget relative group"; // 添加 relative 和 group 以支持语言标签定位
    
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    
    // 添加 hljs 类以确保样式生效
    code.className = "hljs";

    if (this.language) {
      code.classList.add(`language-${this.language}`);
    }
    
    // 使用 lowlight 进行语法高亮
    // 尝试高亮，如果失败则回退到纯文本
    let highlighted = false;
    if (this.language) {
      try {
        // 检查语言是否注册，如果未注册尝试使用别名或直接高亮（lowlight 会抛出错误如果语言未知）
        if (lowlight.registered(this.language)) {
          const tree = lowlight.highlight(this.language, this.code);
          this.hastToDOM(tree.children, code);
          highlighted = true;
        } else {
          // 尝试查找别名或忽略错误
          // lowlight v3 没有直接的 getLanguage，只能 try highlight
          // 但 highlight 会 throw，所以我们在 catch 中处理
          // 如果不知道语言，不进行高亮
        }
      } catch (e) {
        console.warn("Highlight error:", e);
      }
    }
    
    if (!highlighted) {
      code.textContent = this.code;
    }
    
    pre.appendChild(code);
    container.appendChild(pre);

    // 显示语言标签（类似 Typora）
    if (this.language) {
      const langLabel = document.createElement("div");
      langLabel.className = "absolute top-1 right-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity select-none pointer-events-none font-sans";
      langLabel.textContent = this.language;
      container.appendChild(langLabel);
    }
    
    return container;
  }

  // 辅助函数：将 HAST 节点转换为 DOM
  hastToDOM(nodes: any[], parent: HTMLElement) {
    for (const node of nodes) {
      if (node.type === 'text') {
        parent.appendChild(document.createTextNode(node.value));
      } else if (node.type === 'element') {
        const el = document.createElement(node.tagName);
        if (node.properties && node.properties.className) {
          el.className = node.properties.className.join(' ');
        }
        if (node.children) {
          this.hastToDOM(node.children, el);
        }
        parent.appendChild(el);
      }
    }
  }

  ignoreEvent() {
    return true;
  }
}

// Code Block 渲染 StateField
const codeBlockStateField = StateField.define<DecorationSet>({
  create(state) {
    return buildCodeBlockDecorations(state);
  },
  update(decorations, transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildCodeBlockDecorations(transaction.state);
    }
    return decorations.map(transaction.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildCodeBlockDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const selection = state.selection;

  const isSelected = (from: number, to: number) => {
    for (const range of selection.ranges) {
      if (range.from <= to && range.to >= from) {
        return true;
      }
    }
    return false;
  };

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "FencedCode") {
        if (isSelected(node.from, node.to)) return;

        const text = state.doc.sliceString(node.from, node.to);
        // 解析语言和代码内容
        const lines = text.split('\n');
        if (lines.length < 2) return; // 至少要有开始和结束标记
        
        const firstLine = lines[0];
        // 改进正则：支持缩进，支持任意数量的反引号（>=3）
        const language = firstLine.replace(/^\s*`{3,}/, "").trim();
        
        // 提取代码内容
        // 去掉第一行
        const codeLines = lines.slice(1);
        
        // 检查最后一行是否是结束标记（只包含反引号）
        // 如果是，则去掉；如果不是（例如未闭合的代码块），则保留
        const lastLine = codeLines[codeLines.length - 1];
        if (lastLine && /^\s*`{3,}\s*$/.test(lastLine)) {
            codeLines.pop();
        }
        
        const code = codeLines.join('\n');

        decorations.push(
          Decoration.replace({
            widget: new CodeBlockWidget(code, language),
            block: true,
          }).range(node.from, node.to)
        );
      }
    },
  });

  return Decoration.set(decorations);
}

// Table 渲染 StateField
const tableStateField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state);
  },
  update(decorations, transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildTableDecorations(transaction.state);
    }
    return decorations.map(transaction.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildTableDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const selection = state.selection;

  const isSelected = (from: number, to: number) => {
    for (const range of selection.ranges) {
      if (range.from <= to && range.to >= from) {
        return true;
      }
    }
    return false;
  };

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Table") {
        if (isSelected(node.from, node.to)) return;

        const tableMarkdown = state.doc.sliceString(node.from, node.to);
        decorations.push(
          Decoration.replace({
            widget: new TableWidget(tableMarkdown),
            block: true,
          }).range(node.from, node.to)
        );
      }
    },
  });

  return Decoration.set(decorations);
}

// Math 渲染 StateField - 使用 StateField 以支持 block decorations
const mathStateField = StateField.define<DecorationSet>({
  create(state) {
    return buildMathDecorations(state);
  },
  update(decorations, transaction) {
    // 当文档内容变化或选择变化时更新装饰
    if (transaction.docChanged || transaction.selection) {
      return buildMathDecorations(transaction.state);
    }
    return decorations.map(transaction.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildMathDecorations(state: EditorState): DecorationSet {
  try {
    const decorations: any[] = [];
    const doc = state.doc.toString();
    const selection = state.selection;
    
    // 辅助函数：检查范围是否与当前选择重叠
    const isSelected = (from: number, to: number) => {
      for (const range of selection.ranges) {
        // 只要选择范围（包括光标）与公式范围有任何重叠或接触，就视为选中
        // 使用 >= 和 <= 确保光标在公式边缘时也显示源码
        if (range.from <= to && range.to >= from) {
          return true;
        }
      }
      return false;
    };
    
    // 记录已处理的区域，避免重复匹配
    const processedRanges: Array<{ from: number; to: number }> = [];
    
    // 1. 处理块级公式 $$...$$（支持跨行）
    const blockMathRegex = /\$\$([\s\S]+?)\$\$/g;
    let blockMatch;
    
    while ((blockMatch = blockMathRegex.exec(doc)) !== null) {
      const from = blockMatch.index;
      const to = from + blockMatch[0].length;
      
      processedRanges.push({ from, to });
      
      // 如果光标在公式范围内，不渲染（显示源码）
      if (isSelected(from, to)) continue;
      
      const formula = blockMatch[1].trim();
      if (formula) {
        // 检查是否覆盖整行（从行首到行尾）
        const fromLine = state.doc.lineAt(from);
        const toLine = state.doc.lineAt(to);
        const isFullLine = from === fromLine.from && to === toLine.to;

        decorations.push(
          Decoration.replace({
            widget: new MathWidget(formula, true), // displayMode = true
            block: isFullLine, // 只有覆盖整行时才使用 block: true
          }).range(from, to)
        );
      }
    }
    
    // 2. 处理行内公式 $...$（支持跨行，但不支持连续换行）
    // 改进正则：允许单次换行，但不支持连续换行（段落分隔），以避免误判普通文本中的美元符号
    const inlineMathRegex = /(?<!\\|\$)\$(?!\$)((?:[^$\n]|\n(?!\n))+?)(?<!\\|\$)\$(?!\$)/g;
    let match;
    while ((match = inlineMathRegex.exec(doc)) !== null) {
      const from = match.index;
      const to = from + match[0].length;
      
      // 跳过已处理的区域（块级公式）
      const isProcessed = processedRanges.some(
        (range: { from: number; to: number }) => from >= range.from && to <= range.to
      );
      if (isProcessed) continue;
      
      // 如果光标在公式范围内，不渲染（显示源码）
      if (isSelected(from, to)) continue;
      
      const formula = match[1].trim();
      if (formula) {
        // 检查是否覆盖整行（从行首到行尾）
        const fromLine = state.doc.lineAt(from);
        const toLine = state.doc.lineAt(to);
        const isFullLine = from === fromLine.from && to === toLine.to;
        
        // 如果跨行但不是整行，则无法渲染（CodeMirror 限制）
        // 但如果是整行（例如 $ \n math \n $），则可以作为 block 渲染
        if (fromLine.number !== toLine.number && !isFullLine) {
          continue;
        }

        decorations.push(
          Decoration.replace({
            widget: new MathWidget(formula, isFullLine), // 如果是整行，则使用 displayMode
            block: isFullLine, // 只有覆盖整行时才使用 block: true
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
        // 实时预览模式：隐藏语法标记、渲染数学公式、渲染表格、渲染代码块
        // 源码模式：显示原始 Markdown
        ...(livePreview ? [livePreviewPlugin, mathStateField, tableStateField, codeBlockStateField] : []),
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
