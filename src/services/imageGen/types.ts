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

export interface ImageProviderPersistedSettings {
  /** Optional baseURL override (proxy / regional endpoint). */
  baseUrl?: string;
}

export interface AllImageProviderSettings {
  perProvider: Partial<Record<ImageProviderId, ImageProviderPersistedSettings>>;
}

export interface ImageTestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}
