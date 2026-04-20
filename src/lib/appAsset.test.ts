import { describe, expect, it } from "vitest";

import { resolveRendererAssetUrl } from "./appAsset";

describe("resolveRendererAssetUrl", () => {
  it("resolves renderer assets relative to the packaged Electron index page", () => {
    expect(
      resolveRendererAssetUrl(
        "/lumina.png",
        "file:///Applications/Lumina%20Note.app/Contents/Resources/app.asar/out/renderer/index.html",
      ),
    ).toBe(
      "file:///Applications/Lumina%20Note.app/Contents/Resources/app.asar/out/renderer/lumina.png",
    );
  });

  it("keeps dev-server asset urls rooted at the current origin", () => {
    expect(resolveRendererAssetUrl("/lumina.png", "http://localhost:5174/")).toBe(
      "http://localhost:5174/lumina.png",
    );
  });
});
