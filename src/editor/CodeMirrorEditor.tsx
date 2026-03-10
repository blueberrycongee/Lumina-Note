import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, type RefObject } from 'react';
import { useFileStore } from '@/stores/useFileStore';
import { useAIStore } from '@/stores/useAIStore';
import { useSplitStore } from '@/stores/useSplitStore';
import { useUIStore } from '@/stores/useUIStore';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { useShallow } from 'zustand/react/shallow';
import { parseLuminaLink } from '@/services/pdf/annotations';
import { writeBinaryFile, readBinaryFileBase64 } from '@/lib/tauri';
import {
  EditorState,
  StateField,
  StateEffect,
  Compartment,
  Prec,
  ChangeSet,
  Range,
  Text,
} from '@codemirror/state';
import { slashCommandExtensions, placeholderExtension } from './extensions/slashCommand';
import { SlashMenu } from './components/SlashMenu';
import {
  EditorView,
  drawSelection,
  keymap,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Table } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';
import { common as lowlightCommon, createLowlight } from 'lowlight';
import katex from 'katex';
import mermaid from 'mermaid';
import {
  PLUGIN_EDITOR_SELECTION_EVENT,
  pluginEditorRuntime,
} from '@/services/plugins/editorRuntime';
import {
  checkUpdateAction,
  collapseOnSelectionFacet,
  tableField,
  tableEditorPlugin,
  mouseSelectingField,
  setMouseSelecting,
  shouldShowSource,
} from 'codemirror-live-markdown';

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
const pluginExtensionsCompartment = new Compartment();
const fontSizeCompartment = new Compartment();

// ============ 2. 全局状态 ============
// mouseSelectingField 和 setMouseSelecting 从 codemirror-live-markdown 导入

interface CodeMirrorEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
  viewMode?: ViewMode;
  livePreview?: boolean;
  scrollContainerRef?: RefObject<HTMLElement>;
}

export interface CodeMirrorEditorRef {
  getScrollLine: () => number;
  scrollToLine: (line: number) => void;
  syncSelectionToViewport: () => void;
}

// ============ 3. 样式定义 (动画与布局核心) ============

const createEditorTheme = (fontSize: number) =>
  EditorView.theme({
    '&': {
      backgroundColor: 'transparent',
      fontSize: `${fontSize}px`,
      height: '100%',
      '--lumina-codeblock-bg': 'hsl(var(--muted) / 0.58)',
      '--lumina-codeblock-bg-hover': 'hsl(var(--muted) / 0.74)',
      '--lumina-codeblock-bg-source': 'hsl(var(--muted) / 0.7)',
      '--lumina-codeblock-border': 'hsl(var(--border) / 0.65)',
      '--lumina-codeblock-border-soft': 'hsl(var(--border) / 0.35)',
      '--lumina-codeblock-shadow':
        '0 0 0 1px hsl(var(--border) / 0.08), 0 10px 24px -18px hsl(var(--foreground) / 0.28)',
    },
    '.cm-codeblock-widget pre': { fontSize: `${Math.max(10, fontSize - 2)}px` },
    '.cm-content': {
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: '16px 0',
      caretColor: 'hsl(var(--foreground))',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
    '.cm-line': {
      padding: '0 16px',
      paddingLeft: '16px',
      lineHeight: '1.75',
      position: 'relative',
    },

    // 选区颜色（更淡的蓝色）
    '.cm-selectionBackground': { backgroundColor: 'rgba(191, 219, 254, 0.25) !important' },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(191, 219, 254, 0.35) !important',
    },

    // === 动画核心样式 ===

    // 1. 悬挂标记 (Headings) - 绝对定位到左侧，不占用正文空间
    '.cm-formatting-hanging': {
      position: 'absolute',
      right: '100%', // 悬挂在内容左侧
      marginRight: '6px',
      color: 'hsl(var(--muted-foreground) / 0.4)',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '14px', // 固定字体大小，不继承标题大小
      fontWeight: 'bold',
      userSelect: 'none',
      pointerEvents: 'none',
    },

    // 2. 行内标记 (Bold, Italic) - 默认隐藏 (收缩)
    '.cm-formatting-inline': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      verticalAlign: 'baseline',
      color: 'hsl(var(--muted-foreground) / 0.6)',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '0.85em',
      // 关键动画属性：初始宽度为0，透明度为0
      maxWidth: '0',
      opacity: '0',
      transform: 'scaleX(0.8)',
      transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
      pointerEvents: 'none',
    },

    // 3. 行内标记 - 激活状态 (展开)
    '.cm-formatting-inline-visible': {
      maxWidth: '4ch', // 足够容纳符号
      opacity: '1',
      transform: 'scaleX(1)',
      margin: '0 1px',
      pointerEvents: 'auto',
    },
    '&.cm-drag-selecting .cm-formatting-inline, &.cm-drag-selecting .cm-formatting-block, &.cm-drag-selecting .cm-math-inline, &.cm-drag-selecting .cm-math-source, &.cm-drag-selecting .cm-selection-bridge, &.cm-drag-selecting .cm-selection-gap': {
      transition: 'none !important',
      animation: 'none !important',
    },
    '&.cm-drag-native-selection-suppressed, &.cm-drag-native-selection-suppressed *': {
      userSelect: 'none !important',
      WebkitUserSelect: 'none !important',
    },

    // 块级标记 (标题/列表/引用) - 默认隐藏
    '.cm-formatting-block': {
      display: 'inline',
      overflow: 'hidden',
      fontSize: '0.01em',
      lineHeight: 'inherit',
      opacity: '0',
      color: 'hsl(var(--muted-foreground))',
      fontFamily: "'JetBrains Mono', monospace",
      transition: 'opacity 0.2s ease-out',
    },

    // 块级标记 - 激活状态 (展开)
    '.cm-formatting-block-visible': {
      fontSize: '1em',
      opacity: '0.6',
    },

    // Selection bridge for visible formatting marks and their gap spaces.
    '.cm-selection-bridge, .cm-selection-gap': {
      backgroundColor: 'rgba(191, 219, 254, 0.25)',
      borderRadius: '2px',
      boxShadow: '1px 0 0 rgba(191, 219, 254, 0.25), -1px 0 0 rgba(191, 219, 254, 0.25)',
    },
    '&.cm-focused .cm-selection-bridge, &.cm-focused .cm-selection-gap': {
      backgroundColor: 'rgba(191, 219, 254, 0.35)',
      boxShadow: '1px 0 0 rgba(191, 219, 254, 0.35), -1px 0 0 rgba(191, 219, 254, 0.35)',
    },

    // === Math 编辑体验 ===
    // 行内公式渲染结果 - 带淡入动画
    '.cm-math-inline': {
      display: 'inline-block',
      verticalAlign: 'middle',
      cursor: 'pointer',
      animation: 'mathFadeIn 0.15s ease-out',
    },
    '.cm-math-block': {
      display: 'block',
      textAlign: 'center',
      padding: '0.5em 0',
      overflow: 'hidden',
      cursor: 'pointer',
    },

    // 编辑模式：源码背景 (淡绿色) - 带淡入动画
    '.cm-math-source': {
      backgroundColor: 'rgba(74, 222, 128, 0.15)',
      color: 'hsl(var(--foreground))',
      fontFamily: "'JetBrains Mono', monospace",
      borderRadius: '4px',
      padding: '2px 4px',
      zIndex: '1',
      position: 'relative',
      cursor: 'text',
      animation: 'mathFadeIn 0.15s ease-out',
    },

    // 公式淡入动画关键帧
    '@keyframes mathFadeIn': {
      from: { opacity: '0', transform: 'scale(0.95)' },
      to: { opacity: '1', transform: 'scale(1)' },
    },
    // 编辑模式：预览面板 (位于源码下方)
    '.cm-math-preview-panel': {
      display: 'block',
      textAlign: 'center',
      padding: '8px',
      marginTop: '4px',
      marginBottom: '8px',
      border: '1px solid hsl(var(--border) / 0.5)',
      borderRadius: '6px',
      backgroundColor: 'hsl(var(--muted) / 0.3)',
      pointerEvents: 'none', // 关键：让鼠标点击穿透面板，避免无法聚焦其他位置
      userSelect: 'none',
      opacity: 0.95,
    },

    // === Table 样式 ===
    '.cm-table-widget': { display: 'block', overflowX: 'auto', cursor: 'text' },
    '.cm-table-widget table': { borderCollapse: 'collapse', width: '100%' },
    '.cm-table-widget th, .cm-table-widget td': {
      border: '1px solid hsl(var(--border))',
      padding: '8px 12px',
    },
    '.cm-table-widget th': { backgroundColor: 'hsl(var(--muted))', fontWeight: '600' },
    '.cm-table-editor': { display: 'block', overflowX: 'auto', cursor: 'text' },
    '.cm-table-editor table': { borderCollapse: 'collapse', width: '100%' },
    '.cm-table-editor th, .cm-table-editor td': {
      border: '1px solid hsl(var(--border))',
      padding: '8px 12px',
    },
    '.cm-table-editor th': { backgroundColor: 'hsl(var(--muted))', fontWeight: '600' },
    '.cm-table-cell': { outline: 'none', minWidth: '40px' },
    '.cm-table-toolbar': { display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' },
    '.cm-table-source-toggle': { display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' },
    '.cm-table-toggle': {
      border: '1px solid hsl(var(--border))',
      backgroundColor: 'hsl(var(--background))',
      color: 'hsl(var(--foreground))',
      borderRadius: '6px',
      padding: '4px 8px',
      fontSize: '12px',
      lineHeight: '1',
      cursor: 'pointer',
    },
    '.cm-table-source': {
      fontFamily: "'JetBrains Mono', monospace !important",
      whiteSpace: 'pre',
      color: 'hsl(var(--foreground))',
      display: 'block',
      overflowX: 'auto',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },

    // === Code Block 样式（codemirror-live-markdown）===
    '.cm-codeblock-widget': {
      display: 'block',
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: 'var(--lumina-codeblock-bg)',
      border: '1px solid var(--lumina-codeblock-border)',
      borderRadius: '14px',
      boxShadow: 'var(--lumina-codeblock-shadow)',
      backdropFilter: 'blur(6px)',
    },
    '.cm-lumina-codeblock-open': {
      paddingLeft: '14px !important',
      paddingRight: '78px !important',
      paddingTop: '8px !important',
      paddingBottom: '2px !important',
      backgroundColor: 'var(--lumina-codeblock-bg)',
      color: 'hsl(var(--muted-foreground) / 0.78)',
      fontFamily: "'JetBrains Mono', monospace",
      border: '1px solid var(--lumina-codeblock-border)',
      borderBottom: '1px solid var(--lumina-codeblock-border-soft)',
      borderRadius: '14px 14px 0 0',
      boxShadow: 'var(--lumina-codeblock-shadow)',
      backdropFilter: 'blur(6px)',
    },
    '.cm-lumina-codeblock-content-line': {
      backgroundColor: 'var(--lumina-codeblock-bg)',
      color: 'hsl(var(--foreground) / 0.96)',
      fontFamily: "'JetBrains Mono', monospace",
      paddingLeft: '14px !important',
      paddingRight: '14px !important',
      lineHeight: '1.7 !important',
      boxShadow:
        'inset 1px 0 0 var(--lumina-codeblock-border), inset -1px 0 0 var(--lumina-codeblock-border)',
    },
    '.cm-lumina-codeblock-close': {
      paddingLeft: '14px !important',
      paddingRight: '14px !important',
      paddingTop: '2px !important',
      paddingBottom: '8px !important',
      backgroundColor: 'var(--lumina-codeblock-bg)',
      color: 'hsl(var(--muted-foreground) / 0.78)',
      fontFamily: "'JetBrains Mono', monospace",
      borderLeft: '1px solid var(--lumina-codeblock-border)',
      borderRight: '1px solid var(--lumina-codeblock-border)',
      borderBottom: '1px solid var(--lumina-codeblock-border)',
      borderRadius: '0 0 14px 14px',
      boxShadow: 'var(--lumina-codeblock-shadow)',
      backdropFilter: 'blur(6px)',
    },
    '.cm-codeblock-actions': {
      position: 'absolute',
      top: '10px',
      right: '10px',
      display: 'flex',
      gap: '6px',
      zIndex: '1',
    },
    '.cm-lumina-codeblock-copy-anchor': {
      position: 'absolute',
      top: '8px',
      right: '10px',
      zIndex: '2',
    },
    '.cm-codeblock-widget code': {
      fontFamily: "'JetBrains Mono', monospace",
    },
    '.cm-codeblock-line': {
      display: 'block',
      padding: '0 14px',
      lineHeight: '1.75',
      minHeight: '28px',
    },
    '.cm-codeblock-fence': {
      color: 'hsl(var(--muted-foreground) / 0.6)',
    },
    '.cm-lumina-codeblock-open .cm-codeblock-fence, .cm-lumina-codeblock-close .cm-codeblock-fence':
      {
        color: 'hsl(var(--muted-foreground) / 0.72)',
      },
    '.cm-codeblock-source-toggle': {
      justifyContent: 'flex-end',
      borderRadius: '14px 14px 0 0',
    },
    '.cm-codeblock-toggle, .cm-codeblock-copy': {
      border: '1px solid hsl(var(--border) / 0.5)',
      backgroundColor: 'hsl(var(--background) / 0.72)',
      color: 'hsl(var(--foreground) / 0.84)',
      borderRadius: '9px',
      padding: '5px 9px',
      fontSize: '12px',
      lineHeight: '1',
      cursor: 'pointer',
      transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
    },
    '.cm-codeblock-toggle:hover, .cm-codeblock-copy:hover': {
      backgroundColor: 'hsl(var(--background) / 0.92)',
      borderColor: 'hsl(var(--border) / 0.8)',
      color: 'hsl(var(--foreground) / 0.96)',
    },
    '.cm-codeblock-copy-success': {
      color: 'hsl(142 76% 36%)',
    },
    '.cm-codeblock-source': {
      backgroundColor: 'var(--lumina-codeblock-bg-source)',
      color: 'hsl(var(--foreground) / 0.96)',
      fontFamily: "'JetBrains Mono', monospace",
      paddingLeft: '14px !important',
      paddingRight: '14px !important',
      boxShadow:
        'inset 1px 0 0 var(--lumina-codeblock-border), inset -1px 0 0 var(--lumina-codeblock-border)',
    },

    // === Inline code block styles ===
    '.cm-codeblock-header': {
      fontSize: '12px',
      borderRadius: '14px 14px 0 0',
    },
    '.cm-codeblock-lang': {
      color: 'hsl(var(--muted-foreground) / 0.9)',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11px',
      letterSpacing: '0.02em',
      backgroundColor: 'hsl(var(--background) / 0.56)',
      border: '1px solid hsl(var(--border) / 0.45)',
      padding: '3px 7px',
      borderRadius: '999px',
    },
    '.cm-codeblock-content': {
      backgroundColor: 'var(--lumina-codeblock-bg) !important',
      fontFamily: "'JetBrains Mono', monospace !important",
      color: 'hsl(var(--foreground) / 0.96)',
      padding: '0 14px !important',
      lineHeight: '1.7 !important',
      boxShadow:
        'inset 1px 0 0 var(--lumina-codeblock-border), inset -1px 0 0 var(--lumina-codeblock-border)',
    },
    '.cm-codeblock-footer': {
      backgroundColor: 'var(--lumina-codeblock-bg)',
      borderLeft: '1px solid var(--lumina-codeblock-border)',
      borderRight: '1px solid var(--lumina-codeblock-border)',
      borderBottom: '1px solid var(--lumina-codeblock-border)',
      borderRadius: '0 0 14px 14px',
      boxShadow: 'var(--lumina-codeblock-shadow)',
      height: '10px',
    },
    // hljs token colors
    '.hljs-keyword': { color: 'hsl(var(--md-keyword, 280 70% 55%))' },
    '.hljs-string': { color: 'hsl(var(--md-string, 120 50% 40%))' },
    '.hljs-comment': { color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
    '.hljs-number': { color: 'hsl(var(--md-number, 30 80% 50%))' },
    '.hljs-title': { color: 'hsl(var(--md-link, 210 80% 55%))' },
    '.hljs-built_in': { color: 'hsl(var(--md-link, 210 80% 55%))' },
    '.hljs-type': { color: 'hsl(var(--md-keyword, 280 70% 55%))' },
    '.hljs-function': { color: 'hsl(var(--md-link, 210 80% 55%))' },
    '.hljs-params': { color: 'hsl(var(--foreground))' },
    '.hljs-literal': { color: 'hsl(var(--md-number, 30 80% 50%))' },
    '.hljs-attr': { color: 'hsl(var(--md-link, 210 80% 55%))' },
    '.hljs-variable': { color: 'hsl(var(--foreground))' },
    '.hljs-meta': { color: 'hsl(var(--muted-foreground))' },

    // 基础 Markdown 样式
    '.cm-header-1': {
      fontSize: '2em',
      fontWeight: '700',
      lineHeight: '1.3',
      color: 'hsl(var(--md-heading, var(--foreground)))',
    },
    '.cm-header-2': {
      fontSize: '1.5em',
      fontWeight: '600',
      lineHeight: '1.4',
      color: 'hsl(var(--md-heading, var(--foreground)))',
    },
    '.cm-header-3': {
      fontSize: '1.25em',
      fontWeight: '600',
      lineHeight: '1.5',
      color: 'hsl(var(--md-heading, var(--foreground)))',
    },
    '.cm-header-4, .cm-header-5': {
      fontWeight: '600',
      color: 'hsl(var(--md-heading, var(--foreground)))',
    },
    '.cm-strong': { fontWeight: '700', color: 'hsl(var(--md-bold, var(--foreground)))' },
    '.cm-emphasis': { fontStyle: 'italic', color: 'hsl(var(--md-italic, var(--foreground)))' },
    '.cm-link': { color: 'hsl(var(--md-link, var(--primary)))', textDecoration: 'underline' },
    '.cm-code': {
      backgroundColor: 'hsl(var(--muted))',
      padding: '2px 4px',
      borderRadius: '3px',
      fontFamily: 'monospace',
    },
    '.cm-wikilink': {
      color: 'hsl(var(--primary))',
      textDecoration: 'underline',
      cursor: 'pointer',
    },
    '.cm-strikethrough': { textDecoration: 'line-through', color: 'hsl(var(--muted-foreground))' },
    '.cm-highlight': {
      backgroundColor: 'hsl(50 100% 50% / 0.4)',
      padding: '1px 2px',
      borderRadius: '2px',
    },
    '.cm-highlight-source': { backgroundColor: 'hsl(50 100% 50% / 0.3)', borderRadius: '2px' },
    '.cm-voice-preview': {
      color: 'hsl(var(--muted-foreground))',
      fontStyle: 'italic',
      opacity: 0.8,
    },
    '.cm-image-widget': { display: 'block', margin: '8px 0' },
    '.cm-image-info': {
      background: 'hsl(var(--muted))',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      color: 'hsl(var(--muted-foreground))',
      marginBottom: '4px',
      fontFamily: 'monospace',
    },
    '.markdown-image': { maxWidth: '100%', borderRadius: '6px', cursor: 'pointer' },

    // Horizontal Rule styles
    '.cm-hr': {
      border: 'none',
      borderTop: '1px solid hsl(var(--border))',
      margin: '1rem 0',
      display: 'block',
    },
    '.cm-hr-source': { color: 'hsl(var(--muted-foreground))', opacity: 0.6 },
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
    keysToDelete.forEach((k) => katexCache.delete(k));
  }

  try {
    const html = katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
    katexCache.set(key, html);
  } catch {
    katexCache.set(key, formula);
  }
}

// 后台预渲染队列
let prerenderQueue: { formula: string; displayMode: boolean }[] = [];
let prerenderScheduled = false;

// 安全的 requestIdleCallback polyfill
const safeRequestIdleCallback =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (
        window as typeof window & {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 16);

function schedulePrerenderBatch() {
  if (prerenderScheduled || prerenderQueue.length === 0) return;
  prerenderScheduled = true;

  safeRequestIdleCallback(
    () => {
      const batch = prerenderQueue.splice(0, 5); // 每次处理 5 个
      batch.forEach(({ formula, displayMode }) => prerenderMath(formula, displayMode));
      prerenderScheduled = false;
      if (prerenderQueue.length > 0) schedulePrerenderBatch();
    },
    { timeout: 100 },
  );
}

function queuePrerender(formula: string, displayMode: boolean) {
  const key = `${formula}|${displayMode}`;
  if (katexCache.has(key)) return;
  if (!prerenderQueue.some((q) => q.formula === formula && q.displayMode === displayMode)) {
    prerenderQueue.push({ formula, displayMode });
    schedulePrerenderBatch();
  }
}

class MathWidget extends WidgetType {
  // isPreviewPanel: true = 编辑模式下方的预览面板; false = 预览模式下的替换块
  constructor(
    readonly formula: string,
    readonly displayMode: boolean,
    readonly isPreviewPanel: boolean = false,
  ) {
    super();
  }

  eq(other: MathWidget) {
    return (
      other.formula === this.formula &&
      other.displayMode === this.displayMode &&
      other.isPreviewPanel === this.isPreviewPanel
    );
  }

  toDOM() {
    const container = document.createElement(
      this.displayMode || this.isPreviewPanel ? 'div' : 'span',
    );
    container.className = this.isPreviewPanel
      ? 'cm-math-preview-panel'
      : this.displayMode
        ? 'cm-math-block'
        : 'cm-math-inline';

    // 只有非预览面板（即渲染态公式）才添加标记，用于点击检测
    if (!this.isPreviewPanel) {
      container.dataset.widgetType = 'math';
    }

    // 尝试使用缓存
    const cacheKey = `${this.formula}|${this.displayMode}`;
    const cached = katexCache.get(cacheKey);
    if (cached) {
      container.innerHTML = cached;
    } else {
      try {
        katex.render(this.formula, container, {
          displayMode: this.displayMode,
          throwOnError: false,
          strict: false,
        });
        // 缓存渲染结果
        katexCache.set(cacheKey, container.innerHTML);
      } catch (e) {
        container.textContent = this.formula;
      }
    }
    return container;
  }

  ignoreEvent() {
    // 渲染态公式：让 CodeMirror 忽略事件，由我们自己的 mousedown handler 处理
    // 预览面板：让事件穿透 (pointer-events: none)
    return !this.isPreviewPanel;
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback.
    }
  }

  if (typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previousRanges: globalThis.Range[] = [];
  if (selection) {
    for (let i = 0; i < selection.rangeCount; i += 1) {
      previousRanges.push(selection.getRangeAt(i));
    }
  }

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  if (selection) {
    selection.removeAllRanges();
    previousRanges.forEach((range) => selection.addRange(range));
  }

  return copied;
}

class LiveCodeBlockCopyButtonWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }

  eq(other: LiveCodeBlockCopyButtonWidget) {
    return other.code === this.code;
  }

  toDOM() {
    const anchor = document.createElement('span');
    anchor.className = 'cm-lumina-codeblock-copy-anchor';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-codeblock-copy';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code');
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const copied = await copyTextToClipboard(this.code);
      if (copied) {
        button.textContent = 'Copied!';
        button.classList.add('cm-codeblock-copy-success');
        setTimeout(() => {
          button.textContent = 'Copy';
          button.classList.remove('cm-codeblock-copy-success');
        }, 2000);
      } else {
        button.textContent = 'Failed';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 2000);
      }
    });

    anchor.appendChild(button);
    return anchor;
  }

  ignoreEvent() {
    return true;
  }
}

// Mermaid 图表 Widget
class MermaidWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }
  eq(other: MermaidWidget) {
    return other.code === this.code;
  }
  toDOM() {
    const container = document.createElement('div');
    container.className = 'mermaid-container my-2';
    container.dataset.widgetType = 'codeblock';

    const pre = document.createElement('pre');
    pre.className = 'mermaid';
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
  ignoreEvent() {
    return true;
  }
}

class CalloutIconWidget extends WidgetType {
  constructor(readonly icon: string) {
    super();
  }
  eq(other: CalloutIconWidget) {
    return other.icon === this.icon;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-callout-icon';
    s.textContent = this.icon;
    s.style.cssText = 'margin-right:6px;font-size:1.1em';
    return s;
  }
  ignoreEvent() {
    return true;
  }
}

class VoicePreviewWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: VoicePreviewWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-voice-preview';
    s.textContent = this.text;
    return s;
  }
  ignoreEvent() {
    return true;
  }
}

class HorizontalRuleWidget extends WidgetType {
  constructor() {
    super();
  }
  eq(_other: HorizontalRuleWidget) {
    return true;
  }
  toDOM() {
    const hr = document.createElement('hr');
    hr.className = 'cm-hr';
    hr.style.cssText = 'border:none;border-top:1px solid hsl(var(--border));margin:1rem 0;';
    return hr;
  }
  ignoreEvent() {
    return true;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly showInfo: boolean = false,
    readonly vaultPath: string = '',
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.showInfo === this.showInfo;
  }
  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-image-widget';
    container.style.cssText = 'display:block;margin:8px 0;';
    container.dataset.widgetType = 'image';
    container.dataset.imageSrc = this.src;

    // 如果显示信息，添加路径提示
    if (this.showInfo) {
      const info = document.createElement('div');
      info.className = 'cm-image-info';
      info.style.cssText =
        'background:hsl(var(--primary)/0.1);padding:4px 8px;border-radius:4px;font-size:12px;color:hsl(var(--primary));margin-bottom:4px;font-family:monospace;display:inline-block;';
      info.textContent = this.src;
      container.appendChild(info);
    }

    const img = document.createElement('img');
    img.alt = this.alt;
    img.className = 'markdown-image';
    img.loading = 'lazy';
    img.style.cssText = 'max-width:100%;border-radius:6px;cursor:pointer;';

    // 处理图片路径
    if (this.src.startsWith('http') || this.src.startsWith('data:')) {
      // 网络图片或 data URL
      img.src = this.src;
    } else if (this.vaultPath) {
      // 本地图片：使用 base64 加载
      const normalizedVaultPath = this.vaultPath.replace(/\\/g, '/');
      const normalizedSrc = this.src.replace(/\\/g, '/').replace(/^\.\//, '');
      const fullPath =
        normalizedSrc.startsWith('/') || normalizedSrc.match(/^[A-Za-z]:/)
          ? normalizedSrc
          : `${normalizedVaultPath}/${normalizedSrc}`;

      // 先显示加载中状态
      img.style.opacity = '0.5';
      img.alt = useLocaleStore.getState().t.common.loading;

      // 异步加载 base64
      const ext = fullPath.split('.').pop()?.toLowerCase() || 'png';
      const mimeType =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'gif'
            ? 'image/gif'
            : ext === 'webp'
              ? 'image/webp'
              : 'image/png';

      readBinaryFileBase64(fullPath)
        .then((base64) => {
          img.src = `data:${mimeType};base64,${base64}`;
          img.style.opacity = '1';
          img.alt = this.alt;
        })
        .catch((err) => {
          console.error('[ImageWidget] Image load failed:', fullPath, err);
          img.alt = `${useLocaleStore.getState().t.editor.imageLoadFailed}: ${this.src}`;
          img.style.opacity = '1';
        });
    }

    container.appendChild(img);
    return container;
  }
  ignoreEvent() {
    return true;
  }
}

// ============ 5. 核心逻辑: Should Show Source? ============
// shouldShowSource 从 codemirror-live-markdown 导入

// ============ 6. StateFields & Plugins ============
const LIVE_BLOCK_MARK_TYPES = new Set(['HeaderMark', 'ListMark', 'QuoteMark']);
const LIVE_ALWAYS_VISIBLE_BLOCK_MARK_TYPES = new Set(['ListMark', 'QuoteMark']);
const LIVE_INLINE_MARK_TYPES = new Set(['EmphasisMark', 'StrikethroughMark', 'CodeMark']);
const SKIP_LIVE_PREVIEW_PARENT_TYPES = new Set(['FencedCode', 'CodeBlock']);

function isInsideSkippedLivePreviewParent(node: any): boolean {
  let parent = node.node.parent;
  while (parent) {
    if (SKIP_LIVE_PREVIEW_PARENT_TYPES.has(parent.name)) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function buildLivePreviewDecorations(view: EditorView): DecorationSet {
  const decorations: any[] = [];
  const { state } = view;
  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let line = startLine; line <= endLine; line++) {
      activeLines.add(line);
    }
  }
  const isDrag = state.field(mouseSelectingField, false);

  syntaxTree(state).iterate({
    enter: (node) => {
      if (!LIVE_BLOCK_MARK_TYPES.has(node.name) && !LIVE_INLINE_MARK_TYPES.has(node.name)) return;
      if (isInsideSkippedLivePreviewParent(node)) return;

      if (node.name === 'CodeMark') {
        const parent = node.node.parent;
        if (parent && parent.name === 'InlineCode') {
          const text = state.doc.sliceString(parent.from, parent.to);
          if (text.startsWith('`$') && text.endsWith('$`')) {
            return;
          }
        }
      }

      if (LIVE_BLOCK_MARK_TYPES.has(node.name)) {
        const lineNum = state.doc.lineAt(node.from).number;
        const isActiveLine = activeLines.has(lineNum) && !isDrag;
        const shouldShow = LIVE_ALWAYS_VISIBLE_BLOCK_MARK_TYPES.has(node.name) || isActiveLine;
        const cls = shouldShow
          ? 'cm-formatting-block cm-formatting-block-visible'
          : 'cm-formatting-block';
        decorations.push(Decoration.mark({ class: cls }).range(node.from, node.to));
        return;
      }

      if (node.from >= node.to) return;
      const isTouched = shouldShowSource(state, node.from, node.to);
      const cls =
        isTouched && !isDrag
          ? 'cm-formatting-inline cm-formatting-inline-visible'
          : 'cm-formatting-inline';
      decorations.push(Decoration.mark({ class: cls }).range(node.from, node.to));
    },
  });

  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from),
    true,
  );
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecorations(view);
    }
    update(update: ViewUpdate) {
      const isDragging = update.state.field(mouseSelectingField, false);
      const wasDragging = update.startState.field(mouseSelectingField, false);
      if (isDragging) return;
      if (wasDragging && !isDragging) {
        this.decorations = buildLivePreviewDecorations(update.view);
        return;
      }
      if (checkUpdateAction(update) === 'rebuild') {
        this.decorations = buildLivePreviewDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const LIVE_CODE_BLOCK_SKIPPED_LANGUAGES = new Set(['mermaid']);
const liveCodeBlockLowlight = createLowlight(lowlightCommon);

function addLiveCodeBlockHighlightMarks(
  decorations: Range<Decoration>[],
  nodes: any[] | undefined,
  offset: { value: number },
  absoluteFrom: number,
) {
  if (!nodes?.length) return;

  for (const node of nodes) {
    if (node.type === 'text') {
      offset.value += node.value?.length ?? 0;
      continue;
    }
    if (node.type !== 'element') continue;

    const start = offset.value;
    addLiveCodeBlockHighlightMarks(decorations, node.children, offset, absoluteFrom);
    const end = offset.value;
    const classNames = Array.isArray(node.properties?.className)
      ? node.properties.className.filter((name: unknown): name is string => typeof name === 'string')
      : [];

    if (start < end && classNames.length > 0) {
      decorations.push(
        Decoration.mark({ class: classNames.join(' ') }).range(
          absoluteFrom + start,
          absoluteFrom + end,
        ),
      );
    }
  }
}

function addLiveCodeBlockSyntaxHighlight(
  decorations: Range<Decoration>[],
  code: string,
  language: string,
  absoluteFrom: number,
) {
  if (!code) return;

  try {
    const normalizedLanguage = language.trim().toLowerCase();
    const tree =
      normalizedLanguage && liveCodeBlockLowlight.registered(normalizedLanguage)
        ? liveCodeBlockLowlight.highlight(normalizedLanguage, code)
        : normalizedLanguage
          ? null
          : liveCodeBlockLowlight.highlightAuto(code);

    if (!tree) return;
    addLiveCodeBlockHighlightMarks(decorations, tree.children, { value: 0 }, absoluteFrom);
  } catch {
    // Keep editing functional even when highlight.js cannot parse a language.
  }
}

function buildEditableCodeBlockDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'FencedCode') return;

      const codeInfo = node.node.getChild('CodeInfo');
      const language = codeInfo ? state.doc.sliceString(codeInfo.from, codeInfo.to).trim() : '';
      if (LIVE_CODE_BLOCK_SKIPPED_LANGUAGES.has(language.toLowerCase())) {
        return;
      }
      const codeText = node.node.getChild('CodeText');
      const code = codeText ? state.doc.sliceString(codeText.from, codeText.to) : '';

      const openLine = state.doc.lineAt(node.from);
      const closeLine = state.doc.lineAt(Math.max(node.from, node.to - 1));

      decorations.push(Decoration.line({ class: 'cm-lumina-codeblock-open' }).range(openLine.from));
      decorations.push(
        Decoration.widget({
          widget: new LiveCodeBlockCopyButtonWidget(code),
          side: 1,
        }).range(openLine.to),
      );
      for (let lineNumber = openLine.number + 1; lineNumber < closeLine.number; lineNumber += 1) {
        const line = state.doc.line(lineNumber);
        decorations.push(
          Decoration.line({ class: 'cm-lumina-codeblock-content-line' }).range(line.from),
        );
      }
      decorations.push(
        Decoration.line({ class: 'cm-lumina-codeblock-close' }).range(closeLine.from),
      );

      const openFenceEnd = codeInfo ? codeInfo.from : openLine.to;
      if (openFenceEnd > openLine.from) {
        decorations.push(
          Decoration.mark({ class: 'cm-codeblock-fence' }).range(openLine.from, openFenceEnd),
        );
      }
      if (codeInfo && codeInfo.from < codeInfo.to) {
        decorations.push(
          Decoration.mark({ class: 'cm-codeblock-lang' }).range(codeInfo.from, codeInfo.to),
        );
      }
      if (codeInfo && codeInfo.to < openLine.to) {
        decorations.push(
          Decoration.mark({ class: 'cm-codeblock-fence' }).range(codeInfo.to, openLine.to),
        );
      }
      if (closeLine.to > closeLine.from) {
        decorations.push(
          Decoration.mark({ class: 'cm-codeblock-fence' }).range(closeLine.from, closeLine.to),
        );
      }
      if (codeText) {
        addLiveCodeBlockSyntaxHighlight(decorations, code, language, codeText.from);
      }
    },
  });

  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from),
    true,
  );
}

const editableCodeBlockField = StateField.define<DecorationSet>({
  create: buildEditableCodeBlockDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.reconfigured) {
      return buildEditableCodeBlockDecorations(tr.state);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 共享 doc.toString() 缓存：Text 是不可变持久化结构，同一引用 = 同一内容
let _cachedDoc: Text | null = null;
let _cachedDocString: string = '';

function docString(state: EditorState): string {
  if (state.doc !== _cachedDoc) {
    _cachedDoc = state.doc;
    _cachedDocString = state.doc.toString();
  }
  return _cachedDocString;
}

// 缓存公式位置，避免每次选择变化都重新解析
let mathPositionsCache: { from: number; to: number }[] = [];

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
      const touchesMath = (sel: { from: number; to: number }) =>
        mathPositionsCache.some(
          (m) =>
            (sel.from >= m.from && sel.from <= m.to) ||
            (sel.to >= m.from && sel.to <= m.to) ||
            (sel.from <= m.from && sel.to >= m.to),
        );
      if (
        touchesMath(oldSel) !== touchesMath(newSel) ||
        (touchesMath(newSel) && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))
      ) {
        return buildMathDecorations(tr.state);
      }
    }

    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildMathDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = docString(state);
  const processed: { from: number; to: number }[] = [];

  // 更新公式位置缓存
  mathPositionsCache = [];

  const blockRegex = /\$\$([\s\S]+?)\$\$/g;
  let match;
  while ((match = blockRegex.exec(doc)) !== null) {
    const from = match.index,
      to = from + match[0].length;
    processed.push({ from, to });
    mathPositionsCache.push({ from, to }); // 添加到缓存
    const formula = match[1].trim();

    // 预渲染公式（后台进行）
    queuePrerender(formula, true);

    if (shouldShowSource(state, from, to)) {
      // 编辑模式：源码高亮 + 预览面板(Preview Panel)
      decorations.push(Decoration.mark({ class: 'cm-math-source' }).range(from, to));
      decorations.push(
        Decoration.widget({
          widget: new MathWidget(formula, true, true),
          side: 1,
          block: true,
        }).range(to),
      );
    } else {
      // 预览模式：完整替换
      const fromLine = state.doc.lineAt(from),
        toLine = state.doc.lineAt(to);
      const isFullLine = from === fromLine.from && to === toLine.to;
      decorations.push(
        Decoration.replace({ widget: new MathWidget(formula, true), block: isFullLine }).range(
          from,
          to,
        ),
      );
    }
  }

  const inlineRegex = /(?<!\\|\$)\$(?!\$)((?:[^$\n]|\n(?!\n))+?)(?<!\\|\$)\$(?!\$)/g;
  while ((match = inlineRegex.exec(doc)) !== null) {
    const from = match.index,
      to = from + match[0].length;
    if (processed.some((p) => from >= p.from && to <= p.to)) continue;
    mathPositionsCache.push({ from, to }); // 添加到缓存
    const inlineFormula = match[1].trim();

    // 预渲染公式（后台进行）
    queuePrerender(inlineFormula, false);

    if (shouldShowSource(state, from, to)) {
      decorations.push(Decoration.mark({ class: 'cm-math-source' }).range(from, to));
    } else {
      decorations.push(
        Decoration.replace({ widget: new MathWidget(inlineFormula, false) }).range(from, to),
      );
    }
  }
  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from),
    true,
  );
}

// Mermaid 代码块位置缓存（常规代码块改用 codemirror-live-markdown）
let mermaidBlockPositionsCache: { from: number; to: number }[] = [];

const mermaidStateField = StateField.define<DecorationSet>({
  create: buildMermaidDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.reconfigured) return buildMermaidDecorations(tr.state);
    const isDragging = tr.state.field(mouseSelectingField, false);
    const wasDragging = tr.startState.field(mouseSelectingField, false);
    if (wasDragging && !isDragging) return buildMermaidDecorations(tr.state);
    if (isDragging) return deco;
    if (tr.selection) {
      const oldSel = tr.startState.selection.main;
      const newSel = tr.state.selection.main;
      const touches = (sel: { from: number; to: number }) =>
        mermaidBlockPositionsCache.some(
          (c) =>
            (sel.from >= c.from && sel.from <= c.to) ||
            (sel.to >= c.from && sel.to <= c.to) ||
            (sel.from <= c.from && sel.to >= c.to),
        );
      if (
        touches(oldSel) !== touches(newSel) ||
        (touches(newSel) && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))
      ) {
        return buildMermaidDecorations(tr.state);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function shouldShowMermaidSource(state: EditorState, from: number, to: number): boolean {
  const shouldCollapse = state.facet(collapseOnSelectionFacet);
  if (!shouldCollapse) return false;
  const isDragging = state.field(mouseSelectingField, false);
  if (isDragging) return false;
  return state.selection.ranges.some((range) => {
    if (range.from === range.to) {
      // Caret inside code block should reveal source for direct editing.
      return range.from > from && range.from < to;
    }
    // Only expand when the selected range is fully inside the code block.
    // This avoids cross-boundary selection (e.g. selecting a heading near a block)
    // from unexpectedly expanding the block.
    return range.from >= from && range.to <= to;
  });
}

function buildMermaidDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  mermaidBlockPositionsCache = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'FencedCode') {
        const text = state.doc.sliceString(node.from, node.to);
        const lines = text.split('\n');
        if (lines.length < 2) return;
        const lang = lines[0]
          .replace(/^\s*`{3,}/, '')
          .trim()
          .toLowerCase();
        if (lang !== 'mermaid') return;

        mermaidBlockPositionsCache.push({ from: node.from, to: node.to });
        if (shouldShowMermaidSource(state, node.from, node.to)) return;

        const code = lines.slice(1, lines.length - 1).join('\n');
        const widget = new MermaidWidget(code);
        decorations.push(Decoration.replace({ widget, block: true }).range(node.from, node.to));
      }
    },
  });
  return Decoration.set(decorations);
}

// 高亮位置缓存
let highlightPositionsCache: { from: number; to: number }[] = [];

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
      const touches = (sel: { from: number; to: number }) =>
        highlightPositionsCache.some(
          (h) =>
            (sel.from >= h.from && sel.from <= h.to) ||
            (sel.to >= h.from && sel.to <= h.to) ||
            (sel.from <= h.from && sel.to >= h.to),
        );
      if (
        touches(oldSel) !== touches(newSel) ||
        (touches(newSel) && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))
      ) {
        return buildHighlightDecorations(tr.state);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildHighlightDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = docString(state);
  const highlightRegex = /==([^=\n]+)==/g;
  let match;
  const isDrag = state.field(mouseSelectingField, false);
  const hasSelection = state.selection.ranges.some((range) => range.from !== range.to);

  // 更新缓存
  highlightPositionsCache = [];

  while ((match = highlightRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    highlightPositionsCache.push({ from, to });
    const textStart = from + 2; // 跳过开头的 ==
    const textEnd = to - 2; // 跳过结尾的 ==

    // 检查是否在代码块内
    const lineStart = doc.lastIndexOf('\n', from) + 1;
    const lineText = doc.slice(lineStart, from);
    if (lineText.includes('`')) continue;

    const isTouched = shouldShowSource(state, from, to);

    // 高亮文本部分始终添加高亮样式
    decorations.push(Decoration.mark({ class: 'cm-highlight' }).range(textStart, textEnd));

    // == 标记使用与加粗/斜体相同的动画类
    const markCls =
      isTouched && !isDrag
        ? `cm-formatting-inline cm-formatting-inline-visible${hasSelection ? ' cm-selection-bridge' : ''}`
        : 'cm-formatting-inline';

    // 开头的 ==
    decorations.push(Decoration.mark({ class: markCls }).range(from, textStart));
    // 结尾的 ==
    decorations.push(Decoration.mark({ class: markCls }).range(textEnd, to));
  }

  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from),
    true,
  );
}

const selectionStatePlugin = ViewPlugin.fromClass(
  class {
    constructor(private view: EditorView) {
      this.updateClass(view);
    }
    update(update: ViewUpdate) {
      const isDragging = update.state.field(mouseSelectingField, false);
      const wasDragging = update.startState.field(mouseSelectingField, false);
      if (isDragging !== wasDragging) {
        this.updateClass(update.view);
        return;
      }
      if (update.selectionSet && !isDragging) {
        this.updateClass(update.view);
      }
    }
    destroy() {
      this.view.dom.classList.remove('cm-has-selection');
      this.view.dom.classList.remove('cm-drag-selecting');
      this.view.dom.classList.remove('cm-drag-native-selection-suppressed');
    }
    private updateClass(view: EditorView) {
      const isDragging = view.state.field(mouseSelectingField, false);
      const hasSelection = view.state.selection.ranges.some((range) => range.from !== range.to);
      const suppressNativeSelection = isDragging && shouldDisableDrawSelectionForTauriWebKit();
      view.dom.classList.toggle('cm-drag-selecting', isDragging);
      view.dom.classList.toggle('cm-has-selection', hasSelection);
      view.dom.classList.toggle('cm-drag-native-selection-suppressed', suppressNativeSelection);
      const main = view.state.selection.main;
      const detail = hasSelection
        ? {
            from: main.from,
            to: main.to,
            text: view.state.doc.sliceString(main.from, main.to),
            lineFrom: view.state.doc.lineAt(main.from).number,
            lineTo: view.state.doc.lineAt(main.to).number,
          }
        : null;
      window.dispatchEvent(new CustomEvent(PLUGIN_EDITOR_SELECTION_EVENT, { detail }));
    }
  },
  { decorations: () => Decoration.none },
);

const SKIP_SELECTION_PARENT_TYPES = new Set(['FencedCode', 'CodeBlock']);

function isInsideSkippedSelectionParent(node: any): boolean {
  let parent = node.node.parent;
  while (parent) {
    if (SKIP_SELECTION_PARENT_TYPES.has(parent.name)) return true;
    parent = parent.parent;
  }
  return false;
}

const selectionBridgeField = StateField.define<DecorationSet>({
  create: buildSelectionBridgeDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.reconfigured) return buildSelectionBridgeDecorations(tr.state);
    // Rebuild when drag ends so decorations catch up
    const isDragging = tr.state.field(mouseSelectingField, false);
    const wasDragging = tr.startState.field(mouseSelectingField, false);
    if (wasDragging && !isDragging) return buildSelectionBridgeDecorations(tr.state);
    if (!tr.selection) return deco;
    if (isDragging) {
      if (shouldDisableDrawSelectionForTauriWebKit()) {
        return buildSelectionBridgeDecorations(tr.state);
      }
      return Decoration.none;
    }
    return buildSelectionBridgeDecorations(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function selectEntireDocument(view: EditorView) {
  const { state } = view;
  const { doc } = state;
  if (
    state.selection.ranges.length === 1 &&
    state.selection.main.from === 0 &&
    state.selection.main.to === doc.length
  ) {
    return;
  }
  view.dispatch(state.update({ selection: { anchor: 0, head: doc.length }, userEvent: 'select' }));
}

function selectAllDebugEnabled() {
  return typeof window !== 'undefined' && (window as any).__cmSelectAllDebug === true;
}

type DragLineRange = { from: number; to: number };

type DragScrollRect = { top: number; bottom: number; height: number };

const DRAG_AUTO_SCROLL_EDGE_ZONE_MIN_PX = 36;
const DRAG_AUTO_SCROLL_EDGE_ZONE_MAX_PX = 96;
const DRAG_AUTO_SCROLL_MAX_STEP_PX = 28;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getDragAutoScrollDelta(clientY: number, scrollerRect: DragScrollRect | null) {
  if (!scrollerRect || scrollerRect.height <= 0) return 0;
  const edgeZone = clampNumber(
    Math.round(scrollerRect.height * 0.18),
    DRAG_AUTO_SCROLL_EDGE_ZONE_MIN_PX,
    DRAG_AUTO_SCROLL_EDGE_ZONE_MAX_PX,
  );

  const edgeDistance =
    clientY < scrollerRect.top + edgeZone
      ? clientY - (scrollerRect.top + edgeZone)
      : clientY > scrollerRect.bottom - edgeZone
        ? clientY - (scrollerRect.bottom - edgeZone)
        : 0;

  if (edgeDistance === 0) return 0;

  const direction = edgeDistance > 0 ? 1 : -1;
  const ratio = clampNumber(Math.abs(edgeDistance) / edgeZone, 0, 1);
  const easedRatio = ratio * ratio;
  const step = Math.max(1, Math.round(easedRatio * DRAG_AUTO_SCROLL_MAX_STEP_PX));
  return direction * step;
}

export function resolveDragSelectionLineRange(
  lineRange: DragLineRange | null | undefined,
  clientY: number,
  scrollerRect: DragScrollRect | null,
) {
  if (!lineRange) return null;
  return getDragAutoScrollDelta(clientY, scrollerRect) === 0 ? lineRange : null;
}

function clampDragSelectionClientY(clientY: number, scrollerRect: DragScrollRect | null) {
  if (!scrollerRect) return clientY;
  const minY = scrollerRect.top + 1;
  const maxY = Math.max(minY, scrollerRect.bottom - 1);
  return clampNumber(clientY, minY, maxY);
}

function canElementScrollVertically(element: HTMLElement | null | undefined) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY || style.overflow;
  if (!/(auto|scroll|overlay)/.test(overflowY)) return false;
  return element.scrollHeight > element.clientHeight + 1;
}

export function resolveDragScrollContainer(
  view: Pick<EditorView, 'dom' | 'scrollDOM'>,
  externalScrollContainerRef?: RefObject<HTMLElement> | null,
) {
  const explicitContainer = externalScrollContainerRef?.current ?? null;
  if (canElementScrollVertically(explicitContainer)) {
    return explicitContainer;
  }

  let current: HTMLElement | null = view.dom.parentElement;
  while (current) {
    if (canElementScrollVertically(current)) {
      return current;
    }
    current = current.parentElement;
  }

  if (canElementScrollVertically(view.scrollDOM)) {
    return view.scrollDOM;
  }

  const scrollingElement = view.dom.ownerDocument.scrollingElement;
  if (scrollingElement instanceof HTMLElement && canElementScrollVertically(scrollingElement)) {
    return scrollingElement;
  }

  return view.scrollDOM;
}

function getViewportSelectionAnchor(
  view: Pick<EditorView, 'scrollDOM' | 'lineBlockAtHeight' | 'state' | 'viewport'>,
) {
  const docLength = view.state.doc.length;
  if (docLength <= 0) return 0;
  const scrollTop = Number.isFinite(view.scrollDOM.scrollTop) ? view.scrollDOM.scrollTop : 0;
  try {
    const block = view.lineBlockAtHeight(scrollTop);
    return clampNumber(block.from, 0, docLength);
  } catch {
    return clampNumber(view.viewport.from, 0, docLength);
  }
}

function shouldSkipFirstLivePointerRestoreGuard(
  contentDOM: HTMLElement,
  target: EventTarget | null,
) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  if (element.closest('button, a[href], input, textarea, select')) {
    return true;
  }
  const editableHost = element.closest('[contenteditable="true"]');
  if (editableHost && editableHost !== contentDOM) {
    return true;
  }
  return false;
}

export function suppressStaleSelectionRestoreOnFirstLivePointerDown(
  view: Pick<EditorView, 'state' | 'dispatch' | 'focus' | 'posAtCoords' | 'dom' | 'contentDOM' | 'scrollDOM' | 'lineBlockAtHeight' | 'viewport'>,
  event: Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'preventDefault' | 'target'>,
) {
  if (event.button !== 0) return false;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  if (shouldSkipFirstLivePointerRestoreGuard(view.contentDOM, event.target)) return false;

  const ownerDoc = view.dom.ownerDocument;
  const domSelection = ownerDoc.getSelection();
  const domRangeCount = domSelection?.rangeCount ?? 0;
  if (domRangeCount > 0) {
    domSelection?.removeAllRanges();
  }

  const nextAnchor = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? getViewportSelectionAnchor(view);
  const currentSelection = view.state.selection.main;

  event.preventDefault();
  view.focus();

  if (currentSelection.from !== nextAnchor || currentSelection.to !== nextAnchor) {
    view.dispatch({
      selection: { anchor: nextAnchor },
      scrollIntoView: false,
    });
  }

  return {
    nextAnchor,
    domRangeCount,
    previousSelection: {
      from: currentSelection.from,
      to: currentSelection.to,
      anchor: currentSelection.anchor,
      head: currentSelection.head,
    },
  };
}

type ManualDragSelectableView = {
  inputState?: {
    mouseSelection?: {
      destroy?: () => void;
    } | null;
  } | null;
};

export function cancelNativeMouseSelectionForManualDrag(view: ManualDragSelectableView) {
  const inputState = view.inputState;
  const mouseSelection = inputState?.mouseSelection;
  if (!mouseSelection || typeof mouseSelection.destroy !== 'function') {
    return false;
  }
  mouseSelection.destroy();
  if (inputState?.mouseSelection === mouseSelection) {
    inputState.mouseSelection = null;
  }
  return true;
}

export function syncDragSelectionHeadFromCoords(
  view: Pick<EditorView, 'posAtCoords' | 'dispatch' | 'state'>,
  anchor: number,
  x: number,
  y: number,
  lineRange?: DragLineRange | null,
) {
  let head = view.posAtCoords({ x, y }) ?? view.state.selection.main.head;
  if (lineRange) {
    head = Math.max(lineRange.from, Math.min(lineRange.to, head));
  }
  const currentAnchor = view.state.selection.main.anchor;
  const currentHead = view.state.selection.main.head;
  const currentFrom = view.state.selection.main.from ?? Math.min(currentAnchor, currentHead);
  const currentTo = view.state.selection.main.to ?? Math.max(currentAnchor, currentHead);
  const nextFrom = Math.min(anchor, head);
  const nextTo = Math.max(anchor, head);
  if (currentFrom === nextFrom && currentTo === nextTo) {
    return false;
  }
  view.dispatch({ selection: { anchor, head } });
  return true;
}

function getDragLineRangeFromTarget(
  view: Pick<EditorView, 'posAtDOM' | 'state'>,
  target: EventTarget | null,
): DragLineRange | null {
  const element = target instanceof HTMLElement ? target : null;
  const line = element?.closest('.cm-line');
  if (!line) return null;
  try {
    const lineStart = view.posAtDOM(line, 0);
    const docLine = view.state.doc.lineAt(lineStart);
    return { from: docLine.from, to: docLine.to };
  } catch {
    return null;
  }
}

function shouldDisableDrawSelectionForTauriWebKit() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const w = window as any;
  if (w.__cmForceDisableDrawSelection === true) return true;
  if (typeof process !== 'undefined' && (process as any)?.env?.VITEST) return false;
  const isTauriRuntime = '__TAURI_INTERNALS__' in w || '__TAURI__' in w;
  if (!isTauriRuntime) return false;
  const ua = navigator.userAgent || '';
  const isWebKit = /AppleWebKit/i.test(ua) && !/(Chrome|Chromium|Edg|OPR)/i.test(ua);
  return isWebKit;
}

const CM_SELECTION_VISUAL_DEBUG_STORAGE_KEY = 'cmSelectionVisualDebug';
const CM_SELECTION_TRACE_STORAGE_KEY = 'cmSelectionVisualTrace';
const CM_SELECTION_ANOMALY_THROTTLE_MS = 180;
const CM_SELECTION_TRACE_DEFAULT_FRAME_INTERVAL_MS = 34;
const CM_SELECTION_TRACE_MAX_EVENTS = 5000;
const CM_SELECTION_TRACE_MAX_FRAMES = 3600;
const DRAG_SELECTION_THRESHOLD_PX = 4;

function selectionVisualDebugEnabled() {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  if (w.__cmSelectionVisualDebug === true) return true;
  try {
    return window.localStorage.getItem(CM_SELECTION_VISUAL_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function selectionVisualTraceEnabled() {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  if (w.__cmSelectionTraceEnabled === true) return true;
  if (import.meta.env.DEV && shouldDisableDrawSelectionForTauriWebKit()) return true;
  try {
    return window.localStorage.getItem(CM_SELECTION_TRACE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

type SelectionOverlayMetrics = {
  selectionLayerPresent: boolean;
  selectionBackgroundCount: number;
  selectionBridgeCount: number;
  selectionGapCount: number;
  fullLikeCount: number;
  oversizedCount: number;
  maxWidthRatio: number;
  maxHeightRatio: number;
};

type SelectionTraceFrame = {
  seq: number;
  at: string;
  t: number;
  source: string;
  selection: {
    from: number;
    to: number;
    selectedLength: number;
    docLength: number;
    ranges: number;
  };
  state: {
    mouseSelectingField: boolean;
    dragClass: boolean;
    hasSelectionClass: boolean;
    disableCustomDrawSelection: boolean;
  };
  viewport: {
    from: number;
    to: number;
  };
  scroll: {
    top: number;
    left: number;
  };
  overlay: SelectionOverlayMetrics;
};

type SelectionTraceEvent = {
  seq: number;
  at: string;
  t: number;
  type: string;
  payload: Record<string, unknown>;
};

type SelectionTraceControl = {
  enabled: () => boolean;
  event: (type: string, payload?: Record<string, unknown>) => void;
  snapshot: (source: string) => void;
  anomaly: (source: string, details: ReturnType<typeof inspectSelectionVisualAnomaly>) => void;
  destroy: (reason: string) => void;
};

function pushLimited<T>(items: T[], item: T, max: number) {
  items.push(item);
  if (items.length <= max) return;
  items.splice(0, items.length - max);
}

function collectSelectionOverlayMetrics(view: EditorView): SelectionOverlayMetrics {
  const scroller = view.scrollDOM;
  const scrollerRect = scroller?.getBoundingClientRect() ?? null;
  const selectionBackgrounds = Array.from(view.dom.querySelectorAll('.cm-selectionBackground'));
  const selectionBridges = Array.from(view.dom.querySelectorAll('.cm-selection-bridge'));
  const selectionGaps = Array.from(view.dom.querySelectorAll('.cm-selection-gap'));
  const overlays = [...selectionBackgrounds, ...selectionBridges, ...selectionGaps];

  let fullLikeCount = 0;
  let oversizedCount = 0;
  let maxWidthRatio = 0;
  let maxHeightRatio = 0;

  if (scrollerRect && scrollerRect.width > 0 && scrollerRect.height > 0) {
    for (const node of overlays) {
      const rect = (node as HTMLElement).getBoundingClientRect();
      const widthRatio = rect.width / scrollerRect.width;
      const heightRatio = rect.height / scrollerRect.height;
      maxWidthRatio = Math.max(maxWidthRatio, widthRatio);
      maxHeightRatio = Math.max(maxHeightRatio, heightRatio);
      if (widthRatio >= 0.95 && heightRatio >= 0.8) fullLikeCount += 1;
      if (widthRatio >= 1.2 || heightRatio >= 1.2) oversizedCount += 1;
    }
  }

  return {
    selectionLayerPresent: Boolean(view.dom.querySelector('.cm-selectionLayer')),
    selectionBackgroundCount: selectionBackgrounds.length,
    selectionBridgeCount: selectionBridges.length,
    selectionGapCount: selectionGaps.length,
    fullLikeCount,
    oversizedCount,
    maxWidthRatio,
    maxHeightRatio,
  };
}

function buildSelectionTraceSummary(frames: SelectionTraceFrame[], events: SelectionTraceEvent[]) {
  const anomalyFrames = frames.filter(
    (frame) =>
      frame.selection.selectedLength > 0 &&
      frame.selection.selectedLength < frame.selection.docLength &&
      (frame.overlay.fullLikeCount > 0 || frame.overlay.oversizedCount > 0),
  ).length;
  return {
    eventCount: events.length,
    frameCount: frames.length,
    anomalyFrameCount: anomalyFrames,
    maxWidthRatio: frames.reduce((max, frame) => Math.max(max, frame.overlay.maxWidthRatio), 0),
    maxHeightRatio: frames.reduce((max, frame) => Math.max(max, frame.overlay.maxHeightRatio), 0),
  };
}

function createSelectionTraceControl(
  view: EditorView,
  options: { disableCustomDrawSelection: boolean },
): SelectionTraceControl {
  const ownerDoc = view.dom.ownerDocument;
  const runtimeWindow = ownerDoc.defaultView || (typeof window !== 'undefined' ? window : null);
  const sessionId = `cm-selection-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const data = {
    sessionId,
    startedAt: new Date().toISOString(),
    meta: {
      userAgent: runtimeWindow?.navigator.userAgent ?? '',
      platform: runtimeWindow?.navigator.platform ?? '',
      language: runtimeWindow?.navigator.language ?? '',
      devicePixelRatio: runtimeWindow?.devicePixelRatio ?? null,
      drawSelectionDisabled: options.disableCustomDrawSelection,
      visualDebugEnabled: selectionVisualDebugEnabled(),
      traceStorageKey: CM_SELECTION_TRACE_STORAGE_KEY,
    },
    events: [] as SelectionTraceEvent[],
    frames: [] as SelectionTraceFrame[],
  };

  let eventSeq = 0;
  let frameSeq = 0;
  let frameLoop = 0;
  let lastFrameTs = 0;
  let startPerf = runtimeWindow?.performance.now() ?? Date.now();
  let frameIntervalMs = CM_SELECTION_TRACE_DEFAULT_FRAME_INTERVAL_MS;
  let isEnabled = selectionVisualDebugEnabled() || selectionVisualTraceEnabled();

  const nowStamp = () => {
    const perfNow = runtimeWindow?.performance.now() ?? Date.now();
    return {
      at: new Date().toISOString(),
      t: Number((perfNow - startPerf).toFixed(3)),
    };
  };

  const addEvent = (type: string, payload: Record<string, unknown> = {}) => {
    if (!isEnabled) return;
    eventSeq += 1;
    const stamp = nowStamp();
    pushLimited(
      data.events,
      {
        seq: eventSeq,
        at: stamp.at,
        t: stamp.t,
        type,
        payload,
      },
      CM_SELECTION_TRACE_MAX_EVENTS,
    );
  };

  const captureFrame = (source: string) => {
    if (!isEnabled) return;
    frameSeq += 1;
    const stamp = nowStamp();
    const main = view.state.selection.main;
    pushLimited(
      data.frames,
      {
        seq: frameSeq,
        at: stamp.at,
        t: stamp.t,
        source,
        selection: {
          from: main.from,
          to: main.to,
          selectedLength: main.to - main.from,
          docLength: view.state.doc.length,
          ranges: view.state.selection.ranges.length,
        },
        state: {
          mouseSelectingField: view.state.field(mouseSelectingField, false),
          dragClass: view.dom.classList.contains('cm-drag-selecting'),
          hasSelectionClass: view.dom.classList.contains('cm-has-selection'),
          disableCustomDrawSelection: options.disableCustomDrawSelection,
        },
        viewport: {
          from: view.viewport.from,
          to: view.viewport.to,
        },
        scroll: {
          top: view.scrollDOM?.scrollTop ?? 0,
          left: view.scrollDOM?.scrollLeft ?? 0,
        },
        overlay: collectSelectionOverlayMetrics(view),
      },
      CM_SELECTION_TRACE_MAX_FRAMES,
    );
  };

  const stopFrameLoop = (reason: string) => {
    if (!runtimeWindow || !frameLoop) return;
    runtimeWindow.cancelAnimationFrame(frameLoop);
    frameLoop = 0;
    addEvent('trace-loop-stop', { reason });
  };

  const runFrameLoop = (ts: number) => {
    if (!isEnabled || !runtimeWindow) return;
    if (lastFrameTs === 0 || ts - lastFrameTs >= frameIntervalMs) {
      lastFrameTs = ts;
      captureFrame('raf');
    }
    frameLoop = runtimeWindow.requestAnimationFrame(runFrameLoop);
  };

  const startFrameLoop = (reason: string) => {
    if (!runtimeWindow || !isEnabled || frameLoop) return;
    addEvent('trace-loop-start', { reason, frameIntervalMs });
    frameLoop = runtimeWindow.requestAnimationFrame(runFrameLoop);
  };

  const reset = () => {
    data.startedAt = new Date().toISOString();
    data.events.length = 0;
    data.frames.length = 0;
    eventSeq = 0;
    frameSeq = 0;
    lastFrameTs = 0;
    startPerf = runtimeWindow?.performance.now() ?? Date.now();
  };

  if (runtimeWindow) {
    const w = runtimeWindow as any;
    const traceApi = {
      sessionId,
      storageKey: CM_SELECTION_TRACE_STORAGE_KEY,
      enable: (persist = true) => {
        if (persist) {
          try {
            runtimeWindow.localStorage.setItem(CM_SELECTION_TRACE_STORAGE_KEY, '1');
          } catch {}
        }
        if (!isEnabled) {
          isEnabled = true;
          reset();
          addEvent('trace-enabled', { source: 'window-api' });
          captureFrame('trace-enabled');
          startFrameLoop('window-api-enable');
        }
        return {
          sessionId,
          summary: buildSelectionTraceSummary(data.frames, data.events),
        };
      },
      disable: (persist = true) => {
        if (persist) {
          try {
            runtimeWindow.localStorage.removeItem(CM_SELECTION_TRACE_STORAGE_KEY);
          } catch {}
        }
        if (isEnabled) {
          addEvent('trace-disabled', { source: 'window-api' });
          captureFrame('trace-disabled');
          isEnabled = false;
          stopFrameLoop('window-api-disable');
        }
        return {
          sessionId,
          summary: buildSelectionTraceSummary(data.frames, data.events),
        };
      },
      clear: () => {
        reset();
        addEvent('trace-cleared', { source: 'window-api' });
        captureFrame('trace-cleared');
        return {
          sessionId,
          summary: buildSelectionTraceSummary(data.frames, data.events),
        };
      },
      snapshot: (label: string = 'manual-snapshot') => {
        addEvent('manual-snapshot', { label });
        captureFrame(label);
        return {
          sessionId,
          summary: buildSelectionTraceSummary(data.frames, data.events),
        };
      },
      mark: (type: string, payload: Record<string, unknown> = {}) => {
        addEvent(type, payload);
        captureFrame(`event:${type}`);
      },
      setFrameIntervalMs: (next: number) => {
        if (typeof next === 'number' && Number.isFinite(next)) {
          frameIntervalMs = Math.min(120, Math.max(8, Math.floor(next)));
          addEvent('trace-frame-interval-updated', { frameIntervalMs });
        }
        return frameIntervalMs;
      },
      getData: () => ({
        ...data,
        isEnabled,
        frameIntervalMs,
        summary: buildSelectionTraceSummary(data.frames, data.events),
      }),
      download: (fileName?: string) => {
        const payload = JSON.stringify(
          {
            ...data,
            isEnabled,
            frameIntervalMs,
            summary: buildSelectionTraceSummary(data.frames, data.events),
          },
          null,
          2,
        );
        if (!runtimeWindow.URL?.createObjectURL) {
          return { ok: false, reason: 'createObjectURL-unavailable', bytes: payload.length };
        }
        const safeName =
          fileName ||
          `cm-selection-trace-${new Date().toISOString().replace(/[:.]/g, '-')}-${sessionId}.json`;
        const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
        const href = runtimeWindow.URL.createObjectURL(blob);
        const link = ownerDoc.createElement('a');
        link.href = href;
        link.download = safeName;
        ownerDoc.body.appendChild(link);
        link.click();
        ownerDoc.body.removeChild(link);
        runtimeWindow.setTimeout(() => runtimeWindow.URL.revokeObjectURL(href), 0);
        return { ok: true, fileName: safeName, bytes: payload.length };
      },
    };
    w.__cmSelectionTrace = traceApi;
    w.__luminaEditorTrace = traceApi;
    w.__cmSelectionTraceSessionId = sessionId;
    w.__luminaEditorTraceSessionId = sessionId;
  }

  if (isEnabled) {
    addEvent('trace-initialized', {
      source: 'editor-create',
      frameIntervalMs,
      drawSelectionDisabled: options.disableCustomDrawSelection,
    });
    captureFrame('trace-init');
    startFrameLoop('editor-create');
  }

  return {
    enabled: () => isEnabled,
    event: (type, payload = {}) => {
      addEvent(type, payload);
    },
    snapshot: (source) => {
      captureFrame(source);
    },
    anomaly: (source, details) => {
      addEvent('selection-anomaly', {
        source,
        fullLikeCount: details.fullLikeCount,
        oversizedCount: details.oversizedCount,
        selectionBackgroundCount: details.selectionBackgroundCount,
        selectionBridgeCount: details.selectionBridgeCount,
        selectionGapCount: details.selectionGapCount,
        selection: details.selection,
      });
      captureFrame(`anomaly:${source}`);
    },
    destroy: (reason) => {
      if (isEnabled) {
        addEvent('trace-destroy', { reason });
        captureFrame(`destroy:${reason}`);
      }
      stopFrameLoop(reason);
      if (runtimeWindow) {
        const w = runtimeWindow as any;
        if (w.__cmSelectionTrace?.sessionId === sessionId) {
          delete w.__cmSelectionTrace;
          delete w.__cmSelectionTraceSessionId;
        }
        if (w.__luminaEditorTrace?.sessionId === sessionId) {
          delete w.__luminaEditorTrace;
          delete w.__luminaEditorTraceSessionId;
        }
      }
    },
  };
}

type RectSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
};

function snapshotRect(rect: DOMRect | null): RectSnapshot | null {
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function describeElement(element: Element | null) {
  if (!element) return null;
  const el = element as HTMLElement;
  const style = window.getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || '',
    className: el.className || '',
    rect: snapshotRect(el.getBoundingClientRect()),
    style: {
      position: style.position,
      display: style.display,
      overflow: style.overflow,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      transform: style.transform,
      willChange: style.willChange,
      contain: style.contain,
      zoom: (style as any).zoom || '',
      pointerEvents: style.pointerEvents,
    },
  };
}

function summarizeInteractionTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  const line = element?.closest('.cm-line') as HTMLElement | null;
  const widget = element?.closest('[data-widget-type]') as HTMLElement | null;
  const link = element?.closest('a[href]') as HTMLAnchorElement | null;
  return {
    tag: element?.tagName.toLowerCase() || 'unknown',
    className: element?.className || '',
    text: (element?.textContent || '').slice(0, 120),
    lineText: (line?.textContent || '').slice(0, 160),
    widgetType: widget?.dataset.widgetType || '',
    href: link?.getAttribute('href') || '',
  };
}

function summarizePointerLikeEvent(event: MouseEvent | PointerEvent | WheelEvent) {
  const base = {
    x: event.clientX,
    y: event.clientY,
    button: 'button' in event ? event.button : -1,
    buttons: 'buttons' in event ? event.buttons : 0,
    detail: 'detail' in event ? event.detail : 0,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ...summarizeInteractionTarget(event.target),
  };
  if (event instanceof WheelEvent) {
    return {
      ...base,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
    };
  }
  const PointerEventCtor = (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent;
  if (PointerEventCtor && event instanceof PointerEventCtor) {
    return {
      ...base,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      pressure: event.pressure,
      isPrimary: event.isPrimary,
    };
  }
  return base;
}

function collectTransformChain(element: Element | null, limit = 8) {
  const chain: Array<{
    tag: string;
    id: string;
    className: string;
    transform: string;
    position: string;
    zoom: string;
  }> = [];
  let current: Element | null = element;
  let count = 0;
  while (current && count < limit) {
    const el = current as HTMLElement;
    const style = window.getComputedStyle(el);
    chain.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      className: el.className || '',
      transform: style.transform,
      position: style.position,
      zoom: (style as any).zoom || '',
    });
    current = current.parentElement;
    count += 1;
  }
  return chain;
}

function inspectSelectionVisualAnomaly(view: EditorView) {
  const scroller = view.scrollDOM;
  const scrollerRect = snapshotRect(scroller?.getBoundingClientRect() ?? null);
  const selectionLayer = view.dom.querySelector('.cm-selectionLayer');
  const selectionLayerRect = snapshotRect(
    (selectionLayer as HTMLElement | null)?.getBoundingClientRect() ?? null,
  );
  const selectionBackgrounds = Array.from(view.dom.querySelectorAll('.cm-selectionBackground'));
  const selectionBridges = Array.from(view.dom.querySelectorAll('.cm-selection-bridge'));
  const selectionGaps = Array.from(view.dom.querySelectorAll('.cm-selection-gap'));

  const overlayRects = [
    ...selectionBackgrounds.map((node, index) => ({ node, index, kind: 'background' as const })),
    ...selectionBridges.map((node, index) => ({ node, index, kind: 'bridge' as const })),
    ...selectionGaps.map((node, index) => ({ node, index, kind: 'gap' as const })),
  ].map((entry) => {
    const rect = (entry.node as HTMLElement).getBoundingClientRect();
    const widthRatio = scrollerRect && scrollerRect.width > 0 ? rect.width / scrollerRect.width : 0;
    const heightRatio =
      scrollerRect && scrollerRect.height > 0 ? rect.height / scrollerRect.height : 0;
    return {
      index: entry.index,
      kind: entry.kind,
      rect: snapshotRect(rect),
      widthRatio,
      heightRatio,
    };
  });

  const fullLikeRects = overlayRects.filter(
    (item) => item.widthRatio >= 0.95 && item.heightRatio >= 0.8,
  );
  const oversizedRects = overlayRects.filter(
    (item) => item.widthRatio >= 1.2 || item.heightRatio >= 1.2,
  );

  const main = view.state.selection.main;
  const partialSelection = !(main.from === 0 && main.to === view.state.doc.length);
  const isAnomaly = partialSelection && (fullLikeRects.length > 0 || oversizedRects.length > 0);

  const visualViewport =
    typeof window !== 'undefined' && window.visualViewport
      ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          offsetLeft: window.visualViewport.offsetLeft,
          offsetTop: window.visualViewport.offsetTop,
          scale: window.visualViewport.scale,
        }
      : null;

  const ownerSelection = view.dom.ownerDocument.getSelection();
  const inspect = inspectSelectAllUpgrade(view, ownerSelection);
  const activeElement = view.dom.ownerDocument.activeElement;
  const activeTag = activeElement
    ? `${activeElement.tagName.toLowerCase()}${(activeElement as HTMLElement).className ? `.${(activeElement as HTMLElement).className}` : ''}`
    : 'none';

  return {
    isAnomaly,
    fullLikeCount: fullLikeRects.length,
    oversizedCount: oversizedRects.length,
    selectionBackgroundCount: selectionBackgrounds.length,
    selectionBridgeCount: selectionBridges.length,
    selectionGapCount: selectionGaps.length,
    selection: {
      from: main.from,
      to: main.to,
      docLength: view.state.doc.length,
      ranges: view.state.selection.ranges.length,
      mouseSelecting: view.state.field(mouseSelectingField, false),
      viewport: view.viewport,
      inspect,
    },
    viewMetrics: {
      scrollTop: scroller?.scrollTop ?? null,
      scrollLeft: scroller?.scrollLeft ?? null,
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : null,
      visualViewport,
      activeTag,
    },
    scroller: describeElement(scroller),
    selectionLayer: describeElement(selectionLayer),
    selectionLayerRect,
    overlayRects,
    transformChains: {
      scroller: collectTransformChain(scroller),
      selectionLayer: collectTransformChain(selectionLayer),
    },
  };
}

function logSelectAll(view: EditorView, label: string, data: Record<string, unknown> = {}) {
  if (!selectAllDebugEnabled()) return;
  const selection = view.state.selection.main;
  const docLength = view.state.doc.length;
  const active = view.dom.ownerDocument.activeElement as HTMLElement | null;
  const activeTag = active
    ? `${active.tagName.toLowerCase()}${active.className ? `.${active.className}` : ''}`
    : 'none';
  console.log(`[cm-selectAll] ${label}`, {
    from: selection.from,
    to: selection.to,
    docLength,
    viewport: view.viewport,
    scrollTop: view.scrollDOM?.scrollTop ?? null,
    activeTag,
    ...data,
  });
}

function isViewActive(view: EditorView, target: EventTarget | null) {
  if (view.hasFocus) return true;
  const activeElement = view.dom.ownerDocument.activeElement;
  if (activeElement && view.dom.contains(activeElement)) return true;
  return target instanceof Node && view.dom.contains(target);
}

function applyChangesToContent(base: string, changes: ChangeSet): string {
  let next = '';
  let cursor = 0;
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (fromA > cursor) {
      next += base.slice(cursor, fromA);
    }
    next += inserted.toString();
    cursor = toA;
  });
  if (cursor < base.length) {
    next += base.slice(cursor);
  }
  return next;
}

function inspectSelectAllUpgrade(view: EditorView, selection: Selection | null) {
  const base = {
    shouldUpgrade: false,
    reason: 'unknown',
    from: null as number | null,
    to: null as number | null,
    coversViewport: false,
    alreadyFull: false,
    viewportFrom: view.viewport.from,
    viewportTo: view.viewport.to,
    docLength: view.state.doc.length,
  };
  if (!selection || selection.rangeCount === 0) return { ...base, reason: 'no-selection' };
  if (selection.isCollapsed) return { ...base, reason: 'collapsed' };
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) return { ...base, reason: 'missing-anchor-focus' };
  if (!view.contentDOM.contains(anchorNode) || !view.contentDOM.contains(focusNode)) {
    return { ...base, reason: 'outside-content' };
  }
  const range = selection.getRangeAt(0);
  let domFrom = 0;
  let domTo = 0;
  try {
    domFrom = view.posAtDOM(range.startContainer, range.startOffset);
    domTo = view.posAtDOM(range.endContainer, range.endOffset);
  } catch {
    return { ...base, reason: 'posAtDOM-failed' };
  }
  const from = Math.min(domFrom, domTo);
  const to = Math.max(domFrom, domTo);
  const coversViewport = from <= view.viewport.from && to >= view.viewport.to;
  const alreadyFull = from === 0 && to === view.state.doc.length;
  return {
    ...base,
    shouldUpgrade: coversViewport && !alreadyFull,
    reason: coversViewport
      ? alreadyFull
        ? 'already-full'
        : 'covers-viewport'
      : 'not-cover-viewport',
    from,
    to,
    coversViewport,
    alreadyFull,
  };
}

const SELECT_ALL_INTENT_WINDOW_MS = 1200;

// Workaround: ensure Cmd/Ctrl+A selects the full document even when native selectAll is triggered.
const selectAllDomHandlers = Prec.highest(
  EditorView.domEventHandlers({
    beforeinput(event, view) {
      if (event.inputType !== 'selectAll') return false;
      logSelectAll(view, 'dom-beforeinput', {
        inputType: event.inputType,
        viewActive: isViewActive(view, event.target),
      });
      selectEntireDocument(view);
      event.preventDefault();
      return true;
    },
    keydown(event, view) {
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod || event.shiftKey || event.altKey) return false;
      const key = event.key?.toLowerCase?.() ?? '';
      if (key !== 'a' && event.code !== 'KeyA') return false;
      logSelectAll(view, 'dom-keydown', {
        key: event.key,
        code: event.code,
        viewActive: isViewActive(view, event.target),
      });
      selectEntireDocument(view);
      event.preventDefault();
      return true;
    },
  }),
);

function buildSelectionBridgeDecorations(state: EditorState): DecorationSet {
  if (!state.facet(collapseOnSelectionFacet)) return Decoration.none;
  const hasSelection = state.selection.ranges.some((range) => range.from !== range.to);
  if (!hasSelection) return Decoration.none;

  const selectedLines = new Set<number>();
  let scanFrom = Number.POSITIVE_INFINITY;
  let scanTo = 0;
  for (const range of state.selection.ranges) {
    if (range.from === range.to) continue;
    scanFrom = Math.min(scanFrom, state.doc.lineAt(range.from).from);
    scanTo = Math.max(scanTo, state.doc.lineAt(range.to).to);
    const start = state.doc.lineAt(range.from).number;
    const end = state.doc.lineAt(range.to).number;
    for (let line = start; line <= end; line++) {
      selectedLines.add(line);
    }
  }
  if (!Number.isFinite(scanFrom) || scanTo <= scanFrom) return Decoration.none;

  const decorations: any[] = [];
  const seen = new Set<string>();
  const blockTypes = new Set(['HeaderMark', 'ListMark', 'QuoteMark']);
  const inlineTypes = new Set(['EmphasisMark', 'StrikethroughMark', 'CodeMark']);

  syntaxTree(state).iterate({
    from: scanFrom,
    to: scanTo,
    enter: (node) => {
      if (!blockTypes.has(node.name) && !inlineTypes.has(node.name)) return;
      if (isInsideSkippedSelectionParent(node)) return;

      if (blockTypes.has(node.name)) {
        const lineNum = state.doc.lineAt(node.from).number;
        if (!selectedLines.has(lineNum)) return;
        const key = `${node.from}:${node.to}:bridge`;
        if (!seen.has(key)) {
          seen.add(key);
          decorations.push(
            Decoration.mark({ class: 'cm-selection-bridge' }).range(node.from, node.to),
          );
        }
        const nextChar = state.doc.sliceString(node.to, node.to + 1);
        if (nextChar === ' ') {
          const gapKey = `${node.to}:${node.to + 1}:gap`;
          if (!seen.has(gapKey)) {
            seen.add(gapKey);
            decorations.push(
              Decoration.mark({ class: 'cm-selection-gap' }).range(node.to, node.to + 1),
            );
          }
        }
        return;
      }

      if (node.from >= node.to) return;
      if (!shouldShowSource(state, node.from, node.to)) return;
      const inlineKey = `${node.from}:${node.to}:bridge`;
      if (seen.has(inlineKey)) return;
      seen.add(inlineKey);
      decorations.push(Decoration.mark({ class: 'cm-selection-bridge' }).range(node.from, node.to));
    },
  });

  return Decoration.set(decorations, true);
}

// Table Keymap
const tableKeymap = [
  {
    key: 'Tab',
    run: (view: EditorView) => {
      const { state } = view;
      const { head } = state.selection.main;
      const line = state.doc.lineAt(head);
      if (!line.text.includes('|')) return false;
      const rest = line.text.slice(head - line.from);
      const nextPipe = rest.indexOf('|');
      if (nextPipe !== -1) {
        view.dispatch({ selection: { anchor: head + nextPipe + 2 } });
        return true;
      }
      return false;
    },
  },
  {
    key: 'Enter',
    run: (view: EditorView) => {
      const { state } = view;
      const { head } = state.selection.main;
      const line = state.doc.lineAt(head);
      if (!line.text.includes('|')) return false;
      const pipes = (line.text.match(/\|/g) || []).length;
      if (pipes < 2) return false;
      const row = '\n' + '|  '.repeat(Math.max(1, pipes - 1)) + '|';
      view.dispatch({
        changes: { from: head, insert: row },
        selection: { anchor: head + 4 },
        scrollIntoView: true,
      });
      return true;
    },
  },
];

const wikiLinkStateField = StateField.define<DecorationSet>({
  create: buildWikiLinkDecorations,
  update(deco, tr) {
    return tr.docChanged ? buildWikiLinkDecorations(tr.state) : deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildWikiLinkDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;
  while ((match = regex.exec(docString(state))) !== null) {
    decorations.push(
      Decoration.mark({
        class: 'cm-wikilink',
        attributes: { 'data-wikilink': match[1].trim() },
      }).range(match.index, match.index + match[0].length),
    );
  }
  return Decoration.set(decorations);
}

const calloutStateField = StateField.define<DecorationSet>({
  create: buildCalloutDecorations,
  update(deco, tr) {
    return tr.docChanged ? buildCalloutDecorations(tr.state) : deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});
const CALLOUT_COLORS: Record<string, string> = {
  note: 'blue',
  abstract: 'blue',
  info: 'blue',
  tip: 'green',
  success: 'green',
  question: 'yellow',
  warning: 'yellow',
  danger: 'red',
  failure: 'red',
  bug: 'red',
  example: 'purple',
  quote: 'gray',
  summary: 'blue',
};
const CALLOUT_ICONS: Record<string, string> = {
  note: '📝',
  abstract: '📄',
  summary: '📄',
  info: 'ℹ️',
  tip: '💡',
  hint: '💡',
  success: '✅',
  check: '✅',
  done: '✅',
  question: '❓',
  help: '❓',
  faq: '❓',
  warning: '⚠️',
  caution: '⚠️',
  attention: '⚠️',
  danger: '🔴',
  error: '❌',
  failure: '❌',
  fail: '❌',
  missing: '❌',
  bug: '🐛',
  example: '📋',
  quote: '💬',
  cite: '💬',
};
function buildCalloutDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc;
  let lineNo = 1;
  while (lineNo <= doc.lines) {
    const line = doc.line(lineNo);
    const match = line.text.match(/^>\s*\[!([^\]]+)\]/);
    if (!match) {
      lineNo++;
      continue;
    }
    const rawType = match[1].trim();
    const type = rawType.toLowerCase();
    const isEmojiType = !/^\w+$/.test(rawType);
    const color = isEmojiType ? 'blue' : CALLOUT_COLORS[type] || 'gray';
    const icon = isEmojiType ? rawType : CALLOUT_ICONS[type] || '📝';
    const calloutLines = [{ from: line.from }];
    let nextLineNo = lineNo + 1;
    while (nextLineNo <= doc.lines) {
      const nextLine = doc.line(nextLineNo);
      if (/^>\s*/.test(nextLine.text) || nextLine.text.trim() === '') {
        calloutLines.push({ from: nextLine.from });
        nextLineNo++;
      } else break;
    }
    calloutLines.forEach((l, idx) => {
      let cls = `callout callout-${color}`;
      if (idx === 0) {
        cls += ' callout-first';
        const hMatch = doc.line(lineNo).text.match(/^(>\s*)(\[![^\]]+\])(\s*)/);
        if (hMatch) {
          const s = line.from + hMatch[1].length;
          decorations.push(
            Decoration.replace({ widget: new CalloutIconWidget(icon) }).range(
              s,
              s + hMatch[2].length,
            ),
          );
        }
      }
      if (idx === calloutLines.length - 1) cls += ' callout-last';
      decorations.push(Decoration.line({ class: cls }).range(l.from));
    });
    lineNo = nextLineNo;
  }
  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from),
    true,
  );
}

// ============ 7. Image StateField ============

// 用于跟踪哪些图片应该显示信息
const setImageShowInfo = StateEffect.define<{ src: string; show: boolean }>();
let imagePositionsCache: { from: number; to: number }[] = [];

function selectionTouchesCachedRange(
  selection: { from: number; to: number },
  ranges: { from: number; to: number }[],
) {
  return ranges.some(
    (r) =>
      (selection.from >= r.from && selection.from <= r.to) ||
      (selection.to >= r.from && selection.to <= r.to) ||
      (selection.from <= r.from && selection.to >= r.to),
  );
}

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
      if (
        tr.docChanged ||
        tr.reconfigured ||
        tr.effects.some((e) => e.is(setMouseSelecting) || e.is(setImageShowInfo))
      ) {
        return buildImageDecorations(tr.state, vaultPath);
      }
      if (tr.selection) {
        const oldSel = tr.startState.selection.main;
        const newSel = tr.state.selection.main;
        const oldTouches = selectionTouchesCachedRange(oldSel, imagePositionsCache);
        const newTouches = selectionTouchesCachedRange(newSel, imagePositionsCache);
        if (
          oldTouches !== newTouches ||
          (newTouches && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))
        ) {
          return buildImageDecorations(tr.state, vaultPath);
        }
      }
      return deco.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

function buildImageDecorations(state: EditorState, vaultPath: string): DecorationSet {
  const decorations: any[] = [];
  const doc = docString(state);
  const showInfoSet = state.field(imageInfoField, false) || new Set<string>();
  imagePositionsCache = [];

  // 匹配 Markdown 图片语法 ![alt](src)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = imageRegex.exec(doc)) !== null) {
    const from = match.index,
      to = from + match[0].length;
    const alt = match[1];
    const src = match[2];
    imagePositionsCache.push({ from, to });

    if (shouldShowSource(state, from, to)) {
      // 编辑模式：显示源码 + 图片预览
      decorations.push(Decoration.mark({ class: 'cm-image-source' }).range(from, to));
      decorations.push(
        Decoration.widget({
          widget: new ImageWidget(src, alt, true, vaultPath),
          side: 1,
          block: true,
        }).range(to),
      );
    } else {
      // 预览模式：替换为图片
      const showInfo = showInfoSet.has(src);
      decorations.push(
        Decoration.replace({
          widget: new ImageWidget(src, alt, showInfo, vaultPath),
          block: true,
        }).range(from, to),
      );
    }
  }
  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from),
    true,
  );
}

// ============ 8. Horizontal Rule StateField ============

let horizontalRulePositionsCache: { from: number; to: number }[] = [];

const horizontalRuleStateField = StateField.define<DecorationSet>({
  create: buildHorizontalRuleDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.reconfigured) return buildHorizontalRuleDecorations(tr.state);
    const isDragging = tr.state.field(mouseSelectingField, false);
    const wasDragging = tr.startState.field(mouseSelectingField, false);
    if (wasDragging && !isDragging) return buildHorizontalRuleDecorations(tr.state);
    if (isDragging) return deco;
    if (tr.selection) {
      const oldSel = tr.startState.selection.main;
      const newSel = tr.state.selection.main;
      const touches = (sel: { from: number; to: number }) =>
        horizontalRulePositionsCache.some(
          (h) =>
            (sel.from >= h.from && sel.from <= h.to) ||
            (sel.to >= h.from && sel.to <= h.to) ||
            (sel.from <= h.from && sel.to >= h.to),
        );
      if (
        touches(oldSel) !== touches(newSel) ||
        (touches(newSel) && (oldSel.from !== newSel.from || oldSel.to !== newSel.to))
      ) {
        return buildHorizontalRuleDecorations(tr.state);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildHorizontalRuleDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  horizontalRulePositionsCache = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'HorizontalRule') {
        horizontalRulePositionsCache.push({ from: node.from, to: node.to });

        if (shouldShowSource(state, node.from, node.to)) {
          // 编辑模式：显示源码
          decorations.push(Decoration.mark({ class: 'cm-hr-source' }).range(node.from, node.to));
        } else {
          // 预览模式：替换为水平线
          decorations.push(
            Decoration.replace({
              widget: new HorizontalRuleWidget(),
              block: true,
            }).range(node.from, node.to),
          );
        }
      }
    },
  });

  return Decoration.set(decorations);
}

const readingModePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view.state);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.transactions.some((tr) => tr.reconfigured))
        this.decorations = this.build(u.state);
    }
    build(state: EditorState) {
      const d: any[] = [];
      syntaxTree(state).iterate({
        enter: (node) => {
          if (
            [
              'HeaderMark',
              'EmphasisMark',
              'StrikethroughMark',
              'CodeMark',
              'ListMark',
              'QuoteMark',
            ].includes(node.name)
          ) {
            this.hide(state, node.from, node.to, d);
          }
        },
      });
      return Decoration.set(d, true);
    }
    hide(state: EditorState, from: number, to: number, d: any[]) {
      if (from >= to || state.doc.sliceString(from, to).includes('\n')) return;
      d.push(Decoration.mark({ class: 'cm-formatting-hidden' }).range(from, to));
    }
  },
  { decorations: (v) => v.decorations },
);

const markdownStylePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView) {
      const d: any[] = [];
      syntaxTree(view.state).iterate({
        enter: (node) => {
          const type = node.name;
          const map: Record<string, string> = {
            ATXHeading1: 'cm-header-1',
            ATXHeading2: 'cm-header-2',
            ATXHeading3: 'cm-header-3',
            ATXHeading4: 'cm-header-4',
            StrongEmphasis: 'cm-strong',
            Emphasis: 'cm-emphasis',
            Strikethrough: 'cm-strikethrough',
            InlineCode: 'cm-code',
            Link: 'cm-link',
            URL: 'cm-url',
          };
          if (type.startsWith('ATXHeading')) {
            const cls = map[type] || 'cm-header-4';
            d.push(Decoration.mark({ class: cls }).range(node.from, node.to));
            d.push(Decoration.line({ class: 'cm-heading-line' }).range(node.from));
          } else if (map[type]) {
            d.push(Decoration.mark({ class: map[type] }).range(node.from, node.to));
          }
        },
      });
      return Decoration.set(d, true);
    }
  },
  { decorations: (v) => v.decorations },
);

const setVoicePreview = StateEffect.define<{ from: number; text: string }>();
const clearVoicePreview = StateEffect.define<null | void>();
const voicePreviewField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(val, tr) {
    let deco = val;
    for (const e of tr.effects) {
      if (e.is(setVoicePreview))
        deco = e.value.text
          ? Decoration.set([
              Decoration.widget({ widget: new VoicePreviewWidget(e.value.text), side: 1 }).range(
                e.value.from,
              ),
            ])
          : Decoration.none;
      if (e.is(clearVoicePreview)) deco = Decoration.none;
    }
    return tr.docChanged && deco !== Decoration.none ? deco.map(tr.changes) : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ============ 10. React 组件 ============

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorRef, CodeMirrorEditorProps>(
  function CodeMirrorEditor(
    { content, onChange, className = '', viewMode, livePreview, scrollContainerRef },
    ref,
  ) {
    const { t } = useLocaleStore();

    const effectiveMode: ViewMode = viewMode ?? (livePreview === false ? 'source' : 'live');
    const isReadOnly = effectiveMode === 'reading';

    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const isExternalChange = useRef(false);
    const lastInternalContent = useRef<string>(content);
    const previousModeRef = useRef<ViewMode>(effectiveMode);
    const suppressNextLivePointerRestoreRef = useRef(false);

    const { openVideoNoteTab, openPDFTab, fileTree, openFile, vaultPath } = useFileStore(
      useShallow((state) => ({
        openVideoNoteTab: state.openVideoNoteTab,
        openPDFTab: state.openPDFTab,
        fileTree: state.fileTree,
        openFile: state.openFile,
        vaultPath: state.vaultPath,
      })),
    );
    const { openSecondaryPdf } = useSplitStore();
    const { setSplitView, editorFontSize, editorInteractionTraceEnabled } = useUIStore();

    const getModeExtensions = useCallback(
      (mode: ViewMode) => {
        const imageField = vaultPath ? createImageStateField(vaultPath) : null;
        const widgets = [
          mathStateField,
          mermaidStateField,
          calloutStateField,
          highlightStateField,
          horizontalRuleStateField,
        ];
        if (imageField) widgets.push(imageField);
        switch (mode) {
          case 'reading':
            return [
              collapseOnSelectionFacet.of(false),
              readingModePlugin,
              tableField,
              editableCodeBlockField,
              ...widgets,
            ];
          case 'live':
            return [
              collapseOnSelectionFacet.of(true),
              livePreviewPlugin,
              tableEditorPlugin(),
              // 保持 fenced code 在 live 模式下为稳定的可编辑单态，避免依赖的 selection/render 脱节。
              editableCodeBlockField,
              ...widgets,
            ];
          case 'source':
          default:
            return [calloutStateField];
        }
      },
      [vaultPath],
    );

    const syncSelectionToViewport = useCallback(() => {
      const view = viewRef.current;
      if (!view) return;
      const selection = view.state.selection.main;
      const nextAnchor = getViewportSelectionAnchor(view);
      if (selection.from === nextAnchor && selection.to === nextAnchor) {
        return;
      }
      (window as any).__luminaEditorTrace?.mark?.('selection-synced-to-viewport', {
        previousAnchor: selection.anchor,
        previousHead: selection.head,
        previousFrom: selection.from,
        previousTo: selection.to,
        nextAnchor,
        scrollTop: view.scrollDOM.scrollTop,
        viewportFrom: view.viewport.from,
        viewportTo: view.viewport.to,
      });
      view.dispatch({
        selection: { anchor: nextAnchor },
        scrollIntoView: false,
      });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getScrollLine: () => {
          if (!viewRef.current) return 1;
          const pos = viewRef.current.lineBlockAtHeight(viewRef.current.scrollDOM.scrollTop).from;
          return viewRef.current.state.doc.lineAt(pos).number;
        },
        scrollToLine: (line: number) => {
          if (!viewRef.current) return;
          const target = Math.min(Math.max(1, line), viewRef.current.state.doc.lines);
          viewRef.current.dispatch({
            effects: EditorView.scrollIntoView(viewRef.current.state.doc.line(target).from, {
              y: 'start',
            }),
          });
        },
        syncSelectionToViewport,
      }),
      [syncSelectionToViewport],
    );

    useEffect(() => {
      if (!containerRef.current) return;
      const disableCustomDrawSelection = shouldDisableDrawSelectionForTauriWebKit();

      const state = EditorState.create({
        doc: content,
        extensions: [
          viewModeCompartment.of(getModeExtensions(effectiveMode)),
          readOnlyCompartment.of(EditorState.readOnly.of(isReadOnly)),
          themeCompartment.of([]),
          pluginExtensionsCompartment.of([]),
          history(),
          keymap.of([...tableKeymap, ...defaultKeymap, ...historyKeymap]),
          selectAllDomHandlers,
          markdown({ base: markdownLanguage, extensions: [Table] }),
          EditorView.lineWrapping,
          ...(disableCustomDrawSelection ? [] : [drawSelection()]),
          fontSizeCompartment.of(createEditorTheme(editorFontSize)),
          mouseSelectingField,
          selectionStatePlugin,
          selectionBridgeField,
          wikiLinkStateField,
          voicePreviewField,
          markdownStylePlugin,
          imageInfoField,
          // Slash Command 扩展
          ...slashCommandExtensions,
          placeholderExtension(t.editor.slashMenu.placeholder),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isExternalChange.current) {
              const previousContent = lastInternalContent.current;
              let newContent = previousContent;
              try {
                newContent = applyChangesToContent(previousContent, update.changes);
              } catch {
                newContent = update.state.doc.toString();
              }
              lastInternalContent.current = newContent;
              onChange(newContent);
            }
          }),
        ],
      });

      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;
      const ownerDoc = view.dom.ownerDocument;
      const selectionTrace = createSelectionTraceControl(view, {
        disableCustomDrawSelection,
      });
      const unbindPluginExtensions = pluginEditorRuntime.bindReconfigure((extensions) => {
        view.dispatch({
          effects: pluginExtensionsCompartment.reconfigure(extensions),
        });
      });

      let selectionProbeFrame = 0;
      let selectionProbeActive = false;
      let lastSelectionAnomalyAt = 0;
      let selectionAnomalySeq = 0;

      const reportSelectionVisualAnomaly = (source: string) => {
        const v = viewRef.current;
        if (!v || (!selectionVisualDebugEnabled() && !selectionTrace.enabled())) return;
        const details = inspectSelectionVisualAnomaly(v);
        selectionTrace.event('selection-anomaly-check', {
          source,
          isAnomaly: details.isAnomaly,
          fullLikeCount: details.fullLikeCount,
          oversizedCount: details.oversizedCount,
          selectionBackgroundCount: details.selectionBackgroundCount,
          selectionBridgeCount: details.selectionBridgeCount,
          selectionGapCount: details.selectionGapCount,
          selection: details.selection,
        });
        selectionTrace.snapshot(`anomaly-check:${source}`);
        if (!details.isAnomaly) return;
        const now = Date.now();
        if (now - lastSelectionAnomalyAt < CM_SELECTION_ANOMALY_THROTTLE_MS) return;
        lastSelectionAnomalyAt = now;
        selectionAnomalySeq += 1;
        selectionTrace.anomaly(source, details);
        console.warn(`[cm-selection-anomaly] ${source}`, {
          seq: selectionAnomalySeq,
          at: new Date(now).toISOString(),
          ...details,
        });
      };

      const stopSelectionProbe = () => {
        selectionProbeActive = false;
        if (selectionProbeFrame) {
          cancelAnimationFrame(selectionProbeFrame);
          selectionProbeFrame = 0;
        }
        selectionTrace.event('selection-probe-stop', {});
        selectionTrace.snapshot('selection-probe-stop');
      };

      const runSelectionProbe = () => {
        if (!selectionProbeActive) return;
        reportSelectionVisualAnomaly('drag-frame');
        selectionProbeFrame = requestAnimationFrame(runSelectionProbe);
      };

      const startSelectionProbe = () => {
        if (!selectionVisualDebugEnabled() || selectionProbeActive) return;
        selectionProbeActive = true;
        selectionTrace.event('selection-probe-start', {});
        selectionTrace.snapshot('selection-probe-start');
        runSelectionProbe();
      };

      if (selectionVisualDebugEnabled()) {
        selectionTrace.event('selection-visual-debug-enabled', {
          storageKey: CM_SELECTION_VISUAL_DEBUG_STORAGE_KEY,
        });
        console.log('[cm-selection-anomaly] visual probe enabled', {
          storageKey: CM_SELECTION_VISUAL_DEBUG_STORAGE_KEY,
        });
        if (disableCustomDrawSelection) {
          selectionTrace.event('draw-selection-disabled-for-tauri-webkit', {});
          console.warn('[cm-selection-anomaly] drawSelection-disabled-for-tauri-webkit');
        }
      }

      let mouseDownActive = false;
      let dragSelectionActive = false;
      let mouseDownX = 0;
      let mouseDownY = 0;
      let lastDragClientX = 0;
      let lastDragClientY = 0;
      let lastDragMoveSampleAt = 0;
      let dragSelectionAnchor: number | null = null;
      let lastDragLineRange: DragLineRange | null = null;
      let dragAutoScrollFrame = 0;
      const manualDragSelectionSyncEnabled = shouldDisableDrawSelectionForTauriWebKit();

      const stopDragAutoScroll = () => {
        if (!dragAutoScrollFrame) return;
        cancelAnimationFrame(dragAutoScrollFrame);
        dragAutoScrollFrame = 0;
      };

        const syncDragSelectionFromCoords = (
          x: number,
          y: number,
          source: string,
          lineRange: DragLineRange | null = lastDragLineRange,
        ) => {
        if (!manualDragSelectionSyncEnabled) return false;
        if (dragSelectionAnchor === null) {
          dragSelectionAnchor = view.state.selection.main.anchor;
        }
        const dragScrollContainer = resolveDragScrollContainer(view, scrollContainerRef);
        const scrollerRect = dragScrollContainer?.getBoundingClientRect() ?? null;
        const effectiveLineRange = resolveDragSelectionLineRange(lineRange, y, scrollerRect);
        lastDragLineRange = lineRange;
        const changed = syncDragSelectionHeadFromCoords(
          view,
          dragSelectionAnchor,
          x,
          clampDragSelectionClientY(y, scrollerRect),
          effectiveLineRange,
        );
        if (changed) {
          selectionTrace.event('drag-selection-synced', {
            source,
            x,
            y,
            anchor: dragSelectionAnchor,
            head: view.state.selection.main.head,
          });
          selectionTrace.snapshot('drag-selection-synced');
        }
        return changed;
      };

      const scheduleDragAutoScroll = () => {
        if (!manualDragSelectionSyncEnabled || dragAutoScrollFrame || !dragSelectionActive) return;

        const runDragAutoScroll = () => {
          dragAutoScrollFrame = 0;
          if (!manualDragSelectionSyncEnabled || !mouseDownActive || !dragSelectionActive) return;

          const scroller = resolveDragScrollContainer(view, scrollContainerRef);
          const scrollerRect = scroller?.getBoundingClientRect() ?? null;
          const delta = getDragAutoScrollDelta(lastDragClientY, scrollerRect);
          if (!scroller || !scrollerRect || delta === 0) return;

          const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
          const prevScrollTop = scroller.scrollTop;
          const nextScrollTop = clampNumber(prevScrollTop + delta, 0, maxScrollTop);

          if (nextScrollTop === prevScrollTop) return;

          scroller.scrollTop = nextScrollTop;
          syncDragSelectionFromCoords(lastDragClientX, lastDragClientY, 'drag-autoscroll', null);
          selectionTrace.event('drag-autoscroll', {
            delta,
            prevScrollTop,
            nextScrollTop,
          });
          selectionTrace.snapshot('drag-autoscroll');

          if (getDragAutoScrollDelta(lastDragClientY, scrollerRect) !== 0) {
            dragAutoScrollFrame = requestAnimationFrame(runDragAutoScroll);
          }
        };

        dragAutoScrollFrame = requestAnimationFrame(runDragAutoScroll);
      };

      const clearDragSelectionState = () => {
        const hadDragSelection = dragSelectionActive;
        selectionTrace.event('drag-clear-requested', {
          mouseDownActive,
          dragSelectionActive,
          dragClass: view.dom.classList.contains('cm-drag-selecting'),
          mouseSelectingField: view.state.field(mouseSelectingField, false),
        });
        selectionTrace.snapshot('drag-clear-requested');
        mouseDownActive = false;
        dragSelectionAnchor = null;
        lastDragLineRange = null;
        stopDragAutoScroll();
        if (!hadDragSelection) {
          stopSelectionProbe();
          return;
        }
        dragSelectionActive = false;
        requestAnimationFrame(() => {
          view.dispatch({ effects: setMouseSelecting.of(false) });
          selectionTrace.event('drag-end-dispatch', {
            dragClass: view.dom.classList.contains('cm-drag-selecting'),
            mouseSelectingField: view.state.field(mouseSelectingField, false),
          });
          selectionTrace.snapshot('drag-end-dispatch');
          reportSelectionVisualAnomaly('mouseup');
          requestAnimationFrame(() => {
            selectionTrace.event('drag-end-next-frame', {
              dragClass: view.dom.classList.contains('cm-drag-selecting'),
              mouseSelectingField: view.state.field(mouseSelectingField, false),
            });
            selectionTrace.snapshot('drag-end-next-frame');
            reportSelectionVisualAnomaly('mouseup-next-frame');
            stopSelectionProbe();
          });
        });
      };

      const handleMouseDown = (event: MouseEvent) => {
        if (event.button !== 0) return;
        mouseDownActive = true;
        mouseDownX = event.clientX;
        mouseDownY = event.clientY;
        lastDragClientX = event.clientX;
        lastDragClientY = event.clientY;
        dragSelectionAnchor = null;
        lastDragLineRange = getDragLineRangeFromTarget(view, event.target);
        selectionTrace.event('mouse-down', {
          ...summarizePointerLikeEvent(event),
          currentSelection: {
            from: view.state.selection.main.from,
            to: view.state.selection.main.to,
            head: view.state.selection.main.head,
          },
        });
        selectionTrace.snapshot('mouse-down');
        reportSelectionVisualAnomaly('mousedown');
      };
      const handleMouseMove = (event: MouseEvent) => {
        if (!mouseDownActive || (event.buttons & 1) === 0) return;
        const dx = Math.abs(event.clientX - mouseDownX);
        const dy = Math.abs(event.clientY - mouseDownY);
        if (!dragSelectionActive) {
          if (dx < DRAG_SELECTION_THRESHOLD_PX && dy < DRAG_SELECTION_THRESHOLD_PX) return;
          dragSelectionActive = true;
          lastDragMoveSampleAt = 0;
          dragSelectionAnchor = view.state.selection.main.anchor;
          let cancelledNativeMouseSelection = false;
          if (manualDragSelectionSyncEnabled) {
            cancelledNativeMouseSelection = cancelNativeMouseSelectionForManualDrag(view as any);
            ownerDoc.getSelection()?.removeAllRanges();
            event.preventDefault();
          }
          view.dispatch({ effects: setMouseSelecting.of(true) });
          selectionTrace.event('drag-start-dispatch', {
            dx,
            dy,
            threshold: DRAG_SELECTION_THRESHOLD_PX,
            cancelledNativeMouseSelection,
            dragClass: view.dom.classList.contains('cm-drag-selecting'),
            mouseSelectingField: view.state.field(mouseSelectingField, false),
          });
          selectionTrace.snapshot('drag-start-dispatch');
          requestAnimationFrame(() => {
            selectionTrace.event('drag-start-next-frame', {
              dragClass: view.dom.classList.contains('cm-drag-selecting'),
              mouseSelectingField: view.state.field(mouseSelectingField, false),
            });
            selectionTrace.snapshot('drag-start-next-frame');
          });
          const dragLineRange = getDragLineRangeFromTarget(view, event.target);
          if (syncDragSelectionFromCoords(event.clientX, event.clientY, 'drag-start', dragLineRange)) {
            event.preventDefault();
          }
          scheduleDragAutoScroll();
          startSelectionProbe();
          reportSelectionVisualAnomaly('drag-start');
          return;
        }

        lastDragClientX = event.clientX;
        lastDragClientY = event.clientY;
        const dragLineRange = getDragLineRangeFromTarget(view, event.target);
        if (manualDragSelectionSyncEnabled) {
          event.preventDefault();
        }
        if (syncDragSelectionFromCoords(event.clientX, event.clientY, 'drag-move', dragLineRange)) {
          event.preventDefault();
        }
        scheduleDragAutoScroll();

        const now = Date.now();
        if (now - lastDragMoveSampleAt < 90) return;
        lastDragMoveSampleAt = now;
        const target = event.target instanceof HTMLElement ? event.target : null;
        const line = target?.closest('.cm-line') as HTMLElement | null;
        const lineRect = line?.getBoundingClientRect() ?? null;
        selectionTrace.event('drag-move-sampled', {
          x: event.clientX,
          y: event.clientY,
          dx,
          dy,
          dragClass: view.dom.classList.contains('cm-drag-selecting'),
          mouseSelectingField: view.state.field(mouseSelectingField, false),
          targetTag: target?.tagName || 'unknown',
          targetClass: target?.className || '',
          lineText: (line?.textContent || '').slice(0, 160),
          lineRect: snapshotRect(lineRect),
          currentSelection: {
            from: view.state.selection.main.from,
            to: view.state.selection.main.to,
            selectedLength: view.state.selection.main.to - view.state.selection.main.from,
          },
        });
        selectionTrace.snapshot('drag-move-sampled');
      };
      const handleMouseUp = () => {
        selectionTrace.event('mouse-up', {
          dragClass: view.dom.classList.contains('cm-drag-selecting'),
          mouseSelectingField: view.state.field(mouseSelectingField, false),
          currentSelection: {
            from: view.state.selection.main.from,
            to: view.state.selection.main.to,
            head: view.state.selection.main.head,
          },
        });
        selectionTrace.snapshot('mouse-up');
        clearDragSelectionState();
      };
      const handleOwnerDocVisibilityChange = () => {
        if (!ownerDoc.hidden) return;
        selectionTrace.event('owner-doc-hidden', {});
        selectionTrace.snapshot('owner-doc-hidden');
        clearDragSelectionState();
      };
      const handleWindowBlur = () => {
        selectionTrace.event('window-blur', {});
        selectionTrace.snapshot('window-blur');
        clearDragSelectionState();
      };
      let lastScrollTraceAt = 0;
      let lastPointerMoveTraceAt = 0;
      const handleFirstLivePointerRestoreGuard = (event: PointerEvent) => {
        if (!suppressNextLivePointerRestoreRef.current) return;
        const result = suppressStaleSelectionRestoreOnFirstLivePointerDown(view, event);
        if (!result) return;
        suppressNextLivePointerRestoreRef.current = false;
        selectionTrace.event('first-live-pointerdown-guard', {
          x: event.clientX,
          y: event.clientY,
          nextAnchor: result.nextAnchor,
          domRangeCount: result.domRangeCount,
          previousSelection: result.previousSelection,
        });
        selectionTrace.snapshot('first-live-pointerdown-guard');
      };
      const traceScrollableSnapshot = (source: string, element: HTMLElement | null) => {
        if (!element) return;
        selectionTrace.event(source, {
          scrollTop: element.scrollTop,
          scrollLeft: element.scrollLeft,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        });
        selectionTrace.snapshot(source);
      };
      const traceInputEvent = (
        source: string,
        event: MouseEvent | PointerEvent | WheelEvent,
        snapshot = true,
      ) => {
        selectionTrace.event(source, {
          ...summarizePointerLikeEvent(event),
          currentSelection: {
            from: view.state.selection.main.from,
            to: view.state.selection.main.to,
            head: view.state.selection.main.head,
          },
          scrollTop: view.scrollDOM.scrollTop,
          viewportFrom: view.viewport.from,
          viewportTo: view.viewport.to,
        });
        if (snapshot) {
          selectionTrace.snapshot(source);
        }
      };
      const handleEditorScroll = () => {
        const now = Date.now();
        if (now - lastScrollTraceAt < 80) return;
        lastScrollTraceAt = now;
        traceScrollableSnapshot('editor-scroll', view.scrollDOM);
      };
      const handleEditorWheel = (event: WheelEvent) => {
        traceInputEvent('editor-wheel', event);
      };
      const handleContentPointerDown = (event: PointerEvent) => {
        traceInputEvent('content-pointerdown', event);
      };
      const handleContentPointerMove = (event: PointerEvent) => {
        const now = Date.now();
        if (event.buttons === 0 && now - lastPointerMoveTraceAt < 120) return;
        if (event.buttons !== 0 && now - lastPointerMoveTraceAt < 60) return;
        lastPointerMoveTraceAt = now;
        traceInputEvent('content-pointermove', event, event.buttons !== 0);
      };
      const handleContentPointerUp = (event: PointerEvent) => {
        traceInputEvent('content-pointerup', event);
      };
      const handleContentMouseUp = (event: MouseEvent) => {
        traceInputEvent('content-mouseup', event);
      };
      const handleContentFocusIn = (event: FocusEvent) => {
        selectionTrace.event('content-focusin', {
          ...summarizeInteractionTarget(event.target),
          activeTag: ownerDoc.activeElement?.tagName || 'unknown',
        });
        selectionTrace.snapshot('content-focusin');
      };
      const handleContentFocusOut = (event: FocusEvent) => {
        selectionTrace.event('content-focusout', {
          ...summarizeInteractionTarget(event.target),
          relatedTag: event.relatedTarget instanceof HTMLElement ? event.relatedTarget.tagName : 'unknown',
        });
        selectionTrace.snapshot('content-focusout');
      };
      const handleContentClick = (event: MouseEvent) => {
        traceInputEvent('content-click', event);
      };
      view.contentDOM.addEventListener('pointerdown', handleFirstLivePointerRestoreGuard, true);
      view.contentDOM.addEventListener('mousedown', handleMouseDown);
      view.scrollDOM.addEventListener('scroll', handleEditorScroll, { passive: true });
      view.scrollDOM.addEventListener('wheel', handleEditorWheel, { passive: true });
      view.contentDOM.addEventListener('pointerdown', handleContentPointerDown);
      view.contentDOM.addEventListener('pointermove', handleContentPointerMove);
      ownerDoc.addEventListener('pointerup', handleContentPointerUp);
      view.contentDOM.addEventListener('mouseup', handleContentMouseUp);
      view.contentDOM.addEventListener('focusin', handleContentFocusIn);
      view.contentDOM.addEventListener('focusout', handleContentFocusOut);
      view.contentDOM.addEventListener('click', handleContentClick);
      ownerDoc.addEventListener('mousemove', handleMouseMove);
      ownerDoc.addEventListener('mouseup', handleMouseUp);
      ownerDoc.addEventListener('visibilitychange', handleOwnerDocVisibilityChange);
      ownerDoc.defaultView?.addEventListener('blur', handleWindowBlur);

      const handleSelectAllBeforeInput = (event: InputEvent) => {
        const v = viewRef.current;
        if (!v || event.inputType !== 'selectAll') return;
        if (!isViewActive(v, event.target)) {
          logSelectAll(v, 'doc-beforeinput-skip', {
            inputType: event.inputType,
            reason: 'inactive',
            target: event.target?.constructor?.name,
          });
          return;
        }
        selectAllIntentAt = Date.now();
        selectionTrace.event('select-all-beforeinput', {
          inputType: event.inputType,
          target: event.target?.constructor?.name || 'unknown',
        });
        selectionTrace.snapshot('select-all-beforeinput');
        logSelectAll(v, 'doc-beforeinput', {
          inputType: event.inputType,
          target: event.target?.constructor?.name,
        });
        selectEntireDocument(v);
        event.preventDefault();
        event.stopPropagation();
      };

      const handleSelectAllKeyDown = (event: KeyboardEvent) => {
        const v = viewRef.current;
        if (!v) return;
        const isMod = event.metaKey || event.ctrlKey;
        if (!isMod || event.shiftKey || event.altKey) return;
        const key = event.key?.toLowerCase?.() ?? '';
        if (key !== 'a' && event.code !== 'KeyA') return;
        if (!isViewActive(v, event.target)) {
          logSelectAll(v, 'doc-keydown-skip', {
            key: event.key,
            code: event.code,
            reason: 'inactive',
            target: event.target?.constructor?.name,
          });
          return;
        }
        selectAllIntentAt = Date.now();
        selectionTrace.event('select-all-keydown', {
          key: event.key,
          code: event.code,
          target: event.target?.constructor?.name || 'unknown',
        });
        selectionTrace.snapshot('select-all-keydown');
        logSelectAll(v, 'doc-keydown', {
          key: event.key,
          code: event.code,
          target: event.target?.constructor?.name,
        });
        selectEntireDocument(v);
        event.preventDefault();
        event.stopPropagation();
      };

      let suppressSelectionChange = false;
      let selectAllIntentAt = 0;
      const handleSelectionChange = () => {
        const v = viewRef.current;
        if (!v || suppressSelectionChange) return;
        if (!isViewActive(v, v.dom.ownerDocument.activeElement)) return;
        const selection = ownerDoc.getSelection();
        if (v.state.field(mouseSelectingField, false)) {
          selectionTrace.event('selectionchange-while-dragging', {
            rangeCount: selection?.rangeCount ?? 0,
            collapsed: selection?.isCollapsed ?? true,
          });
          selectionTrace.snapshot('selectionchange-while-dragging');
          reportSelectionVisualAnomaly('selectionchange-while-dragging');
          return;
        }
        selectionTrace.event('selectionchange', {
          rangeCount: selection?.rangeCount ?? 0,
          collapsed: selection?.isCollapsed ?? true,
        });
        selectionTrace.snapshot('selectionchange');
        reportSelectionVisualAnomaly('selectionchange');
        const inspect = inspectSelectAllUpgrade(v, selection);
        const hasRecentIntent =
          selectAllIntentAt > 0 && Date.now() - selectAllIntentAt <= SELECT_ALL_INTENT_WINDOW_MS;
        if (!hasRecentIntent) {
          if (selectAllDebugEnabled()) {
            logSelectAll(v, 'doc-selectionchange-skip', {
              reason: 'no-selectall-intent',
              rangeCount: selection?.rangeCount ?? 0,
              domCollapsed: selection?.isCollapsed ?? true,
              inspect,
            });
          }
          return;
        }
        if (!inspect.shouldUpgrade) {
          if (selectAllDebugEnabled()) {
            logSelectAll(v, 'doc-selectionchange-skip', {
              reason: `not-upgradable:${inspect.reason}`,
              rangeCount: selection?.rangeCount ?? 0,
              domCollapsed: selection?.isCollapsed ?? true,
              inspect,
            });
          }
          return;
        }

        logSelectAll(v, 'doc-selectionchange-upgrade', {
          rangeCount: selection?.rangeCount ?? 0,
          inspect,
        });

        suppressSelectionChange = true;
        selectEntireDocument(v);
        selectAllIntentAt = 0;
        requestAnimationFrame(() => {
          suppressSelectionChange = false;
        });
      };

      ownerDoc.addEventListener('beforeinput', handleSelectAllBeforeInput, true);
      ownerDoc.addEventListener('keydown', handleSelectAllKeyDown, true);
      ownerDoc.addEventListener('selectionchange', handleSelectionChange);

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
            } catch (err) {}
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
                    effects: setImageShowInfo.of({ src, show: false }),
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
        const widgetDom = target.closest('[data-widget-type="math"], [data-widget-type="table"]');
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
          e.preventDefault();
          e.stopPropagation();
          const parsed = parseLuminaLink(link.getAttribute('href')!);
          if (parsed?.file)
            e.ctrlKey || e.metaKey
              ? (setSplitView(true), openSecondaryPdf(parsed.file, parsed.page || 1, parsed.id))
              : openPDFTab(parsed.file);
          return;
        }

        const wikiEl = target.closest('.cm-wikilink');
        if (wikiEl && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          e.stopPropagation();
          const name = wikiEl.getAttribute('data-wikilink');
          if (name) {
            const find = (arr: any[]): string | null => {
              for (const i of arr) {
                if (!i.is_dir && i.name.replace('.md', '').toLowerCase() === name.toLowerCase())
                  return i.path;
                if (i.is_dir) {
                  const r = find(i.children);
                  if (r) return r;
                }
              }
              return null;
            };
            const path = find(fileTree);
            path ? openFile(path) : console.log(`Not found: ${name}`);
          }
          return;
        }

        if ((e.ctrlKey || e.metaKey) && link) {
          const h = link.getAttribute('href')!;
          if (h.includes('bilibili') || h.includes('b23.tv')) {
            e.preventDefault();
            e.stopPropagation();
            openVideoNoteTab(h);
            return;
          }
        }
      };

      view.contentDOM.addEventListener('mousedown', handleClick);
      view.contentDOM.addEventListener('paste', handlePaste);
      return () => {
        stopSelectionProbe();
        selectionTrace.destroy('editor-cleanup');
        view.contentDOM.removeEventListener('pointerdown', handleFirstLivePointerRestoreGuard, true);
        view.contentDOM.removeEventListener('mousedown', handleMouseDown);
        view.contentDOM.removeEventListener('mousedown', handleClick);
        view.contentDOM.removeEventListener('paste', handlePaste);
        view.contentDOM.removeEventListener('focusin', handleContentFocusIn);
        view.contentDOM.removeEventListener('focusout', handleContentFocusOut);
        view.contentDOM.removeEventListener('click', handleContentClick);
        view.contentDOM.removeEventListener('pointerdown', handleContentPointerDown);
        view.contentDOM.removeEventListener('pointermove', handleContentPointerMove);
        ownerDoc.removeEventListener('pointerup', handleContentPointerUp);
        view.contentDOM.removeEventListener('mouseup', handleContentMouseUp);
        view.scrollDOM.removeEventListener('scroll', handleEditorScroll);
        view.scrollDOM.removeEventListener('wheel', handleEditorWheel);
        ownerDoc.removeEventListener('mousemove', handleMouseMove);
        ownerDoc.removeEventListener('mouseup', handleMouseUp);
        ownerDoc.removeEventListener('visibilitychange', handleOwnerDocVisibilityChange);
        ownerDoc.defaultView?.removeEventListener('blur', handleWindowBlur);
        ownerDoc.removeEventListener('beforeinput', handleSelectAllBeforeInput, true);
        ownerDoc.removeEventListener('keydown', handleSelectAllKeyDown, true);
        ownerDoc.removeEventListener('selectionchange', handleSelectionChange);
        unbindPluginExtensions();
        view.destroy();
        _cachedDoc = null;
        _cachedDocString = '';
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      (window as any).__luminaEditorTrace?.mark?.('view-mode-reconfigure', {
        mode: effectiveMode,
        readOnly: isReadOnly,
        selectionAnchor: view.state.selection.main.anchor,
        selectionHead: view.state.selection.main.head,
        viewportFrom: view.viewport.from,
        viewportTo: view.viewport.to,
        scrollTop: view.scrollDOM.scrollTop,
      });
      view.dispatch({
        effects: [
          viewModeCompartment.reconfigure(getModeExtensions(effectiveMode)),
          readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly)),
        ],
      });
    }, [effectiveMode, isReadOnly, getModeExtensions]);

    useEffect(() => {
      const previousMode = previousModeRef.current;
      previousModeRef.current = effectiveMode;
      const shouldSuppressNextPointerRestore = previousMode === 'reading' && effectiveMode === 'live';
      suppressNextLivePointerRestoreRef.current = shouldSuppressNextPointerRestore;
      if (!shouldSuppressNextPointerRestore) return;
      (window as any).__luminaEditorTrace?.mark?.('reading-to-live-transition', {
        previousMode,
        mode: effectiveMode,
      });
      syncSelectionToViewport();
    }, [effectiveMode, syncSelectionToViewport]);

    useEffect(() => {
      const traceApi = (window as any).__luminaEditorTrace;
      if (!traceApi) return;
      if (editorInteractionTraceEnabled) {
        traceApi.enable(false);
        traceApi.clear();
        traceApi.mark('interaction-trace-toggle-enabled', {
          source: 'ui-store',
          mode: effectiveMode,
        });
        return;
      }
      traceApi.mark('interaction-trace-toggle-disabled', {
        source: 'ui-store',
        mode: effectiveMode,
      });
      traceApi.disable(false);
    }, [editorInteractionTraceEnabled, effectiveMode]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: fontSizeCompartment.reconfigure(createEditorTheme(editorFontSize)),
      });
    }, [editorFontSize]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || content === lastInternalContent.current) return;
      const current = view.state.doc.toString();
      if (current !== content) {
        isExternalChange.current = true;
        const sel = view.state.selection.main.head;
        view.dispatch({
          changes: { from: 0, to: current.length, insert: content },
          selection: { anchor: Math.min(sel, content.length) },
        });
        lastInternalContent.current = content;
        isExternalChange.current = false;
      }
    }, [content]);

    useEffect(() => {
      const onVoiceInt = (e: any) =>
        viewRef.current?.dispatch({
          effects: e.detail?.text
            ? setVoicePreview.of({
                from: viewRef.current.state.selection.main.head,
                text: e.detail.text,
              })
            : clearVoicePreview.of(null),
        });
      const onVoiceFin = (e: any) => {
        if (e.detail?.text && viewRef.current) {
          const p = viewRef.current.state.selection.main.head;
          viewRef.current.dispatch({
            changes: { from: p, to: p, insert: e.detail.text },
            selection: { anchor: p + e.detail.text.length },
            effects: clearVoicePreview.of(null),
          });
        }
      };
      const onAi = (e: any) => {
        if (!viewRef.current || !e.detail?.text) return;
        const { mode, text, description } = e.detail;
        const s = viewRef.current.state,
          doc = s.doc.toString(),
          sel = s.selection.main;
        let mod = doc;
        if (mode === 'replace_selection') mod = doc.slice(0, sel.from) + text + doc.slice(sel.to);
        else if (mode === 'append_callout') mod = doc.slice(0, sel.to) + text + doc.slice(sel.to);
        if (mod !== doc) {
          const f = useFileStore.getState().currentFile;
          if (f)
            useAIStore.getState().setPendingDiff({
              fileName: f.split('/').pop()!,
              filePath: f,
              original: doc,
              modified: mod,
              description: description || 'AI Edit',
            });
        }
      };
      const onSum = (e: any) => {
        if (viewRef.current && e.detail?.callout) {
          const p = viewRef.current.state.selection.main.to;
          viewRef.current.dispatch({
            changes: { from: p, to: p, insert: e.detail.callout },
            selection: { anchor: p + e.detail.callout.length },
          });
        }
      };

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
            replacement = selectedText
              .split('\n')
              .map((line) => `- ${line}`)
              .join('\n');
            break;
          case 'ol':
            replacement = selectedText
              .split('\n')
              .map((line, i) => `${i + 1}. ${line}`)
              .join('\n');
            break;
          case 'task':
            replacement = selectedText
              .split('\n')
              .map((line) => `- [ ] ${line}`)
              .join('\n');
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
            replacement = selectedText
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n');
            break;
          default:
            return;
        }

        const newPos = sel.from + replacement.length + cursorOffset;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: replacement },
          selection: { anchor: newPos },
        });
        view.focus();
      };

      window.addEventListener('voice-input-interim', onVoiceInt);
      window.addEventListener('voice-input-final', onVoiceFin);
      window.addEventListener('selection-ai-edit', onAi);
      window.addEventListener('insert-summary-callout', onSum);
      window.addEventListener('editor-format-text', onFormat);
      return () => {
        window.removeEventListener('voice-input-interim', onVoiceInt);
        window.removeEventListener('voice-input-final', onVoiceFin);
        window.removeEventListener('selection-ai-edit', onAi);
        window.removeEventListener('insert-summary-callout', onSum);
        window.removeEventListener('editor-format-text', onFormat);
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
        <div
          ref={containerRef}
          className={`codemirror-wrapper h-full ${className}`}
        />
        <SlashMenu view={viewRef.current} />
      </>
    );
  },
);

export default CodeMirrorEditor;
