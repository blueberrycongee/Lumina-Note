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
  "ListItem",
  "Blockquote",
  "FencedCode",
  "CodeBlock",
  "HorizontalRule",
  "Table",
]);

// 容器节点：继续遍历子节点，自身不生成块
const CONTAINER_NODE_TYPES = new Set(["BulletList", "OrderedList"]);

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
  const listTypeStack: string[] = [];

  tree.iterate({
    enter(node) {
      if (node.name === "Document") return;

      if (CONTAINER_NODE_TYPES.has(node.name)) {
        listTypeStack.push(node.name);
        return; // 继续遍历子节点
      }

      if (node.name === "ListItem") {
        const listType = listTypeStack[listTypeStack.length - 1] ?? "BulletList";
        const startLine = state.doc.lineAt(node.from);
        const endLine = state.doc.lineAt(node.to);
        blocks.push({
          from: node.from,
          to: node.to,
          type: listType,
          startLine: startLine.number,
          endLine: endLine.number,
        });
        return false; // 不进入 ListItem 的子节点
      }

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
    leave(node) {
      if (CONTAINER_NODE_TYPES.has(node.name)) {
        listTypeStack.pop();
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
      <circle cx="2.5" cy="2.5" r="1.25" fill="currentColor"/>
      <circle cx="2.5" cy="6" r="1.25" fill="currentColor"/>
      <circle cx="2.5" cy="9.5" r="1.25" fill="currentColor"/>
      <circle cx="9.5" cy="2.5" r="1.25" fill="currentColor"/>
      <circle cx="9.5" cy="6" r="1.25" fill="currentColor"/>
      <circle cx="9.5" cy="9.5" r="1.25" fill="currentColor"/>
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
        if (!isDragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
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
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="6" y1="2.5" x2="6" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="2.5" y1="6" x2="9.5" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

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
    private flashHandler: ((e: CustomEvent) => void) | null = null;
    private dragStartHandler: ((e: CustomEvent) => void) | null = null;
    private dragMoveHandler: ((e: CustomEvent) => void) | null = null;
    private dragEndHandler: ((e: CustomEvent) => void) | null = null;
    private dragState: {
      sourceBlock: BlockInfo;
      ghostEl: HTMLElement;
      indicatorEl: HTMLElement;
      targetBlock: BlockInfo | null;
      insertAfter: boolean;
      sourceLineEls: HTMLElement[];
    } | null = null;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
      this.attachMouseListeners(view);
      this.attachBlockSelectListener(view);
      this.attachFlashListener(view);
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
      if (this.flashHandler) {
        window.removeEventListener(
          "lumina-block-flash",
          this.flashHandler as EventListener,
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

        // Mark source block lines with visual feedback
        const sourceLineEls: HTMLElement[] = [];
        const sStartLine = view.state.doc.line(block.startLine);
        const sEndLine = view.state.doc.line(block.endLine);
        for (let lineNum = sStartLine.number; lineNum <= sEndLine.number; lineNum++) {
          const line = view.state.doc.line(lineNum);
          const coords = view.coordsAtPos(line.from);
          if (!coords) continue;
          const el = document.elementFromPoint(
            coords.left + 10,
            coords.top + 2,
          ) as HTMLElement | null;
          if (el && el.closest(".cm-block-line")) {
            const lineEl = el.closest(".cm-block-line") as HTMLElement;
            lineEl.classList.add("cm-block-dragging-source");
            sourceLineEls.push(lineEl);
          }
        }

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
          sourceLineEls,
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

        const blockState = view.state.field(blockEditorStateField);
        const source = this.dragState.sourceBlock;

        // Editor container rect for coordinate conversion
        const editorRect = view.dom.getBoundingClientRect();

        // Find target block by comparing mouse Y with block boundaries
        // (more reliable than posAtCoords in empty areas)
        let target: BlockInfo | null = null;
        let insertAfter = false;

        for (const b of blockState.blocks) {
          if (b.from === source.from) continue;
          const bStart = view.coordsAtPos(b.from);
          const bEnd = view.coordsAtPos(b.to);
          if (!bStart || !bEnd) continue;

          if (clientY >= bStart.top && clientY <= bEnd.bottom) {
            target = b;
            const midY = (bStart.top + bEnd.bottom) / 2;
            insertAfter = clientY > midY;
            break;
          }
        }

        // Mouse is in empty area: find nearest block
        if (!target) {
          let closestBlock: BlockInfo | null = null;
          let closestDist = Infinity;
          for (const b of blockState.blocks) {
            if (b.from === source.from) continue;
            const bStart = view.coordsAtPos(b.from);
            if (!bStart) continue;
            const dist = Math.abs(clientY - bStart.top);
            if (dist < closestDist) {
              closestDist = dist;
              closestBlock = b;
            }
          }
          if (closestBlock) {
            target = closestBlock;
            const tStart = view.coordsAtPos(closestBlock.from);
            const tEnd = view.coordsAtPos(closestBlock.to);
            if (tStart && tEnd) {
              const midY = (tStart.top + tEnd.bottom) / 2;
              insertAfter = clientY > midY;
            }
          }
        }

        if (!target) {
          this.dragState.indicatorEl.style.display = "none";
          this.dragState.targetBlock = null;
          return;
        }

        // Skip meaningless moves (source already at target position)
        const sourceIndex = blockState.blocks.findIndex(
          (b) => b.from === source.from,
        );
        const targetIndex = blockState.blocks.findIndex(
          (b) => b.from === target.from,
        );
        const isMeaningless = insertAfter
          ? sourceIndex === targetIndex + 1
          : sourceIndex === targetIndex - 1;
        if (isMeaningless) {
          this.dragState.indicatorEl.style.display = "none";
          this.dragState.targetBlock = null;
          return;
        }

        this.dragState.targetBlock = target;
        this.dragState.insertAfter = insertAfter;

        // Position indicator relative to editor container
        const indicator = this.dragState.indicatorEl;
        const tStart = view.coordsAtPos(target.from);
        const tEnd = view.coordsAtPos(target.to);
        if (!tStart || !tEnd) return;

        indicator.style.display = "block";
        const anchorY = insertAfter ? tEnd.bottom : tStart.top;
        indicator.style.top = `${anchorY - editorRect.top}px`;
        indicator.style.left = `${tStart.left - editorRect.left}px`;
        indicator.style.width = `${Math.min(tEnd.right - tStart.left, 760)}px`;
      };

      this.dragEndHandler = () => {
        if (!this.dragState) return;
        const { sourceBlock, targetBlock, insertAfter } = this.dragState;
        let landedRange: { from: number; to: number } | null = null;
        if (targetBlock) {
          landedRange = this.moveBlock(view, sourceBlock, targetBlock, insertAfter);
        }
        this.cleanupDrag();

        // 落地动效：给新位置的块添加动画
        if (landedRange) {
          this.flashLandedBlock(view, landedRange);
        }
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
        this.dragState.sourceLineEls.forEach((el) => {
          el.classList.remove("cm-block-dragging-source");
        });
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

      // 用预计算的行号定位，避免 syntax tree 位置歧义
      const sourceStart = state.doc.line(source.startLine);
      const sourceEnd = state.doc.line(source.endLine);
      const targetStart = state.doc.line(target.startLine);
      const targetEnd = state.doc.line(target.endLine);

      // 删除范围：source 块的所有行 + 末尾换行符
      const deleteFrom = sourceStart.from;
      let deleteTo = sourceEnd.to;
      if (sourceEnd.number < state.doc.lines) {
        const nextLine = state.doc.line(sourceEnd.number + 1);
        deleteTo = nextLine.from;
      }

      // 插入位置和文本
      let insertPos: number;
      let insertText: string;

      if (insertAfter) {
        if (targetEnd.number < state.doc.lines) {
          // target 后面还有行：插到下一行开头，source 自带换行
          const nextLine = state.doc.line(targetEnd.number + 1);
          insertPos = nextLine.from;
          insertText = text + "\n";
        } else {
          // target 是最后一行：追加到文档末尾，前面补换行
          insertPos = state.doc.length;
          insertText = "\n" + text;
        }
      } else {
        // 插到 target 开头，source 自带换行
        insertPos = targetStart.from;
        insertText = text + "\n";
      }

      // 计算 dispatch 后插入文本在新文档中的实际位置
      const deleteLen = deleteTo - deleteFrom;
      const adjustedInsertPos =
        insertPos > deleteFrom ? insertPos - deleteLen : insertPos;

      view.dispatch({
        changes: [
          { from: deleteFrom, to: deleteTo },
          { from: insertPos, insert: insertText },
        ],
      });

      // 对于追加到末尾的情况（insertText 以 \n 开头），跳过开头的换行符定位
      const landFrom = insertText.startsWith("\n")
        ? adjustedInsertPos + 1
        : adjustedInsertPos;
      return { from: landFrom, to: adjustedInsertPos + insertText.length };
    }

    private flashLandedBlock(
      view: EditorView,
      range: { from: number; to: number },
    ) {
      const startLine = view.state.doc.lineAt(range.from);
      const endLine = view.state.doc.lineAt(range.to);
      const landedLines: HTMLElement[] = [];

      for (
        let lineNum = startLine.number;
        lineNum <= endLine.number;
        lineNum++
      ) {
        const line = view.state.doc.line(lineNum);
        const coords = view.coordsAtPos(line.from);
        if (!coords) continue;
        const el = document.elementFromPoint(
          coords.left + 10,
          coords.top + 2,
        ) as HTMLElement | null;
        if (el && el.closest(".cm-block-line")) {
          const lineEl = el.closest(".cm-block-line") as HTMLElement;
          lineEl.classList.add("cm-block-land");
          landedLines.push(lineEl);
        }
      }

      setTimeout(() => {
        landedLines.forEach((el) => el.classList.remove("cm-block-land"));
      }, 400);
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

    private attachFlashListener(view: EditorView) {
      this.flashHandler = (e: CustomEvent) => {
        const { from } = e.detail as { from: number; to: number };
        const blockState = view.state.field(blockEditorStateField);
        const block = findBlockAtPos(blockState.blocks, from);
        if (!block) return;

        const startLine = view.state.doc.line(block.startLine);
        const flashedLines: HTMLElement[] = [];

        for (
          let lineNum = startLine.number;
          lineNum <= block.endLine;
          lineNum++
        ) {
          const line = view.state.doc.line(lineNum);
          const coords = view.coordsAtPos(line.from);
          if (!coords) continue;
          const el = document.elementFromPoint(
            coords.left + 10,
            coords.top + 2,
          ) as HTMLElement | null;
          if (el && el.closest(".cm-block-line")) {
            const lineEl = el.closest(".cm-block-line") as HTMLElement;
            lineEl.classList.add("cm-block-flash");
            flashedLines.push(lineEl);
          }
        }

        setTimeout(() => {
          flashedLines.forEach((el) => el.classList.remove("cm-block-flash"));
        }, 250);
      };

      window.addEventListener(
        "lumina-block-flash",
        this.flashHandler as EventListener,
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

        // 整块背景装饰（替代逐行 hover 样式）
        const surfaceClass = `cm-block-surface${
          isHovered ? " cm-block-hovered" : ""
        }${isSelected ? " cm-block-selected" : ""}`;
        decorations.push(
          Decoration.mark({
            class: surfaceClass,
            inclusive: false,
          }).range(block.from, block.to),
        );

        // 保留每行的基础 class（flash 等功能依赖 .cm-block-line）
        for (
          let lineNum = startLine.number;
          lineNum <= endLine.number;
          lineNum++
        ) {
          const line = view.state.doc.line(lineNum);
          decorations.push(
            Decoration.line({
              class: "cm-block-line",
              attributes: {
                "data-block-type": block.type,
              },
            }).range(line.from),
          );
        }
      }

      // 为未被任何块覆盖的空行添加 + 按钮
      const coveredLines = new Set<number>();
      for (const block of blockState.blocks) {
        for (let ln = block.startLine; ln <= block.endLine; ln++) {
          coveredLines.add(ln);
        }
      }

      for (let lineNum = 1; lineNum <= view.state.doc.lines; lineNum++) {
        if (coveredLines.has(lineNum)) continue;
        const line = view.state.doc.line(lineNum);
        if (line.text.trim() !== "") continue;

        decorations.push(
          Decoration.widget({
            widget: new PlusButtonWidget(line.from, line.to),
            side: -1,
            inline: false,
            block: false,
          }).range(line.from),
        );

        decorations.push(
          Decoration.line({
            class: "cm-block-line",
            attributes: { "data-block-type": "EmptyLine" },
          }).range(line.from),
        );
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
