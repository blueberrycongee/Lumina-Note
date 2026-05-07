import { describe, expect, it } from "vitest";

import type { FileEntry } from "@/lib/host";

import {
  LARGE_IMAGE_THRESHOLD_BYTES,
  buildImageLibraryIndex,
  buildRelativeAssetReference,
  isImagePath,
  planAssetReferenceUpdates,
} from "./imageManager";

const makeFile = (
  path: string,
  overrides?: Partial<FileEntry>,
): FileEntry => ({
  name: path.split("/").pop() || path,
  path,
  is_dir: false,
  size: null,
  modified_at: null,
  created_at: null,
  children: null,
  ...overrides,
});

const makeDir = (path: string, children: FileEntry[]): FileEntry => ({
  name: path.split("/").pop() || path,
  path,
  is_dir: true,
  size: null,
  modified_at: null,
  created_at: null,
  children,
});

describe("isImagePath", () => {
  it("recognizes common image extensions", () => {
    expect(isImagePath("/vault/image.png")).toBe(true);
    expect(isImagePath("/vault/image.SVG")).toBe(true);
    expect(isImagePath("/vault/note.md")).toBe(false);
  });
});

describe("buildImageLibraryIndex", () => {
  it("indexes image metadata and note relationships across markdown, wiki, and html refs", async () => {
    const now = new Date("2026-03-11T09:00:00.000Z").getTime();
    const fileTree = [
      makeDir("/vault/notes", [
        makeFile("/vault/notes/alpha.md"),
        makeFile("/vault/notes/beta.md"),
      ]),
      makeDir("/vault/assets", [
        makeFile("/vault/assets/hero.png", {
          size: 1234,
          modified_at: now - 1000,
          created_at: now - 5000,
        }),
        makeFile("/vault/assets/orphan.webp", {
          size: LARGE_IMAGE_THRESHOLD_BYTES + 1,
          modified_at: now - 10 * 24 * 60 * 60 * 1000,
          created_at: now - 11 * 24 * 60 * 60 * 1000,
        }),
      ]),
    ];
    const contents = new Map<string, string>([
      [
        "/vault/notes/alpha.md",
        [
          "![Hero](../assets/hero.png)",
          "![[../assets/hero.png|320]]",
          '<img src="../assets/hero.png?raw=1" alt="Hero" />',
        ].join("\n"),
      ],
      ["/vault/notes/beta.md", "Nothing here"],
    ]);

    const index = await buildImageLibraryIndex(
      fileTree,
      "/vault",
      async (path) => contents.get(path) ?? "",
      { now },
    );

    expect(index.summary).toEqual({
      totalImages: 2,
      referencedImages: 1,
      orphanImages: 1,
      multiReferencedImages: 1,
      recentImages: 1,
      largeImages: 1,
      totalBytes: LARGE_IMAGE_THRESHOLD_BYTES + 1 + 1234,
    });

    const hero = index.images.find((image) => image.path === "/vault/assets/hero.png");
    expect(hero).toMatchObject({
      relativePath: "assets/hero.png",
      folderRelativePath: "assets",
      referenceCount: 3,
      orphan: false,
      multiReferenced: true,
      recent: true,
      large: false,
    });
    expect(hero?.referencedBy).toEqual([
      {
        notePath: "/vault/notes/alpha.md",
        noteName: "alpha",
        noteRelativePath: "notes/alpha.md",
        occurrenceCount: 3,
      },
    ]);

    const orphan = index.images.find((image) => image.path === "/vault/assets/orphan.webp");
    expect(orphan).toMatchObject({
      referenceCount: 0,
      orphan: true,
      multiReferenced: false,
      recent: false,
      large: true,
    });
  });

  it("populates size/mtime/ctime from statImage when entry fields are null (post-walker-rewrite path)", async () => {
    const now = new Date("2026-03-11T09:00:00.000Z").getTime();
    // Mirrors what the new walker actually produces: stat fields all null.
    const fileTree = [
      makeDir("/vault/assets", [
        makeFile("/vault/assets/recent.png"), // size/mtime/ctime null
        makeFile("/vault/assets/big.png"), // size/mtime/ctime null
      ]),
    ];

    const stats = new Map<string, { sizeBytes: number; modifiedAt: number; createdAt: number }>([
      [
        "/vault/assets/recent.png",
        { sizeBytes: 8000, modifiedAt: now - 1000, createdAt: now - 2000 },
      ],
      [
        "/vault/assets/big.png",
        {
          sizeBytes: LARGE_IMAGE_THRESHOLD_BYTES + 1,
          modifiedAt: now - 30 * 24 * 60 * 60 * 1000,
          createdAt: now - 31 * 24 * 60 * 60 * 1000,
        },
      ],
    ]);

    const statCalls: string[] = [];
    const index = await buildImageLibraryIndex(
      fileTree,
      "/vault",
      async () => "",
      {
        now,
        statImage: async (path) => {
          statCalls.push(path);
          return stats.get(path) ?? null;
        },
      },
    );

    // statImage should be called once per image, not once per file
    expect(statCalls.sort()).toEqual([
      "/vault/assets/big.png",
      "/vault/assets/recent.png",
    ]);

    const recent = index.images.find((i) => i.path === "/vault/assets/recent.png");
    expect(recent?.sizeBytes).toBe(8000);
    expect(recent?.modifiedAt).toBe(now - 1000);
    expect(recent?.recent).toBe(true);
    expect(recent?.large).toBe(false);

    const big = index.images.find((i) => i.path === "/vault/assets/big.png");
    expect(big?.large).toBe(true);
    expect(big?.recent).toBe(false);

    expect(index.summary.totalBytes).toBe(8000 + LARGE_IMAGE_THRESHOLD_BYTES + 1);
    expect(index.summary.recentImages).toBe(1);
    expect(index.summary.largeImages).toBe(1);
  });

  it("falls back to entry stat fields when no statImage fetcher is provided", async () => {
    // This is what the existing tests pre-rewrite implicitly relied on;
    // keep it green so any caller that already had stat-bearing entries
    // (eg. mocked tests) doesn't break.
    const now = new Date("2026-03-11T09:00:00.000Z").getTime();
    const fileTree = [
      makeDir("/vault/assets", [
        makeFile("/vault/assets/x.png", {
          size: 500,
          modified_at: now - 1000,
          created_at: now - 2000,
        }),
      ]),
    ];
    const index = await buildImageLibraryIndex(
      fileTree,
      "/vault",
      async () => "",
      { now },
    );
    expect(index.images[0].sizeBytes).toBe(500);
    expect(index.images[0].modifiedAt).toBe(now - 1000);
  });
});

describe("buildRelativeAssetReference", () => {
  it("builds note-relative asset paths", () => {
    expect(buildRelativeAssetReference("/vault/notes/alpha.md", "/vault/assets/hero.png")).toBe(
      "../assets/hero.png",
    );
    expect(
      buildRelativeAssetReference("/vault/notes/alpha.md", "/vault/notes/images/hero.png", "?raw=1"),
    ).toBe("images/hero.png?raw=1");
  });
});

describe("planAssetReferenceUpdates", () => {
  it("rewrites every supported asset syntax when an image path changes", () => {
    const updates = planAssetReferenceUpdates(
      [
        {
          path: "/vault/notes/alpha.md",
          content: [
            "![Hero](../assets/hero.png)",
            "![[../assets/hero.png|320]]",
            '<img src="../assets/hero.png?raw=1" alt="Hero" />',
          ].join("\n"),
        },
        {
          path: "/vault/notes/beta.md",
          content: "No matching refs",
        },
      ],
      [{ from: "/vault/assets/hero.png", to: "/vault/media/renamed-hero.png" }],
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      notePath: "/vault/notes/alpha.md",
      changes: [
        {
          from: "/vault/assets/hero.png",
          to: "/vault/media/renamed-hero.png",
          occurrenceCount: 3,
        },
      ],
    });
    expect(updates[0].updatedContent).toContain("![Hero](../media/renamed-hero.png)");
    expect(updates[0].updatedContent).toContain("![[../media/renamed-hero.png|320]]");
    expect(updates[0].updatedContent).toContain('<img src="../media/renamed-hero.png?raw=1"');
  });
});
