import { describe, it, expect } from "vitest";
import type { PublishNoteSource } from "./notes";
import type { ProfileConfig } from "@/types/profile";
import { buildPublishPlan } from "./plan";

const baseProfile: ProfileConfig = {
  id: "profile-1",
  displayName: "Ada",
  bio: "Bio",
  avatarUrl: "",
  links: [],
  pinnedNotePaths: [],
};

const makeNote = (path: string, content: string, overrides?: Partial<PublishNoteSource>): PublishNoteSource => ({
  path,
  title: overrides?.title ?? "Note",
  summary: overrides?.summary ?? "Summary",
  tags: overrides?.tags ?? [],
  content,
  frontmatter: overrides?.frontmatter ?? {},
  publishAt: overrides?.publishAt,
  slug: overrides?.slug,
});

describe("buildPublishPlan", () => {
  it("generates html, theme files, and data json", () => {
    const notes = [
      makeNote("/vault/Note A.md", "![Alt](./images/pic.png)", { title: "Hello" }),
    ];

    const plan = buildPublishPlan(notes, baseProfile, { generatedAt: "2026-01-27T00:00:00.000Z" });

    const paths = plan.files.map((file) => file.path).sort();
    expect(paths).toEqual([
      "data/site.json",
      "index.html",
      "posts/hello/index.html",
      "theme.css",
      "theme.json",
    ]);

    const postHtml = plan.files.find((file) => file.path === "posts/hello/index.html");
    expect(postHtml?.content).toContain("/assets/");

    const siteJson = plan.files.find((file) => file.path === "data/site.json");
    expect(siteJson?.content).toContain("\"profile\"" );
    expect(siteJson?.content).toContain("2026-01-27T00:00:00.000Z");
  });

  it("applies basePath to rendered urls", () => {
    const notes = [makeNote("/vault/Note A.md", "Hello", { title: "Hello" })];

    const plan = buildPublishPlan(notes, baseProfile, { basePath: "/repo" });
    const indexHtml = plan.files.find((file) => file.path === "index.html");
    const postHtml = plan.files.find((file) => file.path === "posts/hello/index.html");

    expect(indexHtml?.content).toContain("href=\"/repo/theme.css\"");
    expect(postHtml?.content).toContain("href=\"/repo/theme.css\"");
    expect(postHtml?.content).toContain("href=\"/repo/\"");
  });
});
