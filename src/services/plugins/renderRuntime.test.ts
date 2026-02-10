import { describe, expect, it } from "vitest";
import { pluginRenderRuntime } from "@/services/plugins/renderRuntime";

describe("plugin render runtime", () => {
  it("applies markdown post processor", () => {
    const cleanup = pluginRenderRuntime.registerMarkdownPostProcessor("p1", "mark", (html) =>
      html.replace("<p>", '<p data-mark="1">'),
    );

    const out = pluginRenderRuntime.apply("<p>hello</p>");
    expect(out).toContain('data-mark="1"');

    cleanup();
    pluginRenderRuntime.clearPlugin("p1");
  });

  it("applies code block renderer by language", () => {
    const cleanup = pluginRenderRuntime.registerCodeBlockRenderer("p1", {
      id: "js",
      language: "js",
      render: ({ code }) => `<div class=\"js\">${code}</div>`,
    });

    const out = pluginRenderRuntime.apply('<pre><code class="language-js">const a=1;</code></pre>');
    expect(out).toContain('class="js"');

    cleanup();
    pluginRenderRuntime.clearPlugin("p1");
  });
});
