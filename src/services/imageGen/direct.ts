/**
 * Direct image-generation path — bypasses the chat agent entirely.
 *
 * Called by MainAIChatShell when the user is in image-mode AND the chat
 * agent isn't usable (no API key, no opencode session, etc.). The result
 * is the same as going through the generate_image opencode tool: a PNG
 * saved under <vault>/assets/generated/<YYYY-MM>/<id>.png plus a sidecar
 * JSON. Just no LLM in between.
 */

import { invoke } from "@/lib/host";
import type {
  ImageProviderId,
  ImageProviderInfo,
} from "@/services/imageGen/types";

export type DirectAspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";

export interface DirectImageInput {
  prompt: string;
  providerId: ImageProviderId;
  aspectRatio?: DirectAspectRatio;
  referenceImages?: Array<{ data: string; mediaType: string }>;
  vaultPath: string;
}

export type DirectImageResult =
  | {
      ok: true;
      providerId: ImageProviderId;
      providerLabel: string;
      marketingName: string;
      modelUsed: string;
      relativePath: string;
      absolutePath: string;
    }
  | {
      ok: false;
      providerId?: ImageProviderId;
      error: string;
    };

export async function generateImageDirect(
  input: DirectImageInput,
): Promise<DirectImageResult> {
  return invoke<DirectImageResult>("image_generate_direct", {
    prompt: input.prompt,
    provider_id: input.providerId,
    aspect_ratio: input.aspectRatio,
    reference_images: input.referenceImages,
    vault_path: input.vaultPath,
  });
}

/**
 * Pick a configured image provider in priority order. Nano Banana first
 * (default for the image-gen skill), then OpenAI's gpt-image-2, then
 * Seedream. Returns null if nothing is configured — caller should toast
 * "go open AI Settings".
 */
const PROVIDER_PRIORITY: ImageProviderId[] = [
  "google-image",
  "openai-image",
  "bytedance-image",
];

export function pickConfiguredImageProvider(
  providers: ImageProviderInfo[],
): ImageProviderInfo | null {
  for (const id of PROVIDER_PRIORITY) {
    const hit = providers.find((p) => p.id === id && p.configured);
    if (hit) return hit;
  }
  // Fallback: any configured provider, in registry order.
  return providers.find((p) => p.configured) ?? null;
}
