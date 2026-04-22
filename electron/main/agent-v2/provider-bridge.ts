// Translate Lumina's ProviderSettingsStore into the env vars opencode reads
// at startup (OPENCODE_CONFIG_CONTENT + OPENCODE_AUTH_CONTENT). Without this
// bridge the UI-configured key never reaches opencode — it only lives in the
// legacy Rust-agent path.
//
// Shape ref:
//   auth.json  — thirdparty/opencode/packages/opencode/src/auth/index.ts:59
//                process.env.OPENCODE_AUTH_CONTENT is parsed as the auth map.
//   config     — thirdparty/opencode/packages/opencode/src/config/config.ts:585
//                process.env.OPENCODE_CONFIG_CONTENT is merged as global config.

import type { ProviderSettingsStore } from "../agent/providers/settings-store.js";
import type { ProviderId } from "../agent/providers/registry.js";

const OPENCODE_CUSTOM_PROVIDER_ID = "lumina-compat";

// Lumina provider id → opencode provider id. Mainline providers use the
// same id as models.dev so opencode's registry picks up model metadata,
// pricing, context limits, etc.
const PROVIDER_ID_MAP: Partial<Record<ProviderId, string>> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  deepseek: "deepseek",
  groq: "groq",
  openrouter: "openrouter",
  ollama: "ollama",
  "openai-compatible": OPENCODE_CUSTOM_PROVIDER_ID,
};

type OpencodeBridge = {
  /** JSON for OPENCODE_CONFIG_CONTENT */
  config: string;
  /** JSON for OPENCODE_AUTH_CONTENT */
  auth: string;
  /** Human-friendly summary for logs */
  summary: string;
};

export async function buildOpencodeBridge(
  providerSettings: ProviderSettingsStore,
): Promise<OpencodeBridge | null> {
  const luminaId = providerSettings.getActiveProvider();
  if (!luminaId) {
    console.log("[opencode-bridge] skip: no active provider in settings");
    return null;
  }

  const opencodeId = PROVIDER_ID_MAP[luminaId];
  if (!opencodeId) {
    console.log(`[opencode-bridge] skip: provider '${luminaId}' has no opencode mapping`);
    return null;
  }

  const persisted = providerSettings.getProviderSettings(luminaId);
  const resolvedModelId = persisted.modelId;
  if (!resolvedModelId) {
    console.log(`[opencode-bridge] skip: provider '${luminaId}' has no modelId set`);
    return null;
  }

  const apiKey = (await providerSettings.getProviderApiKey(luminaId)) ?? "";
  // Local-only providers (Ollama) don't need a key; everything else does.
  const keyRequired = luminaId !== "ollama";
  if (keyRequired && !apiKey) {
    console.log(`[opencode-bridge] skip: provider '${luminaId}' has no apiKey in keychain`);
    return null;
  }

  // Build config.provider entry. Mainline providers just need the apiKey
  // + optional baseURL override. The openai-compatible path needs a full
  // declaration (npm loader + models map) because it isn't in models.dev.
  const providerEntry: Record<string, unknown> = {};
  const options: Record<string, unknown> = {};
  if (apiKey) options.apiKey = apiKey;
  if (persisted.baseUrl) options.baseURL = persisted.baseUrl;
  if (persisted.headers) options.headers = persisted.headers;
  if (Object.keys(options).length > 0) providerEntry.options = options;

  if (luminaId === "openai-compatible") {
    providerEntry.name = persisted.name ?? "Custom OpenAI-compatible";
    providerEntry.npm = "@ai-sdk/openai-compatible";
    providerEntry.models = { [resolvedModelId]: {} };
    if (!persisted.baseUrl) {
      // openai-compatible without baseURL is unusable — opencode's openai
      // SDK would hit api.openai.com, which defeats the point.
      console.log(
        `[opencode-bridge] skip: openai-compatible needs a baseUrl (current modelId='${resolvedModelId}')`,
      );
      return null;
    }
  } else if (luminaId === "ollama") {
    // ollama isn't in opencode's BUNDLED_PROVIDERS; declare it explicitly so
    // Npm.add() resolves ollama-ai-provider-v2 at runtime.
    providerEntry.name = "Ollama";
    providerEntry.npm = "ollama-ai-provider-v2";
    providerEntry.models = { [resolvedModelId]: {} };
  } else {
    // Mainline providers — declare the model so it shows up even if
    // models.dev hasn't been fetched yet. An empty object is fine;
    // opencode merges with its registry.
    providerEntry.models = { [resolvedModelId]: {} };
  }

  const config = {
    // Top-level `model: "providerID/modelID"` sets opencode's defaultModel()
    // so we don't depend on the recent-model heuristic or models.dev ordering.
    model: `${opencodeId}/${resolvedModelId}`,
    // Force the built-in `build` agent. Opencode merges config files from
    // ~/.config/opencode and ~/.opencode on startup, and a user who has
    // played with opencode CLI before may have `default_agent` pointing at
    // a plugin-provided agent (e.g. "Sisyphus - Ultraworker") whose loader
    // fails under Electron's ESM — prompts then die with "default agent
    // not found". Pinning default_agent here, plus passing `agent: "build"`
    // per-prompt, ensures Lumina always routes through the stable built-in.
    default_agent: "build",
    provider: {
      [opencodeId]: providerEntry,
    },
  };

  const auth = apiKey
    ? {
        [opencodeId]: {
          type: "api" as const,
          key: apiKey,
        },
      }
    : {};

  const summary = `${opencodeId}/${resolvedModelId}${persisted.baseUrl ? ` @ ${persisted.baseUrl}` : ""}`;
  // Mask the key in the log: first 4 + last 4 chars, enough to tell whether
  // the right key is in use without leaking it.
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)} (${apiKey.length} chars)`
    : "(none)";
  console.log(
    `[opencode-bridge] built: ${summary} key=${maskedKey}`,
  );
  return {
    config: JSON.stringify(config),
    auth: JSON.stringify(auth),
    summary,
  };
}

/**
 * Writes bridge data onto process.env so opencode picks it up when its
 * config/auth layers next read. Safe to call on both cold start and during
 * a restart — overwrites previous values and clears them when bridge is
 * null (e.g. user cleared provider settings).
 */
export function applyOpencodeBridge(bridge: OpencodeBridge | null): void {
  if (bridge) {
    process.env.OPENCODE_CONFIG_CONTENT = bridge.config;
    process.env.OPENCODE_AUTH_CONTENT = bridge.auth;
  } else {
    delete process.env.OPENCODE_CONFIG_CONTENT;
    delete process.env.OPENCODE_AUTH_CONTENT;
  }
}
