import type {
  VscodeExtensionCompatProfile,
  VscodeHostCapability,
} from './profiles.js'

export const CURRENT_VSCODE_HOST_CAPABILITIES: ReadonlySet<VscodeHostCapability> =
  new Set<VscodeHostCapability>([
    'commands',
    'diagnostics-read',
    'env-open-external',
    'memento',
    'secret-storage',
    'terminal',
    'webview-panel',
    'webview-view',
    'window-notifications',
    'workspace-documents',
    'workspace-fs',
    'workspace-selection',
  ])

export interface VscodeHostCapabilityDiagnostic {
  canRunWithoutMissingCapabilities: boolean
  missingCapabilities: VscodeHostCapability[]
  implementedCapabilities: VscodeHostCapability[]
}

export function diagnoseHostCapabilities(
  profile: VscodeExtensionCompatProfile,
  implemented: ReadonlySet<VscodeHostCapability> = CURRENT_VSCODE_HOST_CAPABILITIES,
): VscodeHostCapabilityDiagnostic {
  const missingCapabilities = profile.requiredCapabilities.filter(
    (capability) => !implemented.has(capability),
  )

  return {
    canRunWithoutMissingCapabilities: missingCapabilities.length === 0,
    missingCapabilities,
    implementedCapabilities: profile.requiredCapabilities.filter((capability) =>
      implemented.has(capability),
    ),
  }
}
