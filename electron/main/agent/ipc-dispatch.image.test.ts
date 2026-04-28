import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImageProviderSettingsStore } from './image-providers/settings-store.js'

const testImageProviderConnectionMock = vi.hoisted(() => vi.fn())

vi.mock('./image-providers/test-connection.js', () => ({
  testImageProviderConnection: testImageProviderConnectionMock,
}))

import { dispatchAgentCommand } from './ipc-dispatch.js'

describe('dispatchAgentCommand image provider IPC', () => {
  beforeEach(() => {
    testImageProviderConnectionMock.mockReset()
    testImageProviderConnectionMock.mockResolvedValue({
      success: true,
      latencyMs: 12,
    })
  })

  it('tests a configured image provider with its stored key when no draft key is supplied', async () => {
    const imageProviderSettings = {
      getProviderApiKey: vi.fn(async () => 'stored-image-key'),
    } as unknown as ImageProviderSettingsStore

    await dispatchAgentCommand(
      { imageProviderSettings },
      'image_test_provider',
      {
        provider_id: 'google-image',
        settings: { apiKey: '', baseUrl: 'https://proxy.example' },
      },
    )

    expect(imageProviderSettings.getProviderApiKey).toHaveBeenCalledWith(
      'google-image',
    )
    expect(testImageProviderConnectionMock).toHaveBeenCalledWith({
      providerId: 'google-image',
      apiKey: 'stored-image-key',
      baseUrl: 'https://proxy.example',
    })
  })

  it('tests with the draft key when the user is replacing a saved image key', async () => {
    const imageProviderSettings = {
      getProviderApiKey: vi.fn(async () => 'stored-image-key'),
    } as unknown as ImageProviderSettingsStore

    await dispatchAgentCommand(
      { imageProviderSettings },
      'image_test_provider',
      {
        provider_id: 'google-image',
        settings: { apiKey: '  draft-image-key  ' },
      },
    )

    expect(imageProviderSettings.getProviderApiKey).not.toHaveBeenCalled()
    expect(testImageProviderConnectionMock).toHaveBeenCalledWith({
      providerId: 'google-image',
      apiKey: 'draft-image-key',
      baseUrl: undefined,
    })
  })
})
