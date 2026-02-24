import { describe, expect, it } from "vitest";
import { buildIrDocumentFromDocx, docxBlocksToIrBlocks } from "./docxToIr";
import type { DocxBlock } from "./docxImport";

describe("docxToIr", () => {
  it("maps basic blocks into IR", () => {
    const blocks: DocxBlock[] = [
      {
        type: "paragraph",
        runs: [{ text: "Hello" }],
      },
      {
        type: "heading",
        level: 2,
        runs: [{ text: "Title", style: { bold: true } }],
      },
      {
        type: "list",
        ordered: false,
        items: [{ runs: [{ text: "Item" }] }],
      },
      {
        type: "table",
        rows: [
          { cells: [{ blocks: [{ type: "paragraph", runs: [{ text: "Cell" }] }] }] },
        ],
      },
      {
        type: "image",
        embedId: "rId1",
        description: "Logo",
        widthEmu: 914400,
        heightEmu: 457200,
      },
    ];

    const irBlocks = docxBlocksToIrBlocks(blocks, ((() => {
      let i = 0;
      return (prefix: string) => `${prefix}_${++i}`;
    })()));

    const blockTypes = irBlocks as Array<{ type: string }>;
    expect(blockTypes[0].type).toBe("paragraph");
    expect(blockTypes[1].type).toBe("heading");
    expect(blockTypes[2].type).toBe("list");
    expect(blockTypes[3].type).toBe("table");
    expect(blockTypes[4].type).toBe("image");
  });

  it("builds an IR document wrapper", () => {
    const blocks: DocxBlock[] = [{ type: "paragraph", runs: [{ text: "Body" }] }];
    const ir = buildIrDocumentFromDocx(blocks);
    expect(ir.version).toBe(1);
    expect(ir.blocks).toHaveLength(1);
  });
});
