import { describe, expect, it } from "vitest";
import { computeStringDiff } from "./diff";

describe("computeStringDiff", () => {
  it("returns null for identical strings", () => {
    expect(computeStringDiff("hello", "hello")).toBeNull();
  });

  it("handles insert in the middle", () => {
    expect(computeStringDiff("helo", "hello")).toEqual({
      from: 3,
      to: 3,
      insert: "l",
    });
  });

  it("handles delete from the middle", () => {
    expect(computeStringDiff("hello", "helo")).toEqual({
      from: 3,
      to: 4,
      insert: "",
    });
  });

  it("handles replace range", () => {
    expect(computeStringDiff("hello world", "hello there")).toEqual({
      from: 6,
      to: 11,
      insert: "there",
    });
  });

  it("handles append to the end", () => {
    expect(computeStringDiff("hello", "hello!")).toEqual({
      from: 5,
      to: 5,
      insert: "!",
    });
  });

  it("handles prepend to the start", () => {
    expect(computeStringDiff("hello", "hi hello")).toEqual({
      from: 1,
      to: 1,
      insert: "i h",
    });
  });

  it("handles delete entire content", () => {
    expect(computeStringDiff("hello", "")).toEqual({
      from: 0,
      to: 5,
      insert: "",
    });
  });

  it("handles empty to non-empty", () => {
    expect(computeStringDiff("", "hello")).toEqual({
      from: 0,
      to: 0,
      insert: "hello",
    });
  });
});
