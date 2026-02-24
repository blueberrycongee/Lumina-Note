import { describe, it, expect } from "vitest";
import { createStableSlug, ensureUniqueSlug, slugify } from "./slug";

describe("slugify", () => {
  it("normalizes whitespace and punctuation", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
  });

  it("converts underscores and multiple spaces to single dashes", () => {
    expect(slugify("My__Note   Title")).toBe("my-note-title");
  });

  it("strips diacritics", () => {
    expect(slugify("Café Au Lait")).toBe("cafe-au-lait");
  });
});

describe("createStableSlug", () => {
  it("returns a stable fallback when slugify is empty", () => {
    const slugA = createStableSlug("中文标题", "/vault/中文标题.md");
    const slugB = createStableSlug("中文标题", "/vault/中文标题.md");

    expect(slugA).toBe(slugB);
    expect(slugA.startsWith("note-")).toBe(true);
  });

  it("prefers sanitized input when possible", () => {
    expect(createStableSlug("Hello World", "/vault/hello.md")).toBe("hello-world");
  });
});

describe("ensureUniqueSlug", () => {
  it("appends numeric suffixes when needed", () => {
    const used = new Set(["hello", "hello-2"]);
    const next = ensureUniqueSlug("hello", used);

    expect(next).toBe("hello-3");
    expect(used.has("hello-3")).toBe(true);
  });
});
