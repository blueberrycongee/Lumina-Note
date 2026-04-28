/**
 * Lumina opencode plugin — registers the `generate_image` tool and any
 * future agent-runtime extensions specific to this app.
 *
 * Loaded by opencode at startup via cfg.plugin = [<absolute path to this file>].
 * Path-based plugins must default-export `{ id, server }` (see opencode's
 * plugin/shared.ts:resolvePluginId — file plugins without an `id` throw).
 *
 * Stateful work (reading API keys, locating the active vault) is delegated
 * to the LuminaPluginContext on globalThis, which main/index.ts populates
 * before starting the opencode server. This keeps the plugin bundle from
 * having to import the rest of Lumina's main process and avoids module-graph
 * duplication (the plugin is bundled as a sibling artefact, not part of the
 * main bundle).
 */

import fs from 'node:fs/promises'

import {
  getLuminaPluginContext,
  type PluginImageProviderId,
  type ResolvedImageSettings,
} from './context.js'
import { dispatchImageGeneration } from './providers.js'
import { writeImageToVault } from './output.js'
import { tool, type Plugin, type PluginModule, type ToolContext } from './types.js'

const VALID_PROVIDERS: readonly PluginImageProviderId[] = [
  'openai-image',
  'google-image',
  'bytedance-image',
] as const

const ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16'] as const

const GENERATE_IMAGE_DESCRIPTION = `Generate a new image and save it to the vault.

Use this tool when the user wants new visual content — note illustrations, design exploration, mood images, posters, anything pictorial. The image is saved to assets/generated/ inside the vault and returned as a vault-relative path the user (or you, in a follow-up edit) can reference via standard markdown image syntax: ![](assets/generated/...)

Provider routing (pick the best configured provider for the request):
- openai-image (gpt-image-2) — best for precise photorealistic outputs and when you need many reference images stitched together. Supports flexible sizes.
- google-image (Nano Banana, Gemini 2.5 Flash Image) — fast, strong multi-image consistency, best for iterative edits with reference images. Max 3 reference images.
- bytedance-image (Seedream 4.5) — best for Chinese text rendering, posters, and dense typography. Up to 2048².

Reference images:
- Pass file paths in 'reference_images' to use existing vault images as style/subject references.
- Use this when the user mentions "like that other image", "in the style of", "based on", or when continuing iteration on a previous generation.
- Use opencode's read/glob tools first to locate candidate references — don't guess paths.

Errors:
- "no API key" → tell the user which provider needs configuring (AI Settings → Image Models).
- "no vault open" → ask the user to open a vault first.`

const pluginFn: Plugin = async () => {
  return {
    tool: {
      generate_image: tool({
        description: GENERATE_IMAGE_DESCRIPTION,
        args: {
          prompt: tool.schema
            .string()
            .min(3)
            .describe(
              'Visual description of the image to generate. Be specific about subject, style, composition, lighting. Avoid abstract instructions; describe what you want to *see*.',
            ),
          provider: tool.schema
            .enum(VALID_PROVIDERS)
            .optional()
            .describe(
              'Which image-generation provider to use. If omitted or unconfigured, Lumina uses the first configured provider.',
            ),
          aspect_ratio: tool.schema
            .enum(ASPECT_RATIOS)
            .optional()
            .describe(
              'Aspect ratio for the output. Defaults to 1:1. Use 16:9 for landscape banners, 9:16 for vertical/mobile, 3:4 or 4:3 otherwise.',
            ),
          reference_images: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe(
              'Optional absolute paths to images to use as visual references. Up to 3 (Nano Banana limit) — extras are dropped.',
            ),
          model_id: tool.schema
            .string()
            .optional()
            .describe(
              'Optional provider-specific model id override. Only honored when the requested provider is configured; otherwise Lumina uses the configured provider model.',
            ),
        },
        async execute(args, ctx: ToolContext) {
          const lumina = getLuminaPluginContext()
          const vaultPath = lumina.getActiveVaultPath()
          if (!vaultPath) {
            throw new Error(
              'No vault is currently open. Open a vault from Lumina before generating images.',
            )
          }

          const providerChoice = await resolveProviderForRequest(
            lumina,
            args.provider,
          )
          const providerId = providerChoice.providerId
          const defaults = lumina.getImageProviderDefaults(providerId)
          const settings = providerChoice.settings

          const referencePaths = args.reference_images ?? []
          // Cap to 3 references for Nano Banana / generally-useful working set.
          const cappedRefs = referencePaths.slice(0, 3)
          const referenceImages: Array<{ mimeType: string; bytes: Buffer }> = []
          for (const refPath of cappedRefs) {
            try {
              const bytes = await fs.readFile(refPath)
              referenceImages.push({
                mimeType: detectMimeType(refPath),
                bytes,
              })
            } catch (err) {
              throw new Error(
                `Failed to read reference image at ${refPath}: ${err instanceof Error ? err.message : String(err)}`,
              )
            }
          }

          // Model id is provider-specific. If the agent requested an
          // unconfigured provider, ignore its model_id while falling back so
          // we don't call the configured endpoint with a stale foreign model.
          const effectiveModelId = resolveEffectiveModelId({
            requestedProvider: args.provider,
            requestedModelId: args.model_id,
            providerId,
            fellBack: providerChoice.fellBack,
            settings,
            defaults,
          })

          ctx.metadata({
            title: `Generating with ${defaults.marketingName}…`,
            metadata: {
              provider: providerId,
              requestedProvider: args.provider,
              providerFallback: providerChoice.fellBack,
              model: effectiveModelId,
              referenceCount: referenceImages.length,
            },
          })

          const result = await dispatchImageGeneration({
            providerId,
            defaults,
            settings,
            request: {
              prompt: args.prompt,
              referenceImages,
              aspectRatio: args.aspect_ratio,
              modelId: effectiveModelId,
            },
            signal: ctx.abort,
          })

          const generatedAt = new Date().toISOString()
          const saved = await writeImageToVault({
            vaultPath,
            bytes: result.images[0],
            metadata: {
              providerId,
              modelId: result.modelUsed,
              prompt: args.prompt,
              aspectRatio: args.aspect_ratio,
              referenceCount: referenceImages.length,
              generatedAt,
            },
          })

          return {
            output: [
              `Generated and saved: ${saved.relativePath}`,
              ``,
              `Markdown reference: \`![](${saved.relativePath})\``,
              ``,
              `Provider: ${defaults.marketingName} (${result.modelUsed})`,
              `Aspect: ${args.aspect_ratio ?? '1:1'}`,
              `References: ${referenceImages.length}`,
              `Sidecar metadata: ${saved.sidecarPath}`,
            ].join('\n'),
            metadata: {
              vaultRelativePath: saved.relativePath,
              absolutePath: saved.absolutePath,
              provider: providerId,
              model: result.modelUsed,
            },
          }
        },
      }),
    },
  }
}

export async function pickDefaultProvider(
  lumina: ReturnType<typeof getLuminaPluginContext>,
): Promise<PluginImageProviderId> {
  for (const id of VALID_PROVIDERS) {
    const settings = await lumina.resolveImageSettings(id)
    if (settings.apiKey?.trim()) return id
  }
  return 'openai-image'
}

export async function resolveProviderForRequest(
  lumina: ReturnType<typeof getLuminaPluginContext>,
  requested?: PluginImageProviderId,
): Promise<{
  providerId: PluginImageProviderId
  settings: ResolvedImageSettings
  fellBack: boolean
}> {
  if (requested) {
    const requestedSettings = await lumina.resolveImageSettings(requested)
    if (requestedSettings.apiKey?.trim()) {
      return {
        providerId: requested,
        settings: requestedSettings,
        fellBack: false,
      }
    }

    const fallbackProvider = await pickDefaultProvider(lumina)
    const fallbackSettings =
      fallbackProvider === requested
        ? requestedSettings
        : await lumina.resolveImageSettings(fallbackProvider)
    return {
      providerId: fallbackProvider,
      settings: fallbackSettings,
      fellBack: fallbackProvider !== requested,
    }
  }

  const providerId = await pickDefaultProvider(lumina)
  return {
    providerId,
    settings: await lumina.resolveImageSettings(providerId),
    fellBack: false,
  }
}

export function resolveEffectiveModelId(input: {
  requestedProvider?: PluginImageProviderId
  requestedModelId?: string
  providerId: PluginImageProviderId
  fellBack: boolean
  settings: ResolvedImageSettings
  defaults: { defaultModelId: string }
}): string {
  const configuredModelId = input.settings.modelId ?? input.defaults.defaultModelId
  if (input.fellBack || input.requestedProvider !== input.providerId) {
    return configuredModelId
  }
  return input.requestedModelId ?? configuredModelId
}

function detectMimeType(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

const pluginModule: PluginModule = {
  id: 'lumina',
  server: pluginFn,
}

export default pluginModule
