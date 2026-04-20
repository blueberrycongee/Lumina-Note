import { describe, expect, it, vi } from 'vitest'

import { platformHandlers } from './platform.js'

describe('platformHandlers', () => {
  it('resizes the current window when plugin:window|set_size is invoked', async () => {
    const win = {
      isDestroyed: vi.fn(() => false),
      setSize: vi.fn(),
    }

    await platformHandlers['plugin:window|set_size'](
      { width: 1280, height: 840 },
      win as never,
    )

    expect(win.setSize).toHaveBeenCalledWith(1280, 840)
  })

  it('ignores resize requests when no live window is available', async () => {
    const win = {
      isDestroyed: vi.fn(() => true),
      setSize: vi.fn(),
    }

    await expect(
      platformHandlers['plugin:window|set_size']({ width: 1280, height: 840 }, win as never),
    ).resolves.toBeNull()
    expect(win.setSize).not.toHaveBeenCalled()
  })
})
