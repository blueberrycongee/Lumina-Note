import { describe, expect, it, vi } from 'vitest'

import type { ProviderSettingsStore } from './providers/settings-store.js'
import { dispatchAgentCommand } from './ipc-dispatch.js'

function makeProviderSettings(): ProviderSettingsStore {
  return {
    setProviderSettings: vi.fn(),
    setActiveProvider: vi.fn(),
    setProviderApiKey: vi.fn(),
    deleteProviderApiKey: vi.fn(),
  } as unknown as ProviderSettingsStore
}

describe('dispatchAgentCommand provider settings IPC', () => {
  it('waits for provider refresh before completing provider settings updates', async () => {
    const providerSettings = makeProviderSettings()
    let resolveRefresh!: () => void
    const onProviderSettingsChanged = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveRefresh = resolve
      }),
    )

    let completed = false
    const promise = dispatchAgentCommand(
      { providerSettings, onProviderSettingsChanged },
      'agent_set_provider_settings',
      {
        provider_id: 'deepseek',
        settings: {
          modelId: 'deepseek-v4-flash',
          thinkingMode: 'instant',
        },
      },
    ).then(() => {
      completed = true
    })

    await Promise.resolve()
    expect(completed).toBe(false)
    expect(onProviderSettingsChanged).toHaveBeenCalledTimes(1)

    resolveRefresh()
    await promise
    expect(completed).toBe(true)
  })
})
