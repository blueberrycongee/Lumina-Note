import { describe, expect, it } from "vitest";
import { pluginStyleRuntime } from "@/services/plugins/styleRuntime";

describe("plugin style runtime", () => {
  it("orders style layers", () => {
    const cleanA = pluginStyleRuntime.registerStyle("a", { css: ".x{color:red}", layer: "override" });
    const cleanB = pluginStyleRuntime.registerStyle("b", { css: ".x{color:blue}", layer: "base" });

    const entries = pluginStyleRuntime.listEntries();
    expect(entries[0]?.layer).toBe("base");
    expect(entries[entries.length - 1]?.layer).toBe("override");

    cleanA();
    cleanB();
  });

  it("detects selector conflicts", () => {
    const cleanA = pluginStyleRuntime.registerStyle("a", { css: ".same{color:red}" });
    const cleanB = pluginStyleRuntime.registerStyle("b", { css: ".same{color:blue}" });

    const conflicts = pluginStyleRuntime.listConflicts();
    expect(conflicts.some((item) => item.selector.includes(".same"))).toBe(true);

    cleanA();
    cleanB();
  });
});
