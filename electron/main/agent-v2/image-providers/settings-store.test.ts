import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ImageProviderSettingsStore,
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-image-settings-'))
})

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('ImageProviderSettingsStore', () => {
  it('returns empty state before any writes', () => {
    const store = new ImageProviderSettingsStore({
      baseDir: tmpDir,
      secretStore: createInMemorySecretStore(),
    })
    expect(store.getAll().perProvider).toEqual({})
  })

  it('persists per-provider settings across instances', () => {
    const secret = createInMemorySecretStore()
    const store = new ImageProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    store.setProviderSettings('openai-image', { baseUrl: 'https://proxy.example/v1' })

    const store2 = new ImageProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    expect(store2.getProviderSettings('openai-image')).toEqual({
      baseUrl: 'https://proxy.example/v1',
    })
  })

  it('keeps API keys in the secret store, never in the JSON file', async () => {
    const secret = createInMemorySecretStore()
    const store = new ImageProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    store.setProviderSettings('google-image', {})
    await store.setProviderApiKey('google-image', 'AIza-secret')

    expect(secret.inner.get('lumina:image-provider:apikey:google-image')).toBe('AIza-secret')

    const filePath = path.join(tmpDir, 'lumina-image-provider-settings.json')
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    expect(fileContent.includes('AIza-secret')).toBe(false)

    await expect(store.getProviderApiKey('google-image')).resolves.toBe('AIza-secret')
  })

  it('isConfigured reflects whether an apiKey is set', async () => {
    const store = new ImageProviderSettingsStore({
      baseDir: tmpDir,
      secretStore: createInMemorySecretStore(),
    })
    await expect(store.isConfigured('openai-image')).resolves.toBe(false)
    await store.setProviderApiKey('openai-image', 'sk-x')
    await expect(store.isConfigured('openai-image')).resolves.toBe(true)
    await store.setProviderApiKey('openai-image', '   ')
    await expect(store.isConfigured('openai-image')).resolves.toBe(false)
  })

  it('resolveSettings merges persisted baseUrl with secret-stored apiKey', async () => {
    const secret = createInMemorySecretStore()
    const store = new ImageProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    store.setProviderSettings('bytedance-image', { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' })
    await store.setProviderApiKey('bytedance-image', 'volc-token')

    const resolved = await store.resolveSettings('bytedance-image')
    expect(resolved).toEqual({
      apiKey: 'volc-token',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    })
  })

  it('deleteProviderApiKey clears the secret store entry', async () => {
    const secret = createInMemorySecretStore()
    const store = new ImageProviderSettingsStore({ baseDir: tmpDir, secretStore: secret })
    await store.setProviderApiKey('openai-image', 'sk-x')
    await store.deleteProviderApiKey('openai-image')
    await expect(store.getProviderApiKey('openai-image')).resolves.toBeNull()
  })
})
