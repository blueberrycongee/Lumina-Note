import { describe, expect, it } from "vitest";
import {
  VSCODE_AI_EXTENSIONS_PLUGIN_ID,
  isVscodeAiExtensionsPluginEnabled,
} from "./systemPlugin";
import type { PluginInfo } from "@/types/plugins";

const plugin: PluginInfo = {
  id: VSCODE_AI_EXTENSIONS_PLUGIN_ID,
  name: "VS Code AI Extensions",
  version: "0.1.0",
  entry: "index.js",
  permissions: ["workspace:panel"],
  enabled_by_default: false,
  source: "builtin",
  root_path: "/plugins",
  entry_path: "/plugins/vscode-ai-extensions/index.js",
};

describe("VS Code AI extensions system plugin", () => {
  it("stays disabled by default", () => {
    expect(
      isVscodeAiExtensionsPluginEnabled({
        plugins: [plugin],
        enabledById: {},
      }),
    ).toBe(false);
  });

  it("uses the persisted plugin toggle when present", () => {
    expect(
      isVscodeAiExtensionsPluginEnabled({
        plugins: [plugin],
        enabledById: { [VSCODE_AI_EXTENSIONS_PLUGIN_ID]: true },
      }),
    ).toBe(true);
  });
});
