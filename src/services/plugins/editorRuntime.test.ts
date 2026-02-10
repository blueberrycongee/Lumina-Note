import { describe, expect, it } from "vitest";
import { pluginEditorRuntime } from "@/services/plugins/editorRuntime";

describe("plugin editor runtime", () => {
  it("reconfigures bound editor when extensions change", () => {
    const seen: number[] = [];
    const unbind = pluginEditorRuntime.bindReconfigure((extensions) => {
      seen.push(extensions.length);
    });
    const cleanup = pluginEditorRuntime.registerExtension("p1", {} as never);

    cleanup();
    unbind();

    expect(seen.some((value) => value >= 1)).toBe(true);
  });
});

