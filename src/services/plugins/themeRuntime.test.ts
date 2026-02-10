import { describe, expect, it } from "vitest";
import { pluginThemeRuntime } from "@/services/plugins/themeRuntime";

describe("plugin theme runtime", () => {
  it("applies and resets token overrides", () => {
    const root = document.documentElement;
    root.style.removeProperty("--lumina-test");

    const cleanup = pluginThemeRuntime.setToken("test-plugin", "--lumina-test", "100 10% 10%", "light");
    expect(root.style.getPropertyValue("--lumina-test").trim()).toBe("100 10% 10%");

    cleanup();
    expect(root.style.getPropertyValue("--lumina-test").trim()).toBe("");
  });

  it("registers and applies preset", () => {
    const root = document.documentElement;
    root.style.removeProperty("--lumina-preset");

    const dispose = pluginThemeRuntime.registerPreset("test-plugin", {
      id: "preset-a",
      tokens: { "--lumina-preset": "210 20% 30%" },
    });
    pluginThemeRuntime.applyPreset("test-plugin", "preset-a");

    expect(root.style.getPropertyValue("--lumina-preset").trim()).toBe("210 20% 30%");

    pluginThemeRuntime.clearPlugin("test-plugin");
    dispose();
  });

  it("reapplies overrides after host theme writes root vars", () => {
    const root = document.documentElement;
    root.style.removeProperty("--lumina-reapply");

    const cleanup = pluginThemeRuntime.setToken(
      "test-plugin",
      "--lumina-reapply",
      "111 11% 11%",
      "light",
    );
    expect(root.style.getPropertyValue("--lumina-reapply").trim()).toBe("111 11% 11%");

    root.style.setProperty("--lumina-reapply", "10 10% 10%");
    expect(root.style.getPropertyValue("--lumina-reapply").trim()).toBe("10 10% 10%");

    pluginThemeRuntime.reapply();
    expect(root.style.getPropertyValue("--lumina-reapply").trim()).toBe("111 11% 11%");

    cleanup();
  });
});
