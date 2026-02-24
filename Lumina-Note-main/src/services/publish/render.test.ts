import { describe, it, expect } from "vitest";
import { renderPublishHtml } from "./render";

describe("renderPublishHtml", () => {
  it("rewrites local asset urls before rendering", () => {
    const html = renderPublishHtml("![Alt](./images/pic.png)", {
      mapAssetUrl: (url) => (url.startsWith("http") ? null : "/assets/pic.png"),
    });

    expect(html).toContain("src=\"/assets/pic.png\"");
  });
});
