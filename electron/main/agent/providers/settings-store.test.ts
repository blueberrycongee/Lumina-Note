import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ProviderSettingsStore,
  type SecretStore,
} from './settings-store.js'

function createInMemorySecretStore(): SecretStore & { inner: Map<string, string> } {
  const inner = new Map<string, string>()
  return {
    inner,
    async get(key) {
      return inner.get(key) ?? null
    },
    async set(key, value) {
      inner.set(key, value)
    },
    async delete(key) {
      inner.delete(key)
    },
  }
}

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-settings-'))
})

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('ProviderSettingsStore', () => {
  it('returns empty state before any writes', () => {
    const store = new ProviderSettingsStore({
      baseDir: tmpDir,
      secretStore: createInMemorySecretStore(),
    })
    const all = store.getAll()
    expect(all.activeProviderId).toBeNull()
    expect(all.perProvider).toEqual({})
  })

  it('persists activeProviderId and perProvider settings', () => {
    const secret = createInMemorySecretStore()
    const store = new ProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    store.setActiveProvider('anthropic')
    store.setProviderSettings('anthropic', { modelId: 'claude-opus-4-7', baseUrl: 'https://x' })

    // Fresh instance reads from disk
    const store2 = new ProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    expect(store2.getActiveProvider()).toBe('anthropic')
    expect(store2.getProviderSettings('anthropic')).toEqual({
      modelId: 'claude-opus-4-7',
      baseUrl: 'https://x',
    })
  })

  it('api key goes through secretStore, not the JSON file', async () => {
    const secret = createInMemorySecretStore()
    const store = new ProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    // Also trigger a settings write so the JSON file exists
    store.setProviderSettings('openai', { modelId: 'gpt-5.2' })
    await store.setProviderApiKey('openai', 'sk-secret')
    expect(secret.inner.get('lumina:provider:apikey:openai')).toBe('sk-secret')

    const filePath = path.join(tmpDir, 'lumina-provider-settings.json')
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    expect(fileContent.includes('sk-secret')).toBe(false)

    await expect(store.getProviderApiKey('openai')).resolves.toBe('sk-secret')
  })

  it('resolveSettings merges persisted fields with apiKey from secret store', async () => {
    const secret = createInMemorySecretStore()
    const store = new ProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    store.setProviderSettings('openai-compatible', {
      baseUrl: 'https://api.moonshot.cn/v1',
      name: 'Moonshot',
      modelId: 'kimi-k2.5',
    })
    await store.setProviderApiKey('openai-compatible', 'sk-k')

    const resolved = await store.resolveSettings('openai-compatible')
    expect(resolved).toEqual({
      apiKey: 'sk-k',
      baseUrl: 'https://api.moonshot.cn/v1',
      name: 'Moonshot',
      headers: undefined,
    })
  })

  it('deleteProviderApiKey removes the key from secret store', async () => {
    const secret = createInMemorySecretStore()
    const store = new ProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    await store.setProviderApiKey('anthropic', 'x')
    await store.deleteProviderApiKey('anthropic')
    await expect(store.getProviderApiKey('anthropic')).resolves.toBeNull()
  })

  it('setActiveProvider can be null to clear the active selection', () => {
    const store = new ProviderSettingsStore({ baseDir: tmpDir, secretStore: createInMemorySecretStore() })
    store.setActiveProvider('anthropic')
    store.setActiveProvider(null)
    expect(store.getActiveProvider()).toBeNull()
  })

  it('resolveSettings returns undefined apiKey when none is stored', async () => {
    const store = new ProviderSettingsStore({ baseDir: tmpDir, secretStore: createInMemorySecretStore() })
    store.setProviderSettings('openai', { modelId: 'gpt-5.2' })
    const resolved = await store.resolveSettings('openai')
    expect(resolved.apiKey).toBeUndefined()
  })
})
