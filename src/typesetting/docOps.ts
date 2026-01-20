import type { DocxRunStyle } from "./docxImport";

export type DocParagraphAction =
  | { type: "align"; align: "left" | "right" | "center" | "justify" }
  | { type: "indent"; delta: number }
  | { type: "block"; block: string };

export type DocOp =
  | { type: "insert_text"; text: string }
  | {
      type: "delete_content";
      direction: "backward" | "forward" | "selection";
      unit: "character" | "word" | "line" | "paragraph" | "selection";
    }
  | { type: "apply_inline_style"; style: DocxRunStyle }
  | { type: "apply_paragraph_style"; action: DocParagraphAction };

const buildInsertTextOp = (text: string): DocOp => ({
  type: "insert_text",
  text,
});

const buildDeleteOp = (
  direction: "backward" | "forward" | "selection",
  unit: "character" | "word" | "line" | "paragraph" | "selection",
): DocOp => ({
  type: "delete_content",
  direction,
  unit,
});

export function docOpFromInputType(
  inputType: string,
  data?: string | null,
): DocOp | null {
  switch (inputType) {
    case "insertText":
    case "insertFromPaste":
    case "insertFromDrop":
    case "insertFromYank":
      return data && data.length > 0 ? buildInsertTextOp(data) : null;
    case "insertParagraph":
    case "insertLineBreak":
      return buildInsertTextOp("\n");
    case "insertTab":
      return buildInsertTextOp("\t");
    case "deleteContentBackward":
      return buildDeleteOp("backward", "character");
    case "deleteContentForward":
      return buildDeleteOp("forward", "character");
    case "deleteWordBackward":
      return buildDeleteOp("backward", "word");
    case "deleteWordForward":
      return buildDeleteOp("forward", "word");
    case "deleteSoftLineBackward":
    case "deleteSoftLineForward":
    case "deleteHardLineBackward":
    case "deleteHardLineForward":
      return buildDeleteOp(
        inputType.includes("Backward") ? "backward" : "forward",
        "line",
      );
    case "deleteByCut":
      return buildDeleteOp("selection", "selection");
    case "formatBold":
      return { type: "apply_inline_style", style: { bold: true } };
    case "formatItalic":
      return { type: "apply_inline_style", style: { italic: true } };
    case "formatUnderline":
      return { type: "apply_inline_style", style: { underline: true } };
    case "formatStrikeThrough":
    case "formatStrikethrough":
      return { type: "apply_inline_style", style: { strikethrough: true } };
    case "formatJustifyLeft":
      return {
        type: "apply_paragraph_style",
        action: { type: "align", align: "left" },
      };
    case "formatJustifyCenter":
      return {
        type: "apply_paragraph_style",
        action: { type: "align", align: "center" },
      };
    case "formatJustifyRight":
      return {
        type: "apply_paragraph_style",
        action: { type: "align", align: "right" },
      };
    case "formatJustifyFull":
      return {
        type: "apply_paragraph_style",
        action: { type: "align", align: "justify" },
      };
    case "formatIndent":
      return {
        type: "apply_paragraph_style",
        action: { type: "indent", delta: 1 },
      };
    case "formatOutdent":
      return {
        type: "apply_paragraph_style",
        action: { type: "indent", delta: -1 },
      };
    case "formatBlock": {
      const normalized = data?.replace(/[<>]/g, "").trim();
      if (!normalized) return null;
      return {
        type: "apply_paragraph_style",
        action: { type: "block", block: normalized },
      };
    }
    default:
      return null;
  }
}

export function docOpFromBeforeInput(event: InputEvent): DocOp | null {
  return docOpFromInputType(event.inputType, event.data);
}
