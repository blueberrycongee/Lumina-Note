/**
 * Renderer-side types for image-generation providers. The shapes mirror the
 * IPC contract exposed by `electron/main/agent/image-providers/`.
 *
 * Three providers, simultaneously available — the agent (via the image-gen
 * skill) picks which one to call. There is no "active" image provider.
 */

export type ImageProviderId =
  | "openai-image"
  | "google-image"
  | "bytedance-image";

export interface ImageProviderInfo {
  id: ImageProviderId;
  label: string;
  marketingName: string;
  description: string;
  defaultModelId: string;
  defaultBaseUrl: string;
  maxReferenceImages: number;
  supportsMask: boolean;
  /** Whether this provider has an API key set in keychain right now. */
  configured: boolean;
}

/**
 * Static fallback registry used when the main-process IPC isn't available
 * (e.g. Electron main hasn't been restarted to pick up new handlers, or
 * we're running in a renderer-only dev context). Without this, an IPC
 * failure leaves the Image Models settings showing only a section header
 * with no provider rows — and the user has nowhere to type their API key.
 *
 * Keep these entries in sync with electron/main/agent/image-providers/
 * registry.ts. The static metadata is non-secret and identical on both
 * sides; the only thing the IPC adds is the live `configured` flag.
 */
export const FALLBACK_IMAGE_PROVIDERS: ImageProviderInfo[] = [
  {
    id: "openai-image",
    label: "OpenAI",
    marketingName: "gpt-image-2",
    description:
      "OpenAI gpt-image-2 — flexible sizes up to 2048², supports edit+mask",
    defaultModelId: "gpt-image-2",
    defaultBaseUrl: "https://api.openai.com/v1",
    maxReferenceImages: 8,
    supportsMask: true,
    configured: false,
  },
  {
    id: "google-image",
    label: "Google",
    marketingName: "Nano Banana",
    description:
      "Gemini 2.5 Flash Image (Nano Banana) — fast multi-image composition",
    defaultModelId: "gemini-2.5-flash-image",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    maxReferenceImages: 3,
    supportsMask: false,
    configured: false,
  },
  {
    id: "bytedance-image",
    label: "ByteDance",
    marketingName: "Seedream 4.5",
    description:
      "Seedream 4.5 — best Chinese-text rendering, up to 2048²",
    defaultModelId: "doubao-seedream-4-5-250928",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    maxReferenceImages: 4,
    supportsMask: false,
    configured: false,
  },
];

export interface ImageProviderPersistedSettings {
  /** Optional baseURL override (proxy / regional endpoint). */
  baseUrl?: string;
  /** Optional model id override; falls back to provider's default. */
  modelId?: string;
}

export interface AllImageProviderSettings {
  perProvider: Partial<Record<ImageProviderId, ImageProviderPersistedSettings>>;
}

export interface ImageTestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}
