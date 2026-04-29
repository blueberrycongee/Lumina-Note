/**
 * Agent-prefixed IPC routing.
 *
 * Post-opencode-migration this dispatcher is intentionally narrow: all
 * chat-agent commands (start_task / abort / approve_tool / debug log
 * helpers) have been deleted along with the legacy AgentRuntime. What's
 * left is the user-facing settings surface + resources that the new
 * opencode runtime sits on top of:
 *
 *   - provider settings (drive the opencode-bridge's env content)
 *   - skills (read-only skill discovery for the Skill manager UI)
 *   - vault / wiki (Lumina's own features — not part of opencode)
 *
 * If you're adding a new chat/LLM-facing command, route it through the
 * opencode server instead of here.
 */

import type { ProviderId } from './providers/registry.js'
import { hasProvider } from './providers/registry.js'
import type {
  ProviderPersistedSettings,
  ProviderSettingsStore,
} from './providers/settings-store.js'
import { testProviderConnection } from './providers/test-connection.js'
import { setAutoApproveToolCalls } from '../agent-v2/provider-bridge.js'
import type { WikiManager } from '../wiki/manager.js'
import type { WikiSettings, WikiSettingsStore } from '../wiki/settings-store.js'
import { loadWikiIndex } from '../wiki/index-loader.js'
import type { ImageProviderId } from './image-providers/registry.js'
import {
  isImageProviderId,
  listImageProviders,
} from './image-providers/registry.js'
import type {
  ImageProviderPersistedSettings,
  ImageProviderSettingsStore,
} from './image-providers/settings-store.js'
import { testImageProviderConnection } from './image-providers/test-connection.js'
import {
  deleteSkill,
  writeSkill,
  type SkillFrontmatter,
} from '../agent-v2/skills/handlers.js'
import { dispatchImageGeneration } from '../agent-v2/plugin/providers.js'
import { writeImageToVault } from '../agent-v2/plugin/output.js'
import { getImageProvider } from './image-providers/registry.js'

export interface AgentDispatchContext {
  providerSettings?: ProviderSettingsStore
  imageProviderSettings?: ImageProviderSettingsStore
  wikiSettings?: WikiSettingsStore
  wikiManager?: WikiManager
  /**
   * Called from `vault_initialize` so main/index.ts can track the active
   * vault path. The opencode plugin (lumina-plugin.js) reads this via
   * globalThis when generate_image runs, since the plugin doesn't share a
   * module graph with the main bundle.
   */
  onActiveVaultChanged?: (vaultPath: string) => void
  /**
   * Fired after the user mutates provider state via any of:
   *   agent_set_active_provider / agent_set_provider_settings / agent_set_provider_api_key
   * Wired from main/index.ts to rebuild OPENCODE_CONFIG_CONTENT +
   * OPENCODE_AUTH_CONTENT and restart the embedded opencode server so the
   * next send uses the new key / model / thinking mode.
   */
  onProviderSettingsChanged?: () => void | Promise<void>
}

export function isAgentCommand(cmd: string): boolean {
  return (
    cmd.startsWith('agent_') ||
    cmd.startsWith('vault_') ||
    cmd.startsWith('wiki_') ||
    cmd.startsWith('image_') ||
    cmd.startsWith('skill_')
  )
}

export async function dispatchAgentCommand(
  ctx: AgentDispatchContext,
  cmd: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const {
    providerSettings,
    imageProviderSettings,
    wikiSettings,
    wikiManager,
    onActiveVaultChanged,
    onProviderSettingsChanged,
  } = ctx
  const triggerProviderRefresh = async (): Promise<void> => {
    if (!onProviderSettingsChanged) return
    try {
      await onProviderSettingsChanged()
    } catch (err) {
      console.error('[ipc-dispatch] provider-settings-changed hook threw', err)
    }
  }
  switch (cmd) {
    // Provider settings — feeds the opencode bridge.
    case 'agent_get_provider_settings': {
      if (!providerSettings) return null
      return providerSettings.getAll()
    }
    case 'agent_set_active_provider': {
      if (!providerSettings) return null
      const { provider_id } = args as { provider_id?: string }
      if (provider_id === null || provider_id === undefined) {
        providerSettings.setActiveProvider(null)
        await triggerProviderRefresh()
        return null
      }
      if (!hasProvider(provider_id)) {
        throw new Error(`Unknown provider: ${provider_id}`)
      }
      providerSettings.setActiveProvider(provider_id)
      await triggerProviderRefresh()
      return null
    }
    case 'agent_set_provider_settings': {
      if (!providerSettings) return null
      const { provider_id, settings } = args as {
        provider_id?: string
        settings?: ProviderPersistedSettings
      }
      if (!provider_id || !hasProvider(provider_id)) {
        throw new Error(`Unknown provider: ${provider_id}`)
      }
      providerSettings.setProviderSettings(
        provider_id as ProviderId,
        settings ?? {},
      )
      await triggerProviderRefresh()
      return null
    }
    case 'agent_set_provider_api_key': {
      if (!providerSettings) return null
      const { provider_id, api_key } = args as {
        provider_id?: string
        api_key?: string
      }
      if (!provider_id || !hasProvider(provider_id)) {
        throw new Error(`Unknown provider: ${provider_id}`)
      }
      if (api_key === undefined || api_key === null || api_key === '') {
        await providerSettings.deleteProviderApiKey(provider_id as ProviderId)
      } else {
        await providerSettings.setProviderApiKey(provider_id as ProviderId, api_key)
      }
      await triggerProviderRefresh()
      return null
    }
    case 'agent_set_auto_approve': {
      const { value } = args as { value?: boolean }
      setAutoApproveToolCalls(!!value)
      await triggerProviderRefresh()
      return null
    }
    case 'agent_has_provider_api_key': {
      if (!providerSettings) return false
      const { provider_id } = args as { provider_id?: string }
      if (!provider_id || !hasProvider(provider_id)) return false
      const key = await providerSettings.getProviderApiKey(provider_id as ProviderId)
      return typeof key === 'string' && key.length > 0
    }
    case 'agent_test_provider': {
      const { provider_id, model_id, settings } = args as {
        provider_id?: string
        model_id?: string
        settings?: { apiKey?: string; baseUrl?: string; name?: string; headers?: Record<string, string> }
      }
      if (!provider_id || !hasProvider(provider_id)) {
        return { success: false, error: `Unknown provider: ${provider_id}` }
      }
      if (!model_id) {
        return { success: false, error: 'missing model_id' }
      }
      return testProviderConnection(provider_id as ProviderId, model_id, settings ?? {})
    }

    // Image-generation providers (gpt-image-2 / Nano Banana / Seedream).
    // The opencode plugin's `generate_image` tool reads these settings at
    // tool-execute time — they do NOT need to flow through the opencode
    // bridge env, because the plugin runs in the same Node process and can
    // access the singleton store directly.
    case 'image_list_providers': {
      const providers = listImageProviders()
      // Augment with "configured" flag the UI uses to show a green dot.
      const out = await Promise.all(
        providers.map(async (entry) => ({
          ...entry,
          configured: imageProviderSettings
            ? await imageProviderSettings.isConfigured(entry.id)
            : false,
        })),
      )
      return out
    }
    case 'image_get_provider_settings': {
      if (!imageProviderSettings) return null
      return imageProviderSettings.getAll()
    }
    case 'image_set_provider_settings': {
      if (!imageProviderSettings) return null
      const { provider_id, settings } = args as {
        provider_id?: string
        settings?: ImageProviderPersistedSettings
      }
      if (!provider_id || !isImageProviderId(provider_id)) {
        throw new Error(`Unknown image provider: ${provider_id}`)
      }
      imageProviderSettings.setProviderSettings(
        provider_id as ImageProviderId,
        settings ?? {},
      )
      return null
    }
    case 'image_set_provider_api_key': {
      if (!imageProviderSettings) return null
      const { provider_id, api_key } = args as {
        provider_id?: string
        api_key?: string
      }
      if (!provider_id || !isImageProviderId(provider_id)) {
        throw new Error(`Unknown image provider: ${provider_id}`)
      }
      if (api_key === undefined || api_key === null || api_key === '') {
        await imageProviderSettings.deleteProviderApiKey(
          provider_id as ImageProviderId,
        )
      } else {
        await imageProviderSettings.setProviderApiKey(
          provider_id as ImageProviderId,
          api_key.trim(),
        )
      }
      return null
    }
    case 'image_has_provider_api_key': {
      if (!imageProviderSettings) return false
      const { provider_id } = args as { provider_id?: string }
      if (!provider_id || !isImageProviderId(provider_id)) return false
      return imageProviderSettings.isConfigured(
        provider_id as ImageProviderId,
      )
    }
    case 'image_test_provider': {
      const { provider_id, settings } = args as {
        provider_id?: string
        settings?: { apiKey?: string; baseUrl?: string }
      }
      if (!provider_id || !isImageProviderId(provider_id)) {
        return { success: false, error: `Unknown image provider: ${provider_id}` }
      }
      const draftApiKey = settings?.apiKey?.trim() ?? ''
      const storedApiKey =
        !draftApiKey && imageProviderSettings
          ? ((await imageProviderSettings.getProviderApiKey(
              provider_id as ImageProviderId,
            )) ?? '')
          : ''
      const apiKey = draftApiKey || storedApiKey
      return testImageProviderConnection({
        providerId: provider_id as ImageProviderId,
        apiKey,
        baseUrl: settings?.baseUrl,
      })
    }
    // Direct image-generation path: bypass the chat agent entirely. Reuses
    // the same dispatchImageGeneration + writeImageToVault that the
    // generate_image opencode tool uses, but invoked straight from the
    // renderer when the user has an image provider configured but the
    // chat agent isn't (e.g. they pasted only an image API key, or their
    // chat provider is broken). Result lands in vault/assets/generated/
    // identically; renderer surfaces it as a synthetic chat card.
    case 'image_generate_direct': {
      if (!imageProviderSettings) {
        return { ok: false, error: 'image-provider settings unavailable' }
      }
      const {
        prompt,
        provider_id,
        aspect_ratio,
        reference_images,
        vault_path,
      } = args as {
        prompt?: string
        provider_id?: string
        aspect_ratio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16'
        reference_images?: Array<{ data: string; mediaType: string }>
        vault_path?: string
      }
      if (!prompt || prompt.trim().length === 0) {
        return { ok: false, error: 'prompt is required' }
      }
      if (!vault_path) {
        return { ok: false, error: 'no vault open' }
      }
      if (!provider_id || !isImageProviderId(provider_id)) {
        return { ok: false, error: `Unknown image provider: ${provider_id}` }
      }
      const entry = getImageProvider(provider_id as ImageProviderId)
      if (!entry) {
        return { ok: false, error: `Unknown image provider: ${provider_id}` }
      }
      const settings = await imageProviderSettings.resolveSettings(
        provider_id as ImageProviderId,
      )
      if (!settings.apiKey) {
        return {
          ok: false,
          error: `No API key configured for ${entry.label}`,
          providerId: provider_id,
        }
      }
      const refs = (reference_images ?? []).slice(0, 3).map((r) => ({
        mimeType: r.mediaType,
        bytes: Buffer.from(r.data, 'base64'),
      }))
      try {
        const result = await dispatchImageGeneration({
          providerId: provider_id as ImageProviderId,
          defaults: {
            defaultModelId: entry.defaultModelId,
            defaultBaseUrl: entry.defaultBaseUrl,
          },
          settings: { apiKey: settings.apiKey, baseUrl: settings.baseUrl },
          request: {
            prompt: prompt.trim(),
            referenceImages: refs,
            aspectRatio: aspect_ratio,
            modelId: settings.modelId,
          },
        })
        const generatedAt = new Date().toISOString()
        const saved = await writeImageToVault({
          vaultPath: vault_path,
          bytes: result.images[0],
          metadata: {
            providerId: provider_id,
            modelId: result.modelUsed,
            prompt: prompt.trim(),
            aspectRatio: aspect_ratio,
            referenceCount: refs.length,
            generatedAt,
          },
        })
        return {
          ok: true,
          providerId: provider_id,
          providerLabel: entry.label,
          marketingName: entry.marketingName,
          modelUsed: result.modelUsed,
          relativePath: saved.relativePath,
          absolutePath: saved.absolutePath,
        }
      } catch (err) {
        return {
          ok: false,
          providerId: provider_id,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }

    // Vault skill CRUD — listing/reading goes through opencode's /skill
    // endpoint directly (the renderer hits it via the cached server info).
    // Writes are gated through this dispatch so we can validate names and
    // constrain output to <vault>/.claude/skills/<name>/SKILL.md.
    case 'skill_write': {
      const { vault_path, name, frontmatter, body } = args as {
        vault_path?: string
        name?: string
        frontmatter?: SkillFrontmatter
        body?: string
      }
      if (!vault_path || !name || !frontmatter) {
        throw new Error('skill_write: missing vault_path / name / frontmatter')
      }
      return writeSkill({
        vaultPath: vault_path,
        name,
        frontmatter,
        body: body ?? '',
      })
    }
    case 'skill_delete': {
      const { vault_path, name } = args as {
        vault_path?: string
        name?: string
      }
      if (!vault_path || !name) {
        throw new Error('skill_delete: missing vault_path / name')
      }
      await deleteSkill({ vaultPath: vault_path, name })
      return null
    }

    // Vault — bind wiki manager to active vault, load wiki index, placeholder lint.
    case 'vault_initialize': {
      const { workspacePath, workspace_path } = args as {
        workspacePath?: string
        workspace_path?: string
      }
      const vaultPath = workspacePath ?? workspace_path
      if (typeof vaultPath === 'string' && vaultPath.length > 0) {
        // Notify main/index.ts so the opencode plugin (which reads vault
        // path off globalThis at tool-execute time) sees the latest value.
        onActiveVaultChanged?.(vaultPath)
        if (wikiManager) {
          await wikiManager.bind(vaultPath).catch(() => undefined)
          await wikiManager.start().catch(() => undefined)
        }
      }
      return null
    }
    case 'vault_load_index': {
      const { workspacePath, workspace_path } = args as {
        workspacePath?: string
        workspace_path?: string
      }
      const vaultPath = workspacePath ?? workspace_path
      if (typeof vaultPath !== 'string' || vaultPath.length === 0) {
        return { pages: [], last_updated: 0 }
      }
      try {
        return await loadWikiIndex(vaultPath)
      } catch {
        return { pages: [], last_updated: 0 }
      }
    }
    case 'vault_run_lint': {
      return {
        checked_pages: 0,
        broken_links: [] as unknown[],
        orphaned_pages: [] as string[],
        stale_pages: [] as string[],
        overall_health: 1,
      }
    }

    // Wiki settings + manager lifecycle.
    case 'wiki_get_settings': {
      if (!wikiSettings) return null
      return wikiSettings.get()
    }
    case 'wiki_set_settings': {
      if (!wikiSettings) return null
      const { settings } = args as { settings?: Partial<WikiSettings> }
      return wikiSettings.set(settings ?? {})
    }
    case 'wiki_reset_settings': {
      if (!wikiSettings) return null
      return wikiSettings.reset()
    }
    case 'wiki_bind': {
      if (!wikiManager) return null
      const { vault_path } = args as { vault_path?: string }
      if (!vault_path) {
        throw new Error('wiki_bind: missing vault_path')
      }
      await wikiManager.bind(vault_path)
      await wikiManager.start()
      return null
    }
    case 'wiki_rebuild': {
      if (!wikiManager) return { ok: false, error: 'wiki manager not configured' }
      try {
        const count = await wikiManager.rebuild()
        return { ok: true, marked: count }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    case 'wiki_synthesize_note': {
      if (!wikiManager) return { ok: false, error: 'wiki manager not configured' }
      const { rel_path } = args as { rel_path?: string }
      if (!rel_path) {
        return { ok: false, error: 'wiki_synthesize_note: missing rel_path' }
      }
      try {
        return await wikiManager.synthesizeNote(rel_path)
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    case 'wiki_stop': {
      if (!wikiManager) return null
      await wikiManager.stop()
      return null
    }

    default:
      console.warn(`[agent:ipc-dispatch] unhandled command: ${cmd}`)
      return null
  }
}
