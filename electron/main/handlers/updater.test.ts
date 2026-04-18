import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createUpdaterHandlers,
  type AutoUpdaterLike,
  type ResumableStatus,
} from './updater.js'

let cacheDir = ''

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-updater-'))
})

afterEach(() => {
  try {
    fs.rmSync(cacheDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function buildFakeUpdater(overrides: Partial<AutoUpdaterLike> = {}): AutoUpdaterLike {
  const emitter = new EventEmitter() as AutoUpdaterLike
  emitter.checkForUpdates = overrides.checkForUpdates ?? vi.fn(async () => null)
  emitter.downloadUpdate = overrides.downloadUpdate ?? vi.fn(async () => [])
  emitter.quitAndInstall = overrides.quitAndInstall ?? vi.fn()
  return emitter
}

function build(opts: {
  autoUpdater?: AutoUpdaterLike
} = {}) {
  const events: Array<{ name: string; payload: unknown }> = []
  const autoUpdater = opts.autoUpdater ?? buildFakeUpdater()
  const handlers = createUpdaterHandlers({
    autoUpdater,
    sendEvent: (name, payload) => events.push({ name, payload }),
    getCacheDir: () => cacheDir,
    now: () => 1_700_000_000_000,
  })
  return { handlers, events, autoUpdater }
}

describe('update_start_resumable_install', () => {
  it('emits started + ready when downloadUpdate resolves cleanly', async () => {
    const autoUpdater = buildFakeUpdater({
      downloadUpdate: vi.fn(async () => {
        autoUpdater.emit('download-progress', { transferred: 50, total: 100, percent: 50 })
        autoUpdater.emit('update-downloaded', {})
        return ['installer.exe']
      }),
    })
    const { handlers, events } = build({ autoUpdater })
    const taskId = await handlers.update_start_resumable_install({ expectedVersion: '2.0.0' })
    expect(typeof taskId).toBe('string')
    const types = events.map((e) => (e.payload as { type: string }).type)
    expect(types).toEqual(['started', 'progress', 'ready'])
  })

  it('emits error when downloadUpdate throws', async () => {
    const autoUpdater = buildFakeUpdater({
      downloadUpdate: vi.fn(async () => {
        throw new Error('network down')
      }),
    })
    const { handlers, events } = build({ autoUpdater })
    await handlers.update_start_resumable_install({ expectedVersion: '2.0.0' })
    const last = events[events.length - 1]?.payload as { type: string; errorMessage: string }
    expect(last.type).toBe('error')
    expect(last.errorMessage).toMatch(/network down/)
  })
})

describe('update_cancel_resumable_install', () => {
  it('flips status to cancelled and suppresses subsequent downloadUpdate errors', async () => {
    const autoUpdater = buildFakeUpdater({
      downloadUpdate: vi.fn(async () => {
        throw new Error('aborted')
      }),
    })
    const { handlers, events } = build({ autoUpdater })

    // Start then cancel mid-flight (synchronous since mock throws immediately)
    const startPromise = handlers.update_start_resumable_install({ expectedVersion: '2.0.0' })
    await handlers.update_cancel_resumable_install({})
    await startPromise

    const types = events.map((e) => (e.payload as { type: string }).type)
    expect(types).toContain('cancelled')
    // Error event must not fire after cancel
    expect(types.filter((t) => t === 'error').length).toBe(0)
  })
})

describe('update_clear_resumable_cache', () => {
  it('removes files under the cache dir and clears status', async () => {
    fs.writeFileSync(path.join(cacheDir, 'stale-installer.bin'), 'x')
    const { handlers } = build()
    await handlers.update_start_resumable_install({ expectedVersion: '2.0.0' })
    await handlers.update_clear_resumable_cache({})
    expect(fs.readdirSync(cacheDir)).toEqual([])
    const status = (await handlers.update_get_resumable_status({})) as ResumableStatus | null
    expect(status).toBeNull()
  })

  it('silently tolerates missing cache dir', async () => {
    fs.rmSync(cacheDir, { recursive: true, force: true })
    const { handlers } = build()
    await expect(handlers.update_clear_resumable_cache({})).resolves.toBeNull()
  })
})

describe('update_get_resumable_status', () => {
  it('returns null before any install is started', async () => {
    const { handlers } = build()
    const status = await handlers.update_get_resumable_status({})
    expect(status).toBeNull()
  })

  it('returns current snapshot after download starts', async () => {
    const autoUpdater = buildFakeUpdater({
      downloadUpdate: vi.fn(async () => {
        autoUpdater.emit('download-progress', { transferred: 25, total: 100, percent: 25 })
        return []
      }),
    })
    const { handlers } = build({ autoUpdater })
    await handlers.update_start_resumable_install({ expectedVersion: '2.0.0' })
    const status = (await handlers.update_get_resumable_status({})) as ResumableStatus
    expect(status.downloadedBytes).toBe(25)
    expect(status.totalBytes).toBe(100)
  })
})

describe('plugin:updater|check', () => {
  it('returns null when checkForUpdates resolves with no updateInfo', async () => {
    const { handlers } = build()
    const result = await handlers['plugin:updater|check']({})
    expect(result).toBeNull()
  })

  it('returns null when checkForUpdates throws (feed not configured)', async () => {
    const autoUpdater = buildFakeUpdater({
      checkForUpdates: vi.fn(async () => {
        throw new Error('no feed configured')
      }),
    })
    const { handlers } = build({ autoUpdater })
    const result = await handlers['plugin:updater|check']({})
    expect(result).toBeNull()
  })

  it('maps updateInfo to the Tauri-shape result when an update is available', async () => {
    const autoUpdater = buildFakeUpdater({
      checkForUpdates: vi.fn(async () => ({
        updateInfo: {
          version: '2.1.0',
          releaseNotes: 'changelog',
          releaseDate: '2026-05-01',
        },
      })),
    })
    const { handlers } = build({ autoUpdater })
    const result = await handlers['plugin:updater|check']({})
    expect(result).toEqual({
      available: true,
      version: '2.1.0',
      body: 'changelog',
      date: '2026-05-01',
    })
  })
})
