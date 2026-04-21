/**
 * Block Editor 扩展
 * 在现有 Markdown 编辑基座上，为块级节点添加飞书式交互体验
 *
 * 设计原则：
 * - 块是"视图层"概念，底层仍然是纯 Markdown 文本
 * - 通过 CodeMirror Decoration 给块级节点添加视觉边界与交互手柄
 * - 块操作通过文本变更（ChangeSet）实现
 */

import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { StateField, StateEffect, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { deleteBlock, duplicateBlock } from "./blockOperations";

// ============ 类型定义 ============

export interface BlockInfo {
  from: number;
  to: number;
  type: string;
  startLine: number;
  endLine: number;
}

// ============ 块类型白名单 ============
// 对应 Lezer Markdown 语法树中的顶层块级节点

const BLOCK_NODE_TYPES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading1",
  "SetextHeading2",
  "Paragraph",
  "BulletList",
  "OrderedList",
  "Blockquote",
  "FencedCode",
  "CodeBlock",
  "HorizontalRule",
  "Table",
]);

// ============ State Effects ============

export const setHoveredBlock = StateEffect.define<BlockInfo | null>();
export const setSelectedBlock = StateEffect.define<BlockInfo | null>();

// ============ 块状态 StateField ============

interface BlockEditorState {
  blocks: BlockInfo[];
  hovered: BlockInfo | null;
  selected: BlockInfo | null;
}

const blockEditorStateField = StateField.define<BlockEditorState>({
  create(state) {
    return {
      blocks: parseBlocks(state),
      hovered: null,
      selected: null,
    };
  },
  update(state, tr) {
    let newState = state;

    if (tr.docChanged) {
      newState = { ...newState, blocks: parseBlocks(tr.state) };
    }

    for (const effect of tr.effects) {
      if (effect.is(setHoveredBlock)) {
        newState = { ...newState, hovered: effect.value };
      }
      if (effect.is(setSelectedBlock)) {
        newState = { ...newState, selected: effect.value };
      }
    }

    return newState;
  },
});

// ============ 解析块边界 ============

function parseBlocks(state: EditorState): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter(node) {
      if (node.name === "Document") return; // 继续遍历子节点

      if (BLOCK_NODE_TYPES.has(node.name)) {
        const startLine = state.doc.lineAt(node.from);
        const endLine = state.doc.lineAt(node.to);
        blocks.push({
          from: node.from,
          to: node.to,
          type: node.name,
          startLine: startLine.number,
          endLine: endLine.number,
        });
        return false; // 不进入该节点的子节点（保持顶层块粒度）
      }
    },
  });

  return blocks;
}

export function findBlockAtPos(
  blocks: BlockInfo[],
  pos: number
): BlockInfo | null {
  for (const block of blocks) {
    if (pos >= block.from && pos <= block.to) {
      return block;
    }
  }
  return null;
}

// ============ Block Handle Widget ============

class BlockHandleWidget extends WidgetType {
  constructor(
    readonly blockType: string,
    readonly blockFrom: number,
    readonly blockTo: number
  ) {
    super();
  }

  eq(other: BlockHandleWidget) {
    return (
      other.blockType === this.blockType &&
      other.blockFrom === this.blockFrom &&
      other.blockTo === this.blockTo
    );
  }

  toDOM() {
    const handle = document.createElement("div");
    handle.className = "cm-block-handle";
    handle.setAttribute("aria-label", "Block actions");
    handle.setAttribute("role", "button");
    handle.tabIndex = -1;

    // 使用 SVG 图标替代文字，更轻量且不受字体影响
    handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3" cy="3" r="1" fill="currentColor"/>
      <circle cx="3" cy="6" r="1" fill="currentColor"/>
      <circle cx="3" cy="9" r="1" fill="currentColor"/>
      <circle cx="9" cy="3" r="1" fill="currentColor"/>
      <circle cx="9" cy="6" r="1" fill="currentColor"/>
      <circle cx="9" cy="9" r="1" fill="currentColor"/>
    </svg>`;

    // 左键点击：选中整个块
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // 只处理左键
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent("lumina-block-select", {
          detail: {
            from: this.blockFrom,
            to: this.blockTo,
          },
        })
      );
    });

    // 右键点击：打开块操作菜单
    handle.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent("lumina-block-menu", {
          detail: {
            from: this.blockFrom,
            to: this.blockTo,
            clientX: e.clientX,
            clientY: e.clientY,
          },
        })
      );
    });

    return handle;
  }

  ignoreEvent() {
    return true; // CodeMirror 完全忽略该 widget 的事件
  }
}

// ============ 块操作菜单 DOM 管理 ============

class BlockMenuManager {
  private menuEl: HTMLElement | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  show(
    view: EditorView,
    block: BlockInfo,
    clientX: number,
    clientY: number
  ) {
    this.hide();

    const menu = document.createElement("div");
    menu.className = "cm-block-menu";

    const duplicateItem = document.createElement("div");
    duplicateItem.className = "cm-block-menu-item";
    duplicateItem.textContent = "Duplicate";
    duplicateItem.addEventListener("mousedown", (e) => {
      e.preventDefault();
      duplicateBlock(view, block);
      this.hide();
    });

    const deleteItem = document.createElement("div");
    deleteItem.className = "cm-block-menu-item cm-block-menu-item-danger";
    deleteItem.textContent = "Delete";
    deleteItem.addEventListener("mousedown", (e) => {
      e.preventDefault();
      deleteBlock(view, block);
      this.hide();
    });

    menu.appendChild(duplicateItem);
    menu.appendChild(deleteItem);

    // 定位：优先显示在鼠标右侧，如果超出视口则显示在左侧
    menu.style.position = "fixed";
    menu.style.left = `${clientX + 8}px`;
    menu.style.top = `${clientY}px`;
    menu.style.zIndex = "1000";

    document.body.appendChild(menu);
    this.menuEl = menu;

    // 如果超出右边界，调整位置
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth - 8) {
      menu.style.left = `${clientX - menuRect.width - 8}px`;
    }
    if (menuRect.bottom > window.innerHeight - 8) {
      menu.style.top = `${clientY - menuRect.height}px`;
    }

    // 点击外部关闭
    this.outsideClickHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this.hide();
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", this.outsideClickHandler!);
    }, 0);
  }

  hide() {
    if (this.outsideClickHandler) {
      document.removeEventListener("mousedown", this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
  }
}

// ============ 块装饰 ViewPlugin ============

const blockDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
    private mouseLeaveHandler: (() => void) | null = null;
    private blockSelectHandler: ((e: CustomEvent) => void) | null = null;
    private blockMenuHandler: ((e: CustomEvent) => void) | null = null;
    private menuManager = new BlockMenuManager();

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
      this.attachMouseListeners(view);
      this.attachBlockSelectListener(view);
      this.attachBlockMenuListener(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        this.blockStateChanged(update)
      ) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    destroy() {
      if (this.blockSelectHandler) {
        window.removeEventListener(
          "lumina-block-select",
          this.blockSelectHandler as EventListener
        );
      }
      if (this.blockMenuHandler) {
        window.removeEventListener(
          "lumina-block-menu",
          this.blockMenuHandler as EventListener
        );
      }
      this.menuManager.hide();
    }

    private blockStateChanged(update: ViewUpdate): boolean {
      const prev = update.startState.field(blockEditorStateField, false);
      const curr = update.state.field(blockEditorStateField, false);
      if (!prev || !curr) return false;
      return (
        prev.hovered?.from !== curr.hovered?.from ||
        prev.hovered?.to !== curr.hovered?.to ||
        prev.selected?.from !== curr.selected?.from ||
        prev.selected?.to !== curr.selected?.to
      );
    }

    private attachBlockMenuListener(view: EditorView) {
      this.blockMenuHandler = (e: CustomEvent) => {
        const { from, clientX, clientY } = e.detail as {
          from: number;
          to: number;
          clientX: number;
          clientY: number;
        };
        const blockState = view.state.field(blockEditorStateField);
        const block = findBlockAtPos(blockState.blocks, from);
        if (block) {
          this.menuManager.show(view, block, clientX, clientY);
          // 同时选中该块
          view.dispatch({
            selection: { anchor: block.from, head: block.to },
            effects: setSelectedBlock.of(block),
            scrollIntoView: false,
          });
        }
      };
      window.addEventListener(
        "lumina-block-menu",
        this.blockMenuHandler as EventListener
      );
    }

    private attachBlockSelectListener(view: EditorView) {
      this.blockSelectHandler = (e: CustomEvent) => {
        const { from } = e.detail as { from: number; to: number };
        const blockState = view.state.field(blockEditorStateField);
        const block = findBlockAtPos(blockState.blocks, from);
        if (block) {
          view.dispatch({
            selection: { anchor: block.from, head: block.to },
            effects: setSelectedBlock.of(block),
            scrollIntoView: false,
          });
        }
      };
      window.addEventListener(
        "lumina-block-select",
        this.blockSelectHandler as EventListener
      );
    }

    private attachMouseListeners(view: EditorView) {
      const dom = view.dom;

      this.mouseMoveHandler = (e: MouseEvent) => {
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return;

        const blockState = view.state.field(blockEditorStateField);
        const block = findBlockAtPos(blockState.blocks, pos);

        const current = blockState.hovered;
        const isSame =
          current === block ||
          (current != null &&
            block != null &&
            current.from === block.from &&
            current.to === block.to);

        if (!isSame) {
          view.dispatch({ effects: setHoveredBlock.of(block) });
        }
      };

      this.mouseLeaveHandler = () => {
        const blockState = view.state.field(blockEditorStateField);
        if (blockState.hovered) {
          view.dispatch({ effects: setHoveredBlock.of(null) });
        }
      };

      dom.addEventListener("mousemove", this.mouseMoveHandler);
      dom.addEventListener("mouseleave", this.mouseLeaveHandler);
    }

    private buildDecorations(view: EditorView): DecorationSet {
      const blockState = view.state.field(blockEditorStateField);
      const decorations: Array<{
        from: number;
        to: number;
        value: Decoration;
      }> = [];

      for (const block of blockState.blocks) {
        const isHovered =
          blockState.hovered != null &&
          block.from === blockState.hovered.from &&
          block.to === blockState.hovered.to;
        const isSelected =
          blockState.selected != null &&
          block.from === blockState.selected.from &&
          block.to === blockState.selected.to;

        let className = "cm-block-line";
        if (isHovered) className += " cm-block-hovered";
        if (isSelected) className += " cm-block-selected";

        const startLine = view.state.doc.line(block.startLine);
        const endLine = view.state.doc.line(block.endLine);

        // 块手柄：插入到第一行开头
        decorations.push(
          Decoration.widget({
            widget: new BlockHandleWidget(block.type, block.from, block.to),
            side: -1,
            inline: false,
            block: false,
          }).range(startLine.from)
        );

        // 块行样式
        for (
          let lineNum = startLine.number;
          lineNum <= endLine.number;
          lineNum++
        ) {
          const line = view.state.doc.line(lineNum);
          decorations.push(
            Decoration.line({
              class: className,
              attributes: {
                "data-block-type": block.type,
              },
            }).range(line.from)
          );
        }
      }

      return Decoration.set(decorations, true);
    }
  },
  { decorations: (v) => v.decorations }
);

// ============ 导出 ============

export const blockEditorExtensions = [
  blockEditorStateField,
  blockDecorationsPlugin,
];
