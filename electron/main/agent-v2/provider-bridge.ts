// Translate Lumina's ProviderSettingsStore into the env vars opencode reads
// at startup (OPENCODE_CONFIG_CONTENT + OPENCODE_AUTH_CONTENT). Without this
// bridge the UI-configured key never reaches opencode; it only lives in
// Lumina's encrypted settings store.
//
// Shape ref:
//   auth.json  — thirdparty/opencode/packages/opencode/src/auth/index.ts:59
//                process.env.OPENCODE_AUTH_CONTENT is parsed as the auth map.
//   config     — thirdparty/opencode/packages/opencode/src/config/config.ts:585
//                process.env.OPENCODE_CONFIG_CONTENT is merged as global config.

import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ProviderPersistedSettings,
  ProviderSettingsStore,
} from "./providers/settings-store.js";
import type { ProviderId } from "./providers/registry.js";

const OPENCODE_CUSTOM_PROVIDER_ID = "lumina-compat";

let _autoApproveToolCalls = false;

/**
 * Resolve `<file>` to an absolute path relative to the main bundle's
 * directory at runtime. Works in both ESM (preferred — uses import.meta.url)
 * and the legacy CJS fallback.
 */
function resolveBesideMainBundle(file: string): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = typeof __dirname === "string" ? __dirname : process.cwd();
  }
  return path.join(dir, file);
}

/** Absolute path to the bundled Lumina opencode plugin (lumina-plugin.js). */
function resolveLuminaPluginPath(): string {
  return resolveBesideMainBundle("lumina-plugin.js");
}

/**
 * Absolute path to the directory holding Lumina's bundled built-in skills
 * (image-gen, etc.). Populated by the lumina:copy-builtin-skills vite
 * plugin during build.
 */
function resolveBuiltinSkillsPath(): string {
  return resolveBesideMainBundle("skills");
}

export function setAutoApproveToolCalls(value: boolean): void {
  _autoApproveToolCalls = value;
}

// System prompt injected as the `build` agent's prompt. Opencode's
// default behaviour (session/llm.ts:103) is: if an agent has a
// non-empty `prompt` field, it REPLACES the provider-default prompt
// (anthropic.txt / default.txt / etc.) — which otherwise introduces the
// assistant as "opencode, an interactive CLI tool ... software
// engineering tasks", completely wrong for a notes app.
//
// Keep it short. Longer context bloats every request. Tool behaviour is
// already shaped by opencode's tool definitions; this prompt only needs
// to set identity, register the app's purpose, and nudge the tone.
const LUMINA_SYSTEM_PROMPT = `You are Lumina's AI assistant, embedded inside the Lumina note-taking and knowledge-management app.

Your job is to help the user think, research, write, and maintain a personal knowledge vault made of Markdown notes.

Available tools include read, write, edit, grep, glob, list, webfetch, websearch, and bash.

Before using tools, classify the current turn by the evidence or action the user requested:
1. Direct conversation: the user asks for explanation, opinion, brainstorming, writing discussion, clarification, translation, or summarization of pasted text, and does not ask to use existing files, the current tab, vault contents, or the web. Action: answer directly from the conversation and user-provided text. If key writing details are missing, ask concise clarifying questions.
2. Vault-grounded answer: the user explicitly asks about vault contents, the current note or tab, a named/attached/mentioned file or PDF, or says to use/reference existing notes. Action: inspect only the relevant source(s), then answer using what you found.
3. Vault mutation: the user asks to create, edit, rewrite, organize, save, or cross-reference notes/files. Action: inspect the target file first when editing, then make the requested change.
4. External research: the user asks for current facts or web research. Action: use web tools if available, then cite or summarize the evidence.

Ambient app state is not consent. An open tab, visible PDF, active vault, nearby file, or previous session artifact is available context, but it is not a request to inspect it. If a turn fits Direct conversation and Vault-grounded answer is merely possible, stay in Direct conversation and ask whether the user wants existing files used.

Rules:
- Respond in the user's language. Most users write Chinese; match them unless they ask for English.
- When writing or editing notes, actually modify the file — don't just describe what you'd write.
- When editing, read the note first so you can make a targeted edit instead of overwriting.
- If tool work is needed, gather evidence before the final user-facing answer; do not emit a partial answer and then continue with tool calls.
- For ordinary chat, brainstorming, clarification, and short writing discussions, do not create internal task lists or todos. Reserve task tracking for substantial multi-step work that changes files, runs commands, or performs research.
- Prefer concise, well-structured Markdown. If the user wants long-form, they'll ask.
- Tone and formatting: use plain, professional Markdown. Avoid emojis and decorative symbols in normal chat. Preserve emojis only when they are part of user-provided text, source content, file names, or when the user explicitly asks for an expressive or social style.
- Follow-up prompt links: for exploratory, open-ended, strategic, comparative, research, learning, planning, or ambiguous topics, proactively end with 1-3 useful follow-up prompts. Use exactly this Markdown form for each prompt: [Prompt text](lumina-prompt:). The visible text must be the complete prompt the user can send by clicking. Good follow-ups should help the user narrow scope, go deeper, compare options, verify assumptions, or turn the answer into an actionable next step. If your answer already asks clarifying questions, omit follow-up prompt links. Do not use tools or create a separate assistant message just to add follow-up links. Do not output follow-up prompts as plain text or inside a code block. Do not force them into simple factual answers, completed tasks, error messages, or cases where a follow-up would add no value.
- Never call yourself "opencode" or a "CLI tool for software engineering." You are Lumina's assistant.`;

// Background-only wiki synthesis agent. Identity-only — the actual
// synthesis instructions live in the wiki-sync SKILL.md, which the agent
// loads via the `skill` tool when invoked. Keeping this prompt minimal
// avoids drift between two sources of truth.
const WIKI_SYNC_AGENT_PROMPT = `You are running as Lumina's background wiki synthesizer. There is no human in the loop — your output is consumed automatically by the wiki state tracker.

For every task, immediately invoke the \`skill wiki-sync\` tool to load the synthesis playbook, then follow it. Do not emit any final text until you have updated wiki/ as instructed by the skill.

Constraints:
- Run no shell commands. Bash, web fetch, and web search are not available to this agent.
- Stay inside the vault. Read/write paths are confined by your permission policy.
- Respond in the user's language when summarizing what you changed.`;

// Lumina provider id → opencode provider id. Mainline providers use the
// same id as models.dev so opencode's registry picks up model metadata,
// pricing, context limits, etc.
const PROVIDER_ID_MAP: Partial<Record<ProviderId, string>> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  deepseek: "deepseek",
  // models.dev id is `moonshotai`; opencode's registry pulls Kimi metadata
  // (context windows, pricing) from there.
  moonshot: "moonshotai",
  // models.dev id is `zhipuai`; opencode picks up GLM model metadata from there.
  glm: "zhipuai",
  // models.dev id is `xiaomi`; opencode picks up MiMo model metadata from there.
  mimo: "xiaomi",
  groq: "groq",
  openrouter: "openrouter",
  ollama: "ollama",
  "openai-compatible": OPENCODE_CUSTOM_PROVIDER_ID,
};

const MIMO_TOKEN_PLAN_OPENCODE_IDS: Record<string, string> = {
  "https://token-plan-cn.xiaomimimo.com/v1": "xiaomi-token-plan-cn",
  "https://token-plan-sgp.xiaomimimo.com/v1": "xiaomi-token-plan-sgp",
  "https://token-plan-ams.xiaomimimo.com/v1": "xiaomi-token-plan-ams",
};

const MIMO_MODEL_LIMITS: Record<string, { context: number; output: number }> = {
  "mimo-v2.5-pro": {
    context: 1_048_576,
    output: 131_072,
  },
  "mimo-v2.5": {
    context: 1_048_576,
    output: 131_072,
  },
  "mimo-v2-pro": {
    context: 1_048_576,
    output: 131_072,
  },
  "mimo-v2-omni": {
    context: 262_144,
    output: 65_536,
  },
  "mimo-v2-flash": {
    context: 262_144,
    output: 65_536,
  },
};

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

function resolveOpencodeProviderId(
  luminaId: ProviderId,
  persisted: ProviderPersistedSettings,
): string | undefined {
  if (luminaId === "mimo") {
    return (
      MIMO_TOKEN_PLAN_OPENCODE_IDS[normalizeBaseUrl(persisted.baseUrl)] ??
      PROVIDER_ID_MAP.mimo
    );
  }
  return PROVIDER_ID_MAP[luminaId];
}

const CATALOG_MODELS: Partial<Record<ProviderId, string[]>> = {
  anthropic: [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-opus-4-6",
    "claude-opus-4-5",
  ],
  openai: [
    "gpt-5.5-pro",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5",
    "gpt-4.1",
    "gpt-4o",
    "gpt-4o-mini",
  ],
  google: [
    "gemini-3.1-pro",
    "gemini-3.1-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ],
  deepseek: [
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  moonshot: [
    "kimi-k2.6",
    "kimi-k2.5",
    "kimi-k2-thinking",
    "kimi-k2-thinking-turbo",
    "kimi-k2-turbo-preview",
    "kimi-k2-0905-preview",
    "moonshot-v1-128k",
  ],
  glm: [
    "glm-5",
    "glm-5-x",
    "glm-4.7",
    "glm-4.7-flash",
    "glm-4.5-air",
  ],
  mimo: [
    "mimo-v2.5-pro",
    "mimo-v2-pro",
    "mimo-v2-omni",
    "mimo-v2-flash",
  ],
  groq: [
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3-32b",
    "moonshotai/kimi-k2-instruct-0905",
  ],
  openrouter: [
    "openai/gpt-5.4",
    "anthropic/claude-opus-4.7",
    "google/gemini-3.1-pro",
    "moonshotai/kimi-k2.6",
    "deepseek/deepseek-r1",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
  ],
  ollama: [
    "llama3.3",
    "llama3.2",
    "llama3.2-vision",
    "qwen3:8b",
    "deepseek-r1:8b",
    "deepseek-r1:14b",
    "gemma3",
  ],
};

type OpencodeBridge = {
  /** JSON for OPENCODE_CONFIG_CONTENT */
  config: string;
  /** JSON for OPENCODE_AUTH_CONTENT */
  auth: string;
  /** Human-friendly summary for logs */
  summary: string;
};

function modelConfigForOpencode(
  luminaId: ProviderId,
  modelId: string,
): Record<string, unknown> {
  const limit = fallbackLimitForModel(luminaId, modelId);
  const config: Record<string, unknown> = limit ? { limit } : {};

  const isDeepSeekReasoner =
    luminaId === "deepseek" &&
    (modelId.startsWith("deepseek-v4-") || modelId === "deepseek-reasoner");

  if (!isDeepSeekReasoner) {
    return config;
  }

  return {
    ...config,
    // DeepSeek requires assistant reasoning_content to be replayed when a
    // thinking response involved tool calls. Opencode owns that history
    // transform via `interleaved`; Lumina does not add per-request thinking
    // or reasoning_effort providerOptions here.
    reasoning: true,
    interleaved: { field: "reasoning_content" },
  };
}

function fallbackLimitForModel(
  luminaId: ProviderId,
  modelId: string,
): { context: number; output: number } | undefined {
  if (luminaId === "deepseek") {
    if (modelId.startsWith("deepseek-v4-")) {
      // V4 models: 1M context, 384K max output (official docs)
      return { context: 1_000_000, output: 384_000 };
    }
    // Legacy deepseek-chat / deepseek-reasoner: 128K context (V3.1+),
    // 8K max_tokens ceiling. Deprecated 2026-07-24.
    return { context: 128_000, output: 8_192 };
  }

  if (luminaId === "moonshot") {
    return {
      context: modelId === "moonshot-v1-128k" ? 128_000 : 256_000,
      output: 4_096,
    };
  }

  if (luminaId === "glm") {
    return {
      context: modelId.startsWith("glm-5") ? 200_000 : 128_000,
      output: 4_096,
    };
  }

  if (luminaId === "mimo") {
    return (
      MIMO_MODEL_LIMITS[modelId] ?? {
        context: 1_000_000,
        output: 4_096,
      }
    );
  }

  if (luminaId === "ollama") {
    return {
      context: 32_000,
      output: 4_096,
    };
  }

  return undefined;
}

const MIMO_TOKEN_PLAN_MODELS = [
  "mimo-v2.5-pro",
  "mimo-v2.5",
  "mimo-v2-pro",
  "mimo-v2-omni",
];

function catalogModelsForProvider(
  luminaId: ProviderId,
  persisted?: ProviderPersistedSettings,
): string[] {
  if (
    luminaId === "mimo" &&
    persisted?.baseUrl &&
    normalizeBaseUrl(persisted.baseUrl) in MIMO_TOKEN_PLAN_OPENCODE_IDS
  ) {
    return MIMO_TOKEN_PLAN_MODELS;
  }
  return CATALOG_MODELS[luminaId] ?? [];
}

function modelsForProvider(
  luminaId: ProviderId,
  selectedModelId: string,
  persisted?: ProviderPersistedSettings,
): Record<string, unknown> {
  const ids = Array.from(
    new Set([selectedModelId, ...catalogModelsForProvider(luminaId, persisted)]),
  ).filter(Boolean);
  return Object.fromEntries(
    ids.map((modelId) => [modelId, modelConfigForOpencode(luminaId, modelId)]),
  );
}

function positiveIntegerOrFallback(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

export async function buildOpencodeBridge(
  providerSettings: ProviderSettingsStore,
): Promise<OpencodeBridge | null> {
  const luminaId = providerSettings.getActiveProvider();
  if (!luminaId) {
    console.log("[opencode-bridge] skip: no active provider in settings");
    return null;
  }

  const persisted = providerSettings.getProviderSettings(luminaId);
  const resolvedModelId = persisted.modelId;
  if (!resolvedModelId) {
    console.log(`[opencode-bridge] skip: provider '${luminaId}' has no modelId set`);
    return null;
  }

  const defaultProvider = await buildProviderEntry({
    luminaId,
    persisted,
    apiKey: (await providerSettings.getProviderApiKey(luminaId)) ?? "",
  });
  if (!defaultProvider) {
    return null;
  }

  const providerEntries: Record<string, Record<string, unknown>> = {
    [defaultProvider.opencodeId]: defaultProvider.providerEntry,
  };
  const authEntries: Record<string, { type: "api"; key: string }> = {};
  if (defaultProvider.apiKey) {
    authEntries[defaultProvider.opencodeId] = {
      type: "api",
      key: defaultProvider.apiKey,
    };
  }

  const all =
    typeof providerSettings.getAll === "function"
      ? providerSettings.getAll()
      : {
          activeProviderId: luminaId,
          perProvider: {
            [luminaId]: persisted,
          },
        };
  for (const [id, settings] of Object.entries(all.perProvider)) {
    if (id === luminaId || !settings?.modelId) continue;
    const extra = await buildProviderEntry({
      luminaId: id as ProviderId,
      persisted: settings,
      apiKey: (await providerSettings.getProviderApiKey(id as ProviderId)) ?? "",
      silent: true,
    });
    if (!extra) continue;
    providerEntries[extra.opencodeId] = extra.providerEntry;
    if (extra.apiKey) {
      authEntries[extra.opencodeId] = {
        type: "api",
        key: extra.apiKey,
      };
    }
  }

  // Build config.provider entry. Mainline providers just need the apiKey
  // + optional baseURL override. The openai-compatible path needs a full
  // declaration (npm loader + models map) because it isn't in models.dev.
  const config: Record<string, unknown> = {
    // Top-level `model: "providerID/modelID"` sets opencode's defaultModel()
    // so we don't depend on the recent-model heuristic or models.dev ordering.
    model: `${defaultProvider.opencodeId}/${resolvedModelId}`,
    // Force the built-in `build` agent (see the long comment in
    // useOpencodeAgent.startTask: plugin-backed agents from the user's
    // CLI config can break).
    default_agent: "build",
    // Override `build`'s system prompt with Lumina's. config.agent[name]
    // merges into the built-in agents record (agent/agent.ts:236-263);
    // `.prompt` wins over the provider default at llm.ts:103.
    agent: {
      build: {
        prompt: LUMINA_SYSTEM_PROMPT,
      },
      // Background wiki synthesizer agent. Lumina's wiki manager spawns
      // a one-shot session with `agent: "wiki-sync"` whenever a note
      // changes. The actual synthesis playbook lives in the wiki-sync
      // SKILL.md (shipped at out/main/skills/wiki-sync/) — this agent
      // entry just sets the identity and auto-allows the FS tools the
      // skill needs (background sync can't pop a permission dialog).
      "wiki-sync": {
        prompt: WIKI_SYNC_AGENT_PROMPT,
        permission: {
          read: "allow",
          edit: "allow",
          write: "allow",
          bash: "deny",
          webfetch: "deny",
          websearch: "deny",
        },
      },
    },
    provider: providerEntries,
    // Lumina-side plugin sitting in the same Node process. Currently
    // registers the `generate_image` tool. Any future agent-runtime
    // extensions (custom hooks, additional tools) live in this single
    // plugin entry — keeping us aligned with opencode's plugin model
    // instead of inventing a parallel framework.
    plugin: [resolveLuminaPluginPath()],
    // Skills opencode will load at session start.
    //  - Absolute: bundled built-ins (image-gen, etc.) shipped with the app.
    //  - Relative paths: vault-local skills written by the user.
    //    opencode resolves relative paths against the session's directory
    //    (which Lumina sets to the vault root in useOpencodeAgent), so
    //    `.claude/skills` becomes `<vault>/.claude/skills/**/SKILL.md`.
    // Global ~/.claude and ~/.agents skills are disabled in opencode-xdg.ts;
    // Lumina should not let a broken external skill crash an in-app session.
    skills: {
      paths: [
        resolveBuiltinSkillsPath(),
        ".claude/skills",
        ".agents/skills",
        ".skills",
        ".lumina/skills",
      ],
    },
  };

  if (_autoApproveToolCalls) {
    config.permission = "allow";
  }

  const summary = Object.keys(providerEntries).length === 1
    ? defaultProvider.summary
    : `${defaultProvider.summary} (+${Object.keys(providerEntries).length - 1} configured)`;
  // Mask the key in the log: first 4 + last 4 chars, enough to tell whether
  // the right key is in use without leaking it.
  const maskedKey = defaultProvider.apiKey
    ? `${defaultProvider.apiKey.slice(0, 4)}…${defaultProvider.apiKey.slice(-4)} (${defaultProvider.apiKey.length} chars)`
    : "(none)";
  console.log(
    `[opencode-bridge] built: ${summary} key=${maskedKey}`,
  );
  return {
    config: JSON.stringify(config),
    auth: JSON.stringify(authEntries),
    summary,
  };
}

async function buildProviderEntry(input: {
  luminaId: ProviderId;
  persisted: ProviderPersistedSettings;
  apiKey: string;
  silent?: boolean;
}): Promise<
  | {
      opencodeId: string;
      providerEntry: Record<string, unknown>;
      apiKey: string;
      summary: string;
    }
  | null
> {
  const { luminaId, persisted, apiKey, silent } = input;
  const opencodeId = resolveOpencodeProviderId(luminaId, persisted);
  if (!opencodeId) {
    if (!silent) console.log(`[opencode-bridge] skip: provider '${luminaId}' has no opencode mapping`);
    return null;
  }

  const resolvedModelId = persisted.modelId;
  if (!resolvedModelId) {
    if (!silent) console.log(`[opencode-bridge] skip: provider '${luminaId}' has no modelId set`);
    return null;
  }

  // Local-only providers (Ollama) don't need a key; everything else does.
  const keyRequired = luminaId !== "ollama";
  if (keyRequired && !apiKey) {
    if (!silent) console.log(`[opencode-bridge] skip: provider '${luminaId}' has no apiKey in keychain`);
    return null;
  }

  const providerEntry: Record<string, unknown> = {};
  const options: Record<string, unknown> = {};
  if (apiKey) options.apiKey = apiKey;
  if (persisted.baseUrl) options.baseURL = persisted.baseUrl;
  if (persisted.headers) options.headers = persisted.headers;
  if (Object.keys(options).length > 0) providerEntry.options = options;

  // Conservative token limits used when we can't look the model up in
  // models.dev. Opencode's `maxOutputTokens()` falls back to 32_000 when
  // limit.output is missing, which DeepSeek (8192 ceiling), Moonshot
  // (4096), and most small OpenAI-compatible endpoints reject with HTTP
  // 400 "Invalid max_tokens". 4096 is the lowest common denominator and
  // is safely accepted by every provider we've tested.
  const CUSTOM_MODEL_LIMITS = {
    context: positiveIntegerOrFallback(persisted.contextWindow, 32_000),
    output: positiveIntegerOrFallback(persisted.maxOutputTokens, 4_096),
  };

  if (luminaId === "openai-compatible") {
    providerEntry.name = persisted.name ?? "Custom OpenAI-compatible";
    providerEntry.npm = "@ai-sdk/openai-compatible";
    providerEntry.models = {
      [resolvedModelId]: { limit: CUSTOM_MODEL_LIMITS },
    };
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
    // Npm.add() resolves ollama-ai-provider-v2 at runtime. Local model
    // token caps vary wildly; 4096 output is a safe default.
    providerEntry.name = "Ollama";
    providerEntry.npm = "ollama-ai-provider-v2";
    providerEntry.models = modelsForProvider(luminaId, resolvedModelId, persisted);
  } else {
    // Mainline providers — declare the model so it shows up even if
    // models.dev hasn't been fetched yet. Empty object lets opencode merge
    // with its registry (correct limits come from there).
    providerEntry.models = modelsForProvider(luminaId, resolvedModelId, persisted);
  }

  const summary = `${opencodeId}/${resolvedModelId}${persisted.baseUrl ? ` @ ${persisted.baseUrl}` : ""}`;
  return {
    opencodeId,
    providerEntry,
    apiKey,
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
