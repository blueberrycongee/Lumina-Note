import { describe, expect, it } from "vitest";
import type { NoteIndex } from "@/stores/useNoteIndexStore";

import { buildKnowledgeGraphData } from "./knowledgeGraphData";

function note(path: string, name: string, outgoingLinks: string[] = []): NoteIndex {
  return {
    path,
    name,
    outgoingLinks,
    tags: [],
    lastModified: 0,
  };
}

describe("buildKnowledgeGraphData", () => {
  it("builds graph nodes and links from the note index instead of sidebar tree state", () => {
    const data = buildKnowledgeGraphData(
      [
        note("/vault/root.md", "root", ["nested"]),
        note("/vault/folder/nested.md", "nested"),
      ],
      { vaultPath: "/vault" },
    );

    expect(data.nodes.some((node) => node.id === "/vault/root.md")).toBe(true);
    expect(data.nodes.some((node) => node.id === "/vault/folder/nested.md")).toBe(true);
    expect(data.nodes.some((node) => node.id === "folder:/vault/folder")).toBe(true);
    expect(data.edges).toContainEqual({
      source: "/vault/root.md",
      target: "/vault/folder/nested.md",
      type: "link",
    });
  });

  it("caps displayed note nodes and reports hidden notes for large graphs", () => {
    const data = buildKnowledgeGraphData(
      [
        note("/vault/a.md", "a", ["b"]),
        note("/vault/b.md", "b", ["c"]),
        note("/vault/c.md", "c"),
      ],
      { vaultPath: "/vault", currentFile: "/vault/c.md", noteLimit: 2 },
    );

    const noteNodes = data.nodes.filter((node) => !node.isFolder);
    expect(noteNodes).toHaveLength(2);
    expect(noteNodes.some((node) => node.id === "/vault/c.md")).toBe(true);
    expect(data.status).toEqual({
      totalNotes: 3,
      displayedNotes: 2,
      hiddenNotes: 1,
      cappedByDisplayLimit: true,
    });
  });
});
