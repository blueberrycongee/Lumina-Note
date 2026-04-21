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

export interface BlockEditorState {
  blocks: BlockInfo[];
  hovered: BlockInfo | null;
  selected: BlockInfo | null;
}

export const blockEditorStateField = StateField.define<BlockEditorState>({
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
  pos: number,
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
    readonly blockTo: number,
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

    // 左键：单击打开综合菜单 / 拖拽排序
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
            }),
          );
        }
        if (isDragging) {
          window.dispatchEvent(
            new CustomEvent("lumina-block-drag-move", {
              detail: {
                clientX: moveEvent.clientX,
                clientY: moveEvent.clientY,
              },
            }),
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
            }),
          );
        } else {
          // Click: open combined menu
          window.dispatchEvent(
            new CustomEvent("lumina-block-menu", {
              detail: {
                from: this.blockFrom,
                to: this.blockTo,
                clientX: upEvent.clientX,
                clientY: upEvent.clientY,
                mode: "combined",
              },
            }),
          );
        }
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    // 右键点击：打开综合菜单
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
            mode: "combined",
          },
        }),
      );
    });

    return handle;
  }

  ignoreEvent() {
    return true; // CodeMirror 完全忽略该 widget 的事件
  }
}

function isEmptyParagraph(state: EditorState, block: BlockInfo): boolean {
  if (block.type !== "Paragraph") return false;
  const text = state.doc.sliceString(block.from, block.to).trim();
  return text === "";
}

// ============ Plus Button Widget for empty paragraphs ============

class PlusButtonWidget extends WidgetType {
  constructor(
    readonly blockFrom: number,
    readonly blockTo: number,
  ) {
    super();
  }

  eq(other: PlusButtonWidget) {
    return other.blockFrom === this.blockFrom && other.blockTo === this.blockTo;
  }

  toDOM() {
    const btn = document.createElement("div");
    btn.className = "cm-block-plus-btn";
    btn.setAttribute("aria-label", "Add block");
    btn.setAttribute("role", "button");
    btn.tabIndex = -1;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" stroke-width="1.5"/>
      <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5"/>
    </svg>`;

    btn.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent("lumina-block-menu", {
          detail: {
            from: this.blockFrom,
            to: this.blockTo,
            clientX: e.clientX,
            clientY: e.clientY,
            mode: "insert",
          },
        }),
      );
    });

    return btn;
  }

  ignoreEvent() {
    return true;
  }
}

// ============ 块装饰 ViewPlugin ============

const blockDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
    private mouseLeaveHandler: (() => void) | null = null;
    private blockSelectHandler: ((e: CustomEvent) => void) | null = null;
    private dragStartHandler: ((e: CustomEvent) => void) | null = null;
    private dragMoveHandler: ((e: CustomEvent) => void) | null = null;
    private dragEndHandler: ((e: CustomEvent) => void) | null = null;
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
      this.attachDragListeners(view);
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
          this.blockSelectHandler as EventListener,
        );
      }
      if (this.dragStartHandler) {
        window.removeEventListener(
          "lumina-block-drag-start",
          this.dragStartHandler as EventListener,
        );
      }
      if (this.dragMoveHandler) {
        window.removeEventListener(
          "lumina-block-drag-move",
          this.dragMoveHandler as EventListener,
        );
      }
      if (this.dragEndHandler) {
        window.removeEventListener(
          "lumina-block-drag-end",
          this.dragEndHandler as EventListener,
        );
      }
      this.cleanupDrag();
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

        // 判断插入到目标块前还是后：鼠标在目标块上半部则前，下半部则后
        const coords = view.coordsAtPos(target.from);
        const coordsEnd = view.coordsAtPos(target.to);
        if (!coords || !coordsEnd) return;
        const midY = (coords.top + coordsEnd.bottom) / 2;
        const insertAfter = clientY > midY;

        this.dragState.targetBlock = target;
        this.dragState.insertAfter = insertAfter;

        // 定位 indicator
        const indicator = this.dragState.indicatorEl;
        indicator.style.display = "block";
        const anchorY = insertAfter ? coordsEnd.bottom : coords.top;
        indicator.style.top = `${anchorY}px`;
        indicator.style.left = `${coords.left}px`;
        indicator.style.width = `${Math.min(
          coordsEnd.right - coords.left,
          760,
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
        this.dragStartHandler as EventListener,
      );
      window.addEventListener(
        "lumina-block-drag-move",
        this.dragMoveHandler as EventListener,
      );
      window.addEventListener(
        "lumina-block-drag-end",
        this.dragEndHandler as EventListener,
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
      insertAfter: boolean,
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

      // 如果源块在目标块之前，删除后目标位置会前移
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
        this.blockSelectHandler as EventListener,
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

        // 块手柄：空段落显示 + 按钮，其他显示六点手柄
        if (isEmptyParagraph(view.state, block)) {
          decorations.push(
            Decoration.widget({
              widget: new PlusButtonWidget(block.from, block.to),
              side: -1,
              inline: false,
              block: false,
            }).range(startLine.from),
          );
        } else {
          decorations.push(
            Decoration.widget({
              widget: new BlockHandleWidget(block.type, block.from, block.to),
              side: -1,
              inline: false,
              block: false,
            }).range(startLine.from),
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
            }).range(line.from),
          );
        }
      }

      return Decoration.set(decorations, true);
    }
  },
  { decorations: (v) => v.decorations },
);

// ============ 导出 ============

export const blockEditorExtensions = [
  blockEditorStateField,
  blockDecorationsPlugin,
];
