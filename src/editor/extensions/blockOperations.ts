/**
 * Block Operations 工具函数
 * 在 Markdown 编辑基座上实现块级操作（删除、复制、类型转换）
 */

import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

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

export interface BlockRange {
  from: number;
  to: number;
  type: string;
}

export function getBlockAtPos(
  state: EditorState,
  pos: number
): BlockRange | null {
  const tree = syntaxTree(state);
  let result: BlockRange | null = null;

  tree.iterate({
    enter(node) {
      if (node.name === "Document") return;
      if (BLOCK_NODE_TYPES.has(node.name)) {
        if (pos >= node.from && pos <= node.to) {
          result = { from: node.from, to: node.to, type: node.name };
        }
        return false;
      }
    },
  });

  return result;
}

/**
 * 获取块第一行的 markdown 前缀长度
 */
function getBlockPrefixLength(state: EditorState, block: BlockRange): number {
  const line = state.doc.lineAt(block.from);
  const text = line.text;

  switch (block.type) {
    case "ATXHeading1":
    case "ATXHeading2":
    case "ATXHeading3":
    case "ATXHeading4":
    case "ATXHeading5":
    case "ATXHeading6": {
      const m = text.match(/^(#{1,6})\s+/);
      return m ? m[0].length : 0;
    }
    case "BulletList": {
      const m = text.match(/^(\s*)(?:[-*+])\s+/);
      return m ? m[0].length : 0;
    }
    case "OrderedList": {
      const m = text.match(/^(\s*)(?:\d+\.)\s+/);
      return m ? m[0].length : 0;
    }
    case "Blockquote": {
      const m = text.match(/^>\s*/);
      return m ? m[0].length : 0;
    }
    case "FencedCode": {
      const m = text.match(/^```\w*\s*/);
      return m ? m[0].length : 0;
    }
    default:
      return 0;
  }
}

/**
 * 判断 slash 命令位置是否处于块的"可转换起始区"：
 * 块第一行，且块前缀之后只有空白（即 slash 紧跟在块前缀后或行首）
 */
export function isAtBlockStart(
  state: EditorState,
  slashFrom: number
): boolean {
  const block = getBlockAtPos(state, slashFrom);
  if (!block) return false;
  const line = state.doc.lineAt(slashFrom);
  const blockStartLine = state.doc.lineAt(block.from);
  if (line.number !== blockStartLine.number) return false;

  const prefixLen = getBlockPrefixLength(state, block);
  const afterPrefix = state.doc.sliceString(line.from + prefixLen, slashFrom);
  return afterPrefix.trim() === "";
}

// 目标块类型前缀映射
const TARGET_PREFIX: Record<string, string> = {
  ATXHeading1: "# ",
  ATXHeading2: "## ",
  ATXHeading3: "### ",
  ATXHeading4: "#### ",
  ATXHeading5: "##### ",
  ATXHeading6: "###### ",
  BulletList: "- ",
  OrderedList: "1. ",
  Blockquote: "> ",
  Paragraph: "",
};

/**
 * 转换当前块类型。
 * 前提：slashFrom 位于块的可转换起始区（isAtBlockStart === true）。
 * 策略：删除从行首到 slash filter 末尾的内容，插入目标前缀。
 */
export function transformBlockType(
  view: EditorView,
  block: BlockRange,
  _targetType: string,
  _slashFrom: number,
  slashTo: number
): boolean {
  const { state } = view;
  const line = state.doc.lineAt(block.from);
  const targetPrefix = TARGET_PREFIX[_targetType] ?? "";

  view.dispatch({
    changes: { from: line.from, to: slashTo, insert: targetPrefix },
    selection: { anchor: line.from + targetPrefix.length },
  });

  return true;
}

/**
 * 删除一个块
 */
export function deleteBlock(view: EditorView, block: BlockRange): boolean {
  const { state } = view;
  // 删除块内容并连带其后一个换行符（如果有），避免留下空行
  const to = block.to < state.doc.length ? block.to + 1 : block.to;
  view.dispatch({
    changes: { from: block.from, to },
  });
  return true;
}

/**
 * 复制一个块并在其后插入
 */
export function duplicateBlock(view: EditorView, block: BlockRange): boolean {
  const { state } = view;
  const text = state.doc.sliceString(block.from, block.to);
  const insert = text + "\n";
  view.dispatch({
    changes: { from: block.to, to: block.to, insert },
    selection: { anchor: block.to + insert.length },
  });
  return true;
}
