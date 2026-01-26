import {
  buildFallbackFontCandidates,
  buildFamilyFontCandidates,
  fontDirsForOs,
  joinFontPath,
  osKindFromPlatform,
} from "@/typesetting/fontPaths";

describe("fontPaths", () => {
  it("maps platform strings to OsKind", () => {
    expect(osKindFromPlatform("macos")).toBe("macos");
    expect(osKindFromPlatform("darwin")).toBe("macos");
    expect(osKindFromPlatform("windows")).toBe("windows");
    expect(osKindFromPlatform("win32")).toBe("windows");
    expect(osKindFromPlatform("linux")).toBe("linux");
    expect(osKindFromPlatform("unknown")).toBe("unknown");
  });

  it("expands mac font dirs with home", () => {
    expect(fontDirsForOs("macos", "/Users/test")).toEqual([
      "/System/Library/Fonts",
      "/Library/Fonts",
      "/Users/test/Library/Fonts",
    ]);
  });

  it("builds family candidates for mac fonts", () => {
    const candidates = buildFamilyFontCandidates("宋体", "macos", "/Users/test");
    expect(candidates).toEqual([
      "/System/Library/Fonts/simsun.ttc",
      "/System/Library/Fonts/Songti.ttc",
      "/System/Library/Fonts/PingFang.ttc",
      "/Library/Fonts/simsun.ttc",
      "/Library/Fonts/Songti.ttc",
      "/Library/Fonts/PingFang.ttc",
      "/Users/test/Library/Fonts/simsun.ttc",
      "/Users/test/Library/Fonts/Songti.ttc",
      "/Users/test/Library/Fonts/PingFang.ttc",
    ]);
  });

  it("builds fallback candidates for windows", () => {
    const candidates = buildFallbackFontCandidates("windows");
    expect(candidates[0]).toBe("C:\\Windows\\Fonts\\simsun.ttc");
    expect(candidates).toContain("C:\\Windows\\Fonts\\calibri.ttf");
  });

  it("joins paths with platform separators", () => {
    expect(joinFontPath("C:\\Windows\\Fonts", "arial.ttf")).toBe(
      "C:\\Windows\\Fonts\\arial.ttf",
    );
    expect(joinFontPath("/Library/Fonts", "Arial.ttf")).toBe(
      "/Library/Fonts/Arial.ttf",
    );
  });
});

