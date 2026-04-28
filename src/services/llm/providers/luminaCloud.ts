import { getModels as fetchCloudModels } from '@/services/luminaCloud';
import type { ModelMeta, ProviderMeta } from './models';

/**
 * "Lumina Cloud" as a license-gated LLM provider.
 *
 * The provider definition is self-contained here rather than added to
 * `PROVIDER_MODELS` in `models.ts` because PRD §3 forbids editing
 * `src/services/llm/providers/models.ts`. The consumer (AISettingsModal,
 * task C11) is responsible for combining `LUMINA_CLOUD_PROVIDER` with
 * `listProviderModels()` when the visibility predicate fires.
 *
 * Wire shape: OpenAI-compatible — `baseURL = api.lumina-note.com/v1/ai`,
 * `apiKey = <license>` (the license is the bearer token; the gateway
 * rewrites `lumina:*` model ids upstream per CONTRACT.md §2.2).
 *
 * Models are fetched dynamically from `GET /v1/ai/models` (CONTRACT.md
 * §2.3) — no static catalog here, since the available models depend on
 * the license's `features` and SKU.
 */

export const LUMINA_CLOUD_PROVIDER_ID = 'lumina-cloud';

export const LUMINA_CLOUD_BASE_URL = 'https://api.lumina-note.com/v1/ai';

export const LUMINA_CLOUD_REQUIRED_FEATURE = 'cloud_ai';

export const LUMINA_CLOUD_PROVIDER: ProviderMeta = {
  id: LUMINA_CLOUD_PROVIDER_ID,
  label: 'Lumina Cloud',
  description: 'Lumina-managed cloud AI (license required)',
  defaultBaseUrl: LUMINA_CLOUD_BASE_URL,
  // The license takes the place of an API key in the OpenAI-compatible
  // plumbing — UI should still render an "API key" input, just labelled
  // "License" by the consumer if it wants to.
  requiresApiKey: true,
  // Base URL is managed by Lumina; no per-user override.
  supportsBaseUrl: false,
  // Static models list is empty by design — see fetchLuminaCloudModels.
  models: [],
};

/**
 * The provider is visible iff the user holds a valid license that includes
 * the `cloud_ai` feature flag (CONTRACT.md §4). No license, no payload, or
 * a payload that lacks `cloud_ai` → hide the provider entirely (PRD §3).
 *
 * Accepts `readonly string[] | null | undefined` to match
 * `useLicenseStore`'s `payload?.features` shape without coercion at every
 * call site.
 */
export function isLuminaCloudVisible(features: readonly string[] | null | undefined): boolean {
  if (!features) return false;
  return features.includes(LUMINA_CLOUD_REQUIRED_FEATURE);
}

/**
 * Fetch the model catalog from `/v1/ai/models` and shape it as
 * `ModelMeta[]` so the AI settings UI can render the same row format used
 * for the static providers.
 *
 * The server returns `{ id, upstream, context }`. We surface `id` as both
 * the catalog id and the human label — until the contract grows a
 * display-name field, the prefixed id (e.g. `lumina:claude-opus-4-7`) is
 * the cleanest thing to show.
 */
export async function fetchLuminaCloudModels(license: string): Promise<ModelMeta[]> {
  const response = await fetchCloudModels(license);
  return response.data.map((m): ModelMeta => ({
    id: m.id,
    name: m.id,
    contextWindow: m.context,
  }));
}
