import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry } from "@/lib/tauri";
import { loadPublishedNotes } from "./notes";

const readFileMock = vi.fn();

vi.mock("@/lib/tauri", () => ({
  readFile: (path: string) => readFileMock(path),
}));

const makeFileTree = (paths: string[]): FileEntry[] =>
  paths.map((path) => ({
    name: path.split("/").pop() || path,
    path,
    is_dir: false,
    children: null,
  }));

describe("loadPublishedNotes", () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  it("filters by visibility and reads slug from frontmatter", async () => {
    const files = ["/vault/public.md", "/vault/private.md", "/vault/published.md"];
    const contentMap: Record<string, string> = {
      "/vault/public.md": `---
visibility: public
slug: my-post
---

# Public
`,
      "/vault/private.md": `---
visibility: private
---

# Private
`,
      "/vault/published.md": `---
published: true
---

# Published
`,
    };

    readFileMock.mockImplementation((path: string) => Promise.resolve(contentMap[path]));

    const notes = await loadPublishedNotes(makeFileTree(files));
    const paths = notes.map((note) => note.path).sort();

    expect(paths).toEqual(["/vault/public.md", "/vault/published.md"].sort());
    const publicNote = notes.find((note) => note.path === "/vault/public.md");
    expect(publicNote?.slug).toBe("my-post");
  });
});
