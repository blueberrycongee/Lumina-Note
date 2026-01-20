import { describe, expect, it } from "vitest";
import { sliceUtf8 } from "./utf8";

describe("sliceUtf8", () => {
  it("slices ASCII byte ranges", () => {
    expect(sliceUtf8("Header Text", 0, 6)).toBe("Header");
    expect(sliceUtf8("Header Text", 7, 11)).toBe("Text");
  });

  it("clamps out-of-range offsets", () => {
    expect(sliceUtf8("Hello", -10, 2)).toBe("He");
    expect(sliceUtf8("Hello", 0, 100)).toBe("Hello");
  });

  it("handles multibyte characters", () => {
    const text = "\u6c49\u5b57ABC";
    const hanziBytes = new TextEncoder().encode("\u6c49\u5b57").length;
    expect(sliceUtf8(text, 0, hanziBytes)).toBe("\u6c49\u5b57");
  });
});
