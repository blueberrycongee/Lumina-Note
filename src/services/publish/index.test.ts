import { describe, it, expect } from "vitest";
import type { ProfileConfig } from "@/types/profile";
import { buildPublishIndexFromNotes } from "./index";

type PublishNoteInput = Parameters<typeof buildPublishIndexFromNotes>[0][number];

const baseProfile: ProfileConfig = {
  id: "profile-1",
  displayName: "Tester",
  bio: "bio",
  avatarUrl: "",
  links: [],
  pinnedNotePaths: [],
};

describe("buildPublishIndexFromNotes", () => {
  it("builds stable slugs, pinned order, and post urls", () => {
    const notes: PublishNoteInput[] = [
      {
        path: "/vault/Hello.md",
        title: "Hello World",
        summary: "Summary A",
        tags: ["Tag"],
        publishAt: "2024-01-01",
      },
      {
        path: "/vault/Hello-2.md",
        title: "Hello World",
        summary: "Summary B",
        tags: ["tag"],
        publishAt: "2024-02-01",
      },
    ];

    const index = buildPublishIndexFromNotes(notes, {
      ...baseProfile,
      pinnedNotePaths: ["/vault/Hello.md", "/vault/Hello-2.md"],
    });

    expect(index.posts.map((post) => post.slug)).toEqual(["hello-world", "hello-world-2"]);
    expect(index.pinned).toEqual(["hello-world-2", "hello-world"]);
    expect(index.posts[0].url).toBe("/posts/hello-world/");
  });

  it("respects custom slugs and aggregates tags", () => {
    const notes: PublishNoteInput[] = [
      {
        path: "/vault/Alpha.md",
        title: "Alpha",
        slug: "My Custom",
        summary: "Summary",
        tags: ["Alpha", "Beta"],
        publishAt: "2024-03-01",
      },
      {
        path: "/vault/Beta.md",
        title: "Beta",
        summary: "Summary",
        tags: ["beta"],
        publishAt: "2024-02-01",
      },
    ];

    const index = buildPublishIndexFromNotes(notes, baseProfile, { postsBasePath: "blog" });

    expect(index.posts[0].slug).toBe("my-custom");
    expect(index.posts[0].url).toBe("/blog/my-custom/");
    expect(index.tags).toEqual([
      { tag: "beta", count: 2 },
      { tag: "alpha", count: 1 },
    ]);
  });
});
