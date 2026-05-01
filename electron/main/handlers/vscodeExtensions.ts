import path from 'node:path'

import {
  isSupportedVscodeAiExtensionId,
  type SupportedVscodeAiExtensionId,
} from '../vscode-extensions/profiles.js'
import { VscodeExtensionStore } from '../vscode-extensions/store.js'
import { VscodeExtensionManager } from '../vscode-extensions/manager.js'
import {
  queryLatestRemoteVersion,
  type FetchLike,
} from '../vscode-extensions/sources.js'
import {
  installLatestVscodeExtensionUpdate,
  type VscodeExtensionUpdateResult,
} from '../vscode-extensions/update.js'
import type { BinaryFetchLike } from '../vscode-extensions/download.js'

export interface CreateVscodeExtensionHandlersOptions {
  baseDir: string
  hostScriptPath: string
  metadataFetch?: FetchLike
  binaryFetch?: BinaryFetchLike
}

export type VscodeExtensionHandlerMap = Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
>

export function createVscodeExtensionHandlers(
  options: CreateVscodeExtensionHandlersOptions,
): VscodeExtensionHandlerMap {
  const store = new VscodeExtensionStore({ baseDir: options.baseDir })
  const manager = new VscodeExtensionManager(store)
  const cacheDir = path.join(options.baseDir, 'vscode-extension-cache')
  const installRoot = path.join(options.baseDir, 'vscode-extensions')

  return {
    async vscode_extensions_get_state() {
      return store.getState()
    },

    async vscode_extensions_check_latest(args) {
      const extensionId = parseExtensionId(args.extensionId)
      const source = parseRemoteSource(args.source)
      return queryLatestRemoteVersion(extensionId, {
        source,
        marketplaceTermsAccepted: args.marketplaceTermsAccepted === true,
        fetch: options.metadataFetch,
      })
    },

    async vscode_extensions_install_latest(args) {
      const extensionId = parseExtensionId(args.extensionId)
      const source = parseRemoteSource(args.source)
      return sanitizeUpdateResult(
        await installLatestVscodeExtensionUpdate(manager, {
          extensionId,
          source,
          marketplaceTermsAccepted: args.marketplaceTermsAccepted === true,
          cacheDir,
          installRoot,
          hostScriptPath: options.hostScriptPath,
          metadataFetch: options.metadataFetch,
          binaryFetch: options.binaryFetch,
        }),
      )
    },

    async vscode_extensions_activate_installed(args) {
      const extensionId = parseExtensionId(args.extensionId)
      const version = parseVersion(args.version)
      store.activate(extensionId, version)
      return store.getActive(extensionId)
    },

    async vscode_extensions_rollback(args) {
      const extensionId = parseExtensionId(args.extensionId)
      return store.rollback(extensionId)
    },
  }
}

function parseExtensionId(value: unknown): SupportedVscodeAiExtensionId {
  if (typeof value !== 'string' || !isSupportedVscodeAiExtensionId(value)) {
    throw new Error(`Unsupported VS Code AI extension id: ${String(value)}`)
  }
  return value.toLowerCase() as SupportedVscodeAiExtensionId
}

function parseRemoteSource(value: unknown): 'marketplace' | 'open-vsx' {
  if (value === 'marketplace' || value === 'open-vsx') return value
  throw new Error(`Unsupported VS Code extension source: ${String(value)}`)
}

function parseVersion(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('version is required')
  }
  return value.trim()
}

function sanitizeUpdateResult(result: VscodeExtensionUpdateResult) {
  return {
    remote: result.remote,
    download: {
      filePath: result.download.filePath,
      sha256: result.download.sha256,
      byteLength: result.download.byteLength,
    },
    installed: result.installed,
    smoke: result.smoke
      ? {
          ok: result.smoke.ok,
          origin: result.smoke.origin,
          health: result.smoke.health,
        }
      : null,
    outcome: result.outcome,
  }
}
