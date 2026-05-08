import { describe, expect, it } from "vitest";
import type { Backlink, NoteIndex } from "@/stores/useNoteIndexStore";

import { buildLocalGraphData } from "./localGraphData";

function note(path: string, name: string, outgoingLinks: string[] = []): NoteIndex {
  return {
    path,
    name,
    outgoingLinks,
    tags: [],
    lastModified: 0,
  };
}

function backlink(path: string, name: string): Backlink {
  return {
    path,
    name,
    context: "",
    line: 1,
  };
}

describe("buildLocalGraphData", () => {
  it("resolves outgoing links through the note index", () => {
    const data = buildLocalGraphData({
      currentFile: "/vault/root.md",
      currentContent: "[[nested]]",
      notes: [
        note("/vault/root.md", "root"),
        note("/vault/folder/nested.md", "nested"),
      ],
      backlinks: [],
    });

    expect(data.nodes.some((node) => node.id === "/vault/folder/nested.md")).toBe(true);
    expect(data.edges).toContainEqual({
      source: "/vault/root.md",
      target: "/vault/folder/nested.md",
    });
  });

  it("uses indexed backlinks even when the backlink note is nested", () => {
    const data = buildLocalGraphData({
      currentFile: "/vault/root.md",
      currentContent: "",
      notes: [note("/vault/root.md", "root")],
      backlinks: [backlink("/vault/folder/referrer.md", "referrer")],
    });

    expect(data.nodes).toContainEqual(
      expect.objectContaining({
        id: "/vault/folder/referrer.md",
        isBacklink: true,
      }),
    );
    expect(data.edges).toContainEqual({
      source: "/vault/folder/referrer.md",
      target: "/vault/root.md",
    });
  });

  it("caps dense local neighborhoods and reports hidden related notes", () => {
    const data = buildLocalGraphData({
      currentFile: "/vault/root.md",
      currentContent: "[[a]] [[b]] [[c]]",
      notes: [
        note("/vault/a.md", "a"),
        note("/vault/b.md", "b"),
        note("/vault/c.md", "c"),
      ],
      backlinks: [],
      relatedLimit: 2,
    });

    expect(data.nodes.filter((node) => !node.isCurrent)).toHaveLength(2);
    expect(data.status).toEqual({
      totalRelated: 3,
      displayedRelated: 2,
      hiddenRelated: 1,
      cappedByDisplayLimit: true,
    });
  });
});
