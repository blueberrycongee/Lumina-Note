import type {
  DocxBlock,
  DocxListBlock,
  DocxParagraphStyle,
  DocxTableBlock,
} from "./docxImport";

export type DocxTextLayoutOptions = {
  align: NonNullable<DocxParagraphStyle["alignment"]> | "left";
  firstLineIndentPx: number;
  spaceBeforePx: number;
  spaceAfterPx: number;
};

export const DOCX_IMAGE_PLACEHOLDER = "\uFFFC";

export function docxBlocksToPlainText(blocks: DocxBlock[]): string {
  return blocks
    .map((block) => blockToText(block))
    .filter((value) => value !== null)
    .join("\n");
}

export function docxBlocksToLineHeightPx(
  blocks: DocxBlock[],
  defaultLineHeightPx: number,
  dpi = 96,
): number {
  const style = findFirstParagraphStyle(blocks);
  if (!style || style.lineHeight === undefined) {
    return clampLineHeight(defaultLineHeightPx);
  }

  const lineHeight = style.lineHeight;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return clampLineHeight(defaultLineHeightPx);
  }

  switch (style.lineHeightRule ?? "auto") {
    case "exact":
      return clampLineHeight(pointsToPx(lineHeight, dpi));
    case "atLeast":
      return clampLineHeight(
        Math.max(defaultLineHeightPx, pointsToPx(lineHeight, dpi)),
      );
    case "auto":
    default:
      return clampLineHeight(defaultLineHeightPx * lineHeight);
  }
}

export function docxBlocksToFontSizePx(
  blocks: DocxBlock[],
  defaultFontSizePx: number,
  dpi = 96,
): number {
  const sizePt = findFirstRunFontSizePt(blocks);
  if (!sizePt || !Number.isFinite(sizePt) || sizePt <= 0) {
    return clampFontSize(defaultFontSizePx);
  }

  return clampFontSize(pointsToPx(sizePt, dpi));
}

export function docxBlocksToLayoutTextOptions(
  blocks: DocxBlock[],
  dpi = 96,
): DocxTextLayoutOptions {
  const defaults: DocxTextLayoutOptions = {
    align: "left",
    firstLineIndentPx: 0,
    spaceBeforePx: 0,
    spaceAfterPx: 0,
  };
  const style = findFirstParagraphStyle(blocks);
  if (!style) {
    return defaults;
  }

  const align = style.alignment ?? "left";
  const leftIndent = finiteOrZero(style.indentLeftPt);
  const firstLineIndent = finiteOrZero(style.indentFirstLinePt);
  const firstLineIndentPx = roundPx(pointsToPx(leftIndent + firstLineIndent, dpi));
  const spaceBeforePx = clampNonNegativePx(
    pointsToPx(finiteOrZero(style.spacingBeforePt), dpi),
  );
  const spaceAfterPx = clampNonNegativePx(
    pointsToPx(finiteOrZero(style.spacingAfterPt), dpi),
  );

  return {
    align,
    firstLineIndentPx,
    spaceBeforePx,
    spaceAfterPx,
  };
}

function blockToText(block: DocxBlock): string | null {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return block.runs.map((run) => run.text).join("");
    case "list":
      return listToText(block);
    case "table":
      return tableToText(block);
    case "image":
      return DOCX_IMAGE_PLACEHOLDER;
    default:
      return null;
  }
}

function listToText(block: DocxListBlock): string {
  return block.items
    .map((item) => item.runs.map((run) => run.text).join(""))
    .join("\n");
}

function tableToText(block: DocxTableBlock): string {
  return block.rows
    .map((row) =>
      row.cells
        .map((cell) =>
          cell.blocks
            .map((inner) => blockToText(inner))
            .filter((value): value is string => value !== null)
            .join(" "),
        )
        .join("\t"),
    )
    .join("\n");
}

function findFirstParagraphStyle(
  blocks: DocxBlock[],
): DocxParagraphStyle | undefined {
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "heading") {
      if (block.paragraphStyle) {
        return block.paragraphStyle;
      }
      continue;
    }

    if (block.type === "list") {
      for (const item of block.items) {
        if (item.paragraphStyle) {
          return item.paragraphStyle;
        }
      }
      continue;
    }

    if (block.type === "table") {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          const style = findFirstParagraphStyle(cell.blocks);
          if (style) {
            return style;
          }
        }
      }
    }
  }
  return undefined;
}

function findFirstRunFontSizePt(blocks: DocxBlock[]): number | undefined {
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "heading") {
      for (const run of block.runs) {
        const size = run.style?.sizePt;
        if (Number.isFinite(size) && size && size > 0) {
          return size;
        }
      }
      continue;
    }

    if (block.type === "list") {
      for (const item of block.items) {
        for (const run of item.runs) {
          const size = run.style?.sizePt;
          if (Number.isFinite(size) && size && size > 0) {
            return size;
          }
        }
      }
      continue;
    }

    if (block.type === "table") {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          const size = findFirstRunFontSizePt(cell.blocks);
          if (size) {
            return size;
          }
        }
      }
    }
  }
  return undefined;
}

function pointsToPx(points: number, dpi: number): number {
  return (points * dpi) / 72;
}

function finiteOrZero(value?: number): number {
  if (value === undefined) return 0;
  return Number.isFinite(value) ? value : 0;
}

function roundPx(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function clampNonNegativePx(value: number): number {
  return Math.max(0, roundPx(value));
}

function clampLineHeight(value: number): number {
  return Math.max(1, Math.round(value));
}

function clampFontSize(value: number): number {
  return Math.max(1, Math.round(value));
}
