/**
 * Image-provider settings store — parallel to ProviderSettingsStore but for
 * image-generation APIs.
 *
 * Differences from chat-provider store:
 *  - No `activeProviderId`. All configured providers are simultaneously
 *    available; the image-gen skill (and ultimately the agent) decides which
 *    to dispatch based on the request. Image generation is multi-model by
 *    nature — a brand-asset extension might want Nano Banana, a Chinese
 *    poster might want Seedream — so locking one in defeats the point.
 *  - Per-provider settings carry only `baseUrl` (override) for now. No model
 *    selector — the registry's `defaultModelId` is the model. Users who want
 *    a different model variant set it in the skill markdown.
 *  - API keys still go through the same SecretStore the chat store uses, so
 *    we share the OS keychain with the rest of Lumina.
 */

import fs from 'node:fs'
import path from 'node:path'

import type { ImageProviderId } from './registry.js'

export interface ImageProviderPersistedSettings {
  /** Optional baseURL override (proxies, regional endpoints, etc.) */
  baseUrl?: string
}

export interface AllImageProviderSettings {
  perProvider: Partial<Record<ImageProviderId, ImageProviderPersistedSettings>>
}

export interface SecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface SettingsStoreOptions {
  baseDir: string
  secretStore: SecretStore
  fileName?: string
}

const DEFAULT_STATE: AllImageProviderSettings = {
  perProvider: {},
}

function secretKey(providerId: ImageProviderId): string {
  return `lumina:image-provider:apikey:${providerId}`
}

export class ImageProviderSettingsStore {
  private readonly options: SettingsStoreOptions
  private readonly filePath: string
  private state: AllImageProviderSettings = DEFAULT_STATE
  private loaded = false

  constructor(options: SettingsStoreOptions) {
    this.options = options
    this.filePath = path.join(
      options.baseDir,
      options.fileName ?? 'lumina-image-provider-settings.json',
    )
  }

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AllImageProviderSettings>
      this.state = {
        perProvider: parsed.perProvider ?? {},
      }
    } catch {
      this.state = { perProvider: {} }
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.state, null, 2),
        'utf-8',
      )
    } catch (err) {
      console.error('[image-provider-settings] save failed', err)
    }
  }

  getAll(): AllImageProviderSettings {
    this.load()
    return {
      perProvider: { ...this.state.perProvider },
    }
  }

  getProviderSettings(id: ImageProviderId): ImageProviderPersistedSettings {
    this.load()
    return { ...(this.state.perProvider[id] ?? {}) }
  }

  setProviderSettings(
    id: ImageProviderId,
    settings: ImageProviderPersistedSettings,
  ): void {
    this.load()
    this.state.perProvider[id] = { ...settings }
    this.save()
  }

  async getProviderApiKey(id: ImageProviderId): Promise<string | null> {
    return this.options.secretStore.get(secretKey(id))
  }

  async setProviderApiKey(id: ImageProviderId, apiKey: string): Promise<void> {
    await this.options.secretStore.set(secretKey(id), apiKey)
  }

  async deleteProviderApiKey(id: ImageProviderId): Promise<void> {
    await this.options.secretStore.delete(secretKey(id))
  }

  /**
   * Whether this provider has all it needs to be invoked: an API key is
   * present. baseUrl is optional (registry has a default).
   */
  async isConfigured(id: ImageProviderId): Promise<boolean> {
    const key = await this.getProviderApiKey(id)
    return !!(key && key.trim().length > 0)
  }

  /**
   * Build the resolved settings the dispatcher needs (registry defaults +
   * persisted overrides + secret-stored apiKey).
   */
  async resolveSettings(
    id: ImageProviderId,
  ): Promise<{ apiKey?: string; baseUrl?: string }> {
    const persisted = this.getProviderSettings(id)
    const apiKey = (await this.getProviderApiKey(id)) ?? undefined
    return {
      apiKey,
      baseUrl: persisted.baseUrl,
    }
  }
}
