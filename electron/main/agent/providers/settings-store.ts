/**
 * Provider settings store — agent 运行前需要知道用哪个 provider / 哪个 baseUrl / 哪个 model。
 *
 * 策略:
 *  - 非敏感部分(activeProviderId / 每 provider 的 baseUrl / modelId / name)走 JSON 文件,
 *    放 Electron userData 下 lumina-provider-settings.json
 *  - 敏感部分(apiKey)委托给 SecretStore(电子端 secure_store,走 OS Keychain 或加密 JSON)
 *
 * SettingsStore 暴露纯 read/write API,IPC 层会用它 + secret store 组装 dispatch 命令。
 */

import fs from 'node:fs'
import path from 'node:path'

import type { ProviderId } from './registry.js'

export interface ProviderPersistedSettings {
  baseUrl?: string
  modelId?: string
  /** openai-compatible 用: 用户自定义显示名 */
  name?: string
  /** 附加 HTTP header(罕见,用户自填) */
  headers?: Record<string, string>
}

export interface AllProviderSettings {
  /** 当前选中的 provider,用于 agent runtime.start 时取 */
  activeProviderId: ProviderId | null
  /** 每个 provider 的独立配置 */
  perProvider: Partial<Record<ProviderId, ProviderPersistedSettings>>
}

export interface SecretStore {
  /** key 形如 'lumina:provider:apikey:<providerId>' */
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface SettingsStoreOptions {
  /** Electron userData 路径 */
  baseDir: string
  /** 敏感信息后端 */
  secretStore: SecretStore
  /** 文件名覆写(测试用) */
  fileName?: string
}

const DEFAULT_STATE: AllProviderSettings = {
  activeProviderId: null,
  perProvider: {},
}

function secretKey(providerId: ProviderId): string {
  return `lumina:provider:apikey:${providerId}`
}

export class ProviderSettingsStore {
  private readonly options: SettingsStoreOptions
  private readonly filePath: string
  private state: AllProviderSettings = DEFAULT_STATE
  private loaded = false

  constructor(options: SettingsStoreOptions) {
    this.options = options
    this.filePath = path.join(
      options.baseDir,
      options.fileName ?? 'lumina-provider-settings.json',
    )
  }

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AllProviderSettings>
      this.state = {
        activeProviderId: parsed.activeProviderId ?? null,
        perProvider: parsed.perProvider ?? {},
      }
    } catch {
      this.state = { ...DEFAULT_STATE, perProvider: {} }
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
      console.error('[provider-settings] save failed', err)
    }
  }

  getAll(): AllProviderSettings {
    this.load()
    return {
      activeProviderId: this.state.activeProviderId,
      perProvider: { ...this.state.perProvider },
    }
  }

  getActiveProvider(): ProviderId | null {
    this.load()
    return this.state.activeProviderId
  }

  setActiveProvider(id: ProviderId | null): void {
    this.load()
    this.state.activeProviderId = id
    this.save()
  }

  getProviderSettings(id: ProviderId): ProviderPersistedSettings {
    this.load()
    return { ...(this.state.perProvider[id] ?? {}) }
  }

  setProviderSettings(id: ProviderId, settings: ProviderPersistedSettings): void {
    this.load()
    this.state.perProvider[id] = { ...settings }
    this.save()
  }

  async getProviderApiKey(id: ProviderId): Promise<string | null> {
    return this.options.secretStore.get(secretKey(id))
  }

  async setProviderApiKey(id: ProviderId, apiKey: string): Promise<void> {
    await this.options.secretStore.set(secretKey(id), apiKey)
  }

  async deleteProviderApiKey(id: ProviderId): Promise<void> {
    await this.options.secretStore.delete(secretKey(id))
  }

  /** 组装 registry.createLanguageModel 需要的完整 ProviderSettings(含 apiKey) */
  async resolveSettings(
    id: ProviderId,
  ): Promise<{ apiKey?: string; baseUrl?: string; name?: string; headers?: Record<string, string> }> {
    const persisted = this.getProviderSettings(id)
    const apiKey = (await this.getProviderApiKey(id)) ?? undefined
    return {
      apiKey,
      baseUrl: persisted.baseUrl,
      name: persisted.name,
      headers: persisted.headers,
    }
  }
}
