import type { DocxBlock, DocxListBlock, DocxTableBlock } from "./docxImport";

export function docxBlocksToPlainText(blocks: DocxBlock[]): string {
  return blocks
    .map((block) => blockToText(block))
    .filter((value) => value !== null)
    .join("\n");
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
      return "[image]";
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
