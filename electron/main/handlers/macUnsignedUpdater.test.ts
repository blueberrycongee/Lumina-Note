import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getAppPath: () => "/Applications/Lumina Note.app/Contents/Resources/app.asar",
    getPath: () => "/tmp/lumina-note",
    getVersion: () => "1.4.2",
    on: vi.fn(),
    quit: vi.fn(),
  },
  net: {
    request: vi.fn(),
  },
}));

import {
  isNewerVersion,
  parseLatestMacYml,
  selectMacZipFile,
} from "./macUnsignedUpdater.js";

describe("parseLatestMacYml", () => {
  it("extracts version, release date, and ZIP metadata", () => {
    const result = parseLatestMacYml(`
version: 1.5.0
files:
  - url: Lumina Note-1.5.0-arm64-mac.zip
    sha512: arm-hash
    size: 120
  - url: Lumina Note-1.5.0-mac.zip
    sha512: x64-hash
    size: 100
path: Lumina Note-1.5.0-arm64-mac.zip
sha512: arm-hash
releaseDate: '2026-05-13T10:00:00.000Z'
`);

    expect(result).toEqual({
      version: "1.5.0",
      releaseDate: "2026-05-13T10:00:00.000Z",
      releaseNotes: null,
      files: [
        {
          url: "Lumina Note-1.5.0-arm64-mac.zip",
          sha512: "arm-hash",
          size: 120,
        },
        {
          url: "Lumina Note-1.5.0-mac.zip",
          sha512: "x64-hash",
          size: 100,
        },
      ],
    });
  });

  it("ignores malformed file entries", () => {
    const result = parseLatestMacYml(`
version: 1.5.0
files:
  - url: Lumina Note-1.5.0-arm64-mac.zip
    sha512: arm-hash
  - url: Lumina Note-1.5.0-mac.zip
    sha512: x64-hash
    size: 100
`);

    expect(result.files).toEqual([
      {
        url: "Lumina Note-1.5.0-mac.zip",
        sha512: "x64-hash",
        size: 100,
      },
    ]);
  });
});

describe("selectMacZipFile", () => {
  const files = [
    { url: "Lumina Note-1.5.0-arm64-mac.zip", sha512: "a", size: 10 },
    { url: "Lumina Note-1.5.0-mac.zip", sha512: "b", size: 20 },
  ];

  it("selects the arm64 ZIP for Apple Silicon", () => {
    expect(selectMacZipFile(files, "arm64")?.url).toBe(
      "Lumina Note-1.5.0-arm64-mac.zip",
    );
  });

  it("selects the non-arm64 ZIP for x64", () => {
    expect(selectMacZipFile(files, "x64")?.url).toBe(
      "Lumina Note-1.5.0-mac.zip",
    );
  });
});

describe("isNewerVersion", () => {
  it("compares semantic version segments numerically", () => {
    expect(isNewerVersion("1.4.10", "1.4.2")).toBe(true);
    expect(isNewerVersion("1.4.2", "1.4.2")).toBe(false);
    expect(isNewerVersion("1.3.9", "1.4.2")).toBe(false);
  });
});
