/**
 * Diagnostics handler — bundles the app's recent debug logs plus environment
 * metadata into a single text file at `destination` for users to attach to
 * bug reports. Replaces src-tauri/src/diagnostics.rs.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface AppInfoLike {
  version: string
  logsDir: string
}

export interface CreateDiagnosticsHandlersOptions {
  getAppInfo: () => AppInfoLike
  now?: () => Date
  /** Max bytes to include per log file (default 2 MiB) */
  maxBytesPerFile?: number
}

export type DiagnosticsHandlerMap = Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
>

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

export function createDiagnosticsHandlers(
  options: CreateDiagnosticsHandlersOptions,
): DiagnosticsHandlerMap {
  const now = options.now ?? (() => new Date())
  const maxBytes = options.maxBytesPerFile ?? DEFAULT_MAX_BYTES

  return {
    async export_diagnostics(args) {
      const destination = typeof args.destination === 'string' ? args.destination : ''
      if (!destination) {
        throw new Error('export_diagnostics: destination is required')
      }

      const parent = path.dirname(destination)
      fs.mkdirSync(parent, { recursive: true })

      const info = options.getAppInfo()
      const handle = fs.openSync(destination, 'w')
      try {
        const header = [
          'Lumina Diagnostics',
          `version: ${info.version}`,
          `timestamp: ${now().toISOString()}`,
          `os: ${process.platform}`,
          `arch: ${process.arch}`,
          `node: ${process.version}`,
          `electron: ${process.versions.electron ?? 'n/a'}`,
          `release: ${os.release()}`,
          '',
          `debug-logs dir: ${info.logsDir}`,
          '',
        ].join('\n')
        fs.writeSync(handle, header)

        const files = listLogFiles(info.logsDir)
        if (files.length === 0) {
          fs.writeSync(handle, '(no debug logs found)\n')
        } else {
          for (const file of files) {
            fs.writeSync(handle, `\n===== ${file} =====\n\n`)
            appendFileTail(handle, file, maxBytes)
          }
          fs.writeSync(handle, '\n')
        }
      } finally {
        fs.closeSync(handle)
      }
      return null
    },
  }
}

function listLogFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .map((name) => path.join(dir, name))
      .filter((p) => {
        try {
          return fs.statSync(p).isFile()
        } catch {
          return false
        }
      })
      .sort()
  } catch {
    return []
  }
}

function appendFileTail(outHandle: number, filePath: string, maxBytes: number): void {
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r')
    const size = fs.fstatSync(fd).size
    if (size <= maxBytes) {
      const buf = Buffer.alloc(size)
      fs.readSync(fd, buf, 0, size, 0)
      fs.writeSync(outHandle, buf)
      return
    }
    const start = size - maxBytes
    const buf = Buffer.alloc(maxBytes)
    fs.readSync(fd, buf, 0, maxBytes, start)
    fs.writeSync(outHandle, '\n[... truncated ...]\n')
    fs.writeSync(outHandle, buf)
  } catch (err) {
    fs.writeSync(
      outHandle,
      `\n[diagnostics] failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`,
    )
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        // ignore
      }
    }
  }
}
