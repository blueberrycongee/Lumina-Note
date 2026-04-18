import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry } from "@/lib/host";
import { loadPublishedNotes } from "./notes";

const readFileMock = vi.fn();

vi.mock("@/lib/host", () => ({
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

  it("skips unreadable notes and malformed frontmatter", async () => {
    const files = ['/vault/broken.md', '/vault/malformed.md', '/vault/public.md'];
    readFileMock.mockImplementation((path: string) => {
      if (path === '/vault/broken.md') {
        return Promise.reject(new Error('disk failed'));
      }
      if (path === '/vault/malformed.md') {
        return Promise.resolve(`---
title: [unterminated
visibility: public
---

# Broken`);
      }
      return Promise.resolve(`---
visibility: public
slug: ok
---

# Public`);
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const notes = await loadPublishedNotes(makeFileTree(files));

    expect(notes).toHaveLength(1);
    expect(notes[0]?.path).toBe('/vault/public.md');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
