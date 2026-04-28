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
import type { SkillLoader } from './skills/loader.js'
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

export interface AgentDispatchContext {
  providerSettings?: ProviderSettingsStore
  imageProviderSettings?: ImageProviderSettingsStore
  skillLoader?: SkillLoader
  wikiSettings?: WikiSettingsStore
  wikiManager?: WikiManager
  /**
   * Fired (fire-and-forget) after the user mutates provider state via any of:
   *   agent_set_active_provider / agent_set_provider_settings / agent_set_provider_api_key
   * Wired from main/index.ts to rebuild OPENCODE_CONFIG_CONTENT +
   * OPENCODE_AUTH_CONTENT and restart the embedded opencode server so the
   * new key / model takes effect without restarting the whole app.
   */
  onProviderSettingsChanged?: () => void | Promise<void>
}

export function isAgentCommand(cmd: string): boolean {
  return (
    cmd.startsWith('agent_') ||
    cmd.startsWith('vault_') ||
    cmd.startsWith('wiki_') ||
    cmd.startsWith('image_')
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
    skillLoader,
    wikiSettings,
    wikiManager,
    onProviderSettingsChanged,
  } = ctx
  const triggerProviderRefresh = (): void => {
    if (!onProviderSettingsChanged) return
    void Promise.resolve(onProviderSettingsChanged()).catch((err) => {
      console.error('[ipc-dispatch] provider-settings-changed hook threw', err)
    })
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
        triggerProviderRefresh()
        return null
      }
      if (!hasProvider(provider_id)) {
        throw new Error(`Unknown provider: ${provider_id}`)
      }
      providerSettings.setActiveProvider(provider_id)
      triggerProviderRefresh()
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
      triggerProviderRefresh()
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
      triggerProviderRefresh()
      return null
    }
    case 'agent_set_auto_approve': {
      const { value } = args as { value?: boolean }
      setAutoApproveToolCalls(!!value)
      triggerProviderRefresh()
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
      const apiKey = settings?.apiKey ?? ''
      return testImageProviderConnection({
        providerId: provider_id as ImageProviderId,
        apiKey,
        baseUrl: settings?.baseUrl,
      })
    }

    // Skills — read-only skill discovery for the Skill Manager UI.
    case 'agent_list_skills': {
      if (!skillLoader) return []
      const { workspace_path } = args as { workspace_path?: string }
      if (!workspace_path) return []
      return skillLoader.listSkills(workspace_path)
    }
    case 'agent_read_skill': {
      if (!skillLoader) return null
      const { name, workspace_path } = args as {
        name?: string
        workspace_path?: string
      }
      if (!name || !workspace_path) return null
      const detail = await skillLoader.readSkill(workspace_path, name)
      if (!detail) return null
      return detail
    }

    // Vault — bind wiki manager to active vault, load wiki index, placeholder lint.
    case 'vault_initialize': {
      if (wikiManager) {
        const { workspacePath, workspace_path } = args as {
          workspacePath?: string
          workspace_path?: string
        }
        const vaultPath = workspacePath ?? workspace_path
        if (typeof vaultPath === 'string' && vaultPath.length > 0) {
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
