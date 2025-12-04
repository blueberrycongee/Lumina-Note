import { parseMarkdown } from "@/lib/markdown";
import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { useUIStore } from "@/stores/useUIStore";
import { parseLuminaLink } from "@/lib/annotations";
import { EditorState, StateField, StateEffect } from "@codemirror/state";
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
// 不再需要 oneDark，使用 CSS 变量自动适应主题
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

// 自定义主题 - 使用 CSS 变量支持主题切换
const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "16px",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "16px 0",
    caretColor: "hsl(var(--primary))",
  },
  ".cm-line": {
    padding: "0 16px",
    lineHeight: "1.75",
  },
  ".cm-cursor": {
    borderLeftColor: "hsl(var(--primary))",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "hsl(var(--primary) / 0.2) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "hsl(var(--primary) / 0.3) !important",
  },
  ".cm-gutters": {
    display: "none",
  },
  // Markdown 标题 - 使用主题变量
  ".cm-header-1": { 
    fontSize: "2em", 
    fontWeight: "700", 
    lineHeight: "1.3",
    color: "hsl(var(--md-heading, var(--foreground)))",
  },
  ".cm-header-2": { 
    fontSize: "1.5em", 
    fontWeight: "600", 
    lineHeight: "1.4",
    color: "hsl(var(--md-heading, var(--foreground)))",
  },
  ".cm-header-3": { 
    fontSize: "1.25em", 
    fontWeight: "600", 
    lineHeight: "1.5",
    color: "hsl(var(--md-heading, var(--foreground)))",
  },
  ".cm-header-4": { 
    fontSize: "1.1em", 
    fontWeight: "600",
    color: "hsl(var(--md-heading, var(--foreground)))",
  },
  ".cm-header-5, .cm-header-6": {
    fontWeight: "600",
    color: "hsl(var(--md-heading, var(--foreground)))",
  },
  // 粗体/斜体
  ".cm-strong": { 
    fontWeight: "700",
    color: "hsl(var(--md-bold, var(--foreground)))",
  },
  ".cm-emphasis": { 
    fontStyle: "italic",
    color: "hsl(var(--md-italic, var(--foreground)))",
  },
  ".cm-strikethrough": { textDecoration: "line-through" },
  // 链接
  ".cm-link": { 
    color: "hsl(var(--md-link, var(--primary)))", 
    textDecoration: "underline",
  },
  ".cm-url": { 
    color: "hsl(var(--muted-foreground))",
  },
  // WikiLink 双向链接 - Ctrl+Click 跳转
  ".cm-wikilink": {
    color: "hsl(var(--primary))",
    textDecoration: "underline",
    cursor: "text", // 默认文本光标，表示可编辑
    borderRadius: "2px",
    transition: "background-color 0.15s ease",
    "&:hover": {
      backgroundColor: "hsl(var(--primary) / 0.1)",
    },
  },
  // 代码
  ".cm-code, .cm-inline-code": {
    backgroundColor: "hsl(var(--md-code-bg, var(--muted)))",
    color: "hsl(var(--md-code, var(--foreground)))",
    padding: "2px 4px",
    borderRadius: "3px",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  },
  // 代码块
  ".cm-codeblock": {
    backgroundColor: "hsl(var(--md-code-block-bg, var(--muted)))",
    color: "hsl(var(--md-code-block, var(--foreground)))",
  },
  // 引用
  ".cm-quote": {
    color: "hsl(var(--md-blockquote, var(--muted-foreground)))",
    fontStyle: "italic",
  },
  // 列表标记
  ".cm-list-bullet, .cm-list-number": {
    color: "hsl(var(--md-list-marker, var(--primary)))",
  },
  // Live Preview 隐藏的语法标记
  ".cm-formatting": {
    color: "hsl(var(--muted-foreground) / 0.6)",
  },
  ".cm-formatting-hidden": {
    fontSize: "0",
    width: "0",
    display: "inline-block",
    overflow: "hidden",
  },
  // 标签
  ".cm-tag, .cm-hashtag": {
    color: "hsl(var(--md-tag, var(--primary)))",
  },
  // 水平线
  ".cm-hr": {
    color: "hsl(var(--md-hr, var(--border)))",
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
    color: "hsl(0 70% 50%)",
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
    // 返回 false 允许点击事件传递，这样点击代码块时可以进入编辑模式
    return false;
  }
}

// WikiLink 装饰 StateField
const wikiLinkStateField = StateField.define<DecorationSet>({
  create(state) {
    return buildWikiLinkDecorations(state);
  },
  update(decorations, transaction) {
    if (transaction.docChanged) {
      return buildWikiLinkDecorations(transaction.state);
    }
    return decorations.map(transaction.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildWikiLinkDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc.toString();
  
  // 匹配 [[...]] 格式的 WikiLink
  const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;
  
  while ((match = wikiLinkRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const linkName = match[1].trim();
    
    // 添加 WikiLink 装饰
    decorations.push(
      Decoration.mark({
        class: "cm-wikilink",
        attributes: {
          "data-wikilink": linkName,
        },
      }).range(from, to)
    );
  }
  
  return Decoration.set(decorations);
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

// ============ Callout 高亮（Live 模式） ============

const CALLOUT_COLORS: Record<string, string> = {
  note: "blue",
  abstract: "blue",
  info: "blue",
  tip: "green",
  success: "green",
  question: "yellow",
  warning: "yellow",
  danger: "red",
  failure: "red",
  bug: "red",
  example: "purple",
  quote: "gray",
  summary: "blue",
};

const calloutStateField = StateField.define<DecorationSet>({
  create(state) {
    return buildCalloutDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return buildCalloutDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildCalloutDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc;
  const lineCount = doc.lines;

  let lineNo = 1;
  while (lineNo <= lineCount) {
    const line = doc.line(lineNo);
    const match = line.text.match(/^>\s*\[!(\w+)\]/);
    if (!match) {
      lineNo++;
      continue;
    }

    const type = match[1].toLowerCase();
    const color = CALLOUT_COLORS[type] || "gray";

    // 给当前行添加 callout 样式
    decorations.push(
      Decoration.line({ class: `callout callout-${color}` }).range(line.from)
    );

    // 后续连续以 '>' 开头的行视为同一个 callout 的内容行
    let nextLineNo = lineNo + 1;
    while (nextLineNo <= lineCount) {
      const nextLine = doc.line(nextLineNo);
      if (/^>\s*/.test(nextLine.text) || nextLine.text.trim() === "") {
        decorations.push(
          Decoration.line({ class: `callout callout-${color}` }).range(nextLine.from)
        );
        nextLineNo++;
      } else {
        break;
      }
    }

    lineNo = nextLineNo;
  }

  return Decoration.set(decorations, true);
}

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

// ============ 语音输入流式预览 ============

const setVoicePreview = StateEffect.define<{ from: number; text: string }>();
const clearVoicePreview = StateEffect.define<null | void>();

class VoicePreviewWidget extends WidgetType {
  readonly text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  eq(other: VoicePreviewWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-voice-preview";
    span.textContent = this.text;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

const voicePreviewField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let deco = value;

    for (const effect of tr.effects) {
      if (effect.is(setVoicePreview)) {
        const { from, text } = effect.value;
        if (!text) {
          deco = Decoration.none;
        } else {
          deco = Decoration.set([
            Decoration.widget({
              widget: new VoicePreviewWidget(text),
              side: 1,
            }).range(from),
          ]);
        }
      }

      if (effect.is(clearVoicePreview)) {
        deco = Decoration.none;
      }
    }

    if (tr.docChanged && deco !== Decoration.none) {
      deco = deco.map(tr.changes);
    }

    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const voicePreviewTheme = EditorView.baseTheme({
  ".cm-voice-preview": {
    color: "hsl(var(--muted-foreground))",
    opacity: 0.8,
    fontStyle: "italic",
  },
});

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorRef, CodeMirrorEditorProps>(
  function CodeMirrorEditor({ content, onChange, className = "", isDark = false, livePreview = true }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isExternalChange = useRef(false);
  const lastInternalContent = useRef<string>(content); // 跟踪编辑器内部的最新内容
  
  const { openVideoNoteTab, openPDFTab, fileTree, openFile } = useFileStore();
  const { openSecondaryPdf } = useSplitStore();
  const { setSplitView } = useUIStore();
  
  // 处理 WikiLink 双向链接点击
  const handleWikiLinkClick = useCallback((linkName: string) => {
    // 在文件树中查找匹配的文件
    const findFile = (entries: typeof fileTree): string | null => {
      for (const entry of entries) {
        if (entry.is_dir && entry.children) {
          const found = findFile(entry.children);
          if (found) return found;
        } else if (!entry.is_dir) {
          const fileName = entry.name.replace(".md", "");
          if (fileName.toLowerCase() === linkName.toLowerCase()) {
            return entry.path;
          }
        }
      }
      return null;
    };
    
    const filePath = findFile(fileTree);
    if (filePath) {
      openFile(filePath);
    } else {
      console.log(`笔记不存在: ${linkName}`);
    }
  }, [fileTree, openFile]);
  
  // 处理 B站链接点击
  const handleBilibiliLinkClick = useCallback((url: string) => {
    if (url.includes('bilibili.com/video/') || url.includes('b23.tv')) {
      openVideoNoteTab(url);
    }
  }, [openVideoNoteTab]);
  
  // 处理 lumina:// PDF 链接点击
  const handleLuminaLinkClick = useCallback((href: string, ctrlKey: boolean) => {
    const parsed = parseLuminaLink(href);
    if (parsed && parsed.file) {
      if (ctrlKey) {
        // Ctrl+Click: 分栏打开 PDF
        setSplitView(true);
        openSecondaryPdf(parsed.file, parsed.page || 1, parsed.id);
      } else {
        // 普通点击: 在主视图打开
        openPDFTab(parsed.file);
      }
    }
  }, [setSplitView, openSecondaryPdf, openPDFTab]);

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
        editorTheme,  // 使用 CSS 变量，自动适应主题
        voicePreviewField,
        voicePreviewTheme,
        // 实时预览模式：隐藏语法标记、渲染数学公式、渲染表格、渲染代码块
        // 源码模式：显示原始 Markdown
        wikiLinkStateField,
        ...(livePreview
          ? [
              livePreviewPlugin,
              mathStateField,
              tableStateField,
              codeBlockStateField,
              calloutStateField,
            ]
          : []),
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
      
      const target = e.target as HTMLElement;
      const linkElement = target.closest('a[href]');
      
      // lumina:// 链接支持普通点击和 Ctrl+Click
      if (linkElement) {
        const href = linkElement.getAttribute('href') || '';
        
        // 处理 lumina:// PDF 链接（普通点击打开主视图，Ctrl+Click 分栏）
        if (href.startsWith('lumina://pdf')) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[CodeMirror] 检测到 lumina 链接点击:', href);
          handleLuminaLinkClick(href, e.ctrlKey || e.metaKey);
          return;
        }
      }
      
      // 处理 WikiLink 双向链接（Ctrl+Click 跳转，普通点击编辑）
      if (target.classList.contains("cm-wikilink") || target.closest(".cm-wikilink")) {
        const wikiLinkEl = target.classList.contains("cm-wikilink") 
          ? target 
          : target.closest(".cm-wikilink") as HTMLElement;
        const linkName = wikiLinkEl?.getAttribute("data-wikilink");
        
        // 只有 Ctrl+Click 才跳转，普通点击继续编辑
        if ((e.ctrlKey || e.metaKey) && linkName) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[CodeMirror] Ctrl+Click WikiLink 跳转:', linkName);
          handleWikiLinkClick(linkName);
          return;
        }
        // 普通点击不阻止，让编辑器正常处理（进入编辑模式）
      }
      
      // 其他链接需要 Ctrl+Click
      if (!(e.ctrlKey || e.metaKey)) return;
      
      // 处理 B站链接
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
  }, [handleWikiLinkClick, handleBilibiliLinkClick, handleLuminaLinkClick, isDark, livePreview]);
  
  // 监听语音输入事件：灰色流式预览 + 在光标处插入文本
  useEffect(() => {
    const handleInterim = (e: Event) => {
      const view = viewRef.current;
      if (!view) return;

      const detail = (e as CustomEvent<{ text: string }>).detail;
      const text = detail?.text ?? "";

      if (!text) {
        view.dispatch({ effects: clearVoicePreview.of(null) });
        return;
      }

      const pos = view.state.selection.main.head;
      view.dispatch({
        effects: setVoicePreview.of({ from: pos, text }),
      });
    };

    const handleFinal = (e: Event) => {
      const view = viewRef.current;
      if (!view) return;

      const detail = (e as CustomEvent<{ text: string }>).detail;
      const text = detail?.text ?? "";
      if (!text) return;

      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, to: pos, insert: text },
        selection: { anchor: pos + text.length },
        effects: clearVoicePreview.of(null),
      });
    };

    window.addEventListener("voice-input-interim", handleInterim as EventListener);
    window.addEventListener("voice-input-final", handleFinal as EventListener);

    return () => {
      window.removeEventListener("voice-input-interim", handleInterim as EventListener);
      window.removeEventListener("voice-input-final", handleFinal as EventListener);
    };
  }, []);

  // 监听选区 AI 编辑事件：构造 diff 并交给 DiffView
  useEffect(() => {
    const handleSelectionAIEdit = (e: Event) => {
      const view = viewRef.current;
      if (!view) return;

      const detail = (e as CustomEvent<{
        mode: "append_callout" | "replace_selection";
        text: string;
        description?: string;
      }>).detail;
      if (!detail?.text) return;

      const { mode, text, description } = detail;

      const state = view.state;
      const doc = state.doc;
      const sel = state.selection.main;

      const original = doc.toString();
      let modified = original;

      if (mode === "replace_selection") {
        modified = original.slice(0, sel.from) + text + original.slice(sel.to);
      } else if (mode === "append_callout") {
        const insertPos = sel.to;
        modified = original.slice(0, insertPos) + text + original.slice(insertPos);
      }

      if (modified === original) return;

      const { currentFile } = useFileStore.getState();
      if (!currentFile) return;

      const filePath = currentFile;
      const fileName = filePath.split(/[/\\]/).pop() || filePath;

      const { setPendingDiff } = useAIStore.getState();
      setPendingDiff({
        fileName,
        filePath,
        original,
        modified,
        description: description || "选区 AI 编辑",
      });
    };

    window.addEventListener("selection-ai-edit", handleSelectionAIEdit as EventListener);
    return () => {
      window.removeEventListener("selection-ai-edit", handleSelectionAIEdit as EventListener);
    };
  }, []);

  // 监听选中文本总结插入事件：在当前选区后插入 callout 块
  useEffect(() => {
    const handleInsertCallout = (e: Event) => {
      const view = viewRef.current;
      if (!view) return;

      const detail = (e as CustomEvent<{ callout: string }>).detail;
      const callout = detail?.callout ?? "";
      if (!callout) return;

      const sel = view.state.selection.main;
      const insertPos = sel.to;

      view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: callout },
        selection: { anchor: insertPos + callout.length },
      });
    };

    window.addEventListener("insert-summary-callout", handleInsertCallout as EventListener);
    return () => {
      window.removeEventListener("insert-summary-callout", handleInsertCallout as EventListener);
    };
  }, []);
  
  return (
    <div 
      ref={containerRef} 
      className={`codemirror-wrapper h-full overflow-auto ${className}`}
    />
  );
});

export default CodeMirrorEditor;
