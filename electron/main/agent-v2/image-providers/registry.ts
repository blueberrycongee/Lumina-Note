/**
 * Image-generation provider registry — metadata for the three image APIs we
 * support. Unlike chat providers, this is *just* metadata: there is no
 * Vercel-AI-SDK factory layer because image generation is direct HTTP, not a
 * `streamText`-style abstraction.
 *
 * The `generate_image` opencode tool (registered by Lumina's plugin) reads
 * this registry + a stored API key + a baseUrl and dispatches the request.
 *
 * Keep this list small and editorial: every entry should be a model the user
 * has a real reason to pick. Adding a fourth provider means writing a
 * dispatcher in `generate-image-tool.ts` too — there is no auto-discovery.
 */

export type ImageProviderId =
  | 'openai-image'
  | 'google-image'
  | 'bytedance-image'

export interface ImageProviderEntry {
  id: ImageProviderId
  /** Short label for the settings UI ("OpenAI Images") */
  label: string
  /** One-line marketing description for the settings UI */
  description: string
  /** Default model id this provider uses when the skill doesn't override */
  defaultModelId: string
  /** Default API base URL — user can override per-install in settings */
  defaultBaseUrl: string
  /** Marketing handle the playbook references ("Nano Banana") */
  marketingName: string
  /** Max number of reference images this provider accepts in one call */
  maxReferenceImages: number
  /** Whether this provider supports a separate edit endpoint with mask */
  supportsMask: boolean
}

const entries: ImageProviderEntry[] = [
  {
    id: 'openai-image',
    label: 'OpenAI',
    marketingName: 'gpt-image-2',
    description: 'OpenAI gpt-image-2 — flexible sizes up to 2048², supports edit+mask',
    defaultModelId: 'gpt-image-2',
    defaultBaseUrl: 'https://api.openai.com/v1',
    maxReferenceImages: 8,
    supportsMask: true,
  },
  {
    id: 'google-image',
    label: 'Google',
    marketingName: 'Nano Banana',
    description: 'Gemini 2.5 Flash Image (Nano Banana) — fast multi-image composition',
    defaultModelId: 'gemini-2.5-flash-image',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    maxReferenceImages: 3,
    supportsMask: false,
  },
  {
    id: 'bytedance-image',
    label: 'ByteDance',
    marketingName: 'Seedream 4.5',
    description: 'Seedream 4.5 — best Chinese-text rendering, up to 2048²',
    defaultModelId: 'doubao-seedream-4-5-250928',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    maxReferenceImages: 4,
    supportsMask: false,
  },
]

const registry = new Map<ImageProviderId, ImageProviderEntry>(
  entries.map((entry) => [entry.id, entry]),
)

export function listImageProviders(): ImageProviderEntry[] {
  return entries
}

export function getImageProvider(
  id: ImageProviderId,
): ImageProviderEntry | undefined {
  return registry.get(id)
}

export function isImageProviderId(id: string): id is ImageProviderId {
  return registry.has(id as ImageProviderId)
}
