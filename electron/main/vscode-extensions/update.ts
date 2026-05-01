import type {
  VscodeExtensionCompatProfile,
  SupportedVscodeAiExtensionId,
  VscodeHostCapability,
} from './profiles.js'
import { resolveCompatibilityProfile } from './profiles.js'
import {
  downloadVsixToCache,
  type BinaryFetchLike,
  type VscodeExtensionDownloadResult,
} from './download.js'
import { installDownloadedVsix, type VscodeExtensionInstallFilesResult } from './install.js'
import {
  VscodeExtensionManager,
  type VscodeExtensionInstallOutcome,
} from './manager.js'
import {
  queryLatestRemoteVersion,
  type FetchLike,
  type GithubReleaseSourceOptions,
  type VscodeExtensionRemoteVersion,
} from './sources.js'
import type { VscodeExtensionInstallSource } from './store.js'
import {
  runVscodeHostSmokeTest,
  type VscodeHostSmokeTestResult,
} from './smoke.js'

export interface VscodeExtensionUpdateOptions {
  extensionId: SupportedVscodeAiExtensionId
  source: Extract<VscodeExtensionInstallSource, 'marketplace' | 'open-vsx' | 'github-release'>
  marketplaceTermsAccepted?: boolean
  github?: GithubReleaseSourceOptions
  cacheDir: string
  installRoot: string
  hostScriptPath: string
  workspacePath?: string
  profiles?: VscodeExtensionCompatProfile[]
  implementedCapabilities?: ReadonlySet<VscodeHostCapability>
  metadataFetch?: FetchLike
  binaryFetch?: BinaryFetchLike
}

export interface VscodeExtensionUpdateResult {
  remote: VscodeExtensionRemoteVersion
  download: VscodeExtensionDownloadResult
  installed: VscodeExtensionInstallFilesResult
  smoke: VscodeHostSmokeTestResult | null
  outcome: VscodeExtensionInstallOutcome
}

export async function installLatestVscodeExtensionUpdate(
  manager: VscodeExtensionManager,
  options: VscodeExtensionUpdateOptions,
): Promise<VscodeExtensionUpdateResult> {
  const remote = await queryLatestRemoteVersion(options.extensionId, {
    source: options.source,
    marketplaceTermsAccepted: options.marketplaceTermsAccepted,
    github: options.github,
    fetch: options.metadataFetch,
  })
  const download = await downloadVsixToCache(remote, {
    cacheDir: options.cacheDir,
    fetch: options.binaryFetch,
  })
  const installed = await installDownloadedVsix(download, {
    installRoot: options.installRoot,
  })

  const compatibility = resolveCompatibilityProfile(
    installed.packageJson,
    options.profiles,
  )
  const smoke =
    compatibility.profile && compatibility.profile.entryViewTypes.length > 0
      ? await runVscodeHostSmokeTest({
          hostScriptPath: options.hostScriptPath,
          extensionPath: installed.extensionPath,
          workspacePath: options.workspacePath,
          expectedViewTypes: compatibility.profile.entryViewTypes,
        })
      : null

  const outcome = manager.registerCandidateInstall({
    packageJson: installed.packageJson,
    extensionPath: installed.extensionPath,
    source: remote.source,
    packageSha256: download.sha256,
    smokeTestPassed: smoke?.ok ?? false,
  })

  return {
    remote,
    download,
    installed,
    smoke,
    outcome,
  }
}
