import { createHash } from 'node:crypto'

import {
  resolveCompatibilityProfile,
  type VscodeExtensionPackageLike,
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
  smokeTestPassed?: boolean
}

export interface VscodeExtensionInstallOutcome {
  record: VscodeExtensionInstallRecord | null
  decision: VscodeExtensionActivationDecision
  reason: string
}

export class VscodeExtensionManager {
  constructor(private readonly store: VscodeExtensionStore) {}

  registerCandidateInstall(
    input: VscodeExtensionCandidateInstall,
  ): VscodeExtensionInstallOutcome {
    const compatibility = resolveCompatibilityProfile(input.packageJson)
    if (
      !compatibility.extensionId ||
      !compatibility.version ||
      !compatibility.profile
    ) {
      return {
        record: null,
        decision: 'blocked',
        reason: compatibility.reason,
      }
    }
    const extensionId = compatibility.profile.extensionId

    const record: VscodeExtensionInstallRecord = {
      extensionId,
      version: compatibility.version,
      extensionPath: input.extensionPath,
      source: input.source,
      installedAt: input.installedAt ?? new Date().toISOString(),
      packageSha256: input.packageBytes
        ? sha256Hex(input.packageBytes)
        : undefined,
      compatibility: {
        status: compatibility.status,
        reason: compatibility.reason,
        autoUpdateEligible: compatibility.autoUpdateEligible,
        profileVersionRange: compatibility.profile.versionRange,
      },
    }

    this.store.recordInstall(record)

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
