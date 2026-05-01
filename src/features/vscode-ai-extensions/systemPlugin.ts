import type { PluginInfo } from "@/types/plugins";

export const VSCODE_AI_EXTENSIONS_PLUGIN_ID = "vscode-ai-extensions";

export function isVscodeAiExtensionsPluginEnabled(input: {
  plugins: PluginInfo[];
  enabledById: Record<string, boolean>;
}): boolean {
  const plugin = input.plugins.find(
    (item) => item.id === VSCODE_AI_EXTENSIONS_PLUGIN_ID,
  );
  if (!plugin) {
    return input.enabledById[VSCODE_AI_EXTENSIONS_PLUGIN_ID] === true;
  }
  if (Object.prototype.hasOwnProperty.call(input.enabledById, plugin.id)) {
    return input.enabledById[plugin.id] === true;
  }
  return plugin.enabled_by_default;
}
