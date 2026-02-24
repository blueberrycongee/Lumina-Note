/**
 * Slash Command 扩展
 * 输入 / 时弹出命令菜单
 */

import { EditorView, ViewPlugin, ViewUpdate, WidgetType, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import type { Translations } from "@/i18n";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

// ============ 类型定义 ============

export interface SlashCommand {
  id: string;
  label: string;
  icon: string;
  description: string;
  category: "ai" | "heading" | "list" | "block" | "insert";
  action: (view: EditorView, from: number, to: number) => void;
}

// ============ 命令注册 ============

export function getDefaultCommands(translations?: Translations): SlashCommand[] {
  const t = translations ?? getCurrentTranslations();
  const labels = t.editor?.slashMenu?.commands;
  const tableTemplate = labels?.tableTemplate || "| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n|  |  |  |";

  return [
  // AI 命令
  {
    id: "ai-chat",
    label: labels?.aiChat || "AI Chat",
    icon: "✨",
    description: labels?.aiChatDesc || "Open AI assistant chat",
    category: "ai",
    action: (view, from, to) => {
      view.dispatch({ changes: { from, to, insert: "" } });
      window.dispatchEvent(new CustomEvent("open-ai-chat"));
    },
  },
  {
    id: "ai-continue",
    label: labels?.aiContinue || "AI Continue",
    icon: "🪄",
    description: labels?.aiContinueDesc || "Continue writing with AI",
    category: "ai",
    action: (view, from, to) => {
      view.dispatch({ changes: { from, to, insert: "" } });
      window.dispatchEvent(new CustomEvent("ai-continue-writing"));
    },
  },
  
  // 标题
  {
    id: "h1",
    label: labels?.heading1 || "Heading 1",
    icon: "H1",
    description: labels?.heading1Desc || "Large heading",
    category: "heading",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "# " },
        selection: { anchor: from + 2 }
      });
    },
  },
  {
    id: "h2",
    label: labels?.heading2 || "Heading 2",
    icon: "H2",
    description: labels?.heading2Desc || "Section heading",
    category: "heading",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "## " },
        selection: { anchor: from + 3 }
      });
    },
  },
  {
    id: "h3",
    label: labels?.heading3 || "Heading 3",
    icon: "H3",
    description: labels?.heading3Desc || "Subsection heading",
    category: "heading",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "### " },
        selection: { anchor: from + 4 }
      });
    },
  },
  
  // 列表
  {
    id: "bullet-list",
    label: labels?.bulletList || "Bullet List",
    icon: "•",
    description: labels?.bulletListDesc || "Bulleted list",
    category: "list",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "- " },
        selection: { anchor: from + 2 }
      });
    },
  },
  {
    id: "numbered-list",
    label: labels?.numberedList || "Numbered List",
    icon: "1.",
    description: labels?.numberedListDesc || "Numbered list",
    category: "list",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "1. " },
        selection: { anchor: from + 3 }
      });
    },
  },
  {
    id: "task-list",
    label: labels?.taskList || "Task List",
    icon: "☐",
    description: labels?.taskListDesc || "Todo list",
    category: "list",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "- [ ] " },
        selection: { anchor: from + 6 }
      });
    },
  },
  
  // 块
  {
    id: "quote",
    label: labels?.quote || "Quote",
    icon: "❝",
    description: labels?.quoteDesc || "Blockquote",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "> " },
        selection: { anchor: from + 2 }
      });
    },
  },
  {
    id: "code-block",
    label: labels?.codeBlock || "Code Block",
    icon: "</>",
    description: labels?.codeBlockDesc || "Code snippet",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "```\n\n```" },
        selection: { anchor: from + 4 }
      });
    },
  },
  {
    id: "callout",
    label: labels?.callout || "Callout",
    icon: "💡",
    description: labels?.calloutDesc || "Callout block",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "> [!note]\n> " },
        selection: { anchor: from + 12 }
      });
    },
  },
  {
    id: "math-block",
    label: labels?.mathBlock || "Math Block",
    icon: "∑",
    description: labels?.mathBlockDesc || "LaTeX block",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "$$\n\n$$" },
        selection: { anchor: from + 3 }
      });
    },
  },
  
  // 插入
  {
    id: "table",
    label: labels?.table || "Table",
    icon: "▦",
    description: labels?.tableDesc || "Markdown table",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: tableTemplate },
        selection: { anchor: from + 2 }
      });
    },
  },
  {
    id: "divider",
    label: labels?.divider || "Divider",
    icon: "—",
    description: labels?.dividerDesc || "Horizontal divider",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "---\n" },
        selection: { anchor: from + 4 }
      });
    },
  },
  {
    id: "image",
    label: labels?.image || "Image",
    icon: "🖼",
    description: labels?.imageDesc || "Insert image",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "![]()" },
        selection: { anchor: from + 4 }
      });
    },
  },
  {
    id: "link",
    label: labels?.link || "Link",
    icon: "🔗",
    description: labels?.linkDesc || "Insert link",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "[]()" },
        selection: { anchor: from + 1 }
      });
    },
  },
];
}

// ============ State Effects ============

export const showSlashMenu = StateEffect.define<{ pos: number; filter: string }>();
export const hideSlashMenu = StateEffect.define<void>();
export const updateSlashFilter = StateEffect.define<string>();

interface SlashMenuState {
  active: boolean;
  pos: number;      // "/" 的位置
  filter: string;   // "/" 后面的过滤文本
}

export const slashMenuField = StateField.define<SlashMenuState>({
  create: () => ({ active: false, pos: 0, filter: "" }),
  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showSlashMenu)) {
        return { active: true, pos: effect.value.pos, filter: effect.value.filter };
      }
      if (effect.is(hideSlashMenu)) {
        return { active: false, pos: 0, filter: "" };
      }
      if (effect.is(updateSlashFilter)) {
        return { ...state, filter: effect.value };
      }
    }
    
    // 文档变化时，检查是否应该关闭菜单
    if (state.active && tr.docChanged) {
      const head = tr.state.selection.main.head;
      // 如果光标不再在 "/" 之后，关闭菜单
      if (head <= state.pos) {
        return { active: false, pos: 0, filter: "" };
      }
      // 更新 filter
      const text = tr.state.doc.sliceString(state.pos, head);
      if (!text.startsWith("/")) {
        return { active: false, pos: 0, filter: "" };
      }
      return { ...state, filter: text.slice(1) };
    }
    
    return state;
  },
});

// ============ 输入处理 ============

export const slashCommandPlugin = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {}
    
    update(update: ViewUpdate) {
      const nextMenuState = update.state.field(slashMenuField, false);
      const prevMenuState = update.startState.field(slashMenuField, false);
      if (
        nextMenuState?.active !== prevMenuState?.active ||
        nextMenuState?.filter !== prevMenuState?.filter ||
        nextMenuState?.pos !== prevMenuState?.pos
      ) {
        window.dispatchEvent(new CustomEvent("slash-menu-state", {
          detail: {
            active: nextMenuState?.active ?? false,
            filter: nextMenuState?.filter ?? "",
            pos: nextMenuState?.pos ?? 0,
          }
        }));
      }

      // 检测是否输入了 "/"
      if (update.docChanged && !update.state.field(slashMenuField).active) {
        for (const tr of update.transactions) {
          tr.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
            const text = inserted.toString();
            if (text === "/" && fromB === toB - 1) {
              // 检查是否在行首或空格后
              const line = update.state.doc.lineAt(fromB);
              const before = update.state.doc.sliceString(line.from, fromB);
              if (before.trim() === "" || before.endsWith(" ")) {
                // 显示菜单
                setTimeout(() => {
                  this.view.dispatch({
                    effects: showSlashMenu.of({ pos: fromB, filter: "" })
                  });
                  // 通知 React 组件
                  const coords = this.view.coordsAtPos(fromB);
                  if (coords) {
                    window.dispatchEvent(new CustomEvent("slash-menu-show", {
                      detail: { x: coords.left, y: coords.bottom, pos: fromB }
                    }));
                  }
                }, 0);
              }
            }
          });
        }
      }
    }
  }
);

// ============ 占位符 ============

class PlaceholderWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-placeholder";
    span.textContent = this.text;
    span.style.cssText = `
      color: hsl(var(--muted-foreground) / 0.5);
      pointer-events: none;
      position: absolute;
      left: 16px;
      font-style: italic;
    `;
    return span;
  }
  
  ignoreEvent() { return true; }
}

export function placeholderExtension(text: string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      
      update(update: ViewUpdate) {
        if (update.docChanged || update.focusChanged) {
          this.decorations = this.build(update.view);
        }
      }
      
      build(view: EditorView): DecorationSet {
        const doc = view.state.doc;
        // 只在文档为空时显示
        if (doc.length === 0 || (doc.length === 1 && doc.toString() === "")) {
          return Decoration.set([
            Decoration.widget({
              widget: new PlaceholderWidget(text),
              side: 1,
            }).range(0)
          ]);
        }
        return Decoration.none;
      }
    },
    { decorations: v => v.decorations }
  );
}

// ============ 导出 ============

export const slashCommandExtensions = [
  slashMenuField,
  slashCommandPlugin,
];
