import { describe, expect, it, vi } from 'vitest'

import type { ProviderSettingsStore } from './providers/settings-store.js'

const testProviderConnectionMock = vi.hoisted(() => vi.fn())

vi.mock('./providers/test-connection.js', () => ({
  testProviderConnection: testProviderConnectionMock,
}))

import { dispatchAgentCommand } from './ipc-dispatch.js'

function makeProviderSettings(): ProviderSettingsStore {
  return {
    setProviderSettings: vi.fn(),
    setActiveProvider: vi.fn(),
    setProviderApiKey: vi.fn(),
    deleteProviderApiKey: vi.fn(),
    getProviderApiKey: vi.fn(async () => null),
  } as unknown as ProviderSettingsStore
}

describe('dispatchAgentCommand provider settings IPC', () => {
  it('does not wait for provider refresh before completing provider settings updates', async () => {
    const providerSettings = makeProviderSettings()
    const onProviderSettingsChanged = vi.fn(
      () => new Promise<void>(() => {}),
    )

    await expect(dispatchAgentCommand(
      { providerSettings, onProviderSettingsChanged },
      'agent_set_provider_settings',
      {
        provider_id: 'deepseek',
        settings: {
          modelId: 'deepseek-v4-flash',
        },
      },
    )).resolves.toBeNull()
    expect(onProviderSettingsChanged).toHaveBeenCalledTimes(1)
  })

  it('tests a provider with its stored key when no draft key is supplied', async () => {
    testProviderConnectionMock.mockResolvedValue({ success: true, latencyMs: 10 })
    const providerSettings = {
      ...makeProviderSettings(),
      getProviderApiKey: vi.fn(async () => 'stored-main-key'),
    } as unknown as ProviderSettingsStore

    await dispatchAgentCommand(
      { providerSettings },
      'agent_test_provider',
      {
        provider_id: 'deepseek',
        model_id: 'deepseek-v4-flash',
        settings: { apiKey: '', baseUrl: 'https://api.deepseek.com' },
      },
    )

    expect(providerSettings.getProviderApiKey).toHaveBeenCalledWith('deepseek')
    expect(testProviderConnectionMock).toHaveBeenCalledWith(
      'deepseek',
      'deepseek-v4-flash',
      {
        apiKey: 'stored-main-key',
        baseUrl: 'https://api.deepseek.com',
      },
    )
  })
})
