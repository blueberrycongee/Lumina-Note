import { describe, it, expect } from "vitest";
import { buildAssetOutputName, extractAssetLinks, isExternalUrl, resolveAssetSourcePath, rewriteMarkdownAssetLinks } from "./assets";

describe("isExternalUrl", () => {
  it("detects external schemes", () => {
    expect(isExternalUrl("https://example.com/image.png")).toBe(true);
    expect(isExternalUrl("data:image/png;base64,AAA")).toBe(true);
    expect(isExternalUrl("blob:https://example.com/123")).toBe(true);
  });

  it("treats relative paths as local", () => {
    expect(isExternalUrl("./images/pic.png")).toBe(false);
    expect(isExternalUrl("../images/pic.png")).toBe(false);
  });
});

describe("extractAssetLinks", () => {
  it("finds markdown, wiki, and html image links", () => {
    const markdown = `
![Alt](./images/pic.png "Title")
![[assets/logo.svg|200]]
<img src="../images/inline.jpg" alt="Inline" />
![Remote](https://example.com/remote.png)
`;

    expect(extractAssetLinks(markdown)).toEqual([
      "./images/pic.png",
      "assets/logo.svg",
      "../images/inline.jpg",
      "https://example.com/remote.png",
    ]);
  });
});

describe("rewriteMarkdownAssetLinks", () => {
  it("rewrites local asset paths and preserves titles/aliases", () => {
    const markdown = `
![Alt](./images/pic.png "Title")
![[assets/logo.svg|200]]
<img src="../images/inline.jpg" alt="Inline" />
![Remote](https://example.com/remote.png)
`;

    const output = rewriteMarkdownAssetLinks(markdown, (url) => {
      if (isExternalUrl(url)) return null;
      return `/assets/${url.replace(/^\.\//, "")}`;
    });

    expect(output).toContain("![Alt](/assets/images/pic.png \"Title\")");
    expect(output).toContain("![[/assets/assets/logo.svg|200]]");
    expect(output).toContain("<img src=\"/assets/../images/inline.jpg\"");
    expect(output).toContain("![Remote](https://example.com/remote.png)");
  });
});

describe("resolveAssetSourcePath", () => {
  it("resolves relative asset paths against the note directory", () => {
    const result = resolveAssetSourcePath(\"/vault/notes/note.md\", \"../images/pic.png?raw=1#hash\");

    expect(result?.sourcePath).toBe(\"/vault/images/pic.png\");
    expect(result?.suffix).toBe(\"?raw=1#hash\");
  });
});

describe("buildAssetOutputName", () => {
  it(\"creates a stable hashed asset filename\", () => {
    const name = buildAssetOutputName(\"/vault/images/My Logo.png\");

    expect(name.startsWith(\"my-logo-\")).toBe(true);
    expect(name.endsWith(\".png\")).toBe(true);
  });
});
