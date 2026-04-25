import { describe, expect, it } from 'vitest'

import {
  MAIN_WINDOW_DEFAULT_HEIGHT,
  MAIN_WINDOW_DEFAULT_WIDTH,
  MAIN_WINDOW_MIN_HEIGHT,
  MAIN_WINDOW_MIN_WIDTH,
  createMainWindowOptions,
} from './window-config.js'

describe('createMainWindowOptions', () => {
  it('uses a smaller default startup size while preserving the minimum size', () => {
    const options = createMainWindowOptions('/tmp/preload.cjs', 'linux')

    expect(options).toMatchObject({
      width: MAIN_WINDOW_DEFAULT_WIDTH,
      height: MAIN_WINDOW_DEFAULT_HEIGHT,
      minWidth: MAIN_WINDOW_MIN_WIDTH,
      minHeight: MAIN_WINDOW_MIN_HEIGHT,
    })
  })

  it('keeps the macOS hidden inset titlebar', () => {
    const options = createMainWindowOptions('/tmp/preload.cjs', 'darwin')

    expect(options.titleBarStyle).toBe('hidden')
  })
})
