import { describe, expect, it } from "vitest";
import { getDiagramAttachmentFilePaths, isDiagramFilePath } from "./diagramAttachmentUtils";

describe("diagramAttachmentUtils", () => {
  it("detects supported diagram suffixes", () => {
    expect(isDiagramFilePath("/vault/flow.excalidraw.json")).toBe(true);
    expect(isDiagramFilePath("/vault/flow.diagram.json")).toBe(true);
    expect(isDiagramFilePath("/vault/flow.drawio.json")).toBe(true);
    expect(isDiagramFilePath("/vault/note.md")).toBe(false);
  });

  it("extracts and deduplicates diagram paths from attachments", () => {
    const result = getDiagramAttachmentFilePaths([
      { type: "file", name: "flow.excalidraw.json", path: "/vault/flow.excalidraw.json" },
      { type: "file", name: "note.md", path: "/vault/note.md" },
      {
        type: "quote",
        text: "[diagram]",
        source: "flow.excalidraw.json",
        sourcePath: "/vault/flow.excalidraw.json",
        summary: "diagram",
        range: { kind: "diagram", elementCount: 3 },
      },
      {
        type: "quote",
        text: "[diagram]",
        source: "new",
        sourcePath: "/vault/new.diagram.json",
        summary: "diagram",
      },
    ]);

    expect(result).toEqual([
      "/vault/flow.excalidraw.json",
      "/vault/new.diagram.json",
    ]);
  });
});
