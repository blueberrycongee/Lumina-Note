/**
 * Updater handlers — wrap electron-updater for the five `update_*` IPC
 * endpoints the renderer calls, plus `plugin:updater|check` for the legacy
 * @tauri-apps/plugin-updater `check()` path.
 *
 * The feed URL is wired via electron-builder's `publish` config (see
 * `electron-builder.yml`); electron-builder bakes an `app-update.yml` into
 * the packaged app and electron-updater reads it at runtime. In dev (the
 * app is not packaged) `checkForUpdates` rejects with "application is not
 * packed" — that one error is treated as benign no-op; every other error
 * is propagated so the renderer can surface it.
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
  checkForUpdates(): Promise<{
    isUpdateAvailable?: boolean
    updateInfo: { version: string; releaseNotes?: string | null; releaseDate?: string | null }
  } | null>
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

    async update_quit_and_install() {
      if (typeof autoUpdater.quitAndInstall !== 'function') {
        throw new Error('quitAndInstall is not supported by this updater')
      }
      // (isSilent, isForceRunAfter). isSilent is honored only by Squirrel.Windows
      // one-click installers (we use NSIS oneClick:false, where it's ignored);
      // isForceRunAfter ensures the app auto-relaunches after the install
      // process replaces the binary. electron-updater schedules the actual
      // quit on a microtask, so the IPC return resolves before the app exits.
      autoUpdater.quitAndInstall(true, true)
      return null
    },

    async 'plugin:updater|check'(): Promise<TauriUpdateCheckResult | null> {
      try {
        const result = await autoUpdater.checkForUpdates()
        if (!result || !result.updateInfo) return null
        // electron-updater always populates `updateInfo` with the latest
        // version on the feed, even when it equals the installed version.
        // Trust `isUpdateAvailable` — it's the library's own comparison.
        if (result.isUpdateAvailable === false) return null
        return {
          available: true,
          version: result.updateInfo.version,
          body: result.updateInfo.releaseNotes
            ? String(result.updateInfo.releaseNotes)
            : null,
          date: result.updateInfo.releaseDate ?? null,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Dev mode: there's no packaged app or dev-update.yml. Treat as
        // benign "no update" so the dev console isn't noisy on every check.
        if (/application is not packed/i.test(message)) {
          return null
        }
        // Real failures (network, missing latest.yml, signature mismatch, …)
        // must propagate so the renderer's retry/report path can show them.
        throw err
      }
    },
  }
}
