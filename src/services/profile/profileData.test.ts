import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FileEntry } from "@/lib/tauri";
import type { ProfileConfig } from "@/types/profile";
import { buildProfileData } from "./profileData";

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

const baseProfile: ProfileConfig = {
  id: "profile-1",
  displayName: "Tester",
  bio: "bio",
  avatarUrl: "",
  links: [],
  pinnedNotePaths: [],
};

describe("buildProfileData", () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  it("filters notes by visibility/published flags", async () => {
    const files = [
      "/vault/public-1.md",
      "/vault/private-1.md",
      "/vault/published-1.md",
      "/vault/public-flag.md",
    ];

    const contentMap: Record<string, string> = {
      "/vault/public-1.md": `---
visibility: public
tags: [alpha]
---

# Public One
`,
      "/vault/private-1.md": `---
visibility: private
tags: [beta]
---

# Private One
`,
      "/vault/published-1.md": `---
published: true
tags: [gamma]
---

# Published One
`,
      "/vault/public-flag.md": `---
public: true
tags: [alpha]
---

# Public Flag
`,
    };

    readFileMock.mockImplementation((path: string) => {
      const content = contentMap[path];
      if (!content) {
        throw new Error(`Missing mock for ${path}`);
      }
      return Promise.resolve(content);
    });

    const data = await buildProfileData(makeFileTree(files), {
      ...baseProfile,
      pinnedNotePaths: ["/vault/public-1.md", "/vault/private-1.md"],
    });

    expect(data.pinned.map((note) => note.path)).toEqual(["/vault/public-1.md"]);
    expect(data.recent.map((note) => note.path).sort()).toEqual(
      ["/vault/published-1.md", "/vault/public-flag.md"].sort()
    );
    const alphaTag = data.tags.find((tag) => tag.tag === "alpha");
    expect(alphaTag?.count).toBe(2);
    const betaTag = data.tags.find((tag) => tag.tag === "beta");
    expect(betaTag).toBeUndefined();
  });

  it("orders recent by profileOrder first, then publishAt", async () => {
    const files = ["/vault/a.md", "/vault/b.md", "/vault/c.md"];
    const contentMap: Record<string, string> = {
      "/vault/a.md": `---
visibility: public
profileOrder: 2
publishAt: 2024-01-10
---

# A
`,
      "/vault/b.md": `---
visibility: public
profileOrder: 1
publishAt: 2024-02-10
---

# B
`,
      "/vault/c.md": `---
visibility: public
publishAt: 2024-03-01
---

# C
`,
    };

    readFileMock.mockImplementation((path: string) => Promise.resolve(contentMap[path]));

    const data = await buildProfileData(makeFileTree(files), baseProfile);

    expect(data.recent.map((note) => note.path)).toEqual([
      "/vault/b.md",
      "/vault/a.md",
      "/vault/c.md",
    ]);
  });

  it("orders recent by publishAt when profileOrder is missing", async () => {
    const files = ["/vault/a.md", "/vault/b.md", "/vault/c.md"];
    const contentMap: Record<string, string> = {
      "/vault/a.md": `---
visibility: public
publishAt: 2024-01-10
---

# A
`,
      "/vault/b.md": `---
visibility: public
publishAt: 2024-03-10
---

# B
`,
      "/vault/c.md": `---
visibility: public
publishAt: 2024-02-01
---

# C
`,
    };

    readFileMock.mockImplementation((path: string) => Promise.resolve(contentMap[path]));

    const data = await buildProfileData(makeFileTree(files), baseProfile);

    expect(data.recent.map((note) => note.path)).toEqual([
      "/vault/b.md",
      "/vault/c.md",
      "/vault/a.md",
    ]);
  });
});
