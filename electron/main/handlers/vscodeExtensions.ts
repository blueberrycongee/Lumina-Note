import path from 'node:path'
import fs from 'node:fs'

import {
  BUILTIN_VSCODE_AI_COMPAT_PROFILES,
  TARGET_VSCODE_AI_EXTENSIONS,
  isSupportedVscodeAiExtensionId,
  resolveCompatibilityProfile,
  type SupportedVscodeAiExtensionId,
} from '../vscode-extensions/profiles.js'
import { diagnoseHostCapabilities } from '../vscode-extensions/diagnostics.js'
import { loadExternalCompatProfiles } from '../vscode-extensions/profileLoader.js'
import { VscodeExtensionStore } from '../vscode-extensions/store.js'
import { VscodeExtensionManager } from '../vscode-extensions/manager.js'
import {
  queryLatestRemoteVersion,
  type FetchLike,
  type GithubReleaseSourceOptions,
} from '../vscode-extensions/sources.js'
import {
  installLatestVscodeExtensionUpdate,
  type VscodeExtensionUpdateResult,
} from '../vscode-extensions/update.js'
import { installCompatProfilesFromIndex } from '../vscode-extensions/compatUpdate.js'
import type { BinaryFetchLike } from '../vscode-extensions/download.js'
import { installLocalVsixFile } from '../vscode-extensions/install.js'
import { runVscodeHostSmokeTest } from '../vscode-extensions/smoke.js'

export interface CreateVscodeExtensionHandlersOptions {
  baseDir: string
  hostScriptPath: string
  compatProfilesDir?: string
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
  const compatProfilesDir =
    options.compatProfilesDir ??
    path.join(options.baseDir, 'vscode-extension-compat')
  const loadProfiles = () => [
    ...BUILTIN_VSCODE_AI_COMPAT_PROFILES,
    ...loadExternalCompatProfiles(compatProfilesDir),
  ]
  const createManager = () => new VscodeExtensionManager(store, { profiles: loadProfiles() })
  const cacheDir = path.join(options.baseDir, 'vscode-extension-cache')
  const installRoot = path.join(options.baseDir, 'vscode-extensions')

  return {
    async vscode_extensions_get_state() {
      return store.getState()
    },

    async vscode_extensions_get_diagnostics() {
      const profiles = loadProfiles()
      return Object.keys(TARGET_VSCODE_AI_EXTENSIONS).map((extensionId) => {
        const id = extensionId as SupportedVscodeAiExtensionId
        const active = store.getActive(id)
        const installed = store.listInstalled(id)
        const compatibility = active
          ? resolveCompatibilityProfile(
              {
                publisher: active.extensionId.split('.')[0],
                name: active.extensionId.split('.')[1],
                version: active.version,
              },
              profiles,
            )
          : null
        const hostCapabilities = compatibility?.profile
          ? diagnoseHostCapabilities(compatibility.profile)
          : null
        return {
          extensionId: id,
          displayName: TARGET_VSCODE_AI_EXTENSIONS[id].displayName,
          active,
          installed,
          compatibility,
          hostCapabilities,
        }
      })
    },

    async vscode_extensions_check_latest(args) {
      const extensionId = parseExtensionId(args.extensionId)
      const source = parseRemoteSource(args.source)
      return queryLatestRemoteVersion(extensionId, {
        source,
        marketplaceTermsAccepted: args.marketplaceTermsAccepted === true,
        github: parseGithubReleaseSource(args),
        fetch: options.metadataFetch,
      })
    },

    async vscode_extensions_install_latest(args) {
      const extensionId = parseExtensionId(args.extensionId)
      const source = parseRemoteSource(args.source)
      const profiles = loadProfiles()
      return sanitizeUpdateResult(
        await installLatestVscodeExtensionUpdate(createManager(), {
          extensionId,
          source,
          marketplaceTermsAccepted: args.marketplaceTermsAccepted === true,
          github: parseGithubReleaseSource(args),
          cacheDir,
          installRoot,
          hostScriptPath: options.hostScriptPath,
          profiles,
          metadataFetch: options.metadataFetch,
          binaryFetch: options.binaryFetch,
        }),
      )
    },

    async vscode_extensions_install_local_vsix(args) {
      const vsixPath = parseVsixPath(args.vsixPath)
      const expectedExtensionId =
        typeof args.extensionId === 'string'
          ? parseExtensionId(args.extensionId)
          : undefined
      const installed = await installLocalVsixFile(vsixPath, {
        installRoot,
        expectedExtensionId,
      })
      const profiles = loadProfiles()
      const compatibility = resolveCompatibilityProfile(installed.packageJson, profiles)
      const smoke =
        compatibility.profile && compatibility.profile.entryViewTypes.length > 0
          ? await runVscodeHostSmokeTest({
              hostScriptPath: options.hostScriptPath,
              extensionPath: installed.extensionPath,
              expectedViewTypes: compatibility.profile.entryViewTypes,
            })
          : null
      const packageBytes = fs.readFileSync(vsixPath)
      const outcome = createManager().registerCandidateInstall({
        packageJson: installed.packageJson,
        extensionPath: installed.extensionPath,
        source: 'manual-vsix',
        packageBytes,
        smokeTestPassed: smoke?.ok ?? false,
      })
      return {
        installed,
        smoke,
        outcome,
      }
    },

    async vscode_extensions_install_compat_profiles(args) {
      const indexUrl = parseNonEmptyString(args.indexUrl, 'indexUrl')
      return installCompatProfilesFromIndex({
        indexUrl,
        profilesRoot: compatProfilesDir,
        fetch: options.metadataFetch,
      })
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

function parseRemoteSource(value: unknown): 'marketplace' | 'open-vsx' | 'github-release' {
  if (value === 'marketplace' || value === 'open-vsx' || value === 'github-release') return value
  throw new Error(`Unsupported VS Code extension source: ${String(value)}`)
}

function parseGithubReleaseSource(args: Record<string, unknown>): GithubReleaseSourceOptions | undefined {
  if (args.source !== 'github-release') return undefined
  return {
    owner: parseNonEmptyString(args.githubOwner, 'githubOwner'),
    repo: parseNonEmptyString(args.githubRepo, 'githubRepo'),
    assetPattern: typeof args.githubAssetPattern === 'string' ? args.githubAssetPattern : undefined,
  }
}

function parseVersion(value: unknown): string {
  return parseNonEmptyString(value, 'version')
}

function parseVsixPath(value: unknown): string {
  return parseNonEmptyString(value, 'vsixPath')
}

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`)
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
