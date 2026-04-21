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
import {
  deleteBlock,
  duplicateBlock,
  transformBlockTypeByToolbar,
} from "./blockOperations";

// ============ 类型定义 ============

export interface BlockInfo {
  from: number;
  to: number;
  type: string;
  startLine: number;
  endLine: number;
}

// ============ 块类型白名单 ============

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
      if (node.name === "Document") return;

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
        return false;
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
    handle.setAttribute("aria-label", "Block handle");
    handle.setAttribute("role", "button");
    handle.tabIndex = -1;

    handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3" cy="3" r="1" fill="currentColor"/>
      <circle cx="3" cy="6" r="1" fill="currentColor"/>
      <circle cx="3" cy="9" r="1" fill="currentColor"/>
      <circle cx="9" cy="3" r="1" fill="currentColor"/>
      <circle cx="9" cy="6" r="1" fill="currentColor"/>
      <circle cx="9" cy="9" r="1" fill="currentColor"/>
    </svg>`;

    // 左键：单击选中 / 拖拽排序
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      let isDragging = false;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          isDragging = true;
          window.dispatchEvent(
            new CustomEvent("lumina-block-drag-start", {
              detail: {
                from: this.blockFrom,
                to: this.blockTo,
                clientX: moveEvent.clientX,
                clientY: moveEvent.clientY,
              },
            })
          );
        }
        if (isDragging) {
          window.dispatchEvent(
            new CustomEvent("lumina-block-drag-move", {
              detail: {
                clientX: moveEvent.clientX,
                clientY: moveEvent.clientY,
              },
            })
          );
        }
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (isDragging) {
          window.dispatchEvent(
            new CustomEvent("lumina-block-drag-end", {
              detail: {
                clientX: upEvent.clientX,
                clientY: upEvent.clientY,
              },
            })
          );
        } else {
          window.dispatchEvent(
            new CustomEvent("lumina-block-select", {
              detail: {
                from: this.blockFrom,
                to: this.blockTo,
              },
            })
          );
        }
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    return handle;
  }

  ignoreEvent() {
    return true;
  }
}

// ============ 空块占位提示 Widget ============

class EmptyBlockPlaceholderWidget extends WidgetType {
  eq(_other: EmptyBlockPlaceholderWidget) {
    return true;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-empty-block-placeholder";
    span.textContent = "输入 '/' 快速插入...";
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

function isEmptyParagraph(state: EditorState, block: BlockInfo): boolean {
  if (block.type !== "Paragraph") return false;
  const text = state.doc.sliceString(block.from, block.to).trim();
  return text === "";
}

// ============ Block Format Toolbar (hover 浮出式) ============

interface ToolbarButton {
  id: string;
  label: string;
  title: string;
  action: (view: EditorView, block: BlockInfo) => void;
}

function createToolbarButtons(): ToolbarButton[] {
  const format = (
    id: string,
    label: string,
    title: string,
    targetType: string
  ): ToolbarButton => ({
    id,
    label,
    title,
    action: (view, block) => {
      transformBlockTypeByToolbar(view, block, targetType);
    },
  });

  return [
    format("h1", "H1", "Heading 1", "ATXHeading1"),
    format("h2", "H2", "Heading 2", "ATXHeading2"),
    format("h3", "H3", "Heading 3", "ATXHeading3"),
    format("bullet", "•", "Bullet List", "BulletList"),
    format("ordered", "1.", "Numbered List", "OrderedList"),
    {
      id: "task",
      label: "☐",
      title: "Task List",
      action: (view, block) => {
        const line = view.state.doc.lineAt(block.from);
        view.dispatch({
          changes: {
            from: line.from,
            to: line.from,
            insert: "- [ ] ",
          },
          selection: { anchor: line.from + 6 },
        });
      },
    },
    format("quote", "❝", "Quote", "Blockquote"),
    format("code", "</>", "Code Block", "FencedCode"),
    {
      id: "divider",
      label: "—",
      title: "Divider",
      action: (view, block) => {
        view.dispatch({
          changes: { from: block.from, to: block.to, insert: "---" },
          selection: { anchor: block.from + 3 },
        });
      },
    },
    {
      id: "delete",
      label: "🗑",
      title: "Delete block",
      action: (view, block) => deleteBlock(view, block),
    },
    {
      id: "duplicate",
      label: "📄",
      title: "Duplicate block",
      action: (view, block) => duplicateBlock(view, block),
    },
  ];
}

class BlockFormatToolbar {
  private el: HTMLElement;
  private buttons: ToolbarButton[];
  private view: EditorView | null = null;
  private currentBlock: BlockInfo | null = null;

  constructor() {
    this.buttons = createToolbarButtons();
    this.el = document.createElement("div");
    this.el.className = "cm-block-format-toolbar";
    this.buildDOM();
  }

  private buildDOM() {
    const row1 = document.createElement("div");
    row1.className = "cm-block-format-row";
    const row2 = document.createElement("div");
    row2.className = "cm-block-format-row";

    this.buttons.forEach((btn, idx) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-block-format-btn";
      button.textContent = btn.label;
      button.title = btn.title;
      button.dataset.id = btn.id;
      button.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.view && this.currentBlock) {
          btn.action(this.view, this.currentBlock);
        }
      });

      if (idx < 6) {
        row1.appendChild(button);
      } else {
        row2.appendChild(button);
      }
    });

    this.el.appendChild(row1);
    this.el.appendChild(row2);
  }

  mount(parent: HTMLElement) {
    parent.appendChild(this.el);
  }

  showAt(view: EditorView, block: BlockInfo) {
    this.view = view;
    this.currentBlock = block;

    const coords = view.coordsAtPos(block.from);
    if (!coords) {
      this.hide();
      return;
    }

    // 定位在块左侧：与 .cm-content 左边缘对齐再向左偏移
    const contentRect = view.contentDOM.getBoundingClientRect();
    const toolbarWidth = 150; // 近似宽度
    const left = Math.max(4, contentRect.left - toolbarWidth - 4);
    const top = coords.top;

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.display = "flex";

    // 高亮当前块类型对应的按钮
    this.el.querySelectorAll(".cm-block-format-btn").forEach((btn) => {
      const button = btn as HTMLButtonElement;
      const isActive =
        (block.type === "ATXHeading1" && button.dataset.id === "h1") ||
        (block.type === "ATXHeading2" && button.dataset.id === "h2") ||
        (block.type === "ATXHeading3" && button.dataset.id === "h3") ||
        (block.type === "BulletList" && button.dataset.id === "bullet") ||
        (block.type === "OrderedList" && button.dataset.id === "ordered") ||
        (block.type === "Blockquote" && button.dataset.id === "quote") ||
        (block.type === "FencedCode" && button.dataset.id === "code");
      button.classList.toggle("cm-block-format-btn-active", !!isActive);
    });
  }

  hide() {
    this.el.style.display = "none";
    this.view = null;
    this.currentBlock = null;
  }

  destroy() {
    this.el.remove();
  }
}

// ============ 块操作菜单 DOM 管理 (保留右键菜单) ============

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

    menu.style.position = "fixed";
    menu.style.left = `${clientX + 8}px`;
    menu.style.top = `${clientY}px`;
    menu.style.zIndex = "1000";

    document.body.appendChild(menu);
    this.menuEl = menu;

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth - 8) {
      menu.style.left = `${clientX - menuRect.width - 8}px`;
    }
    if (menuRect.bottom > window.innerHeight - 8) {
      menu.style.top = `${clientY - menuRect.height}px`;
    }

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
    private dragStartHandler: ((e: CustomEvent) => void) | null = null;
    private dragMoveHandler: ((e: CustomEvent) => void) | null = null;
    private dragEndHandler: ((e: CustomEvent) => void) | null = null;
    private menuManager = new BlockMenuManager();
    private formatToolbar = new BlockFormatToolbar();
    private dragState: {
      sourceBlock: BlockInfo;
      ghostEl: HTMLElement;
      indicatorEl: HTMLElement;
      targetBlock: BlockInfo | null;
      insertAfter: boolean;
    } | null = null;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
      this.attachMouseListeners(view);
      this.attachBlockSelectListener(view);
      this.attachBlockMenuListener(view);
      this.attachDragListeners(view);
      this.formatToolbar.mount(view.dom);
    }

    update(update: ViewUpdate) {
      const hoverChanged = this.hoverChanged(update);
      if (
        update.docChanged ||
        update.viewportChanged ||
        hoverChanged ||
        this.blockStateChanged(update)
      ) {
        this.decorations = this.buildDecorations(update.view);
      }

      // 同步更新格式工具栏位置
      if (hoverChanged || update.viewportChanged) {
        const blockState = update.state.field(blockEditorStateField);
        if (blockState.hovered) {
          this.formatToolbar.showAt(update.view, blockState.hovered);
        } else {
          this.formatToolbar.hide();
        }
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
      if (this.dragStartHandler) {
        window.removeEventListener(
          "lumina-block-drag-start",
          this.dragStartHandler as EventListener
        );
      }
      if (this.dragMoveHandler) {
        window.removeEventListener(
          "lumina-block-drag-move",
          this.dragMoveHandler as EventListener
        );
      }
      if (this.dragEndHandler) {
        window.removeEventListener(
          "lumina-block-drag-end",
          this.dragEndHandler as EventListener
        );
      }
      this.menuManager.hide();
      this.formatToolbar.destroy();
      this.cleanupDrag();
    }

    private hoverChanged(update: ViewUpdate): boolean {
      const prev = update.startState.field(blockEditorStateField).hovered;
      const curr = update.state.field(blockEditorStateField).hovered;
      if (!prev && !curr) return false;
      if (!prev || !curr) return true;
      return prev.from !== curr.from || prev.to !== curr.to;
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

    // ── Drag & Drop ───────────────────────────────────────────────

    private attachDragListeners(view: EditorView) {
      this.dragStartHandler = (e: CustomEvent) => {
        const { from, clientX, clientY } = e.detail as {
          from: number;
          to: number;
          clientX: number;
          clientY: number;
        };
        const blockState = view.state.field(blockEditorStateField);
        const block = findBlockAtPos(blockState.blocks, from);
        if (!block) return;

        this.cleanupDrag();
        this.formatToolbar.hide(); // 拖拽时隐藏工具栏

        const ghost = document.createElement("div");
        ghost.className = "cm-block-drag-ghost";
        ghost.textContent = view.state.doc
          .sliceString(block.from, Math.min(block.to, block.from + 60))
          .replace(/\n/g, " ");
        if (block.to - block.from > 60) ghost.textContent += "…";
        document.body.appendChild(ghost);

        const indicator = document.createElement("div");
        indicator.className = "cm-block-drag-indicator";
        indicator.style.display = "none";
        view.dom.appendChild(indicator);

        this.dragState = {
          sourceBlock: block,
          ghostEl: ghost,
          indicatorEl: indicator,
          targetBlock: null,
          insertAfter: false,
        };

        this.updateDragGhost(clientX, clientY);
        document.body.classList.add("lumina-block-dragging");
      };

      this.dragMoveHandler = (e: CustomEvent) => {
        if (!this.dragState) return;
        const { clientX, clientY } = e.detail as {
          clientX: number;
          clientY: number;
        };
        this.updateDragGhost(clientX, clientY);

        const pos = view.posAtCoords({ x: clientX, y: clientY });
        if (pos == null) {
          this.dragState.indicatorEl.style.display = "none";
          return;
        }

        const blockState = view.state.field(blockEditorStateField);
        const target = findBlockAtPos(blockState.blocks, pos);
        if (!target || target.from === this.dragState.sourceBlock.from) {
          this.dragState.indicatorEl.style.display = "none";
          this.dragState.targetBlock = null;
          return;
        }

        const coords = view.coordsAtPos(target.from);
        const coordsEnd = view.coordsAtPos(target.to);
        if (!coords || !coordsEnd) return;
        const midY = (coords.top + coordsEnd.bottom) / 2;
        const insertAfter = clientY > midY;

        this.dragState.targetBlock = target;
        this.dragState.insertAfter = insertAfter;

        const indicator = this.dragState.indicatorEl;
        indicator.style.display = "block";
        const anchorY = insertAfter ? coordsEnd.bottom : coords.top;
        indicator.style.top = `${anchorY - editorScrollTop(view)}px`;
        indicator.style.left = `${coords.left - editorScrollLeft(view)}px`;
        indicator.style.width = `${Math.min(
          coordsEnd.right - coords.left,
          760
        )}px`;
      };

      this.dragEndHandler = () => {
        if (!this.dragState) return;
        const { sourceBlock, targetBlock, insertAfter } = this.dragState;
        if (targetBlock) {
          this.moveBlock(view, sourceBlock, targetBlock, insertAfter);
        }
        this.cleanupDrag();
      };

      window.addEventListener(
        "lumina-block-drag-start",
        this.dragStartHandler as EventListener
      );
      window.addEventListener(
        "lumina-block-drag-move",
        this.dragMoveHandler as EventListener
      );
      window.addEventListener(
        "lumina-block-drag-end",
        this.dragEndHandler as EventListener
      );
    }

    private updateDragGhost(x: number, y: number) {
      if (!this.dragState) return;
      const ghost = this.dragState.ghostEl;
      ghost.style.left = `${x + 12}px`;
      ghost.style.top = `${y + 12}px`;
    }

    private cleanupDrag() {
      document.body.classList.remove("lumina-block-dragging");
      if (this.dragState) {
        this.dragState.ghostEl.remove();
        this.dragState.indicatorEl.remove();
        this.dragState = null;
      }
    }

    private moveBlock(
      view: EditorView,
      source: BlockInfo,
      target: BlockInfo,
      insertAfter: boolean
    ) {
      const { state } = view;
      const text = state.doc.sliceString(source.from, source.to);
      const trailingNl = source.to < state.doc.length ? 1 : 0;
      const deleteFrom = source.from;
      const deleteTo = source.to + trailingNl;

      let insertPos: number;
      if (insertAfter) {
        insertPos = target.to + (target.to < state.doc.length ? 1 : 0);
      } else {
        insertPos = target.from;
      }

      if (source.to < target.from) {
        insertPos -= deleteTo - deleteFrom;
      }

      view.dispatch({
        changes: [
          { from: deleteFrom, to: deleteTo },
          { from: insertPos, insert: text + "\n" },
        ],
      });
    }

    // ── Block Menu (右键) ─────────────────────────────────────────

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

        // 块手柄
        decorations.push(
          Decoration.widget({
            widget: new BlockHandleWidget(block.type, block.from, block.to),
            side: -1,
            inline: false,
            block: false,
          }).range(startLine.from)
        );

        // 空段落占位提示
        if (isEmptyParagraph(view.state, block)) {
          decorations.push(
            Decoration.widget({
              widget: new EmptyBlockPlaceholderWidget(),
              side: 1,
            }).range(startLine.from)
          );
        }

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

// ============ 辅助：获取编辑器滚动偏移 ============

function editorScrollTop(view: EditorView): number {
  const scroller = view.scrollDOM;
  return scroller.scrollTop;
}

function editorScrollLeft(view: EditorView): number {
  const scroller = view.scrollDOM;
  return scroller.scrollLeft;
}

// ============ 导出 ============

export const blockEditorExtensions = [
  blockEditorStateField,
  blockDecorationsPlugin,
];
