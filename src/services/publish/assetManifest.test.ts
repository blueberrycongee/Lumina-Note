import { describe, it, expect } from "vitest";
import type { PublishNoteSource } from "./notes";
import { buildAssetManifest, createAssetUrlMapper } from "./assetManifest";

const makeNote = (path: string, content: string): PublishNoteSource => ({
  path,
  title: "Title",
  summary: "Summary",
  tags: [],
  content,
  frontmatter: {},
});

describe("buildAssetManifest", () => {
  it("deduplicates assets across notes and ignores external urls", () => {
    const notes = [
      makeNote("/vault/notes/note-a.md", "![A](../images/logo.png)"),
      makeNote("/vault/notes/sub/note-b.md", "![[../../images/logo.png]]\n![R](https://example.com/r.png)"),
    ];

    const manifest = buildAssetManifest(notes);

    expect(manifest.assets.length).toBe(1);
    expect(manifest.assets[0].sourcePath).toBe("/vault/images/logo.png");
    expect(manifest.assets[0].publicUrl.startsWith("/assets/")).toBe(true);

    const mapper = createAssetUrlMapper("/vault/notes/note-a.md", manifest);
    expect(mapper("../images/logo.png?raw=1")).toBe(`${manifest.assets[0].publicUrl}?raw=1`);
  });
});
