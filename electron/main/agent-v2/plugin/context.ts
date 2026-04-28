/**
 * Lumina plugin context — the shared bridge between the main process's
 * settings/state and the opencode plugin that lives in a sibling bundle.
 *
 * Why globalThis: opencode imports the plugin via dynamic `import(path)` so
 * the two run in the same Node context but get separate module graphs at
 * bundle level. Re-importing the SettingsStore class from the plugin would
 * compile in a duplicate copy with its own private state. Stuffing the
 * needed accessors on globalThis sidesteps that — both bundles see the same
 * runtime object.
 *
 * The shape is intentionally function-shaped (getters, not values) so the
 * plugin reads the *current* vault path / settings at tool-execute time,
 * not at plugin-load time.
 */

export type PluginImageProviderId =
  | 'openai-image'
  | 'google-image'
  | 'bytedance-image'

export interface ResolvedImageSettings {
  apiKey?: string
  baseUrl?: string
  /** User-persisted model id override — falls back to registry default
   *  when undefined. Per-call model_id arg from the agent still wins. */
  modelId?: string
}

export interface ImageProviderDefaults {
  defaultModelId: string
  defaultBaseUrl: string
  marketingName: string
}

export interface LuminaPluginContext {
  /** Resolve apiKey + baseUrl for the given provider, secret-store backed. */
  resolveImageSettings: (
    id: PluginImageProviderId,
  ) => Promise<ResolvedImageSettings>
  /** Registry defaults the plugin uses when settings don't override. */
  getImageProviderDefaults: (id: PluginImageProviderId) => ImageProviderDefaults
  /** Current vault path, or null if no vault is open. */
  getActiveVaultPath: () => string | null
}

declare global {
  // eslint-disable-next-line no-var
  var __luminaPluginContext: LuminaPluginContext | undefined
}

export function getLuminaPluginContext(): LuminaPluginContext {
  const ctx = globalThis.__luminaPluginContext
  if (!ctx) {
    throw new Error(
      'Lumina plugin context not initialized. ' +
        'The opencode server started before main/index.ts populated ' +
        'globalThis.__luminaPluginContext — this is a wiring bug.',
    )
  }
  return ctx
}

export function setLuminaPluginContext(ctx: LuminaPluginContext): void {
  globalThis.__luminaPluginContext = ctx
}
