import { parseMarkdown } from "@/services/markdown/markdown";
import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { useUIStore } from "@/stores/useUIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { parseLuminaLink } from "@/services/pdf/annotations";
import { writeBinaryFile, readBinaryFileBase64 } from "@/lib/tauri";
import { EditorState, StateField, StateEffect, Compartment } from "@codemirror/state";
import { slashCommandExtensions, placeholderExtension } from "./extensions/slashCommand";
import { SlashMenu } from "./components/SlashMenu";
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
import katex from "katex";
import { common, createLowlight } from "lowlight";
import mermaid from "mermaid";
import {
  livePreviewPlugin,
  collapseOnSelectionFacet,
  mouseSelectingField,
  setMouseSelecting,
  shouldShowSource
} from "codemirror-live-markdown";

// Initialize lowlight
const lowlight = createLowlight(common);

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export type ViewMode = 'reading' | 'live' | 'source';

// ============ 1. 核心架构 ============

const viewModeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const themeCompartment = new Compartment();

// ============ 2. 全局状态 ============
// mouseSelectingField 和 setMouseSelecting 从 codemirror-live-markdown 导入

interface CodeMirrorEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
  viewMode?: ViewMode;
  livePreview?: boolean;
}

export interface CodeMirrorEditorRef {
  getScrollLine: () => number;
  scrollToLine: (line: number) => void;
}

// ============ 3. 样式定义 (动画与布局核心) ============

const editorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: "16px", height: "100%" },
  ".cm-content": { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "16px 0", caretColor: "hsl(var(--primary))" },
  ".cm-line": { padding: "0 16px", paddingLeft: "16px", lineHeight: "1.75", position: "relative" },

  // 选区颜色（更淡的蓝色）
  ".cm-selectionBackground": { backgroundColor: "rgba(191, 219, 254, 0.25) !important" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(191, 219, 254, 0.35) !important" },

  // === 动画核心样式 ===

  // 1. 悬挂标记 (Headings) - 绝对定位到左侧，不占用正文空间
  ".cm-formatting-hanging": {
    position: "absolute",
    right: "100%", // 悬挂在内容左侧
    marginRight: "6px",
    color: "hsl(var(--muted-foreground) / 0.4)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "14px", // 固定字体大小，不继承标题大小
    fontWeight: "bold",
    userSelect: "none",
    pointerEvents: "none",
  },

  // 2. 行内标记 (Bold, Italic) - 默认隐藏 (收缩)
  ".cm-formatting-inline": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    whiteSpace: "nowrap",
    verticalAlign: "baseline",
    color: "hsl(var(--muted-foreground) / 0.6)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.85em",
    // 关键动画属性：初始宽度为0，透明度为0
    maxWidth: "0",
    opacity: "0",
    transform: "scaleX(0.8)",
    transition: "max-width 0.2s cubic-bezier(0.2, 0, 0.2, 1), opacity 0.15s ease-out, transform 0.15s ease-out",
    pointerEvents: "none",
  },

  // 3. 行内标记 - 激活状态 (展开)
  ".cm-formatting-inline-visible": {
    maxWidth: "4ch", // 足够容纳符号
    opacity: "1",
    transform: "scaleX(1)",
    margin: "0 1px",
    pointerEvents: "auto",
  },

  // 块级标记 (标题/列表/引用) - 默认隐藏
  ".cm-formatting-block": {
    display: "inline",
    overflow: "hidden",
    fontSize: "0.01em",
    lineHeight: "inherit",
    opacity: "0",
    color: "hsl(var(--muted-foreground))",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "font-size 0.2s ease-out, opacity 0.2s ease-out",
  },

  // 块级标记 - 激活状态 (展开)
  ".cm-formatting-block-visible": {
    fontSize: "1em",
    opacity: "0.6",
  },

  // When selection exists, ensure formatting marks use the same highlight.
  "&.cm-has-selection .cm-formatting-inline-visible, &.cm-has-selection .cm-formatting-block-visible, &.cm-has-selection .cm-formatting-hanging": {
    backgroundColor: "rgba(191, 219, 254, 0.25)",
    borderRadius: "2px",
    margin: "0",
    padding: "0 1px",
  },
  "&.cm-focused.cm-has-selection .cm-formatting-inline-visible, &.cm-focused.cm-has-selection .cm-formatting-block-visible, &.cm-focused.cm-has-selection .cm-formatting-hanging": {
    backgroundColor: "rgba(191, 219, 254, 0.35)",
  },

  // === Math 编辑体验 ===
  // 行内公式渲染结果 - 带淡入动画
  ".cm-math-inline": {
    display: "inline-block",
    verticalAlign: "middle",
    cursor: "pointer",
    animation: "mathFadeIn 0.15s ease-out",
  },
  ".cm-math-block": { display: "block", textAlign: "center", padding: "0.5em 0", overflow: "hidden", cursor: "pointer" },

  // 编辑模式：源码背景 (淡绿色) - 带淡入动画
  ".cm-math-source": {
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    color: "hsl(var(--foreground))",
    fontFamily: "'JetBrains Mono', monospace",
    borderRadius: "4px",
    padding: "2px 4px",
    zIndex: "1",
    position: "relative",
    cursor: "text",
    animation: "mathFadeIn 0.15s ease-out",
  },

  // 公式淡入动画关键帧
  "@keyframes mathFadeIn": {
    "from": { opacity: "0", transform: "scale(0.95)" },
    "to": { opacity: "1", transform: "scale(1)" },
  },
  // 编辑模式：预览面板 (位于源码下方)
  ".cm-math-preview-panel": {
    display: "block",
    textAlign: "center",
    padding: "8px",
    marginTop: "4px",
    marginBottom: "8px",
    border: "1px solid hsl(var(--border) / 0.5)",
    borderRadius: "6px",
    backgroundColor: "hsl(var(--muted) / 0.3)",
    pointerEvents: "none", // 关键：让鼠标点击穿透面板，避免无法聚焦其他位置
    userSelect: "none",
    opacity: 0.95
  },

  // === Table 样式 ===
  ".cm-table-widget": { display: "block", overflowX: "auto", cursor: "text" },
  ".cm-table-source": { fontFamily: "'JetBrains Mono', monospace !important", whiteSpace: "pre", color: "hsl(var(--foreground))", display: "block", overflowX: "auto" },

  // 基础 Markdown 样式
  ".cm-header-1": { fontSize: "2em", fontWeight: "700", lineHeight: "1.3", color: "hsl(var(--md-heading, var(--foreground)))" },
  ".cm-header-2": { fontSize: "1.5em", fontWeight: "600", lineHeight: "1.4", color: "hsl(var(--md-heading, var(--foreground)))" },
  ".cm-header-3": { fontSize: "1.25em", fontWeight: "600", lineHeight: "1.5", color: "hsl(var(--md-heading, var(--foreground)))" },
  ".cm-header-4, .cm-header-5": { fontWeight: "600", color: "hsl(var(--md-heading, var(--foreground)))" },
  ".cm-strong": { fontWeight: "700", color: "hsl(var(--md-bold, var(--foreground)))" },
  ".cm-emphasis": { fontStyle: "italic", color: "hsl(var(--md-italic, var(--foreground)))" },
  ".cm-link": { color: "hsl(var(--md-link, var(--primary)))", textDecoration: "underline" },
  ".cm-code": { backgroundColor: "hsl(var(--muted))", padding: "2px 4px", borderRadius: "3px", fontFamily: "monospace" },
  ".cm-wikilink": { color: "hsl(var(--primary))", textDecoration: "underline", cursor: "pointer" },
  ".cm-strikethrough": { textDecoration: "line-through", color: "hsl(var(--muted-foreground))" },
  ".cm-highlight": { backgroundColor: "hsl(50 100% 50% / 0.4)", padding: "1px 2px", borderRadius: "2px" },
  ".cm-highlight-source": { backgroundColor: "hsl(50 100% 50% / 0.3)", borderRadius: "2px" },
  ".cm-voice-preview": { color: "hsl(var(--muted-foreground))", fontStyle: "italic", opacity: 0.8 },
  ".cm-image-widget": { display: "block", margin: "8px 0" },
  ".cm-image-info": { background: "hsl(var(--muted))", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", color: "hsl(var(--muted-foreground))", marginBottom: "4px", fontFamily: "monospace" },
  ".markdown-image": { maxWidth: "100%", borderRadius: "6px", cursor: "pointer" },
});

// ============ 4. Widgets ============

// KaTeX 预渲染缓存：key = `${formula}|${displayMode}`
const katexCache = new Map<string, string>();
const MAX_KATEX_CACHE = 500;

// 预渲染公式（在空闲时调用）
function prerenderMath(formula: string, displayMode: boolean): void {
  const key = `${formula}|${displayMode}`;
  if (katexCache.has(key)) return;

  // 限制缓存大小
  if (katexCache.size >= MAX_KATEX_CACHE) {
    // 简单清理：删除前 100 条
    const keysToDelete = Array.from(katexCache.keys()).slice(0, 100);
    keysToDelete.forEach(k => katexCache.delete(k));
  }

  try {
    const html = katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      strict: false
    });
    katexCache.set(key, html);
  } catch {
    katexCache.set(key, formula);
  }
}

// 后台预渲染队列
let prerenderQueue: { formula: string, displayMode: boolean }[] = [];
let prerenderScheduled = false;

// 安全的 requestIdleCallback polyfill
const safeRequestIdleCallback =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (window as typeof window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 16);

function schedulePrerenderBatch() {
  if (prerenderScheduled || prerenderQueue.length === 0) return;
  prerenderScheduled = true;

  safeRequestIdleCallback(() => {
    const batch = prerenderQueue.splice(0, 5); // 每次处理 5 个
    batch.forEach(({ formula, displayMode }) => prerenderMath(formula, displayMode));
    prerenderScheduled = false;
    if (prerenderQueue.length > 0) schedulePrerenderBatch();
  }, { timeout: 100 });
}

function queuePrerender(formula: string, displayMode: boolean) {
  const key = `${formula}|${displayMode}`;
  if (katexCache.has(key)) return;
  if (!prerenderQueue.some(q => q.formula === formula && q.displayMode === displayMode)) {
    prerenderQueue.push({ formula, displayMode });
    schedulePrerenderBatch();
  }
}

class MathWidget extends WidgetType {
  // isPreviewPanel: true = 编辑模式下方的预览面板; false = 预览模式下的替换块
  constructor(readonly formula: string, readonly displayMode: boolean, readonly isPreviewPanel: boolean = false) { super(); }

  eq(other: MathWidget) {
    return other.formula === this.formula &&
      other.displayMode === this.displayMode &&
      other.isPreviewPanel === this.isPreviewPanel;
  }

  toDOM() {
    const container = document.createElement(this.displayMode || this.isPreviewPanel ? "div" : "span");
    container.className = this.isPreviewPanel ? "cm-math-preview-panel" : (this.displayMode ? "cm-math-block" : "cm-math-inline");

    // 只有非预览面板（即渲染态公式）才添加标记，用于点击检测
    if (!this.isPreviewPanel) {
      container.dataset.widgetType = "math";
    }

    // 尝试使用缓存
    const cacheKey = `${this.formula}|${this.displayMode}`;
    const cached = katexCache.get(cacheKey);
    if (cached) {
      container.innerHTML = cached;
    } else {
      try {
        katex.render(this.formula, container, { displayMode: this.displayMode, throwOnError: false, strict: false });
        // 缓存渲染结果
        katexCache.set(cacheKey, container.innerHTML);
      } catch (e) { container.textContent = this.formula; }
    }
    return container;
  }

  ignoreEvent() {
    // 渲染态公式：让 CodeMirror 忽略事件，由我们自己的 mousedown handler 处理
    // 预览面板：让事件穿透 (pointer-events: none)
    return !this.isPreviewPanel;
  }
}

class TableWidget extends WidgetType {
  constructor(readonly markdown: string) { super(); }
  eq(other: TableWidget) { return other.markdown === this.markdown; }
  toDOM() {
    const d = document.createElement("div");
    d.className = "cm-table-widget reading-view prose max-w-none";
    d.dataset.widgetType = "table";
    d.innerHTML = parseMarkdown(this.markdown);
    return d;
  }
  ignoreEvent() { return true; }
}

class CodeBlockWidget extends WidgetType {
  constructor(readonly code: string, readonly language: string) { super(); }
  eq(other: CodeBlockWidget) { return other.code === this.code && other.language === this.language; }
  toDOM() {
    const c = document.createElement("div");
    c.className = "cm-code-block-widget relative group rounded-md overflow-hidden border my-2";
    c.dataset.widgetType = "codeblock";
    c.innerHTML = `<pre class="p-3 m-0 bg-muted/50 overflow-auto text-sm"><code class="hljs font-mono ${this.language ? 'language-' + this.language : ''}"></code></pre>`;
    const codeEl = c.querySelector("code")!;
    if (this.language && lowlight.registered(this.language)) {
      try { const tree = lowlight.highlight(this.language, this.code); this.hastToDOM(tree.children, codeEl); } catch { }
    } else codeEl.textContent = this.code;
    return c;
  }
  hastToDOM(nodes: any[], parent: HTMLElement) {
    for (const node of nodes) {
      if (node.type === 'text') parent.appendChild(document.createTextNode(node.value));
      else if (node.type === 'element') {
        const el = document.createElement(node.tagName);
        if (node.properties?.className) el.className = node.properties.className.join(' ');
        if (node.children) this.hastToDOM(node.children, el);
        parent.appendChild(el);
      }
    }
  }
  ignoreEvent() { return false; }
}

// Mermaid 图表 Widget
class MermaidWidget extends WidgetType {
  constructor(readonly code: string) { super(); }
  eq(other: MermaidWidget) { return other.code === this.code; }
  toDOM() {
    const container = document.createElement("div");
    container.className = "mermaid-container my-2";

    const pre = document.createElement("pre");
    pre.className = "mermaid";
    pre.textContent = this.code;
    container.appendChild(pre);

    // 异步渲染 mermaid
    setTimeout(async () => {
      try {
        const isDark = document.documentElement.classList.contains('dark');
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
        });
        await mermaid.run({ nodes: [pre] });
      } catch (err) {
        console.error('[Mermaid] Render failed:', err);
        pre.textContent = `Mermaid Error: ${this.code}`;
        pre.style.color = 'red';
      }
    }, 0);

    return container;
  }
  ignoreEvent() { return true; }
}

class CalloutIconWidget extends WidgetType {
  constructor(readonly icon: string) { super(); }
  eq(other: CalloutIconWidget) { return other.icon === this.icon; }
  toDOM() { const s = document.createElement("span"); s.className = "cm-callout-icon"; s.textContent = this.icon; s.style.cssText = "margin-right:6px;font-size:1.1em"; return s; }
  ignoreEvent() { return true; }
}

class VoicePreviewWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(other: VoicePreviewWidget) { return other.text === this.text; }
  toDOM() { const s = document.createElement("span"); s.className = "cm-voice-preview"; s.textContent = this.text; return s; }
  ignoreEvent() { return true; }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string, readonly showInfo: boolean = false, readonly vaultPath: string = "") { super(); }
  eq(other: ImageWidget) { return other.src === this.src && other.alt === this.alt && other.showInfo === this.showInfo; }
  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-image-widget";
    container.style.cssText = "display:block;margin:8px 0;";
    container.dataset.widgetType = "image";
    container.dataset.imageSrc = this.src;

    // 如果显示信息，添加路径提示
    if (this.showInfo) {
      const info = document.createElement("div");
      info.className = "cm-image-info";
      info.style.cssText = "background:hsl(var(--primary)/0.1);padding:4px 8px;border-radius:4px;font-size:12px;color:hsl(var(--primary));margin-bottom:4px;font-family:monospace;display:inline-block;";
      info.textContent = this.src;
      container.appendChild(info);
    }

    const img = document.createElement("img");
    img.alt = this.alt;
    img.className = "markdown-image";
    img.loading = "lazy";
    img.style.cssText = "max-width:100%;border-radius:6px;cursor:pointer;";

    // 处理图片路径
    if (this.src.startsWith("http") || this.src.startsWith("data:")) {
      // 网络图片或 data URL
      img.src = this.src;
    } else if (this.vaultPath) {
      // 本地图片：使用 base64 加载
      const normalizedVaultPath = this.vaultPath.replace(/\\/g, '/');
      const normalizedSrc = this.src.replace(/\\/g, '/').replace(/^\.\//, '');
      const fullPath = normalizedSrc.startsWith("/") || normalizedSrc.match(/^[A-Za-z]:/)
        ? normalizedSrc
        : `${normalizedVaultPath}/${normalizedSrc}`;

      // 先显示加载中状态
      img.style.opacity = "0.5";
      img.alt = useLocaleStore.getState().t.common.loading;

      // 异步加载 base64
      const ext = fullPath.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
        ext === 'gif' ? 'image/gif' :
          ext === 'webp' ? 'image/webp' : 'image/png';

      readBinaryFileBase64(fullPath)
        .then(base64 => {
          img.src = `data:${mimeType};base64,${base64}`;
          img.style.opacity = "1";
          img.alt = this.alt;
        })
        .catch(err => {
          console.error('[ImageWidget] Image load failed:', fullPath, err);
          img.alt = `${useLocaleStore.getState().t.editor.imageLoadFailed}: ${this.src}`;
          img.style.opacity = "1";
        });
    }

    container.appendChild(img);
    return container;
  }
  ignoreEvent() { return true; }
}

// ============ 5. 核心逻辑: Should Show Source? ============
// shouldShowSource 从 codemirror-live-markdown 导入

// ============ 6. StateFields & Plugins ============
// livePreviewPlugin 从 codemirror-live-markdown 导入

// 缓存公式位置，避免每次选择变化都重新解析
let mathPositionsCache: { from: number, to: number }[] = [];

const mathStateField = StateField.define<DecorationSet>({
  create: buildMathDecorations,
  update(deco, tr) {
    // 文档变化：必须重建
    if (tr.docChanged || tr.reconfigured) {
      return buildMathDecorations(tr.state);
    }

    // 拖动选择期间：完全跳过重建，等拖动结束后再更新
    const isDragging = tr.state.field(mouseSelectingField, false);
    const wasDragging = tr.startState.field(mouseSelectingField, false);

    // 刚结束拖动：重建一次
    if (wasDragging && !isDragging) {
      return buildMathDecorations(tr.state);
    }

    // 正在拖动：跳过
    if (isDragging) {
      return deco;
    }

    // 普通选择变化：检查是否触及公式
    if (tr.selection) {
      const oldSel = tr.startState.selection.main;
      const newSel = tr.state.selection.main;
      const touchesMath = (sel: { from: number, to: number }) =>
        mathPositionsCache.some(m =>
          (sel.from >= m.from && sel.from <= m.to) ||
          (sel.to >= m.from && sel.to <= m.to) ||
          (sel.from <= m.from && sel.to >= m.to)
        );
      if (touchesMath(oldSel) !== touchesMath(newSel) ||
        (touchesMath(newSel) && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))) {
        return buildMathDecorations(tr.state);
      }
    }

    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

function buildMathDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc.toString();
  const processed: { from: number, to: number }[] = [];

  // 更新公式位置缓存
  mathPositionsCache = [];

  const blockRegex = /\$\$([\s\S]+?)\$\$/g;
  let match;
  while ((match = blockRegex.exec(doc)) !== null) {
    const from = match.index, to = from + match[0].length;
    processed.push({ from, to });
    mathPositionsCache.push({ from, to }); // 添加到缓存
    const formula = match[1].trim();

    // 预渲染公式（后台进行）
    queuePrerender(formula, true);

    if (shouldShowSource(state, from, to)) {
      // 编辑模式：源码高亮 + 预览面板(Preview Panel)
      decorations.push(Decoration.mark({ class: "cm-math-source" }).range(from, to));
      decorations.push(Decoration.widget({ widget: new MathWidget(formula, true, true), side: 1, block: true }).range(to));
    } else {
      // 预览模式：完整替换
      const fromLine = state.doc.lineAt(from), toLine = state.doc.lineAt(to);
      const isFullLine = from === fromLine.from && to === toLine.to;
      decorations.push(Decoration.replace({ widget: new MathWidget(formula, true), block: isFullLine }).range(from, to));
    }
  }

  const inlineRegex = /(?<!\\|\$)\$(?!\$)((?:[^$\n]|\n(?!\n))+?)(?<!\\|\$)\$(?!\$)/g;
  while ((match = inlineRegex.exec(doc)) !== null) {
    const from = match.index, to = from + match[0].length;
    if (processed.some(p => from >= p.from && to <= p.to)) continue;
    mathPositionsCache.push({ from, to }); // 添加到缓存
    const inlineFormula = match[1].trim();

    // 预渲染公式（后台进行）
    queuePrerender(inlineFormula, false);

    if (shouldShowSource(state, from, to)) {
      decorations.push(Decoration.mark({ class: "cm-math-source" }).range(from, to));
    } else {
      decorations.push(Decoration.replace({ widget: new MathWidget(inlineFormula, false) }).range(from, to));
    }
  }
  return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
}

// 表格位置缓存
let tablePositionsCache: { from: number, to: number }[] = [];

const tableStateField = StateField.define<DecorationSet>({
  create: buildTableDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.reconfigured) return buildTableDecorations(tr.state);
    const isDragging = tr.state.field(mouseSelectingField, false);
    const wasDragging = tr.startState.field(mouseSelectingField, false);
    if (wasDragging && !isDragging) return buildTableDecorations(tr.state);
    if (isDragging) return deco;
    if (tr.selection) {
      const oldSel = tr.startState.selection.main;
      const newSel = tr.state.selection.main;
      const touches = (sel: { from: number, to: number }) =>
        tablePositionsCache.some(t => (sel.from >= t.from && sel.from <= t.to) || (sel.to >= t.from && sel.to <= t.to) || (sel.from <= t.from && sel.to >= t.to));
      if (touches(oldSel) !== touches(newSel) || (touches(newSel) && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))) {
        return buildTableDecorations(tr.state);
      }
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

function buildTableDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  tablePositionsCache = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Table") {
        tablePositionsCache.push({ from: node.from, to: node.to });
        if (shouldShowSource(state, node.from, node.to)) {
          decorations.push(Decoration.mark({ class: "cm-table-source" }).range(node.from, node.to));
        } else {
          decorations.push(Decoration.replace({ widget: new TableWidget(state.doc.sliceString(node.from, node.to)), block: true }).range(node.from, node.to));
        }
      }
    }
  });
  return Decoration.set(decorations);
}

// 代码块位置缓存
let codeBlockPositionsCache: { from: number, to: number }[] = [];

const codeBlockStateField = StateField.define<DecorationSet>({
  create: buildCodeBlockDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.reconfigured) return buildCodeBlockDecorations(tr.state);
    const isDragging = tr.state.field(mouseSelectingField, false);
    const wasDragging = tr.startState.field(mouseSelectingField, false);
    if (wasDragging && !isDragging) return buildCodeBlockDecorations(tr.state);
    if (isDragging) return deco;
    if (tr.selection) {
      const oldSel = tr.startState.selection.main;
      const newSel = tr.state.selection.main;
      const touches = (sel: { from: number, to: number }) =>
        codeBlockPositionsCache.some(c => (sel.from >= c.from && sel.from <= c.to) || (sel.to >= c.from && sel.to <= c.to) || (sel.from <= c.from && sel.to >= c.to));
      if (touches(oldSel) !== touches(newSel) || (touches(newSel) && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))) {
        return buildCodeBlockDecorations(tr.state);
      }
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

function buildCodeBlockDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  codeBlockPositionsCache = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "FencedCode") {
        codeBlockPositionsCache.push({ from: node.from, to: node.to });
        if (shouldShowSource(state, node.from, node.to)) return;
        const text = state.doc.sliceString(node.from, node.to);
        const lines = text.split('\n');
        if (lines.length < 2) return;
        const lang = lines[0].replace(/^\s*`{3,}/, "").trim().toLowerCase();
        const code = lines.slice(1, lines.length - 1).join('\n');
        const widget = lang === 'mermaid'
          ? new MermaidWidget(code)
          : new CodeBlockWidget(code, lang);
        decorations.push(Decoration.replace({ widget, block: true }).range(node.from, node.to));
      }
    }
  });
  return Decoration.set(decorations);
}

// 高亮位置缓存
let highlightPositionsCache: { from: number, to: number }[] = [];

const highlightStateField = StateField.define<DecorationSet>({
  create: buildHighlightDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.reconfigured) return buildHighlightDecorations(tr.state);
    const isDragging = tr.state.field(mouseSelectingField, false);
    const wasDragging = tr.startState.field(mouseSelectingField, false);
    if (wasDragging && !isDragging) return buildHighlightDecorations(tr.state);
    if (isDragging) return deco;
    if (tr.selection) {
      const oldSel = tr.startState.selection.main;
      const newSel = tr.state.selection.main;
      const touches = (sel: { from: number, to: number }) =>
        highlightPositionsCache.some(h => (sel.from >= h.from && sel.from <= h.to) || (sel.to >= h.from && sel.to <= h.to) || (sel.from <= h.from && sel.to >= h.to));
      if (touches(oldSel) !== touches(newSel) || (touches(newSel) && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))) {
        return buildHighlightDecorations(tr.state);
      }
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

function buildHighlightDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc.toString();
  const highlightRegex = /==([^=\n]+)==/g;
  let match;
  const isDrag = state.field(mouseSelectingField, false);

  // 更新缓存
  highlightPositionsCache = [];

  while ((match = highlightRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    highlightPositionsCache.push({ from, to });
    const textStart = from + 2;  // 跳过开头的 ==
    const textEnd = to - 2;      // 跳过结尾的 ==

    // 检查是否在代码块内
    const lineStart = doc.lastIndexOf('\n', from) + 1;
    const lineText = doc.slice(lineStart, from);
    if (lineText.includes('`')) continue;

    const isTouched = shouldShowSource(state, from, to);

    // 高亮文本部分始终添加高亮样式
    decorations.push(Decoration.mark({ class: "cm-highlight" }).range(textStart, textEnd));

    // == 标记使用与加粗/斜体相同的动画类
    const markCls = (isTouched && !isDrag)
      ? "cm-formatting-inline cm-formatting-inline-visible"
      : "cm-formatting-inline";

    // 开头的 ==
    decorations.push(Decoration.mark({ class: markCls }).range(from, textStart));
    // 结尾的 ==
    decorations.push(Decoration.mark({ class: markCls }).range(textEnd, to));
  }

  return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
}

const selectionStatePlugin = ViewPlugin.fromClass(class {
  constructor(private view: EditorView) {
    this.updateClass(view);
  }
  update(update: ViewUpdate) {
    if (update.selectionSet) {
      this.updateClass(update.view);
    }
  }
  destroy() {
    this.view.dom.classList.remove("cm-has-selection");
  }
  private updateClass(view: EditorView) {
    const hasSelection = view.state.selection.ranges.some((range) => range.from !== range.to);
    view.dom.classList.toggle("cm-has-selection", hasSelection);
  }
}, { decorations: () => Decoration.none });

// Table Keymap
const tableKeymap = [
  {
    key: "Tab",
    run: (view: EditorView) => {
      const { state } = view;
      const { head } = state.selection.main;
      const line = state.doc.lineAt(head);
      if (!line.text.includes("|")) return false;
      const rest = line.text.slice(head - line.from);
      const nextPipe = rest.indexOf("|");
      if (nextPipe !== -1) { view.dispatch({ selection: { anchor: head + nextPipe + 2 } }); return true; }
      return false;
    }
  },
  {
    key: "Enter",
    run: (view: EditorView) => {
      const { state } = view;
      const { head } = state.selection.main;
      const line = state.doc.lineAt(head);
      if (!line.text.includes("|")) return false;
      const pipes = (line.text.match(/\|/g) || []).length;
      if (pipes < 2) return false;
      const row = "\n" + "|  ".repeat(Math.max(1, pipes - 1)) + "|";
      view.dispatch({
        changes: { from: head, insert: row },
        selection: { anchor: head + 4 },
        scrollIntoView: true
      });
      return true;
    }
  }
];

const wikiLinkStateField = StateField.define<DecorationSet>({
  create: buildWikiLinkDecorations,
  update(deco, tr) { return tr.docChanged ? buildWikiLinkDecorations(tr.state) : deco.map(tr.changes); },
  provide: f => EditorView.decorations.from(f),
});

function buildWikiLinkDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;
  while ((match = regex.exec(state.doc.toString())) !== null) {
    decorations.push(Decoration.mark({ class: "cm-wikilink", attributes: { "data-wikilink": match[1].trim() } }).range(match.index, match.index + match[0].length));
  }
  return Decoration.set(decorations);
}

const calloutStateField = StateField.define<DecorationSet>({
  create: buildCalloutDecorations,
  update(deco, tr) { return (tr.docChanged || tr.selection) ? buildCalloutDecorations(tr.state) : deco.map(tr.changes); },
  provide: f => EditorView.decorations.from(f),
});
const CALLOUT_COLORS: Record<string, string> = { note: "blue", abstract: "blue", info: "blue", tip: "green", success: "green", question: "yellow", warning: "yellow", danger: "red", failure: "red", bug: "red", example: "purple", quote: "gray", summary: "blue" };
const CALLOUT_ICONS: Record<string, string> = { note: "📝", abstract: "📄", summary: "📄", info: "ℹ️", tip: "💡", hint: "💡", success: "✅", check: "✅", done: "✅", question: "❓", help: "❓", faq: "❓", warning: "⚠️", caution: "⚠️", attention: "⚠️", danger: "🔴", error: "❌", failure: "❌", fail: "❌", missing: "❌", bug: "🐛", example: "📋", quote: "💬", cite: "💬" };
function buildCalloutDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc;
  let lineNo = 1;
  while (lineNo <= doc.lines) {
    const line = doc.line(lineNo);
    const match = line.text.match(/^>\s*\[!([^\]]+)\]/);
    if (!match) { lineNo++; continue; }
    const rawType = match[1].trim();
    const type = rawType.toLowerCase();
    const isEmojiType = !/^\w+$/.test(rawType);
    const color = isEmojiType ? "blue" : (CALLOUT_COLORS[type] || "gray");
    const icon = isEmojiType ? rawType : (CALLOUT_ICONS[type] || "📝");
    const calloutLines = [{ from: line.from }];
    let nextLineNo = lineNo + 1;
    while (nextLineNo <= doc.lines) {
      const nextLine = doc.line(nextLineNo);
      if (/^>\s*/.test(nextLine.text) || nextLine.text.trim() === "") { calloutLines.push({ from: nextLine.from }); nextLineNo++; } else break;
    }
    calloutLines.forEach((l, idx) => {
      let cls = `callout callout-${color}`;
      if (idx === 0) {
        cls += " callout-first";
        const hMatch = doc.line(lineNo).text.match(/^(>\s*)(\[![^\]]+\])(\s*)/);
        if (hMatch) {
          const s = line.from + hMatch[1].length;
          decorations.push(Decoration.replace({ widget: new CalloutIconWidget(icon) }).range(s, s + hMatch[2].length));
        }
      }
      if (idx === calloutLines.length - 1) cls += " callout-last";
      decorations.push(Decoration.line({ class: cls }).range(l.from));
    });
    lineNo = nextLineNo;
  }
  return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
}

// ============ 7. Image StateField ============

// 用于跟踪哪些图片应该显示信息
const setImageShowInfo = StateEffect.define<{ src: string; show: boolean }>();
const imageInfoField = StateField.define<Set<string>>({
  create: () => new Set(),
  update(val, tr) {
    let result = val;
    for (const e of tr.effects) {
      if (e.is(setImageShowInfo)) {
        result = new Set(result);
        if (e.value.show) result.add(e.value.src);
        else result.delete(e.value.src);
      }
    }
    return result;
  },
});

// 创建图片装饰的工厂函数
function createImageStateField(vaultPath: string) {
  return StateField.define<DecorationSet>({
    create: (state) => buildImageDecorations(state, vaultPath),
    update(deco, tr) {
      if (tr.docChanged || tr.selection || tr.reconfigured || tr.effects.some(e => e.is(setMouseSelecting) || e.is(setImageShowInfo))) {
        return buildImageDecorations(tr.state, vaultPath);
      }
      return deco.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f),
  });
}

function buildImageDecorations(state: EditorState, vaultPath: string): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc.toString();
  const showInfoSet = state.field(imageInfoField, false) || new Set<string>();

  // 匹配 Markdown 图片语法 ![alt](src)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = imageRegex.exec(doc)) !== null) {
    const from = match.index, to = from + match[0].length;
    const alt = match[1];
    const src = match[2];

    if (shouldShowSource(state, from, to)) {
      // 编辑模式：显示源码 + 图片预览
      decorations.push(Decoration.mark({ class: "cm-image-source" }).range(from, to));
      decorations.push(Decoration.widget({
        widget: new ImageWidget(src, alt, true, vaultPath),
        side: 1,
        block: true
      }).range(to));
    } else {
      // 预览模式：替换为图片
      const showInfo = showInfoSet.has(src);
      decorations.push(Decoration.replace({
        widget: new ImageWidget(src, alt, showInfo, vaultPath),
        block: true
      }).range(from, to));
    }
  }
  return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
}

const readingModePlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view.state); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.transactions.some(tr => tr.reconfigured)) this.decorations = this.build(u.state);
  }
  build(state: EditorState) {
    const d: any[] = [];
    syntaxTree(state).iterate({
      enter: (node) => {
        if (["HeaderMark", "EmphasisMark", "StrikethroughMark", "CodeMark", "ListMark", "QuoteMark"].includes(node.name)) {
          this.hide(state, node.from, node.to, d);
        }
      }
    });
    return Decoration.set(d, true);
  }
  hide(state: EditorState, from: number, to: number, d: any[]) {
    if (from >= to || state.doc.sliceString(from, to).includes('\n')) return;
    d.push(Decoration.mark({ class: "cm-formatting-hidden" }).range(from, to));
  }
}, { decorations: v => v.decorations });

const markdownStylePlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
  build(view: EditorView) {
    const d: any[] = [];
    syntaxTree(view.state).iterate({
      enter: (node) => {
        const type = node.name;
        const map: Record<string, string> = {
          "ATXHeading1": "cm-header-1", "ATXHeading2": "cm-header-2", "ATXHeading3": "cm-header-3", "ATXHeading4": "cm-header-4",
          "StrongEmphasis": "cm-strong", "Emphasis": "cm-emphasis", "Strikethrough": "cm-strikethrough", "InlineCode": "cm-code", "Link": "cm-link", "URL": "cm-url"
        };
        if (type.startsWith("ATXHeading")) {
          const cls = map[type] || "cm-header-4";
          d.push(Decoration.mark({ class: cls }).range(node.from, node.to));
          d.push(Decoration.line({ class: "cm-heading-line" }).range(node.from));
        } else if (map[type]) {
          d.push(Decoration.mark({ class: map[type] }).range(node.from, node.to));
        }
      }
    });
    return Decoration.set(d, true);
  }
}, { decorations: v => v.decorations });

const setVoicePreview = StateEffect.define<{ from: number; text: string }>();
const clearVoicePreview = StateEffect.define<null | void>();
const voicePreviewField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(val, tr) {
    let deco = val;
    for (const e of tr.effects) {
      if (e.is(setVoicePreview)) deco = e.value.text ? Decoration.set([Decoration.widget({ widget: new VoicePreviewWidget(e.value.text), side: 1 }).range(e.value.from)]) : Decoration.none;
      if (e.is(clearVoicePreview)) deco = Decoration.none;
    }
    return tr.docChanged && deco !== Decoration.none ? deco.map(tr.changes) : deco;
  },
  provide: f => EditorView.decorations.from(f),
});

// ============ 10. React 组件 ============

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorRef, CodeMirrorEditorProps>(
  function CodeMirrorEditor({ content, onChange, className = "", viewMode, livePreview }, ref) {

    const effectiveMode: ViewMode = viewMode ?? (livePreview === false ? 'source' : 'live');
    const isReadOnly = effectiveMode === 'reading';

    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const isExternalChange = useRef(false);
    const lastInternalContent = useRef<string>(content);

    const { openVideoNoteTab, openPDFTab, fileTree, openFile, vaultPath } = useFileStore();
    const { openSecondaryPdf } = useSplitStore();
    const { setSplitView } = useUIStore();

    const getModeExtensions = useCallback((mode: ViewMode) => {
      const imageField = vaultPath ? createImageStateField(vaultPath) : null;
      const widgets = [mathStateField, tableStateField, codeBlockStateField, calloutStateField, highlightStateField];
      if (imageField) widgets.push(imageField);
      switch (mode) {
        case 'reading': return [collapseOnSelectionFacet.of(false), readingModePlugin, ...widgets];
        case 'live': return [collapseOnSelectionFacet.of(true), livePreviewPlugin, ...widgets];
        case 'source': default: return [calloutStateField];
      }
    }, [vaultPath]);

    useImperativeHandle(ref, () => ({
      getScrollLine: () => {
        if (!viewRef.current) return 1;
        const pos = viewRef.current.lineBlockAtHeight(viewRef.current.scrollDOM.scrollTop).from;
        return viewRef.current.state.doc.lineAt(pos).number;
      },
      scrollToLine: (line: number) => {
        if (!viewRef.current) return;
        const target = Math.min(Math.max(1, line), viewRef.current.state.doc.lines);
        viewRef.current.dispatch({ effects: EditorView.scrollIntoView(viewRef.current.state.doc.line(target).from, { y: "start" }) });
      }
    }), []);

    useEffect(() => {
      if (!containerRef.current) return;

      const state = EditorState.create({
        doc: content,
        extensions: [
          viewModeCompartment.of(getModeExtensions(effectiveMode)),
          readOnlyCompartment.of(EditorState.readOnly.of(isReadOnly)),
          themeCompartment.of([]),
          history(),
          keymap.of([...tableKeymap, ...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          editorTheme,
          mouseSelectingField,
          selectionStatePlugin,
          wikiLinkStateField,
          voicePreviewField,
          markdownStylePlugin,
          imageInfoField,
          // Slash Command 扩展
          ...slashCommandExtensions,
          placeholderExtension("开始输入，或按 / 唤起命令..."),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isExternalChange.current) {
              const newContent = update.state.doc.toString();
              lastInternalContent.current = newContent;
              onChange(newContent);
            }
          }),
        ],
      });

      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;

      // 拖动选择检测：mousedown 时设为 true，mouseup 时设为 false
      const handleMouseDown = () => {
        view.dispatch({ effects: setMouseSelecting.of(true) });
      };
      const handleMouseUp = () => {
        // 延迟一帧确保选择已更新
        requestAnimationFrame(() => {
          view.dispatch({ effects: setMouseSelecting.of(false) });
        });
      };
      view.contentDOM.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mouseup', handleMouseUp);

      // Paste Handler for Images
      const handlePaste = async (e: ClipboardEvent) => {
        const v = viewRef.current;
        // 从 store 获取最新的 vaultPath
        const currentVaultPath = useFileStore.getState().vaultPath;
        if (!v || !currentVaultPath) {
          return;
        }

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();

            const file = item.getAsFile();
            if (!file) continue;

            const ext = file.type.split('/')[1] || 'png';
            const timestamp = Date.now();
            const fileName = `image_${timestamp}.${ext}`;
            // Windows 路径处理
            const normalizedVaultPath = currentVaultPath.replace(/\\/g, '/');
            const filePath = `${normalizedVaultPath}/${fileName}`;

            try {
              const arrayBuffer = await file.arrayBuffer();
              const data = new Uint8Array(arrayBuffer);
              await writeBinaryFile(filePath, data);

              const pos = v.state.selection.main.head;
              const imageMarkdown = `![](${fileName})`;
              v.dispatch({
                changes: { from: pos, insert: imageMarkdown },
                selection: { anchor: pos + imageMarkdown.length },
              });
            } catch (err) {
            }
            return;
          }
        }
      };

      // Click Handler for Widgets
      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const v = viewRef.current;
        if (!v) return;

        // 0. Image Widget 点击处理
        const imageWidget = target.closest('[data-widget-type="image"]') as HTMLElement;
        if (imageWidget) {
          const src = imageWidget.dataset.imageSrc;
          if (src) {
            e.preventDefault();
            const currentShowInfo = v.state.field(imageInfoField, false) || new Set<string>();
            const isShowing = currentShowInfo.has(src);

            // 如果点击的是路径信息区域，或者已经显示路径信息再次点击 -> 聚焦到源码
            const clickedInfo = target.closest('.cm-image-info');
            if (clickedInfo || isShowing) {
              // 查找图片源码位置并聚焦
              const doc = v.state.doc.toString();
              const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
              let match;
              while ((match = imageRegex.exec(doc)) !== null) {
                if (match[2] === src) {
                  const pos = match.index;
                  v.focus();
                  v.dispatch({
                    selection: { anchor: pos + 2 }, // 定位到 alt 文本位置
                    effects: setImageShowInfo.of({ src, show: false })
                  });
                  return;
                }
              }
            } else {
              // 第一次点击：显示路径信息
              v.dispatch({ effects: setImageShowInfo.of({ src, show: true }) });
            }
          }
          return;
        }

        // 1. Math/Table/CodeBlock Widget 点击 -> 聚焦源码
        const widgetDom = target.closest('[data-widget-type="math"], [data-widget-type="table"], [data-widget-type="codeblock"]');
        if (widgetDom) {
          const pos = v.posAtDOM(widgetDom);
          if (pos !== null) {
            e.preventDefault();
            v.focus();
            v.dispatch({ selection: { anchor: pos + 1 } });
            return;
          }
        }

        // 2. Links
        const link = target.closest('a[href]');
        if (link?.getAttribute('href')?.startsWith('lumina://pdf')) {
          e.preventDefault(); e.stopPropagation();
          const parsed = parseLuminaLink(link.getAttribute('href')!);
          if (parsed?.file) (e.ctrlKey || e.metaKey) ? (setSplitView(true), openSecondaryPdf(parsed.file, parsed.page || 1, parsed.id)) : openPDFTab(parsed.file);
          return;
        }

        const wikiEl = target.closest(".cm-wikilink");
        if (wikiEl && (e.ctrlKey || e.metaKey)) {
          e.preventDefault(); e.stopPropagation();
          const name = wikiEl.getAttribute("data-wikilink");
          if (name) {
            const find = (arr: any[]): string | null => { for (const i of arr) { if (!i.is_dir && i.name.replace(".md", "").toLowerCase() === name.toLowerCase()) return i.path; if (i.is_dir) { const r = find(i.children); if (r) return r; } } return null; };
            const path = find(fileTree);
            path ? openFile(path) : console.log(`Not found: ${name}`);
          }
          return;
        }

        if ((e.ctrlKey || e.metaKey) && link) {
          const h = link.getAttribute('href')!;
          if (h.includes('bilibili') || h.includes('b23.tv')) { e.preventDefault(); e.stopPropagation(); openVideoNoteTab(h); return; }
        }
      };

      view.contentDOM.addEventListener('mousedown', handleClick);
      view.contentDOM.addEventListener('paste', handlePaste);
      return () => {
        view.contentDOM.removeEventListener('mousedown', handleMouseDown);
        view.contentDOM.removeEventListener('mousedown', handleClick);
        view.contentDOM.removeEventListener('paste', handlePaste);
        document.removeEventListener('mouseup', handleMouseUp);
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: [
          viewModeCompartment.reconfigure(getModeExtensions(effectiveMode)),
          readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly))
        ]
      });
    }, [effectiveMode, isReadOnly, getModeExtensions]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || content === lastInternalContent.current) return;
      const current = view.state.doc.toString();
      if (current !== content) {
        isExternalChange.current = true;
        const sel = view.state.selection.main.head;
        view.dispatch({ changes: { from: 0, to: current.length, insert: content }, selection: { anchor: Math.min(sel, content.length) } });
        lastInternalContent.current = content;
        isExternalChange.current = false;
      }
    }, [content]);

    useEffect(() => {
      const onVoiceInt = (e: any) => viewRef.current?.dispatch({ effects: e.detail?.text ? setVoicePreview.of({ from: viewRef.current.state.selection.main.head, text: e.detail.text }) : clearVoicePreview.of(null) });
      const onVoiceFin = (e: any) => { if (e.detail?.text && viewRef.current) { const p = viewRef.current.state.selection.main.head; viewRef.current.dispatch({ changes: { from: p, to: p, insert: e.detail.text }, selection: { anchor: p + e.detail.text.length }, effects: clearVoicePreview.of(null) }); } };
      const onAi = (e: any) => {
        if (!viewRef.current || !e.detail?.text) return;
        const { mode, text, description } = e.detail;
        const s = viewRef.current.state, doc = s.doc.toString(), sel = s.selection.main;
        let mod = doc;
        if (mode === "replace_selection") mod = doc.slice(0, sel.from) + text + doc.slice(sel.to);
        else if (mode === "append_callout") mod = doc.slice(0, sel.to) + text + doc.slice(sel.to);
        if (mod !== doc) {
          const f = useFileStore.getState().currentFile;
          if (f) useAIStore.getState().setPendingDiff({ fileName: f.split('/').pop()!, filePath: f, original: doc, modified: mod, description: description || "AI Edit" });
        }
      };
      const onSum = (e: any) => { if (viewRef.current && e.detail?.callout) { const p = viewRef.current.state.selection.main.to; viewRef.current.dispatch({ changes: { from: p, to: p, insert: e.detail.callout }, selection: { anchor: p + e.detail.callout.length } }); } };

      // 处理右键菜单格式化
      const onFormat = (e: any) => {
        const view = viewRef.current;
        if (!view || !e.detail?.format) return;

        const { format } = e.detail;
        const sel = view.state.selection.main;
        const selectedText = view.state.doc.sliceString(sel.from, sel.to);

        if (!selectedText) return;

        let replacement = selectedText;
        let cursorOffset = 0;

        switch (format) {
          case 'bold':
            replacement = `**${selectedText}**`;
            break;
          case 'italic':
            replacement = `*${selectedText}*`;
            break;
          case 'strikethrough':
            replacement = `~~${selectedText}~~`;
            break;
          case 'highlight':
            replacement = `==${selectedText}==`;
            break;
          case 'code':
            replacement = `\`${selectedText}\``;
            break;
          case 'wikilink':
            replacement = `[[${selectedText}]]`;
            break;
          case 'link':
            replacement = `[${selectedText}](url)`;
            cursorOffset = -4; // 光标移到 url 位置
            break;
          case 'ul':
            replacement = selectedText.split('\n').map(line => `- ${line}`).join('\n');
            break;
          case 'ol':
            replacement = selectedText.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n');
            break;
          case 'task':
            replacement = selectedText.split('\n').map(line => `- [ ] ${line}`).join('\n');
            break;
          case 'h1':
            replacement = `# ${selectedText}`;
            break;
          case 'h2':
            replacement = `## ${selectedText}`;
            break;
          case 'h3':
            replacement = `### ${selectedText}`;
            break;
          case 'h4':
            replacement = `#### ${selectedText}`;
            break;
          case 'h5':
            replacement = `##### ${selectedText}`;
            break;
          case 'h6':
            replacement = `###### ${selectedText}`;
            break;
          case 'quote':
            replacement = selectedText.split('\n').map(line => `> ${line}`).join('\n');
            break;
          default:
            return;
        }

        const newPos = sel.from + replacement.length + cursorOffset;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: replacement },
          selection: { anchor: newPos }
        });
        view.focus();
      };

      window.addEventListener("voice-input-interim", onVoiceInt);
      window.addEventListener("voice-input-final", onVoiceFin);
      window.addEventListener("selection-ai-edit", onAi);
      window.addEventListener("insert-summary-callout", onSum);
      window.addEventListener("editor-format-text", onFormat);
      return () => {
        window.removeEventListener("voice-input-interim", onVoiceInt);
        window.removeEventListener("voice-input-final", onVoiceFin);
        window.removeEventListener("selection-ai-edit", onAi);
        window.removeEventListener("insert-summary-callout", onSum);
        window.removeEventListener("editor-format-text", onFormat);
      };
    }, []);

    // 监听自定义拖拽事件（从文件树拖拽创建双链）
    useEffect(() => {
      const handleLuminaDrop = (e: Event) => {
        const { wikiLink, x, y } = (e as CustomEvent).detail;
        const v = viewRef.current;
        const container = containerRef.current;
        if (!v || !container) return;

        const rect = container.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;

        const pos = v.posAtCoords({ x, y }) ?? v.state.selection.main.head;
        v.dispatch({
          changes: { from: pos, insert: wikiLink },
          selection: { anchor: pos + wikiLink.length },
        });
        v.focus();
      };

      window.addEventListener('lumina-drop', handleLuminaDrop);
      return () => window.removeEventListener('lumina-drop', handleLuminaDrop);
    }, []);

    return (
      <>
        <div ref={containerRef} className={`codemirror-wrapper h-full overflow-auto ${className}`} />
        <SlashMenu view={viewRef.current} />
      </>
    );
  }
);

export default CodeMirrorEditor;
