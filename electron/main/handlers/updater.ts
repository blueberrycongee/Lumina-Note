/**
 * Updater handlers — wrap electron-updater for the four `update_*` IPC
 * endpoints the renderer calls, plus `plugin:updater|check` for the legacy
 * @tauri-apps/plugin-updater `check()` path.
 *
 * The feed URL itself is configured via electron-builder publish settings,
 * which Phase 8.2 will wire up. Until then, `checkForUpdates` throws a clean
 * "not configured" error that the renderer's retry wrapper reports as a
 * warning, and the install commands return idle status.
 */

import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

export interface ResumableStatus {
  taskId: string
  version: string
  attempt: number
  downloadedBytes: number
  totalBytes: number | null
  resumable: boolean
  stage: string
  status?: string
  errorCode: string | null
  errorMessage: string | null
  timestamp: number
  retryDelayMs: number | null
  lastHttpStatus: number | null
  canResumeAfterRestart: boolean
}

export interface ResumableEvent extends ResumableStatus {
  type:
    | 'started'
    | 'resumed'
    | 'progress'
    | 'retrying'
    | 'verifying'
    | 'installing'
    | 'ready'
    | 'error'
    | 'cancelled'
}

export interface TauriUpdateCheckResult {
  available: boolean
  version: string
  body: string | null
  date: string | null
}

export interface AutoUpdaterLike extends EventEmitter {
  checkForUpdates(): Promise<{ updateInfo: { version: string; releaseNotes?: string | null; releaseDate?: string | null } } | null>
  downloadUpdate(): Promise<string[]>
  quitAndInstall?(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface CreateUpdaterHandlersOptions {
  autoUpdater: AutoUpdaterLike
  /** Called with ('update:resumable-event', payload) to notify the renderer */
  sendEvent: (eventName: string, payload: unknown) => void
  /** Directory electron-updater caches pending installers in */
  getCacheDir: () => string
  /** Override Date.now for deterministic tests */
  now?: () => number
}

export type UpdaterHandlerMap = Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
>

const RESUMABLE_EVENT = 'update:resumable-event'

function makeTaskId(now: () => number): string {
  return `upd-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createUpdaterHandlers(
  options: CreateUpdaterHandlersOptions,
): UpdaterHandlerMap {
  const { autoUpdater, sendEvent } = options
  const now = options.now ?? (() => Date.now())

  let current: ResumableStatus | null = null
  let cancelled = false

  function update(partial: Partial<ResumableStatus>): ResumableStatus {
    const base: ResumableStatus = current ?? {
      taskId: '',
      version: '',
      attempt: 1,
      downloadedBytes: 0,
      totalBytes: null,
      resumable: true,
      stage: 'downloading',
      errorCode: null,
      errorMessage: null,
      timestamp: now(),
      retryDelayMs: null,
      lastHttpStatus: null,
      canResumeAfterRestart: true,
    }
    current = { ...base, ...partial, timestamp: now() }
    return current
  }

  function emit(type: ResumableEvent['type'], status: ResumableStatus): void {
    sendEvent(RESUMABLE_EVENT, { type, ...status })
  }

  autoUpdater.on('download-progress', (info: { percent?: number; transferred?: number; total?: number }) => {
    if (!current) return
    const next = update({
      stage: 'downloading',
      status: 'progress',
      downloadedBytes: typeof info.transferred === 'number' ? info.transferred : current.downloadedBytes,
      totalBytes: typeof info.total === 'number' ? info.total : current.totalBytes,
    })
    emit('progress', next)
  })

  autoUpdater.on('update-downloaded', () => {
    if (!current) return
    const next = update({ stage: 'ready', status: 'ready' })
    emit('ready', next)
  })

  autoUpdater.on('error', (err: Error) => {
    if (!current) return
    const next = update({
      stage: 'error',
      status: 'error',
      errorMessage: err.message,
      errorCode: (err as NodeJS.ErrnoException).code ?? null,
    })
    emit('error', next)
  })

  return {
    async update_start_resumable_install(args) {
      const expectedVersion =
        typeof args.expectedVersion === 'string' ? args.expectedVersion : ''
      cancelled = false
      const taskId = makeTaskId(now)
      const started = update({
        taskId,
        version: expectedVersion,
        attempt: 1,
        downloadedBytes: 0,
        totalBytes: null,
        stage: 'downloading',
        status: 'started',
        errorMessage: null,
        errorCode: null,
      })
      emit('started', started)
      try {
        await autoUpdater.downloadUpdate()
      } catch (err) {
        if (!cancelled) {
          const next = update({
            stage: 'error',
            status: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
          })
          emit('error', next)
        }
      }
      return taskId
    },

    async update_cancel_resumable_install() {
      cancelled = true
      if (current) {
        const next = update({ stage: 'cancelled', status: 'cancelled' })
        emit('cancelled', next)
      }
      return null
    },

    async update_clear_resumable_cache() {
      try {
        const dir = options.getCacheDir()
        if (dir && fs.existsSync(dir)) {
          for (const entry of fs.readdirSync(dir)) {
            const p = path.join(dir, entry)
            try {
              fs.rmSync(p, { recursive: true, force: true })
            } catch {
              // ignore individual failures
            }
          }
        }
      } catch (err) {
        console.warn('[updater] clear cache failed', err)
      }
      current = null
      return null
    },

    async update_get_resumable_status() {
      return current
    },

    async 'plugin:updater|check'(): Promise<TauriUpdateCheckResult | null> {
      try {
        const result = await autoUpdater.checkForUpdates()
        if (!result || !result.updateInfo) return null
        return {
          available: true,
          version: result.updateInfo.version,
          body: result.updateInfo.releaseNotes
            ? String(result.updateInfo.releaseNotes)
            : null,
          date: result.updateInfo.releaseDate ?? null,
        }
      } catch (err) {
        // Feed not configured yet (Phase 8.2) or network error — surface as
        // "no update" to match the legacy Tauri stub behavior.
        console.warn('[updater] check failed:', err instanceof Error ? err.message : err)
        return null
      }
    },
  }
}
