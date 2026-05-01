import { createHash } from 'node:crypto'

import { diagnoseHostCapabilities } from './diagnostics.js'
import {
  isSupportedVscodeAiExtensionId,
  resolveCompatibilityProfile,
  type VscodeExtensionPackageLike,
  type VscodeExtensionCompatProfile,
  type VscodeHostCapability,
} from './profiles.js'
import {
  VscodeExtensionStore,
  type VscodeExtensionInstallRecord,
  type VscodeExtensionInstallSource,
} from './store.js'

export type VscodeExtensionActivationDecision =
  | 'auto-activated'
  | 'pending-smoke-test'
  | 'pending-manual-opt-in'
  | 'blocked'

export interface VscodeExtensionCandidateInstall {
  packageJson: VscodeExtensionPackageLike
  extensionPath: string
  source: VscodeExtensionInstallSource
  installedAt?: string
  packageBytes?: Uint8Array
  packageSha256?: string
  smokeTestPassed?: boolean
}

export interface VscodeExtensionInstallOutcome {
  record: VscodeExtensionInstallRecord | null
  decision: VscodeExtensionActivationDecision
  reason: string
}

export class VscodeExtensionManager {
  constructor(
    private readonly store: VscodeExtensionStore,
    private readonly options: {
      profiles?: VscodeExtensionCompatProfile[]
      implementedCapabilities?: ReadonlySet<VscodeHostCapability>
    } = {},
  ) {}

  registerCandidateInstall(
    input: VscodeExtensionCandidateInstall,
  ): VscodeExtensionInstallOutcome {
    const compatibility = resolveCompatibilityProfile(
      input.packageJson,
      this.options.profiles,
    )
    if (!compatibility.extensionId || !compatibility.version) {
      return {
        record: null,
        decision: 'blocked',
        reason: compatibility.reason,
      }
    }
    if (!isSupportedVscodeAiExtensionId(compatibility.extensionId)) {
      return {
        record: null,
        decision: 'blocked',
        reason: compatibility.reason,
      }
    }
    if (
      compatibility.status === 'incompatible-vscode-engine' ||
      compatibility.status === 'invalid-package'
    ) {
      return {
        record: null,
        decision: 'blocked',
        reason: compatibility.reason,
      }
    }
    const extensionId = compatibility.extensionId

    const record: VscodeExtensionInstallRecord = {
      extensionId,
      version: compatibility.version,
      extensionPath: input.extensionPath,
      source: input.source,
      installedAt: input.installedAt ?? new Date().toISOString(),
      packageSha256:
        input.packageSha256 ??
        (input.packageBytes ? sha256Hex(input.packageBytes) : undefined),
      smokeTestPassed: input.smokeTestPassed === true,
      compatibility: {
        status: compatibility.status,
        reason: compatibility.reason,
        autoUpdateEligible: compatibility.autoUpdateEligible,
        profileVersionRange: compatibility.profile?.versionRange ?? null,
      },
    }

    this.store.recordInstall(record)

    if (!compatibility.profile) {
      return {
        record,
        decision: input.smokeTestPassed
          ? 'pending-manual-opt-in'
          : 'pending-smoke-test',
        reason: input.smokeTestPassed
          ? 'Install recorded as unverified; no compatibility profile covers this version.'
          : 'Install recorded as unverified, but smoke test has not passed.',
      }
    }

    const hostDiagnostic = diagnoseHostCapabilities(
      compatibility.profile,
      this.options.implementedCapabilities,
    )
    if (!hostDiagnostic.canRunWithoutMissingCapabilities) {
      return {
        record,
        decision: 'blocked',
        reason: `Host is missing required VS Code capabilities: ${hostDiagnostic.missingCapabilities.join(', ')}.`,
      }
    }

    if (!input.smokeTestPassed) {
      return {
        record,
        decision: 'pending-smoke-test',
        reason: 'Install recorded but smoke test has not passed.',
      }
    }

    if (!compatibility.autoUpdateEligible) {
      return {
        record,
        decision: 'pending-manual-opt-in',
        reason:
          'Install recorded but this version is not stable-verified; manual opt-in is required.',
      }
    }

    this.store.activate(record.extensionId, record.version)
    return {
      record,
      decision: 'auto-activated',
      reason: 'Stable compatibility profile and smoke test passed.',
    }
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
