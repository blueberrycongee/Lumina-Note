import type { DocxBlock, DocxImageBlock, DocxListBlock, DocxRun, DocxTableBlock } from "./docxImport";
import type { TypesettingIrBlock, TypesettingIrDocument, TypesettingIrInline } from "./irSchema";

const EMU_PER_INCH = 914400;
const PT_PER_INCH = 72;

const buildIdGenerator = () => {
  let index = 0;
  return (prefix: string) => `${prefix}_${(index += 1)}`;
};

const emuToPt = (emu: number): number => (emu / EMU_PER_INCH) * PT_PER_INCH;

const runToInline = (run: DocxRun, id: (prefix: string) => string): TypesettingIrInline => {
  const marks: Array<"bold" | "italic" | "underline" | "strike" | "code"> = [];
  if (run.style?.bold) marks.push("bold");
  if (run.style?.italic) marks.push("italic");
  if (run.style?.underline) marks.push("underline");
  if (run.style?.strikethrough) marks.push("strike");

  return {
    id: id("t"),
    type: "text",
    text: run.text ?? "",
    marks: marks.length ? marks : undefined,
  };
};

const runsToParagraph = (runs: DocxRun[], id: (prefix: string) => string): TypesettingIrBlock => ({
  id: id("p"),
  type: "paragraph",
  children: runs.map((run) => runToInline(run, id)),
});

const docxListToIr = (block: DocxListBlock, id: (prefix: string) => string): TypesettingIrBlock => ({
  id: id("list"),
  type: "list",
  ordered: block.ordered,
  items: block.items.map((item) => ({
    id: id("li"),
    type: "listItem",
    blocks: [runsToParagraph(item.runs, id)],
  })),
});

const docxTableToIr = (block: DocxTableBlock, id: (prefix: string) => string): TypesettingIrBlock => ({
  id: id("table"),
  type: "table",
  rows: block.rows.map((row) => ({
    id: id("row"),
    type: "tableRow",
    cells: row.cells.map((cell) => ({
      id: id("cell"),
      type: "tableCell",
      blocks: docxBlocksToIrBlocks(cell.blocks, id),
    })),
  })),
});

const docxImageToIr = (block: DocxImageBlock, id: (prefix: string) => string): TypesettingIrBlock => {
  const width = block.widthEmu ? `${emuToPt(block.widthEmu).toFixed(2)}pt` : undefined;
  const height = block.heightEmu ? `${emuToPt(block.heightEmu).toFixed(2)}pt` : undefined;
  return {
    id: id("img"),
    type: "image",
    embedId: block.embedId,
    alt: block.description,
    width,
    height,
  };
};

export const docxBlocksToIrBlocks = (
  blocks: DocxBlock[],
  id: (prefix: string) => string,
): TypesettingIrBlock[] => blocks.map((block) => {
  switch (block.type) {
    case "paragraph":
      return runsToParagraph(block.runs, id);
    case "heading":
      return {
        id: id("h"),
        type: "heading",
        level: Math.max(1, Math.min(6, block.level)),
        children: block.runs.map((run) => runToInline(run, id)),
      };
    case "list":
      return docxListToIr(block, id);
    case "table":
      return docxTableToIr(block, id);
    case "image":
      return docxImageToIr(block, id);
    default:
      return {
        id: id("p"),
        type: "paragraph",
        children: [{ id: id("t"), type: "text", text: "" }],
      };
  }
});

export const buildIrDocumentFromDocx = (
  blocks: DocxBlock[],
  headerBlocks: DocxBlock[] = [],
  footerBlocks: DocxBlock[] = [],
): TypesettingIrDocument => {
  const id = buildIdGenerator();
  return {
    version: 1,
    id: id("doc"),
    blocks: docxBlocksToIrBlocks(blocks, id),
    headers: headerBlocks.length ? docxBlocksToIrBlocks(headerBlocks, id) : undefined,
    footers: footerBlocks.length ? docxBlocksToIrBlocks(footerBlocks, id) : undefined,
  };
};
